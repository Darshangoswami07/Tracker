import * as XLSX from 'xlsx';

/**
 * Pure parsing/validation logic for the Excel GR bulk-import feature. No
 * React/DB imports here — `importRepository.ts` is the only caller that
 * touches SQLite, so this module can be reasoned about (and unit-tested)
 * independently of the on-device database.
 *
 * Column headers are read dynamically from the workbook (see
 * `EXCEL_HEADER_MAP` below) — GR numbers and other sample values are never
 * hardcoded.
 */

/** One raw row exactly as read off the sheet, keyed by the app's own field
 * names (already mapped away from the Excel headers) but not yet validated
 * or type-coerced beyond what SheetJS gives us. */
export interface RawExcelRow {
  rowNumber: number; // 1-based, matching the row a human sees in Excel (header = row 1)
  grNumber: string | null;
  grDateRaw: unknown;
  consignorName: string | null;
  consigneeName: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  particulars: string | null;
  nugRaw: unknown;
  weightRaw: unknown;
  paymentMode: string | null;
  paidAmtRaw: unknown;
  toPayAmtRaw: unknown;
  chalaanNo: string | null;
  chalaanDateRaw: unknown;
  transportGrn: string | null;
  grSourceLabel: string | null;
}

/** A row that has passed validation, with every value coerced to its final
 * type — this is what `importRepository.bulkImportGRs` inserts. */
export interface ValidGRRow {
  rowNumber: number;
  grNumber: string;
  grDateIso: string;
  consignorName: string | null;
  consigneeName: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  particulars: string | null;
  packageCount: number | null;
  weight: number | null;
  paymentMode: string | null;
  paymentAmount: number | null;
  toPay: number | null;
  chalaanNo: string | null;
  chalaanDate: string | null;
  transportGrn: string | null;
  grSourceLabel: string | null;
}

export interface RowError {
  rowNumber: number;
  message: string;
}

export interface ParsedWorkbook {
  totalRows: number;
  validRows: ValidGRRow[];
  /** Rows whose GR number repeats an earlier row in the SAME file (not a
   * duplicate check against the database — that happens in `importRepository`
   * once existing GR numbers are known). */
  inFileDuplicateRows: RowError[];
  invalidRows: RowError[];
}

/** Maps the Excel headers documented in the import spec to our internal
 * `RawExcelRow` keys. Matching is case-insensitive and ignores surrounding
 * whitespace so minor header formatting differences don't break parsing. */
const HEADER_ALIASES: Record<keyof Omit<RawExcelRow, 'rowNumber'>, string[]> = {
  grNumber: ['gr_no', 'grno', 'gr no', 'gr number'],
  grDateRaw: ['grdate', 'gr_date', 'gr date'],
  consignorName: ['consigner', 'consignor'],
  consigneeName: ['consignee'],
  fromLocation: ['send_from', 'sendfrom', 'send from', 'from'],
  toLocation: ['send_to', 'sendto', 'send to', 'to'],
  particulars: ['particulars'],
  nugRaw: ['nug', 'packages', 'package_count'],
  weightRaw: ['weight_kg', 'weightkg', 'weight'],
  paymentMode: ['pm', 'payment_mode', 'paymentmode'],
  paidAmtRaw: ['paid_amt', 'paidamt', 'paid amount'],
  toPayAmtRaw: ['topay_amt', 'topayamt', 'to pay', 'to pay amount'],
  chalaanNo: ['chalaan_no', 'chalaanno', 'chalaan no'],
  chalaanDateRaw: ['chalaan_date', 'chalaandate', 'chalaan date'],
  transportGrn: ['trns_grn', 'transport_grn', 'transportgrn', 'trnsgrn'],
  grSourceLabel: ['gr_source', 'grsource', 'gr source'],
};

const normalizeHeader = (header: string): string => header.trim().toLowerCase().replace(/\s+/g, ' ');

/** Builds a lookup from a sheet's actual header row to our internal field
 * names, so column order/casing in the source file never matters. */
const buildHeaderLookup = (headers: string[]): Partial<Record<keyof Omit<RawExcelRow, 'rowNumber'>, string>> => {
  const lookup: Partial<Record<keyof Omit<RawExcelRow, 'rowNumber'>, string>> = {};
  const normalizedHeaders = headers.map((h) => ({ original: h, normalized: normalizeHeader(String(h ?? '')) }));
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof Omit<RawExcelRow, 'rowNumber'>, string[]][]) {
    const match = normalizedHeaders.find((h) => aliases.includes(h.normalized));
    if (match) lookup[field] = match.original;
  }
  return lookup;
};

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
};

/** Renders a numeric GR number without a trailing ".0" — SheetJS gives
 * integral numeric cells back as plain JS numbers (`6993`, not `6993.0`),
 * so `String()` is already safe; this only guards against a stray decimal
 * a source file might genuinely contain (e.g. `6993.5` stays `6993.5`). */
const grNumberToText = (value: unknown): string | null => {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  return asText(value);
};

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/** Converts an Excel date cell (JS `Date` when `cellDates: true`, a raw
 * serial number, or a text date like `19-Aug-26`) to an ISO 8601 string.
 * Returns null when the value can't be parsed as a date. */
export const excelDateToIso = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'number') {
    const ms = EXCEL_EPOCH_UTC + value * 86400000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    // Fallback for "DD-Mon-YY" / "DD-Mon-YYYY" (e.g. "19-Aug-26"), which
    // some JS engines' Date constructor doesn't accept directly.
    const match = trimmed.match(/^(\d{1,2})[-/]([A-Za-z]{3,})[-/](\d{2,4})$/);
    if (match) {
      const [, day, monthName, yearRaw] = match;
      const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();
      if (!Number.isNaN(monthIndex)) {
        const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
        const date = new Date(Date.UTC(year, monthIndex, Number(day)));
        if (!Number.isNaN(date.getTime())) return date.toISOString();
      }
    }
    return null;
  }
  return null;
};

/** Parses a numeric cell, tolerant of numbers already-numeric or numeric
 * strings — including the formatting real-world Excel exports commonly use
 * for weight/amount columns: thousands separators ("1,500.50"), currency
 * symbols/codes ("₹1500", "Rs. 1500", "$1500"), surrounding whitespace, and
 * a bare "-" (common for "no value") treated as blank rather than invalid.
 * Returns undefined (not a number) vs null (blank cell) so validation can
 * tell "missing" apart from "not a number". */
const parseOptionalNumber = (value: unknown): number | null | undefined => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '-' || trimmed === '--') return null;
    // Strip currency symbols/codes, thousands separators, and any other
    // stray whitespace, but keep digits, a single leading minus, and a
    // decimal point.
    const cleaned = trimmed.replace(/[₹$€£,]/g, '').replace(/\b(rs|inr|usd)\.?\b/gi, '').trim();
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : undefined;
  }
  return undefined;
};

/** Reads a `.xlsx` file (base64-encoded, as returned by
 * `expo-file-system`'s `readAsStringAsync`) into raw rows, keyed by our
 * internal field names via the dynamic header lookup above. Throws if the
 * workbook can't be parsed or has no recognizable `GR_No` column — callers
 * should show that as a file-level error before any row-level validation. */
export const parseWorkbook = (base64: string): RawExcelRow[] => {
  const workbook = XLSX.read(base64, { type: 'base64', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The Excel file has no sheets.');
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  if (matrix.length === 0) throw new Error('The Excel file is empty.');

  const [headerRow, ...dataRows] = matrix;
  const headers = headerRow.map((h) => String(h ?? ''));
  const lookup = buildHeaderLookup(headers);
  if (!lookup.grNumber) {
    throw new Error('Could not find a "GR_No" column in this file. Please check the file matches the expected format.');
  }

  const columnIndex = (field: keyof Omit<RawExcelRow, 'rowNumber'>): number => {
    const header = lookup[field];
    return header ? headers.indexOf(header) : -1;
  };
  const cell = (row: unknown[], field: keyof Omit<RawExcelRow, 'rowNumber'>): unknown => {
    const idx = columnIndex(field);
    return idx >= 0 ? row[idx] : null;
  };

  return dataRows.map((row, i) => ({
    rowNumber: i + 2, // +1 for 1-based, +1 for the header row
    grNumber: grNumberToText(cell(row, 'grNumber')),
    grDateRaw: cell(row, 'grDateRaw'),
    consignorName: asText(cell(row, 'consignorName')),
    consigneeName: asText(cell(row, 'consigneeName')),
    fromLocation: asText(cell(row, 'fromLocation')),
    toLocation: asText(cell(row, 'toLocation')),
    particulars: asText(cell(row, 'particulars')),
    nugRaw: cell(row, 'nugRaw'),
    weightRaw: cell(row, 'weightRaw'),
    paymentMode: asText(cell(row, 'paymentMode')),
    paidAmtRaw: cell(row, 'paidAmtRaw'),
    toPayAmtRaw: cell(row, 'toPayAmtRaw'),
    chalaanNo: asText(cell(row, 'chalaanNo')),
    chalaanDateRaw: cell(row, 'chalaanDateRaw'),
    transportGrn: asText(cell(row, 'transportGrn')),
    grSourceLabel: asText(cell(row, 'grSourceLabel')),
  }));
};

const isBlankRow = (row: RawExcelRow): boolean =>
  !row.grNumber &&
  !row.consignorName &&
  !row.consigneeName &&
  !row.fromLocation &&
  !row.toLocation &&
  !row.particulars &&
  (row.grDateRaw === null || row.grDateRaw === undefined || row.grDateRaw === '');

/**
 * Validates and coerces every row, classifying each as valid / an in-file
 * duplicate / invalid (with a human-readable reason). Never mutates or
 * looks at the database — duplicate-against-existing-GR checks happen in
 * `importRepository` once it has the on-device GR numbers to compare
 * against.
 */
export const validateRows = (rows: RawExcelRow[]): ParsedWorkbook => {
  const validRows: ValidGRRow[] = [];
  const inFileDuplicateRows: RowError[] = [];
  const invalidRows: RowError[] = [];
  const seenInFile = new Set<string>();

  let totalRows = 0;

  for (const row of rows) {
    if (isBlankRow(row)) continue; // empty rows are skipped, not counted
    totalRows += 1;

    if (!row.grNumber) {
      invalidRows.push({ rowNumber: row.rowNumber, message: 'GR Number is missing.' });
      continue;
    }

    const grDateIso = excelDateToIso(row.grDateRaw);
    if (!grDateIso) {
      invalidRows.push({ rowNumber: row.rowNumber, message: 'Invalid GR Date.' });
      continue;
    }

    const nug = parseOptionalNumber(row.nugRaw);
    if (nug === undefined) {
      invalidRows.push({ rowNumber: row.rowNumber, message: 'Nug must be a number.' });
      continue;
    }
    const weight = parseOptionalNumber(row.weightRaw);
    if (weight === undefined) {
      invalidRows.push({ rowNumber: row.rowNumber, message: 'Weight must be a number.' });
      continue;
    }
    const paidAmt = parseOptionalNumber(row.paidAmtRaw);
    if (paidAmt === undefined) {
      invalidRows.push({ rowNumber: row.rowNumber, message: 'Paid Amount must be a number.' });
      continue;
    }
    const toPayAmt = parseOptionalNumber(row.toPayAmtRaw);
    if (toPayAmt === undefined) {
      invalidRows.push({ rowNumber: row.rowNumber, message: 'To Pay Amount must be a number.' });
      continue;
    }

    if (seenInFile.has(row.grNumber)) {
      inFileDuplicateRows.push({ rowNumber: row.rowNumber, message: `GR ${row.grNumber} is duplicated within this file.` });
      continue;
    }
    seenInFile.add(row.grNumber);

    validRows.push({
      rowNumber: row.rowNumber,
      grNumber: row.grNumber,
      grDateIso,
      consignorName: row.consignorName,
      consigneeName: row.consigneeName,
      fromLocation: row.fromLocation,
      toLocation: row.toLocation,
      particulars: row.particulars,
      packageCount: nug !== null ? Math.trunc(nug) : null,
      weight,
      paymentMode: row.paymentMode,
      paymentAmount: paidAmt,
      toPay: toPayAmt,
      chalaanNo: row.chalaanNo,
      chalaanDate: excelDateToIso(row.chalaanDateRaw),
      transportGrn: row.transportGrn,
      grSourceLabel: row.grSourceLabel,
    });
  }

  return { totalRows, validRows, inFileDuplicateRows, invalidRows };
};
