import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { escapeHtml } from './htmlEscape';
import { officialSealDataUri } from './corporateDocumentStamp';
import type { CorporateDocumentInput, CorporateDocumentKind } from './corporateDocumentEngine';

/**
 * Approved PDFs are immutable source art. This composer never redraws their
 * stationery, headers, footers, labels, colors, terms, or signature lines.
 * It creates a transparent data overlay and places it over the original PDF
 * pages byte-loaded from docs/approved-forms (dev) or the exact build copy.
 */
export const APPROVED_DOCUMENT_TEMPLATE: Partial<Record<CorporateDocumentKind, string>> = {
  rental_contract: 'BILL BOOK A4 rental.pdf',
  fines_notice: 'إشعار مخالفات ورسوم.pdf',
  debit_note: 'إشعار مدين.pdf',
  payment_demand: 'إنذار بالسداد.pdf',
  vehicle_record_card: 'بطاقة مركبة.pdf',
  vehicle_exit_permit: 'تصريح خروج مركبة.pdf',
  fleet_document_renewal_schedule: 'جدول تجديد وثائق الأسطول.pdf',
  official_letter: 'خطاب رسمي.pdf',
  payment_receipt: 'سند قبض.pdf',
  simplified_tax_invoice: 'فاتورة ضريبية مبسطة.pdf',
  tax_invoice: 'فاتورة ضريبية.pdf',
  account_statement: 'كشف حساب ..pdf',
  damage_claim: 'مطالبة أضرار.pdf',
  contract_extension: 'ملحق تمديد عقد.pdf',

  // No dedicated approved LPO / credit-note / quotation master exists in
  // docs/approved-forms today. These workflows therefore use the immutable
  // approved SPLENDOR letterhead as their source art rather than fabricating
  // a lookalike document.
  lpo: 'SPLENDOR_Letter-head.pdf',
  credit_note: 'SPLENDOR_Letter-head.pdf',
  quotation: 'SPLENDOR_Letter-head.pdf'
};

type OverlayItem = {
  value: unknown;
  x: number;
  y: number;
  w?: number;
  h?: number;
  align?: 'left' | 'center' | 'right';
  fontSize?: number;
  weight?: number;
  color?: string;
  dir?: 'rtl' | 'ltr' | 'auto';
  multiline?: boolean;
};

type OverlayRow = {
  y: number;
  height: number;
  cells: Array<{ value: unknown; x: number; w: number; align?: 'left' | 'center' | 'right' }>;
};

export type ApprovedCompositionAudit = {
  templateFile: string;
  templateSha256: string;
  serial: string;
  kind: CorporateDocumentKind;
  pages: number;
  composedAt: string;
};

function value(input: CorporateDocumentInput, path: string): unknown {
  const roots: Record<string, unknown> = {
    serial: input.serial,
    date: input.date,
    customer: input.customer || {},
    vehicle: input.vehicle || {},
    fields: input.fields || {},
    body: input.body || '',
    notes: input.notes || [],
    rows: input.rows || []
  };
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object') return (current as Record<string, unknown>)[key];
    return undefined;
  }, roots);
}

function printable(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
  return String(raw).trim();
}

function item(path: string, x: number, y: number, w = 22, options: Partial<OverlayItem> = {}): OverlayItem {
  return { value: path, x, y, w, h: 2.5, align: 'center', fontSize: 11, weight: 700, dir: 'auto', ...options };
}

function rowsFromInput(input: CorporateDocumentInput, startY: number, rowHeight: number, columns: Array<{ key: string; x: number; w: number }>, max = 8): OverlayRow[] {
  return (input.rows || []).slice(0, max).map((row, index) => ({
    y: startY + index * rowHeight,
    height: rowHeight,
    cells: columns.map(column => ({ value: row[column.key], x: column.x, w: column.w, align: 'center' }))
  }));
}

function commonReferenceItems(input: CorporateDocumentInput, serial: string): OverlayItem[] {
  return [
    { value: serial, x: 69, y: 29.7, w: 19, align: 'center', fontSize: 10, weight: 800, dir: 'ltr' },
    { value: input.date || new Date().toISOString().slice(0, 10), x: 13, y: 29.7, w: 18, align: 'center', fontSize: 10, weight: 700, dir: 'ltr' }
  ];
}

function formLayout(input: CorporateDocumentInput, serial: string): { items: OverlayItem[]; rows: OverlayRow[]; stamp?: { x: number; y: number; w: number; h: number } } {
  const f = input.fields || {};
  const c = input.customer || {};
  const v = input.vehicle || {};
  const base = commonReferenceItems(input, serial);

  switch (input.kind) {
    case 'rental_contract': {
      const corporate = String(f.customerType || c.customerType || '').toLowerCase() === 'company' || Boolean(c.companyName);
      const items: OverlayItem[] = [
        { value: corporate ? '✓' : '', x: 51.2, y: 20.2, w: 3, fontSize: 17 },
        { value: corporate ? '' : '✓', x: 20.7, y: 20.2, w: 3, fontSize: 17 },
        ...(corporate ? [
          { value: c.companyName || c.name, x: 62, y: 27.2, w: 27, align: 'left' as const },
          { value: c.tradeLicenseNumber, x: 62, y: 29.4, w: 27, align: 'left' as const },
          { value: c.trn || c.taxRegistrationNumber, x: 62, y: 31.6, w: 27, align: 'left' as const },
          { value: c.issuingCountry, x: 62, y: 33.8, w: 27, align: 'left' as const },
          { value: c.authorizedPerson || c.responsibleManager, x: 62, y: 36.1, w: 27, align: 'left' as const },
          { value: c.phone, x: 62, y: 38.3, w: 27, align: 'left' as const, dir: 'ltr' as const },
          { value: c.email, x: 62, y: 40.5, w: 27, align: 'left' as const, dir: 'ltr' as const },
          { value: c.poNumber, x: 62, y: 42.7, w: 27, align: 'left' as const, dir: 'ltr' as const }
        ] : [
          { value: c.name || c.fullName, x: 19, y: 27.2, w: 28, align: 'left' as const },
          { value: c.nationality, x: 19, y: 29.4, w: 28, align: 'left' as const },
          { value: c.idNumber || c.passportNumber, x: 19, y: 31.6, w: 28, align: 'left' as const, dir: 'ltr' as const },
          { value: c.idIssueDate, x: 19, y: 33.8, w: 28, align: 'left' as const, dir: 'ltr' as const },
          { value: c.idExpiryDate, x: 19, y: 36.1, w: 28, align: 'left' as const, dir: 'ltr' as const },
          { value: c.drivingLicenseNumber, x: 19, y: 38.3, w: 28, align: 'left' as const, dir: 'ltr' as const },
          { value: c.licenseIssueDate, x: 19, y: 40.5, w: 28, align: 'left' as const, dir: 'ltr' as const },
          { value: c.licenseExpiryDate, x: 19, y: 42.7, w: 28, align: 'left' as const, dir: 'ltr' as const },
          { value: c.internationalLicenseNumber, x: 19, y: 44.9, w: 28, align: 'left' as const, dir: 'ltr' as const },
          { value: c.licenseIssuingCountry || c.issuedFrom, x: 19, y: 47.1, w: 28, align: 'left' as const },
          { value: c.internationalLicenseIssueDate, x: 19, y: 49.3, w: 28, align: 'left' as const, dir: 'ltr' as const },
          { value: c.internationalLicenseExpiryDate, x: 19, y: 51.5, w: 28, align: 'left' as const, dir: 'ltr' as const },
          { value: c.phone, x: 19, y: 53.7, w: 28, align: 'left' as const, dir: 'ltr' as const },
          { value: c.email, x: 19, y: 55.9, w: 28, align: 'left' as const, dir: 'ltr' as const },
          { value: c.address, x: 19, y: 58.1, w: 28, align: 'left' as const }
        ]),
        { value: v.make || v.brand, x: 18, y: 63.8, w: 23, align: 'left' },
        { value: v.model, x: 55, y: 63.8, w: 22, align: 'left' },
        { value: v.year, x: 86, y: 63.8, w: 8, align: 'center', dir: 'ltr' },
        { value: v.color || v.exteriorColor, x: 16, y: 66.1, w: 17, align: 'left' },
        { value: v.plateNumber, x: 39, y: 66.1, w: 17, align: 'center', dir: 'ltr' },
        { value: f.odometerOut || v.mileage, x: 68, y: 66.1, w: 20, align: 'center', dir: 'ltr' },
        { value: f.pickupDate, x: 18, y: 70.6, w: 16, dir: 'ltr' },
        { value: f.pickupTime, x: 35, y: 70.6, w: 10, dir: 'ltr' },
        { value: f.returnDate, x: 18, y: 72.8, w: 16, dir: 'ltr' },
        { value: f.returnTime, x: 35, y: 72.8, w: 10, dir: 'ltr' },
        { value: f.rentalDuration, x: 18, y: 75.0, w: 25 },
        { value: f.rentalAmount, x: 67, y: 70.6, w: 20, dir: 'ltr' },
        { value: f.securityDeposit, x: 67, y: 72.8, w: 20, dir: 'ltr' },
        { value: f.paymentMethod, x: 62, y: 75.2, w: 31 },
        { value: f.additionalDriverName, x: 17, y: 81.5, w: 29, align: 'left' },
        { value: f.additionalDriverNationality, x: 61, y: 81.5, w: 28, align: 'left' },
        { value: f.additionalDriverLicense, x: 17, y: 83.7, w: 29, align: 'left', dir: 'ltr' },
        { value: f.additionalDriverId, x: 61, y: 83.7, w: 28, align: 'left', dir: 'ltr' },
        { value: f.additionalDriverLicenseIssueDate, x: 17, y: 85.9, w: 29, align: 'left', dir: 'ltr' },
        { value: f.additionalDriverPhone, x: 61, y: 85.9, w: 28, align: 'left', dir: 'ltr' },
        { value: serial, x: 73, y: 91.3, w: 17, fontSize: 9, dir: 'ltr', color: '#7f1118' }
      ];
      return { items, rows: [], stamp: corporate ? { x: 53.5, y: 48.6, w: 15, h: 10.5 } : { x: 72.5, y: 89.2, w: 13, h: 9 } };
    }

    case 'vehicle_record_card':
      return {
        items: [...base,
          item('vehicle.plateNumber', 66, 34.0, 21, { dir: 'ltr' }),
          item('vehicle.name', 20, 34.0, 28, { align: 'left' }),
          item('vehicle.vin', 66, 37.0, 21, { dir: 'ltr', fontSize: 9 }),
          item('vehicle.year', 20, 37.0, 28, { dir: 'ltr' }),
          item('vehicle.color', 66, 40.0, 21),
          item('vehicle.mileage', 20, 40.0, 28, { dir: 'ltr' }),
          item('fields.registrationExpiry', 66, 46.0, 21, { dir: 'ltr' }),
          item('fields.insuranceExpiry', 20, 46.0, 28, { dir: 'ltr' })
        ],
        rows: rowsFromInput(input, 56.2, 3.05, [
          { key: 'no', x: 89, w: 5 }, { key: 'date', x: 73, w: 16 }, { key: 'odometer', x: 57, w: 16 },
          { key: 'description', x: 31, w: 26 }, { key: 'cost', x: 18, w: 13 }, { key: 'provider', x: 6, w: 12 }
        ], 8),
        stamp: { x: 70, y: 83.5, w: 14, h: 10 }
      };

    case 'vehicle_exit_permit':
      return {
        items: [...base,
          item('fields.destination', 67, 33.3, 20), item('fields.exitDate', 20, 33.3, 22, { dir: 'ltr' }),
          item('vehicle.name', 67, 42.5, 20), item('vehicle.plateNumber', 20, 42.5, 22, { dir: 'ltr' }),
          item('vehicle.vin', 67, 45.6, 20, { dir: 'ltr', fontSize: 9 }), item('vehicle.year', 20, 45.6, 22, { dir: 'ltr' }),
          item('customer.name', 67, 52.2, 20), item('customer.idNumber', 20, 52.2, 22, { dir: 'ltr' }),
          item('customer.phone', 67, 55.2, 20, { dir: 'ltr' }), item('fields.licenseNumber', 20, 55.2, 22, { dir: 'ltr' })
        ], rows: [], stamp: { x: 66.5, y: 82.0, w: 14.5, h: 10.5 }
      };

    case 'contract_extension':
      return {
        items: [...base,
          item('customer.name', 65, 33.0, 23), item('fields.originalContractNumber', 18, 33.0, 25, { dir: 'ltr' }),
          item('vehicle.plateNumber', 65, 36.0, 23, { dir: 'ltr' }), item('fields.currentEndDate', 18, 36.0, 25, { dir: 'ltr' }),
          item('fields.newEndDate', 65, 44.2, 23, { dir: 'ltr' }), item('fields.extensionPeriod', 18, 44.2, 25),
          item('fields.currentOdometer', 65, 47.2, 23, { dir: 'ltr' }), item('fields.periodRent', 18, 47.2, 25, { dir: 'ltr' }),
          item('fields.paymentMethod', 65, 50.2, 23),
          item('fields.subtotal', 70, 70.5, 17, { dir: 'ltr' }), item('fields.vat', 70, 73.5, 17, { dir: 'ltr' }),
          item('fields.total', 70, 76.6, 17, { dir: 'ltr', fontSize: 13 })
        ], rows: [], stamp: { x: 68, y: 84, w: 15, h: 10.5 }
      };

    case 'payment_receipt':
      return {
        items: [...base,
          item('customer.name', 67, 34.1, 21), item('fields.contractNumber', 20, 34.1, 24, { dir: 'ltr' }),
          item('vehicle.plateNumber', 67, 37.1, 21, { dir: 'ltr' }),
          item('fields.amountInWords', 18, 63.8, 69, { align: 'right', multiline: true, fontSize: 9 }),
          item('fields.paymentMethod', 64, 67.3, 23), item('fields.referenceNumber', 18, 67.3, 28, { dir: 'ltr' }),
          item('fields.subtotal', 70, 72.2, 17, { dir: 'ltr' }), item('fields.vat', 70, 75.1, 17, { dir: 'ltr' }),
          item('fields.total', 70, 78.1, 17, { dir: 'ltr', fontSize: 13 })
        ],
        rows: rowsFromInput(input, 45.1, 3.05, [{ key: 'no', x: 89, w: 5 }, { key: 'description', x: 30, w: 59 }, { key: 'amount', x: 7, w: 23 }], 6),
        stamp: { x: 68, y: 84, w: 15, h: 10.5 }
      };

    case 'tax_invoice':
    case 'simplified_tax_invoice':
      return {
        items: [...base,
          item('customer.name', 66, 33.0, 23), item('customer.trn', 18, 33.0, 25, { dir: 'ltr', fontSize: 9 }),
          item('customer.address', 66, 36.0, 23), item('fields.contractNumber', 18, 36.0, 25, { dir: 'ltr' }),
          item('vehicle.name', 66, 39.0, 23), item('vehicle.plateNumber', 18, 39.0, 25, { dir: 'ltr' }),
          item('fields.supplyDate', 66, 42.0, 23, { dir: 'ltr' }), item('fields.rentalPeriod', 18, 42.0, 25),
          item('fields.subtotal', 72, 69.0, 15, { dir: 'ltr' }), item('fields.discount', 72, 72.0, 15, { dir: 'ltr' }),
          item('fields.taxable', 72, 75.0, 15, { dir: 'ltr' }), item('fields.vat', 72, 78.0, 15, { dir: 'ltr' }),
          item('fields.total', 72, 81.0, 15, { dir: 'ltr', fontSize: 13 })
        ],
        rows: rowsFromInput(input, 49.4, 3.05, [
          { key: 'no', x: 91, w: 4 }, { key: 'description', x: 63, w: 28 }, { key: 'quantity', x: 55, w: 8 },
          { key: 'unitPrice', x: 45, w: 10 }, { key: 'subtotal', x: 34, w: 11 }, { key: 'vatRate', x: 26, w: 8 },
          { key: 'vatAmount', x: 15, w: 11 }, { key: 'total', x: 5, w: 10 }
        ], 6),
        stamp: { x: 67.5, y: 85, w: 14.5, h: 10 }
      };

    case 'debit_note':
    case 'fines_notice':
    case 'damage_claim': {
      const columns = input.kind === 'fines_notice'
        ? [{ key: 'no', x: 91, w: 4 }, { key: 'date', x: 78, w: 13 }, { key: 'description', x: 53, w: 25 }, { key: 'issuer', x: 37, w: 16 }, { key: 'reference', x: 24, w: 13 }, { key: 'amount', x: 12, w: 12 }, { key: 'total', x: 4, w: 8 }]
        : [{ key: 'no', x: 91, w: 4 }, { key: 'description', x: 58, w: 33 }, { key: 'quantity', x: 49, w: 9 }, { key: 'unitPrice', x: 38, w: 11 }, { key: 'subtotal', x: 27, w: 11 }, { key: 'vatRate', x: 19, w: 8 }, { key: 'vatAmount', x: 10, w: 9 }, { key: 'total', x: 3, w: 7 }];
      return {
        items: [...base,
          item('customer.name', 66, 33.0, 23), item('fields.contractNumber', 18, 33.0, 25, { dir: 'ltr' }),
          item('vehicle.plateNumber', 66, 36.0, 23, { dir: 'ltr' }), item('fields.originalInvoiceNumber', 18, 36.0, 25, { dir: 'ltr' }),
          item('fields.reason', 50, 39.0, 38, { align: 'right' }),
          item('fields.subtotal', 72, 69.0, 15, { dir: 'ltr' }), item('fields.vat', 72, 72.0, 15, { dir: 'ltr' }),
          item('fields.total', 72, 75.0, 15, { dir: 'ltr', fontSize: 13 })
        ], rows: rowsFromInput(input, 48.0, 3.05, columns, 6), stamp: { x: 67.5, y: 84.5, w: 14.5, h: 10 }
      };
    }

    case 'account_statement':
      return {
        items: [...base,
          item('fields.contractNumber', 68, 33.1, 19, { dir: 'ltr' }), item('fields.contractDate', 19, 33.1, 25, { dir: 'ltr' }),
          item('customer.name', 68, 36.1, 19), item('vehicle.name', 19, 36.1, 25),
          item('vehicle.plateNumber', 68, 39.1, 19, { dir: 'ltr' }), item('fields.asOfDate', 19, 39.1, 25, { dir: 'ltr' }),
          item('fields.totalDue', 67, 78.0, 23, { dir: 'ltr', fontSize: 18, color: '#ffffff' }),
          item('fields.receiptNumber', 67, 83.0, 23, { dir: 'ltr', color: '#ffffff' })
        ], rows: rowsFromInput(input, 47.3, 3.05, [
          { key: 'no', x: 92, w: 4 }, { key: 'date', x: 77, w: 15 }, { key: 'description', x: 51, w: 26 },
          { key: 'debit', x: 35, w: 16 }, { key: 'credit', x: 19, w: 16 }, { key: 'balance', x: 4, w: 15 }
        ], 7), stamp: { x: 17, y: 82, w: 14, h: 10 }
      };

    case 'payment_demand':
      return {
        items: [...base,
          item('customer.name', 65, 33.2, 23), item('fields.contractNumber', 18, 33.2, 25, { dir: 'ltr' }),
          item('fields.amountDue', 65, 36.2, 23, { dir: 'ltr' }), item('fields.dueSince', 18, 36.2, 25, { dir: 'ltr' }),
          { value: input.body || f.message, x: 11, y: 43.5, w: 78, h: 25, align: 'right', fontSize: 10.5, weight: 500, multiline: true, dir: 'rtl' }
        ], rows: [], stamp: { x: 68, y: 84, w: 15, h: 10.5 }
      };

    case 'official_letter':
    case 'lpo':
    case 'credit_note':
    case 'quotation':
      return {
        items: [
          { value: serial, x: 67, y: 27.4, w: 21, align: 'center', fontSize: 10, weight: 800, dir: 'ltr' },
          { value: input.date || new Date().toISOString().slice(0, 10), x: 14, y: 27.4, w: 19, align: 'center', fontSize: 10, weight: 700, dir: 'ltr' },
          { value: f.recipient || f.supplierName || c.name, x: 16, y: 34.0, w: 72, align: 'right', fontSize: 11, weight: 700 },
          { value: f.subject || input.title || '', x: 16, y: 38.0, w: 72, align: 'right', fontSize: 11, weight: 800 },
          { value: input.body || f.termsAndConditions || '', x: 12, y: 43.0, w: 76, h: 34, align: 'right', fontSize: 10.5, weight: 500, multiline: true, dir: 'rtl' }
        ], rows: [], stamp: { x: 67, y: 80.5, w: 15, h: 10.5 }
      };

    case 'fleet_document_renewal_schedule':
      return {
        items: [...base],
        rows: rowsFromInput(input, 43.8, 3.18, [
          { key: 'no', x: 92, w: 4 }, { key: 'vehicle', x: 70, w: 22 }, { key: 'plateNumber', x: 57, w: 13 },
          { key: 'registrationExpiry', x: 39, w: 18 }, { key: 'insuranceExpiry', x: 21, w: 18 }, { key: 'status', x: 5, w: 16 }
        ], 10), stamp: { x: 69, y: 84, w: 14, h: 10 }
      };

    default:
      return { items: base, rows: [], stamp: { x: 68, y: 84, w: 14, h: 10 } };
  }
}

function resolveItemValue(input: CorporateDocumentInput, overlay: OverlayItem): string {
  if (typeof overlay.value === 'string' && /^(serial|date|customer|vehicle|fields|body|notes|rows)(\.|$)/.test(overlay.value)) {
    return printable(value(input, overlay.value));
  }
  return printable(overlay.value);
}

function overlayItemHtml(input: CorporateDocumentInput, overlay: OverlayItem): string {
  const raw = resolveItemValue(input, overlay);
  if (!raw) return '';
  const safe = escapeHtml(raw).replace(/\n/g, '<br/>');
  const whiteSpace = overlay.multiline ? 'pre-wrap' : 'nowrap';
  return `<div style="position:absolute;left:${overlay.x}%;top:${overlay.y}%;width:${overlay.w || 20}%;height:${overlay.h || 2.5}%;display:flex;align-items:${overlay.multiline ? 'flex-start' : 'center'};justify-content:${overlay.align === 'left' ? 'flex-start' : overlay.align === 'right' ? 'flex-end' : 'center'};overflow:hidden;text-align:${overlay.align || 'center'};direction:${overlay.dir || 'auto'};font-size:${overlay.fontSize || 11}px;font-weight:${overlay.weight || 700};color:${overlay.color || '#261d19'};line-height:1.35;white-space:${whiteSpace};padding:0 2px">${safe}</div>`;
}

function rowHtml(row: OverlayRow): string {
  return row.cells.map(cell => {
    const safe = escapeHtml(printable(cell.value));
    return `<div style="position:absolute;left:${cell.x}%;top:${row.y}%;width:${cell.w}%;height:${row.height}%;display:flex;align-items:center;justify-content:center;overflow:hidden;text-align:${cell.align || 'center'};direction:auto;font-size:9px;font-weight:650;color:#261d19;line-height:1.15;padding:0 2px">${safe}</div>`;
  }).join('');
}

function overlayHtml(input: CorporateDocumentInput, serial: string): string {
  const layout = formLayout({ ...input, serial }, serial);
  const items = layout.items.map(entry => overlayItemHtml({ ...input, serial }, entry)).join('');
  const rows = layout.rows.map(rowHtml).join('');
  const stamp = layout.stamp
    ? `<img aria-label="Approved Splendor corporate seal" src="${officialSealDataUri()}" style="position:absolute;left:${layout.stamp.x}%;top:${layout.stamp.y}%;width:${layout.stamp.w}%;height:${layout.stamp.h}%;object-fit:contain;opacity:.93" />`
    : '';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><style>
html,body{margin:0;width:794px;height:1123px;overflow:hidden;background:transparent!important}*{box-sizing:border-box}body{position:relative;font-family:"Noto Sans Arabic","Noto Sans",Tahoma,Arial,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
</style></head><body>${items}${rows}${stamp}</body></html>`;
}

function resolveTemplatePath(templateFile: string): string {
  const candidates = [
    join(process.cwd(), 'docs', 'approved-forms', templateFile),
    join(process.cwd(), 'dist', 'approved-forms', templateFile),
    join(process.cwd(), 'approved-forms', templateFile)
  ];
  for (const candidate of candidates) {
    try {
      const bytes = readFileSync(candidate);
      if (bytes.length) return candidate;
    } catch {
      // Continue to exact build/development candidates only. There is no
      // remotely downloaded, regenerated, or substitute master fallback.
    }
  }
  throw new Error(`Approved PDF master is missing: ${templateFile}. Refusing to render a substitute document.`);
}

async function transparentOverlayPng(input: CorporateDocumentInput, serial: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.setContent(overlayHtml(input, serial), { waitUntil: 'domcontentloaded' });
    const screenshot = await page.screenshot({ type: 'png', omitBackground: true, captureBeyondViewport: false });
    return Buffer.from(screenshot);
  } finally {
    await browser.close();
  }
}

export async function composeApprovedCorporateDocument(input: CorporateDocumentInput, serial: string): Promise<{ pdf: Buffer; audit: ApprovedCompositionAudit }> {
  const templateFile = APPROVED_DOCUMENT_TEMPLATE[input.kind];
  if (!templateFile) throw new Error(`No approved PDF master is registered for document kind: ${input.kind}.`);
  const templatePath = resolveTemplatePath(templateFile);
  const templateBytes = readFileSync(templatePath);
  const templateSha256 = createHash('sha256').update(templateBytes).digest('hex');
  const source = await PDFDocument.load(templateBytes, { updateMetadata: false });
  const pages = source.getPages();
  if (pages.length === 0) throw new Error(`Approved PDF master has no pages: ${templateFile}.`);

  const overlayBytes = await transparentOverlayPng(input, serial);
  const overlay = await source.embedPng(overlayBytes);
  const first = pages[0];
  const { width, height } = first.getSize();
  first.drawImage(overlay, { x: 0, y: 0, width, height });

  // Preserve all original pages verbatim as the source document structure;
  // only page 1 receives the transparent business-data layer. This is
  // especially important for the approved two-page rental agreement whose
  // terms/conditions page must remain unchanged.
  source.setProducer('Splendor OS - Approved Source Art Composer');
  const pdf = Buffer.from(await source.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false }));
  return {
    pdf,
    audit: {
      templateFile,
      templateSha256,
      serial,
      kind: input.kind,
      pages: pages.length,
      composedAt: new Date().toISOString()
    }
  };
}
