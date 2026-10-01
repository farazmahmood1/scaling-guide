/**
 * CSV for spreadsheet programs: quoted where needed, CRLF line ends, a byte-order mark so Excel
 * reads Urdu names as UTF-8. A cell starting with `=`, `+`, `-` or `@` is prefixed with `'` so a
 * spreadsheet shows it as text instead of running it as a formula (CSV injection).
 */
const cell = (value: string): string => {
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

export const toCsv = (header: readonly string[], rows: ReadonlyArray<readonly string[]>): string =>
  `﻿${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;

export interface CsvRow {
  /** The line the row started on, the first line being 1: what a person sees in a spreadsheet. */
  line: number;
  cells: string[];
}

/**
 * Reads CSV as spreadsheets save it (RFC 4180), numbering rows exactly as the backend's reader
 * does, so a per-row report can be laid beside the cells it is about. Throws on an unterminated
 * quote, the one thing that cannot be read.
 */
export const parseCsv = (text: string): CsvRow[] => {
  const input = text.replace(/^﻿/, '');
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowStart = 1;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        if (c === '\n') line++;
        cell += c;
      }
      continue;
    }
    if (c === '"' && cell === '') quoted = true;
    else if (c === ',') {
      cells.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      cells.push(cell);
      rows.push({ line: rowStart, cells });
      cells = [];
      cell = '';
      line++;
      rowStart = line;
    } else cell += c;
  }
  if (quoted) throw new Error(`Unterminated quote starting on line ${rowStart}`);
  if (cell !== '' || cells.length > 0) {
    cells.push(cell);
    rows.push({ line: rowStart, cells });
  }
  return rows;
};

/** Offers text as a file download. */
export const downloadText = (fileName: string, text: string, type = 'text/csv;charset=utf-8'): void => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
