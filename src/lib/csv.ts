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
