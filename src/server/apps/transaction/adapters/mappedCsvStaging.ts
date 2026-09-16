import { parseCsv, getCsvValue, type CsvRow } from '../../appCommon/csv';

type MappingSpec = {
  type?: string;
  column?: string;
  value?: unknown;
  expression?: string;
  transform?: string;
  condition?: { column?: string; operator?: string; value?: string };
  then?: MappingSpec | unknown;
  else?: MappingSpec | unknown;
};

function numberValue(value: unknown) {
  const normalized = String(value ?? '').replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown) {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return text;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function resolve(row: CsvRow, spec: MappingSpec | unknown): unknown {
  if (!spec || typeof spec !== 'object') return spec ?? '';
  const rule = spec as MappingSpec;
  if (rule.type === 'constant') return rule.value ?? '';
  if (rule.type === 'direct') return getCsvValue(row, String(rule.column ?? ''));
  if (rule.type === 'math') {
    const expression = String(rule.expression ?? '').trim();
    const match = expression.match(/^\s*([+-]?)\s*`?([^\s`+*/()-]+)`?\s*$/);
    if (match) {
      const value = numberValue(getCsvValue(row, match[2]));
      return value === null ? null : (match[1] === '-' ? -value : value);
    }
    return null;
  }
  if (rule.type === 'if_else') {
    const condition = rule.condition;
    const actual = getCsvValue(row, String(condition?.column ?? ''));
    const expected = String(condition?.value ?? '');
    const matches = condition?.operator === 'not_empty'
      ? actual.trim() !== ''
      : condition?.operator === 'equals'
        ? actual.toLowerCase() === expected.toLowerCase()
        : actual.toLowerCase().includes(expected.toLowerCase());
    return resolve(row, matches ? rule.then : rule.else);
  }
  if (rule.column) return getCsvValue(row, rule.column);
  return rule.value ?? '';
}

export function parseMappedCsv(csvText: string, mappingJson: string, stagingColumns: string[], source: { id: number; name?: string }) {
  const rows = parseCsv(csvText);
  let envelope: { mapping?: Record<string, MappingSpec> } = {};
  try {
    envelope = JSON.parse(mappingJson || '{}');
  } catch {
    throw new Error(`Invalid mapping_json for source ${source.name ?? source.id}.`);
  }
  const mapping = envelope.mapping ?? envelope as Record<string, MappingSpec>;
  return rows.map((row) => {
    const result: Record<string, unknown> = {};
    stagingColumns.forEach((column) => {
      if (column === 'account_id') result[column] = source.id;
      else if (column === 'source') result[column] = source.name ?? '';
      else {
        const spec = mapping[column];
        const value = resolve(row, spec);
        const transform = typeof spec === 'object' && spec ? (spec as MappingSpec).transform : undefined;
        result[column] = transform === 'number' ? numberValue(value) : transform === 'date' ? dateValue(value) : value;
        if (column === 'type' && (result[column] === null || result[column] === '')) result[column] = 'expense';
      }
    });
    return result;
  });
}
