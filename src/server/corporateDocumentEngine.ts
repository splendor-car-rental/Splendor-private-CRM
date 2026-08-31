import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { issueNextNumber } from './idGenerator';
import { LTO_LETTERHEAD_HEADER_PNG_BASE64, LTO_LETTERHEAD_FOOTER_PNG_BASE64 } from './assets/ltoLetterheadAsset';
import { escapeHtml } from './htmlEscape';
import { applyCorporateStamp } from './corporateDocumentStamp';

/**
 * Corporate stationery is an immutable master asset.
 * IMPORTANT: do not redraw, recreate, crop, rewrite, recolor, or otherwise
 * regenerate the approved header/footer. This engine only renders business
 * content inside the document body between the fixed bands.
 */
export type CorporateDocumentKind =
  | 'lpo'
  | 'credit_note'
  | 'fines_notice'
  | 'debit_note'
  | 'contract_extension'
  | 'payment_receipt'
  | 'tax_invoice'
  | 'simplified_tax_invoice'
  | 'official_letter'
  | 'vehicle_record_card'
  | 'vehicle_exit_permit'
  | 'account_statement'
  | 'quotation';

export interface CorporateDocumentInput {
  kind: CorporateDocumentKind;
  title?: string;
  serial?: string;
  date?: string;
  customer?: Record<string, unknown>;
  vehicle?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  notes?: string[];
  body?: string;
}

export interface IssuedCorporateDocument {
  serial: string;
  kind: CorporateDocumentKind;
  pdf: Buffer;
  fileName: string;
}

const META: Record<CorporateDocumentKind, { ar: string; en: string; numbering: string }> = {
  lpo: { ar: 'أمر شراء / أمر توريد', en: 'LPO / PURCHASE ORDER', numbering: 'purchaseorder' },
  credit_note: { ar: 'إشعار دائن', en: 'CREDIT NOTE', numbering: 'document' },
  fines_notice: { ar: 'إشعار مخالفات ورسوم', en: 'FINES & CHARGES NOTICE', numbering: 'document' },
  debit_note: { ar: 'إشعار مدين', en: 'DEBIT NOTE', numbering: 'document' },
  contract_extension: { ar: 'ملحق تمديد عقد إيجار', en: 'CONTRACT EXTENSION ADDENDUM', numbering: 'contract' },
  payment_receipt: { ar: 'سند قبض', en: 'PAYMENT RECEIPT', numbering: 'receipt' },
  tax_invoice: { ar: 'فاتورة ضريبية', en: 'TAX INVOICE', numbering: 'invoice' },
  simplified_tax_invoice: { ar: 'فاتورة ضريبية مبسطة', en: 'SIMPLIFIED TAX INVOICE', numbering: 'invoice' },
  official_letter: { ar: 'مكاتبة رسمية', en: 'OFFICIAL LETTER', numbering: 'document' },
  vehicle_record_card: { ar: 'بطاقة مركبة', en: 'VEHICLE RECORD CARD', numbering: 'document' },
  vehicle_exit_permit: { ar: 'تصريح خروج مركبة خارج الدولة', en: 'VEHICLE EXIT PERMIT', numbering: 'document' },
  account_statement: { ar: 'كشف حساب', en: 'ACCOUNT STATEMENT', numbering: 'accountstatement' },
  quotation: { ar: 'عرض سعر', en: 'QUOTATION', numbering: 'quotation' }
};

function text(value: unknown): string {
  return value === undefined || value === null || value === '' ? '' : escapeHtml(String(value));
}

function money(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return text(value);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function field(label: string, value: unknown): string {
  return `<div class="field"><div class="label">${escapeHtml(label)}</div><div class="value">${text(value) || '—'}</div></div>`;
}

function fieldsBlock(fields: Record<string, unknown>): string {
  return `<section class="fields">${Object.entries(fields).map(([label, value]) => field(label, value)).join('')}</section>`;
}

function table(headers: string[], rows: Array<Record<string, unknown>>, keys?: string[]): string {
  const resolvedKeys = keys || Object.keys(rows[0] || {});
  return `<table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${resolvedKeys.map(k => `<td>${text(row[k]) || '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function summaryBox(items: Array<[string, unknown]>, total?: [string, unknown]): string {
  const body = items.map(([label, value]) => `<div class="summary-line"><span>${escapeHtml(label)}</span><strong>${money(value)}</strong></div>`).join('');
  const totalHtml = total ? `<div class="summary-total"><span>${escapeHtml(total[0])}</span><strong>${money(total[1])} AED</strong></div>` : '';
  return `<div class="summary-box">${body}${totalHtml}</div>`;
}

function notesBlock(notes: string[] = []): string {
  if (!notes.length) return '';
  return `<section class="notes"><h3>ملاحظات</h3>${notes.map(n => `<p>${text(n)}</p>`).join('')}</section>`;
}

function renderBody(input: CorporateDocumentInput, serial: string): string {
  const meta = META[input.kind];
  const f = input.fields || {};
  const rows = input.rows || [];
  const customer = input.customer || {};
  const vehicle = input.vehicle || {};

  const heading = `<div class="document-heading"><h1>${escapeHtml(input.title || meta.ar)}</h1><div class="subtitle">${escapeHtml(meta.en)}</div><div class="reference">رقم المستند: <strong>${escapeHtml(serial)}</strong> &nbsp; • &nbsp; التاريخ: <strong>${text(input.date) || new Date().toISOString().slice(0, 10)}</strong></div></div>`;

  switch (input.kind) {
    case 'official_letter':
      return `${heading}<div class="letter-meta">${field('المرجع', f.reference)}${field('التاريخ', input.date)}${field('إلى / السيد', f.recipient)}${field('الموضوع', f.subject)}</div><div class="letter-body">${text(input.body || '')}</div><div class="signature-grid"><div>الاسم: ${text(f.signatoryName) || '—'}<br/>المنصب: ${text(f.signatoryTitle) || '—'}</div><div>التوقيع والختم: ____________________</div></div>`;
    case 'vehicle_record_card':
      return `${heading}<h2>بيانات المركبة</h2>${fieldsBlock(vehicle)}<h2>الوثائق والتواريخ</h2>${fieldsBlock(f)}${rows.length ? table(['م', 'التاريخ', 'قراءة العداد', 'البيان / نوع العملية', 'التكلفة', 'الجهة'], rows) : ''}${notesBlock(input.notes)}`;
    case 'vehicle_exit_permit':
      return `${heading}<h2>بيانات التصريح</h2>${fieldsBlock(f)}<h2>بيانات المركبة</h2>${fieldsBlock(vehicle)}<h2>بيانات السائق</h2>${fieldsBlock(customer)}<section class="prose"><h3>التصريح — Authorization</h3><p>${text(input.body || 'يصرح هذا المستند للسائق المحدد أعلاه باستخدام المركبة للوجهة المحددة، وفق شروط وأحكام عقد الإيجار. يظل المستأجر مسؤولاً عن المركبة وعن أي مخالفات أو أضرار أو التزامات ناشئة عنها داخل دولة الإمارات العربية المتحدة أو خارجها.')}</p></section><div class="signature-grid"><div>توقيع السائق / المستأجر: ____________________</div><div>ختم وتوقيع سبلندر لتأجير السيارات: ____________________</div></div>`;
    case 'contract_extension':
      return `${heading}<h2>بيانات العقد والعميل</h2>${fieldsBlock({ 'اسم العميل': customer.name, 'رقم العقد الأصلي': f.originalContractNumber, 'رقم اللوحة': vehicle.plateNumber })}<h2>تفاصيل التمديد</h2>${fieldsBlock({ 'تاريخ انتهاء المدة الحالية': f.currentEndDate, 'تاريخ الانتهاء الجديد': f.newEndDate, 'مدة التمديد': f.extensionPeriod, 'قراءة العداد الحالية': f.currentOdometer, 'قيمة الإيجار للفترة': f.periodRent, 'طريقة الدفع': f.paymentMethod })}<section class="prose"><h3>أثر التمديد</h3><p>${text(input.body || 'اتفق الطرفان على تمديد مدة عقد الإيجار للفترة المحددة في هذا الملحق، وتظل جميع شروط وأحكام العقد الأصلي والأحكام العامة المرفقة به سارية دون تغيير، ويعد هذا الملحق جزءاً لا يتجزأ منه.')}</p></section>${summaryBox([['قيمة التمديد قبل الضريبة', f.subtotal], ['ضريبة القيمة المضافة (5%)', f.vat]], ['إجمالي قيمة التمديد', f.total])}<div class="signature-grid"><div>توقيع المستأجر: ____________________</div><div>ختم وتوقيع سبلندر لتأجير السيارات: ____________________</div></div>`;
    case 'payment_receipt':
      return `${heading}<h2>بيانات السند</h2>${fieldsBlock({ 'اسم العميل': customer.name, 'رقم عقد الإيجار': f.contractNumber, 'رقم اللوحة': vehicle.plateNumber })}${rows.length ? table(['م', 'البيان', 'المبلغ (درهم)'], rows) : ''}<div class="wide-field">المبلغ المستلم كتابةً: ${text(f.amountInWords) || '—'}</div><div class="wide-field">طريقة الدفع: ${text(f.paymentMethod) || '—'} &nbsp;&nbsp; رقم المرجع: ${text(f.referenceNumber) || '—'}</div>${summaryBox([['إجمالي المبلغ قبل الضريبة', f.subtotal], ['ضريبة القيمة المضافة (5%)', f.vat]], ['إجمالي المبلغ المستلم', f.total])}${notesBlock(input.notes)}<div class="signature-grid"><div>توقيع المستلم (العميل): ____________________</div><div>ختم وتوقيع سبلندر لتأجير السيارات: ____________________</div></div>`;
    case 'tax_invoice':
    case 'simplified_tax_invoice':
      return `${heading}<h2>بيانات الفاتورة</h2>${fieldsBlock({ 'اسم العميل': customer.name, 'الرقم الضريبي للعميل (TRN)': customer.trn, 'عنوان العميل': customer.address, 'رقم عقد الإيجار': f.contractNumber, 'نوع السيارة': vehicle.name, 'رقم اللوحة': vehicle.plateNumber, 'مدة الإيجار': f.rentalPeriod, 'تاريخ التوريد': f.supplyDate })}${rows.length ? table(['م', 'البيان', 'الكمية', 'سعر الوحدة', 'المبلغ قبل الضريبة', 'الضريبة %', 'قيمة الضريبة', 'الإجمالي شامل الضريبة'], rows) : ''}${summaryBox([['الإجمالي قبل الضريبة', f.subtotal], ['الخصم', f.discount], ['صافي المبلغ الخاضع للضريبة', f.taxable], ['ضريبة القيمة المضافة (5%)', f.vat]], ['الإجمالي المستحق شامل الضريبة', f.total])}${notesBlock(input.notes)}<div class="signature-grid"><div>توقيع العميل: ____________________</div><div>ختم وتوقيع سبلندر لتأجير السيارات: ____________________</div></div>`;
    case 'credit_note':
    case 'debit_note':
      return `${heading}<h2>بيانات الإشعار</h2>${fieldsBlock({ 'اسم العميل': customer.name, 'الرقم الضريبي للعميل (TRN)': customer.trn, 'رقم الفاتورة الأصلية': f.originalInvoiceNumber, 'تاريخ الفاتورة الأصلية': f.originalInvoiceDate, 'رقم عقد الإيجار': f.contractNumber, 'رقم اللوحة': vehicle.plateNumber, 'سبب الإصدار': f.reason })}${rows.length ? table(['م', 'البيان', 'الكمية', 'سعر الوحدة', 'المبلغ قبل الضريبة', 'الضريبة %', 'قيمة الضريبة', 'الإجمالي شامل الضريبة'], rows) : ''}${summaryBox([['الإجمالي قبل الضريبة', f.subtotal], ['ضريبة القيمة المضافة (5%)', f.vat]], (input.kind === 'credit_note' ? ['إجمالي قيمة الإشعار الدائن', f.total] : ['إجمالي قيمة الإشعار المدين', f.total]) as [string, unknown])}${notesBlock(input.notes)}<div class="signature-grid"><div>توقيع العميل: ____________________</div><div>ختم وتوقيع سبلندر لتأجير السيارات: ____________________</div></div>`;
    case 'fines_notice':
      return `${heading}<h2>بيانات العميل والعقد</h2>${fieldsBlock({ 'اسم العميل': customer.name, 'رقم عقد الإيجار': f.contractNumber, 'رقم اللوحة': vehicle.plateNumber })}${rows.length ? table(['م', 'التاريخ', 'البيان', 'الجهة المصدرة', 'رقم المخالفة', 'المبلغ', 'الإجمالي'], rows) : ''}${summaryBox([['إجمالي المخالفات ورسوم سالك', f.finesTotal], ['الرسوم الإدارية', f.adminFees]], ['الإجمالي المستحق', f.total])}${notesBlock(input.notes)}<div class="signature-grid"><div>إقرار العميل بالاستلام: ____________________</div><div>ختم وتوقيع سبلندر لتأجير السيارات: ____________________</div></div>`;
    case 'lpo':
      return `${heading}<h2>بيانات أمر التوريد</h2>${fieldsBlock({ 'المورد': f.supplierName, 'تاريخ التوريد': f.deliveryDate, 'شروط الدفع': f.paymentTerms, 'مرجع المورد': f.supplierReference, 'مركز التكلفة': f.costCenter })}${rows.length ? table(['م', 'الوصف', 'الكمية', 'سعر الوحدة', 'الإجمالي'], rows) : ''}${summaryBox([['الإجمالي قبل الضريبة', f.subtotal], ['ضريبة القيمة المضافة (5%)', f.vat]], ['إجمالي أمر التوريد', f.total])}${notesBlock(input.notes)}<div class="signature-grid"><div>إعداد: ____________________</div><div>اعتماد الإدارة: ____________________</div></div>`;
    case 'account_statement':
      return `<div class="statement-top"><div class="statement-title"><h1>كشف حساب</h1><div class="statement-en">ACCOUNT STATEMENT</div><div class="as-of">حتى تاريخ ${text(f.asOfDate || input.date) || '—'}</div></div><div class="statement-info">${fieldsBlock({ 'رقم عقد الإيجار': f.contractNumber, 'تاريخ العقد': f.contractDate, 'اسم العميل': customer.name, 'نوع السيارة': vehicle.name, 'رقم اللوحة': vehicle.plateNumber })}</div></div>${rows.length ? table(['م', 'التاريخ', 'البيان', 'مستحق (مدين)', 'مدفوع (دائن)', 'الرصيد'], rows, ['no', 'date', 'description', 'debit', 'credit', 'balance']) : ''}<div class="statement-bottom"><div class="statement-notes"><h3>ملاحظات</h3><p>الأقساط تستحق في اليوم الأول من كل شهر حسب شروط العقد الموقع بين الطرفين.</p><p>جميع مبالغ سالك والمخالفات والمواقف هي على عاتق المستأجر وفقاً لبنود العقد.</p><p>${text((input.notes || [])[0]) || 'يرجى مراجعة الكشف والتواصل مع الشركة في حال وجود أي استفسار.'}</p></div><div class="amount-due"><div class="amount-title">إجمالي المبلغ المستحق</div><div class="amount-value">${money(f.totalDue)} AED</div><div class="amount-label">رقم إيصال</div><div class="receipt-ref">${text(f.receiptNumber) || '—'}</div><p>يرجى سداد المبلغ المستحق خلال 3 أيام من تاريخ الكشف.</p></div></div><div class="statement-thanks">نشكر لكم على ثقتكم واختياركم سبلندر لتأجير السيارات، ونسعد دائماً بخدمتكم.</div>`;
    case 'quotation':
      return `${heading}<h2>بيانات العميل والمركبة</h2>${fieldsBlock({ 'اسم العميل': customer.name, 'الهاتف': customer.phone, 'البريد الإلكتروني': customer.email, 'نوع السيارة': vehicle.name, 'رقم اللوحة': vehicle.plateNumber, 'تاريخ ووقت الاستلام': f.startDate, 'تاريخ ووقت التسليم': f.endDate, 'مدة الإيجار': f.durationDays ? `${f.durationDays} يوم / Days` : '', 'صلاحية العرض حتى': f.validUntil })}<h2>تفاصيل التسعير | PRICING DETAILS</h2>${rows.length ? table(['م', 'البيان', 'المدة / الكمية', 'سعر الوحدة', 'الإجمالي'], rows, ['no', 'description', 'quantity', 'unitPrice', 'total']) : ''}${summaryBox([['قيمة الإيجار الأساسية', f.baseTotal], ['الخدمات الإضافية', f.extraServicesTotal], ['الخصم', f.discountAmount]], ['الإجمالي قبل الضريبة', f.subtotal])}${summaryBox([['ضريبة القيمة المضافة (5%)', f.vatAmount], ['مبلغ التأمين', f.securityDeposit]], ['الإجمالي النهائي شامل الضريبة', f.grandTotal])}${notesBlock(input.notes)}<section class="prose"><h3>الشروط والملاحظات</h3><p>${text(f.termsAndConditions || input.body || 'هذا العرض صالح للفترة المحددة أعلاه، ويخضع لتوافر المركبة وشروط وأحكام الإيجار المعتمدة لدى سبلندر لتأجير السيارات.')}</p></section><div class="signature-grid"><div>توقيع العميل: ____________________</div><div>ختم وتوقيع سبلندر لتأجير السيارات: ____________________</div></div>`;
  }
}

export function buildCorporateDocumentHtml(input: CorporateDocumentInput, serial: string): string {
  const body = applyCorporateStamp(renderBody(input, serial));
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@page { size:A4; margin: 30mm 0 24mm 0; }
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#242424;font-family:"Noto Sans Arabic","Noto Sans",Arial,sans-serif}body{font-size:10.5pt;line-height:1.65;padding:0 14mm 0 14mm}.document-heading{border-bottom:2px solid #c9a227;padding:2mm 0 4mm;margin-bottom:5mm;text-align:center}.document-heading h1{margin:0;color:#8e1118;font-size:20pt;font-weight:700}.subtitle{margin-top:1mm;color:#857d75;letter-spacing:4px;font-size:9pt}.reference{margin-top:3mm;font-size:8.5pt;color:#5f5a55}.reference strong{color:#7d0d14}.fields{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #e6dfd6;background:#fbf8f3;margin:0 0 5mm}.field{min-height:18mm;padding:3mm 4mm;border-left:1px solid #e6dfd6;border-bottom:1px solid #e6dfd6}.field:nth-child(3n){border-left:0}.field:nth-last-child(-n+3){border-bottom:0}.label{color:#8e1118;font-size:8.5pt;margin-bottom:1mm}.value{font-weight:600;color:#2e2b28;min-height:5mm}.letter-meta{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-bottom:6mm}.letter-body,.prose,.notes{border:1px solid #e5dfd7;padding:5mm;margin:5mm 0;background:#fff}.prose h3,.notes h3{margin:0 0 3mm;color:#8e1118;font-size:12pt}.prose p,.notes p{margin:1.5mm 0}.wide-field{border:1px solid #e5dfd7;padding:4mm;margin:4mm 0;background:#fbf8f3}.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:18mm;margin-top:12mm;padding-top:4mm}.signature-grid>div{min-height:18mm;border-top:1px solid #c9a227;padding-top:2mm;color:#6d665f;display:flex;align-items:flex-start;justify-content:center;position:relative}.corporate-stamp-anchor{display:inline-flex;align-items:center;justify-content:center;width:42mm;height:30mm;vertical-align:middle;flex:0 0 auto}.corporate-stamp-anchor img{width:30mm;height:30mm;object-fit:contain;display:block}.corporate-approval-block{display:flex;justify-content:flex-end;margin-top:10mm;min-height:34mm}.corporate-approval-block .corporate-stamp-anchor{width:38mm;height:34mm}.corporate-approval-block .corporate-stamp-anchor img{width:34mm;height:34mm}h2{background:#8e1118;color:#fff;border-bottom:2px solid #c9a227;padding:2.5mm 4mm;margin:5mm 0 0;font-size:11.5pt}table{width:100%;border-collapse:collapse;margin:0 0 5mm;font-size:8.5pt;page-break-inside:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#a90f18;color:#fff;padding:2.5mm 2mm;border:1px solid #c9a227;font-weight:700}td{padding:2.3mm 2mm;border:1px solid #e6e0d8;text-align:center}tbody tr:nth-child(even){background:#fcf5f3}.summary-box{margin:5mm 0 0 50%;border:1px solid #d9d0c6;background:#fbf8f3}.summary-line,.summary-total{display:flex;justify-content:space-between;padding:2.5mm 4mm;border-bottom:1px solid #e3ddd6}.summary-total{background:#8e1118;color:#fff;border-bottom:0;font-size:11pt}.summary-total strong{color:#fff}.statement-top{display:grid;grid-template-columns:1.05fr 1.45fr;gap:6mm;align-items:start;margin-bottom:5mm}.statement-title{padding-top:4mm;text-align:center}.statement-title h1{margin:0;color:#8e1118;font-size:23pt}.statement-en{color:#857d75;letter-spacing:3px;font-size:8.5pt;margin-top:1mm}.as-of{color:#a90f18;border-bottom:1px solid #c9a227;display:inline-block;padding:1mm 5mm;margin-top:3mm}.statement-info .fields{margin-bottom:0}.statement-info .field{min-height:15mm}.statement-bottom{display:grid;grid-template-columns:1.15fr .85fr;gap:6mm;margin-top:2mm;align-items:stretch}.statement-notes{border:1px solid #d9d0c6;background:#fbf8f3;padding:4mm}.statement-notes h3{margin:0 0 2mm;color:#8e1118;font-size:12pt}.statement-notes p{font-size:8.5pt;margin:1.5mm 0}.amount-due{background:#8e1118;color:#fff;border:2px solid #c9a227;padding:5mm;text-align:center}.amount-title{font-size:11pt}.amount-value{font-size:20pt;font-weight:800;margin:3mm 0;color:#fff}.amount-label{font-size:8.5pt;color:#f1d889}.receipt-ref{font-weight:700;font-size:10pt;margin-top:1mm}.amount-due p{font-size:7.5pt;color:#f7ead0;margin:4mm 0 0}.statement-thanks{text-align:center;color:#8e1118;font-size:8.5pt;margin-top:4mm;padding-top:3mm;border-top:1px solid #c9a227}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body>${body}</body></html>`;
}

async function launchBrowser() {
  return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
}

export async function issueAndRenderCorporateDocument(input: CorporateDocumentInput): Promise<IssuedCorporateDocument> {
  const meta = META[input.kind];
  const serial = input.serial || await issueNextNumber(meta.numbering);
  const html = buildCorporateDocumentHtml(input, serial);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdf = Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="width:100%;margin:0;padding:0"><img src="data:image/png;base64,${LTO_LETTERHEAD_HEADER_PNG_BASE64}" style="width:100%;display:block" /></div>`,
      footerTemplate: `<div style="width:100%;margin:0;padding:0"><img src="data:image/png;base64,${LTO_LETTERHEAD_FOOTER_PNG_BASE64}" style="width:100%;display:block" /></div>`,
      margin: { top: '30mm', bottom: '24mm', left: '0', right: '0' }
    }));
    return { serial, kind: input.kind, pdf, fileName: `${serial}-${meta.en.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf` };
  } finally {
    await browser.close();
  }
}

export function getCorporateDocumentMeta(kind: CorporateDocumentKind) {
  return META[kind];
}
