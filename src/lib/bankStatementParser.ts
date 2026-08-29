import * as XLSX from 'xlsx';

export interface ParsedBankStatementRow {
  date: string; // YYYY-MM-DD
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface BankStatementParseResult {
  fileName: string;
  transactions: ParsedBankStatementRow[];
  totalTransactions: number;
  totalCredit: number;
  totalDebit: number;
  startDate?: string;
  endDate?: string;
  detectedBankName?: string;
  detectedAccountNumber?: string;
  warnings: string[];
}

// Multi-lingual column aliases
const DATE_ALIASES = [
  'date', 'trans date', 'transaction date', 'value date', 'booking date', 'posting date', 'txn date', 'trx date',
  'تاريخ', 'تاريخ المعاملة', 'تاريخ القيد', 'تاريخ العملية', 'التاريخ'
];

const DESC_ALIASES = [
  'description', 'particulars', 'narrative', 'details', 'statement details', 'transaction details', 'remarks', 'narrative details', 'memo', 'payee',
  'البيان', 'الوصف', 'تفاصيل', 'تفاصيل المعاملة', 'شرح القيد', 'المستفيد'
];

const REF_ALIASES = [
  'reference', 'ref', 'ref no', 'reference no', 'txn ref', 'transaction ref', 'cheque no', 'chk no', 'trn', 'auth code', 'doc no', 'chq no',
  'المرجع', 'رقم المرجع', 'رقم العملية', 'رقم الشيك', 'رقم السند', 'رقم القيد'
];

const DEBIT_ALIASES = [
  'debit', 'dr', 'withdrawal', 'withdrawals', 'out', 'debit amount', 'paid out', 'spent',
  'مدين', 'سحب', 'المدين', 'مبالغ مسحوبة', 'خصم'
];

const CREDIT_ALIASES = [
  'credit', 'cr', 'deposit', 'deposits', 'in', 'credit amount', 'paid in', 'received',
  'دائن', 'إيداع', 'الدائن', 'مبالغ مضافة', 'إضافة'
];

const AMOUNT_ALIASES = [
  'amount', 'txn amount', 'transaction amount', 'net amount', 'total',
  'المبلغ', 'قيمة المعاملة', 'القيمة', 'المبلغ الصافي'
];

const BALANCE_ALIASES = [
  'balance', 'closing balance', 'running balance', 'account balance', 'ledger balance',
  'الرصيد', 'رصيد الحساب', 'الرصيد النهائي', 'الرصيد الجاري'
];

function normalizeStr(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().toLowerCase().replace(/[_\-\t]+/g, ' ');
}

function cleanNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  
  let str = String(val).trim();
  // Handle parenthesis e.g. (1,500.00) or (500) -> -500
  let isNegative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.slice(1, -1);
  }
  if (str.endsWith('-')) {
    isNegative = true;
    str = str.slice(0, -1);
  }
  if (str.startsWith('-')) {
    isNegative = true;
    str = str.slice(1);
  }

  // Remove currency signs & text
  str = str.replace(/[^\d.,]/g, '');
  // Normalize commas as thousands separator
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/,/g, '');
  } else if (str.includes(',') && !str.includes('.')) {
    // If comma is decimal separator (European format e.g. 1500,50)
    if (str.split(',')[1]?.length === 2) {
      str = str.replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isNegative ? -Math.abs(num) : num;
}

function parseDateCell(val: any): string {
  if (!val) return new Date().toISOString().split('T')[0];

  // If already a Date object from XLSX
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }

  // If numeric Excel serial date (e.g. 45678)
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const jsDate = new Date(excelEpoch.getTime() + val * 86400000);
    return jsDate.toISOString().split('T')[0];
  }

  const str = String(val).trim();

  // Match DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Match YYYY/MM/DD or YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Fallback try standard Date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

export async function parseBankStatementFile(file: File): Promise<BankStatementParseResult> {
  const warnings: string[] = [];
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    raw: false,
    dateNF: 'yyyy-mm-dd'
  });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('The uploaded file does not contain any sheets or readable data.');
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert worksheet to raw 2D array of strings/values
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rows.length === 0) {
    throw new Error('The statement sheet is empty. Please upload a valid CSV or Excel file.');
  }

  // Detect bank info in top metadata lines
  let detectedBankName: string | undefined = undefined;
  let detectedAccountNumber: string | undefined = undefined;

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const lineStr = rows[i].join(' ');
    if (/emirates nbd|enbd/i.test(lineStr)) detectedBankName = 'Emirates NBD';
    else if (/first abu dhabi|fab/i.test(lineStr)) detectedBankName = 'First Abu Dhabi Bank (FAB)';
    else if (/abu dhabi commercial|adcb/i.test(lineStr)) detectedBankName = 'Abu Dhabi Commercial Bank (ADCB)';
    else if (/dubai islamic|dib/i.test(lineStr)) detectedBankName = 'Dubai Islamic Bank (DIB)';
    else if (/mashreq/i.test(lineStr)) detectedBankName = 'Mashreq Bank';

    const ibanMatch = lineStr.match(/AE\d{2}\s?\d{3}\s?\d{16}/i) || lineStr.match(/AE\d{21}/i);
    if (ibanMatch) detectedAccountNumber = ibanMatch[0].replace(/\s+/g, '');
  }

  // Find Header Row
  let headerRowIndex = -1;
  let dateCol = -1;
  let descCol = -1;
  let refCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let amountCol = -1;
  let balanceCol = -1;

  for (let r = 0; r < Math.min(25, rows.length); r++) {
    const row = rows[r];
    let matchesCount = 0;

    let dCol = -1;
    let deCol = -1;
    let rfCol = -1;
    let drCol = -1;
    let crCol = -1;
    let amCol = -1;
    let blCol = -1;

    for (let c = 0; c < row.length; c++) {
      const cell = normalizeStr(row[c]);
      if (!cell) continue;

      if (DATE_ALIASES.some(a => cell === a || cell.includes(a))) {
        dCol = c;
        matchesCount++;
      } else if (DESC_ALIASES.some(a => cell === a || cell.includes(a))) {
        deCol = c;
        matchesCount++;
      } else if (REF_ALIASES.some(a => cell === a || cell.includes(a))) {
        rfCol = c;
        matchesCount++;
      } else if (DEBIT_ALIASES.some(a => cell === a || cell.includes(a))) {
        drCol = c;
        matchesCount++;
      } else if (CREDIT_ALIASES.some(a => cell === a || cell.includes(a))) {
        crCol = c;
        matchesCount++;
      } else if (AMOUNT_ALIASES.some(a => cell === a || cell.includes(a))) {
        amCol = c;
        matchesCount++;
      } else if (BALANCE_ALIASES.some(a => cell === a || cell.includes(a))) {
        blCol = c;
        matchesCount++;
      }
    }

    // A valid bank statement header row has at least Date and (Debit/Credit or Amount or Description)
    if (dCol !== -1 && (deCol !== -1 || drCol !== -1 || crCol !== -1 || amCol !== -1) && matchesCount >= 2) {
      headerRowIndex = r;
      dateCol = dCol;
      descCol = deCol;
      refCol = rfCol;
      debitCol = drCol;
      creditCol = crCol;
      amountCol = amCol;
      balanceCol = blCol;
      break;
    }
  }

  if (headerRowIndex === -1) {
    // Fallback: Assume first non-empty row is header or standard 0,1,2,3...
    headerRowIndex = 0;
    dateCol = 0;
    descCol = 1;
    refCol = 2;
    debitCol = 3;
    creditCol = 4;
    balanceCol = 5;
    warnings.push('Could not detect exact bank statement column headers automatically; used standard default column positions.');
  }

  const parsedTransactions: ParsedBankStatementRow[] = [];
  let totalCredit = 0;
  let totalDebit = 0;
  let minDate = '';
  let maxDate = '';

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    // Check if empty row
    const nonBlankCount = row.filter((c: any) => c !== '' && c !== null && c !== undefined).length;
    if (nonBlankCount === 0) continue;

    // Check for footer / summary rows (e.g. "Total", "Closing Balance", "Page 1 of 2")
    const fullRowText = row.join(' ').toLowerCase();
    if (fullRowText.includes('total credit') || fullRowText.includes('total debit') || fullRowText.includes('closing balance') || fullRowText.includes('end of statement') || fullRowText.includes('page ')) {
      continue;
    }

    const rawDate = dateCol !== -1 ? row[dateCol] : undefined;
    const rawDesc = descCol !== -1 ? row[descCol] : '';
    const rawRef = refCol !== -1 ? row[refCol] : '';
    let rawDebit = debitCol !== -1 ? row[debitCol] : '';
    let rawCredit = creditCol !== -1 ? row[creditCol] : '';
    const rawAmount = amountCol !== -1 ? row[amountCol] : '';
    const rawBalance = balanceCol !== -1 ? row[balanceCol] : '';

    let debit = cleanNumber(rawDebit);
    let credit = cleanNumber(rawCredit);

    // If single amount column was used
    if (amountCol !== -1 && debit === 0 && credit === 0 && rawAmount !== '') {
      const net = cleanNumber(rawAmount);
      if (net > 0) credit = net;
      else if (net < 0) debit = Math.abs(net);
    }

    // Skip row if both debit and credit are 0 and there's no description
    if (debit === 0 && credit === 0 && !rawDesc) continue;

    const date = parseDateCell(rawDate);
    const description = String(rawDesc || 'BANK TRANSACTION').trim();
    const reference = String(rawRef || `REF-${Math.floor(Math.random() * 899999 + 100000)}`).trim();
    const balance = cleanNumber(rawBalance);

    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;

    totalCredit += credit;
    totalDebit += debit;

    parsedTransactions.push({
      date,
      description,
      reference,
      debit,
      credit,
      balance
    });
  }

  if (parsedTransactions.length === 0) {
    throw new Error('No valid financial transaction rows could be extracted from the file. Please check the file structure.');
  }

  return {
    fileName: file.name,
    transactions: parsedTransactions,
    totalTransactions: parsedTransactions.length,
    totalCredit: Math.round(totalCredit * 100) / 100,
    totalDebit: Math.round(totalDebit * 100) / 100,
    startDate: minDate,
    endDate: maxDate,
    detectedBankName,
    detectedAccountNumber,
    warnings
  };
}
