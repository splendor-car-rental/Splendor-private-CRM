import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeApprovedCorporateDocument } from '../src/server/approvedDocumentComposer';
import type { CorporateDocumentInput } from '../src/server/corporateDocumentEngine';

const out = join(process.cwd(), 'tmp', 'composed-documents');
mkdirSync(out, { recursive: true });

const baseCustomer = {
  name: 'أحمد محمد سالم', fullName: 'أحمد محمد سالم', nationality: 'United Arab Emirates',
  idNumber: '784-1990-1234567-1', idIssueDate: '2025-01-02', idExpiryDate: '2030-01-01',
  drivingLicenseNumber: 'DXB-1234567', licenseIssueDate: '2024-03-10', licenseExpiryDate: '2029-03-09',
  licenseIssuingCountry: 'United Arab Emirates', phone: '+971501234567', email: 'customer@example.com', address: 'Dubai, UAE'
};
const baseVehicle = { name: 'Mercedes-AMG G63', make: 'Mercedes-Benz', model: 'G63', year: 2026, color: 'Black', plateNumber: 'A 12345', vin: 'W1NZZZTEST1234567', mileage: 14500 };
const invoiceRows = [
  { no: 1, description: 'إيجار مركبة - شهر سبتمبر', quantity: 1, unitPrice: 10000, subtotal: 10000, vatRate: 5, vatAmount: 500, total: 10500 },
  { no: 2, description: 'سالك ومواقف', quantity: 1, unitPrice: 250, subtotal: 250, vatRate: 5, vatAmount: 12.5, total: 262.5 }
];

const samples: Array<{ name: string; serial: string; input: CorporateDocumentInput }> = [
  {
    name: '01-rental-contract', serial: 'CON-2026-000123',
    input: { kind: 'rental_contract', date: '2026-09-02', customer: baseCustomer, vehicle: baseVehicle, fields: { pickupDate: '2026-09-02', pickupTime: '10:30', returnDate: '2026-09-09', returnTime: '10:30', rentalDuration: '7 days', rentalAmount: 5000, securityDeposit: 2000, paymentMethod: 'Card', odometerOut: 14500 } }
  },
  {
    name: '02-tax-invoice', serial: 'INV-2026-000123',
    input: { kind: 'tax_invoice', date: '2026-09-02', customer: { ...baseCustomer, trn: '100000000000003' }, vehicle: baseVehicle, fields: { contractNumber: 'CON-2026-000123', supplyDate: '2026-09-02', rentalPeriod: '02/09/2026 - 09/09/2026', subtotal: 10250, discount: 0, taxable: 10250, vat: 512.5, total: 10762.5 }, rows: invoiceRows }
  },
  {
    name: '03-payment-receipt', serial: 'REC-2026-000321',
    input: { kind: 'payment_receipt', date: '2026-09-02', customer: baseCustomer, vehicle: baseVehicle, fields: { contractNumber: 'CON-2026-000123', amountInWords: 'عشرة آلاف وسبعمائة واثنان وستون درهماً وخمسون فلساً', paymentMethod: 'Bank Transfer', referenceNumber: 'NBD-778899', subtotal: 10762.5, vat: 0, total: 10762.5 }, rows: [{ no: 1, description: 'سداد فاتورة INV-2026-000123', amount: 10762.5 }] }
  },
  {
    name: '04-contract-extension', serial: 'EXT-2026-000045',
    input: { kind: 'contract_extension', date: '2026-09-08', customer: baseCustomer, vehicle: baseVehicle, fields: { originalContractNumber: 'CON-2026-000123', currentEndDate: '2026-09-09', newEndDate: '2026-09-16', extensionPeriod: '7 أيام', currentOdometer: 15180, periodRent: 5000, paymentMethod: 'Card', subtotal: 5000, vat: 250, total: 5250 } }
  },
  {
    name: '05-account-statement', serial: 'STM-2026-000044',
    input: { kind: 'account_statement', date: '2026-09-02', customer: baseCustomer, vehicle: baseVehicle, fields: { contractNumber: 'CON-2026-000123', contractDate: '2026-09-02', asOfDate: '2026-09-02', totalDue: 7680, receiptNumber: 'REC-2026-000321' }, rows: [
      { no: 1, date: '2026-09-02', description: 'إيجار المركبة', debit: 5250, credit: 0, balance: 5250 },
      { no: 2, date: '2026-09-02', description: 'مبلغ مدفوع', debit: 0, credit: 2000, balance: 3250 },
      { no: 3, date: '2026-09-05', description: 'سالك ومواقف', debit: 430, credit: 0, balance: 3680 }
    ] }
  },
  {
    name: '06-fines-notice', serial: 'DOC-2026-000088',
    input: { kind: 'fines_notice', date: '2026-09-02', customer: baseCustomer, vehicle: baseVehicle, fields: { contractNumber: 'CON-2026-000123', subtotal: 800, vat: 40, total: 840 }, rows: [
      { no: 1, date: '2026-09-01', description: 'مخالفة مرورية', issuer: 'Dubai Police', reference: 'TRF-12345', amount: 600, total: 600 },
      { no: 2, date: '2026-09-02', description: 'سالك', issuer: 'Salik', reference: 'SLK-777', amount: 200, total: 200 }
    ] }
  },
  {
    name: '07-debit-note', serial: 'DBN-2026-000010',
    input: { kind: 'debit_note', date: '2026-09-02', customer: baseCustomer, vehicle: baseVehicle, fields: { contractNumber: 'CON-2026-000123', originalInvoiceNumber: 'INV-2026-000123', reason: 'رسوم إضافية معتمدة', subtotal: 1000, vat: 50, total: 1050 }, rows: [{ no: 1, description: 'رسوم إضافية', quantity: 1, unitPrice: 1000, subtotal: 1000, vatRate: 5, vatAmount: 50, total: 1050 }] }
  },
  {
    name: '08-damage-claim', serial: 'DMG-2026-000018',
    input: { kind: 'damage_claim', date: '2026-09-02', customer: baseCustomer, vehicle: baseVehicle, fields: { contractNumber: 'CON-2026-000123', reason: 'ضرر جديد بعد إعادة المركبة', subtotal: 2500, vat: 125, total: 2625 }, rows: [{ no: 1, description: 'إصلاح صدام خلفي', quantity: 1, unitPrice: 2500, subtotal: 2500, vatRate: 5, vatAmount: 125, total: 2625 }] }
  },
  {
    name: '09-vehicle-card', serial: 'VHC-2026-000012',
    input: { kind: 'vehicle_record_card', date: '2026-09-02', vehicle: baseVehicle, fields: { registrationExpiry: '2027-06-01', insuranceExpiry: '2027-05-20' }, rows: [{ no: 1, date: '2026-08-20', odometer: 14000, description: 'صيانة دورية', cost: 1200, provider: 'Workshop' }] }
  },
  {
    name: '10-vehicle-exit-permit', serial: 'VEP-2026-000004',
    input: { kind: 'vehicle_exit_permit', date: '2026-09-02', vehicle: baseVehicle, customer: baseCustomer, fields: { destination: 'سلطنة عمان', exitDate: '2026-09-03', licenseNumber: 'DXB-1234567' } }
  },
  {
    name: '11-payment-demand', serial: 'DOC-2026-000099',
    input: { kind: 'payment_demand', date: '2026-09-02', customer: baseCustomer, fields: { contractNumber: 'CON-2026-000123', amountDue: 7680, dueSince: '2026-08-15' }, body: 'نرجو سداد المبلغ المستحق خلال المهلة المحددة وفق العقد والفواتير الصادرة والمسجلة على حسابكم.' }
  }
];

for (const sample of samples) {
  const result = await composeApprovedCorporateDocument({ ...sample.input, serial: sample.serial }, sample.serial);
  writeFileSync(join(out, `${sample.name}.pdf`), result.pdf);
  writeFileSync(join(out, `${sample.name}.audit.json`), JSON.stringify(result.audit, null, 2));
  console.log(`${sample.name}: ${result.audit.templateFile} -> ${result.audit.pages} page(s)`);
}
