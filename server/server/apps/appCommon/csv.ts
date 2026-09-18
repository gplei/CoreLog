export type CsvRow = Record<string, string>;

export function splitCsvLine(line: string) {
  const cells: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseCsv(text: string, expectedHeader = ''): CsvRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];

  const expectedHeaders = expectedHeader ? splitCsvLine(expectedHeader).map(normalizeHeader) : [];
  let headerIndex = 0;
  if (expectedHeaders.length > 0) {
    headerIndex = lines.findIndex((line) => {
      const actualHeaders = splitCsvLine(line).map(normalizeHeader);
      if (expectedHeaders.length === 1) return actualHeaders.includes(expectedHeaders[0]);
      return expectedHeaders.every((header, index) => actualHeaders[index] === header);
    });
    if (headerIndex < 0) return [];
  }

  const headers = splitCsvLine(lines[headerIndex]);
  return lines.slice(headerIndex + 1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

export function getCsvValue(row: CsvRow, header: string) {
  const wanted = header.trim().toLowerCase();
  const key = Object.keys(row).find((item) => item.trim().toLowerCase() === wanted);
  return key ? row[key] ?? '' : '';
}
