import { displayString } from './text';
import { inventorySchema, type Inventory } from './rules';
export const MAX_CSV_BYTES = 256_000,
  MAX_ROWS = 1000;
export function parseCsv(text: string): Inventory[] {
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES)
    throw Error('CSV exceeds 256 KB');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('Unclosed quoted CSV field');
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift()?.map((x) => x.replace(/^\uFEFF/, '').trim());
  if (!headers?.includes('assetTag') || !headers.includes('title'))
    throw Error('CSV needs assetTag and title headers');
  if (new Set(headers).size !== headers.length)
    throw Error('Duplicate CSV header');
  if (rows.length > MAX_ROWS) throw Error('CSV exceeds 1,000 rows');
  const items = rows.map((r, i) => {
    if (r.length !== headers.length)
      throw Error(`Row ${i + 2} has a different number of columns`);
    const o = Object.fromEntries(headers.map((h, j) => [h, r[j]]));
    return inventorySchema.parse(o) as Inventory;
  });
  if (new Set(items.map((x) => x.assetTag)).size !== items.length)
    throw Error('Duplicate assetTag within import');
  return items;
}
export function csvCell(v: unknown): string {
  let s = displayString(v);
  if (/^[\s]*[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function toCsv(
  rows: Record<string, unknown>[],
  headers: string[],
): string {
  return [headers, ...rows.map((r) => headers.map((k) => r[k]))]
    .map((r) => r.map(csvCell).join(','))
    .join('\r\n');
}
