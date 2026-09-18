import path from 'path';
import { transactionDb } from './transactionDb';
import * as transactionQueries from './transactionQueries';
import { getCsvValue as getRowValue, parseCsv } from '../../appCommon/csv';
import { assertSqlIdentifier } from '../../appCommon/sqlIdentifiers';
import { parseMappedCsv } from '../adapters/mappedCsvStaging';
import { db as corelogDb } from '../../../../db/pool';

type QueryValue = string | number | null;

function all<T = unknown>(sql: string, params: QueryValue[] = []) {
  return transactionDb.prepare(sql).all(...params) as T[];
}

function run(sql: string, params: QueryValue[] = []) {
  return transactionDb.prepare(sql).run(...params);
}

function saveCsvHeaders(source: any, headers: string[]) {
  let envelope: Record<string, any> = {};
  if (String(source.mapping_json ?? '').trim()) {
    try {
      const parsed = JSON.parse(String(source.mapping_json));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) envelope = parsed;
    } catch {
      throw new Error(`Invalid mapping_json for source ${source.id}; refusing to overwrite it.`);
    }
  }
  const mapping = envelope.mapping && typeof envelope.mapping === 'object'
    ? envelope.mapping
    : Object.fromEntries(Object.entries(envelope).filter(([key]) => !['csv_header', 'stg_header'].includes(key)));
  delete envelope.stg_header;
  if (Array.isArray(envelope.csv_header) && envelope.csv_header.length > 0) return;
  transactionDb.prepare('update txn_account set mapping_json = ?, updated_at = current_timestamp where id = ?').run(JSON.stringify({
    ...envelope,
    csv_header: headers,
    mapping,
  }), source.id);
  source.mapping_json = JSON.stringify({ ...envelope, csv_header: headers, mapping });
}

const assertTableName = (value: string) => assertSqlIdentifier(value, 'table name');
const assertColumnName = (value: string) => assertSqlIdentifier(value, 'column name');

function mapSourceNameToJobName(name: string) {
  const normalized = String(name ?? '').toLowerCase();
  if (normalized.includes('amex')) return 'amex';
  if (normalized.includes('apple')) return 'apple';
  if (normalized.includes('chase card')) return 'chase';
  if (normalized.includes('chase checking')) return 'chase_chk';
  if (normalized.includes('chase investment')) return 'chase_invst';
  if (normalized.includes('citi costco')) return 'citi_costco';
  if (normalized.includes('citi double cash')) return 'citi_dbl_cash';
  if (normalized.includes('fidelity')) return 'fidelity';
  return normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function formatLocalDate(value: string) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const mmddyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const [, mm, dd, yyyy] = mmddyyyy;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function splitArgs(expression: string) {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i];
    const next = expression[i + 1];

    if (quote) {
      current += char;
      if (char === quote) {
        if (next === quote) {
          current += next;
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(') {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      current += char;
      continue;
    }

    if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim() !== '') {
    args.push(current.trim());
  }

  return args;
}

function evaluateExpression(expression: string, row: Record<string, string>, source: any): string {
  const expr = String(expression ?? '').trim();
  if (!expr) return '';
  if (expr === 'account_id') return String(source.id ?? '');
  if (expr === 'owner') return String(source.owner ?? source.name ?? '');
  if (expr === 'source') return String(source.name ?? '');
  if (expr === 'null') return '';
  if (expr.startsWith('`') && expr.endsWith('`')) {
    return getRowValue(row, expr.slice(1, -1));
  }
  if ((expr.startsWith("'") && expr.endsWith("'")) || (expr.startsWith('"') && expr.endsWith('"'))) {
    return expr.slice(1, -1);
  }

  const ifMatch = expr.match(/^if\((.*)\)$/i);
  if (ifMatch) {
    const [condition, whenTrue = '', whenFalse = ''] = splitArgs(ifMatch[1]);
    const condMatch = condition.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(!=|=)\s*['"]?(.*?)['"]?$/);
    if (condMatch) {
      const [, key, operator, expected] = condMatch;
      const actual = getRowValue(row, key);
      const isMatch = operator === '=' ? String(actual) === expected : String(actual) !== expected;
      return evaluateExpression(isMatch ? whenTrue : whenFalse, row, source);
    }
  }

  const dateMatch = expr.match(/^STR_TO_DATE\((.*?),(.*)\)$/i);
  if (dateMatch) {
    const [valueExpr] = splitArgs(dateMatch[1]);
    return formatLocalDate(evaluateExpression(valueExpr, row, source));
  }

  const directValue = getRowValue(row, expr);
  if (directValue !== '') {
    return directValue;
  }

  return expr;
}

function normalizeStagingParams(stagingParams: string) {
  return stagingParams
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeJobKey(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function fileBaseName(fileName: string) {
  return path.parse(fileName).name;
}

function quoteIdentifier(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeSqlExpressionList(stagingParams: string) {
  return String(stagingParams ?? '').replace(/`([^`]+)`/g, '"$1"');
}

function getRuleMatchText(row: Record<string, any>, matchField: string) {
  const field = String(matchField ?? 'description').trim().toLowerCase();
  if (field === 'source') return String(row.source ?? '');
  if (field === 'owner') return String(row.owner ?? '');
  if (field === 'note') return String(row.note ?? '');
  if (field === 'date') return String(row.date ?? '');
  if (field === 'description' || field === '') return String(row.description ?? '');
  return String(row[field] ?? row.description ?? '');
}

function doesRuleMatch(rowText: string, rule: Record<string, any>) {
  const pattern = String(rule.pattern ?? rule.keyword ?? '').trim();
  if (!pattern) return false;

  const text = String(rowText ?? '');
  const matchType = String(rule.match_type ?? 'contains').trim().toLowerCase();

  if (matchType === 'regex') {
    try {
      return new RegExp(pattern, 'i').test(text);
    } catch {
      return false;
    }
  }

  const normalizeText = (value: string) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b99 ranch(?: market)?\b/g, 'ranch 99')
    .replace(/\bcostco whse\b.*/, 'costco whse');
  const normalizedText = normalizeText(text);
  const normalizedPattern = normalizeText(pattern);

  if (matchType === 'equals') return normalizedText === normalizedPattern;
  if (matchType === 'starts_with') return normalizedText.startsWith(normalizedPattern);
  return normalizedText.includes(normalizedPattern);
}

function sortRules(rules: Array<Record<string, any>>) {
  return rules.slice().sort((left, right) => {
    const leftSource = left.account_id == null ? 1 : 0;
    const rightSource = right.account_id == null ? 1 : 0;
    if (leftSource !== rightSource) return leftSource - rightSource;

    const priorityDiff = Number(right.priority ?? 0) - Number(left.priority ?? 0);
    if (priorityDiff !== 0) return priorityDiff;

    return Number(left.id ?? 0) - Number(right.id ?? 0);
  });
}

function normalizeRulePattern(description: unknown) {
  const normalized = String(description ?? '')
    .toLowerCase()
    .replace(/\bnull\b\s*x+\d+/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b99 ranch(?: market)?\b/g, 'ranch 99')
    .replace(/\bcostco whse\b.*/, 'costco whse');
  if (normalized === 'ranch 99' || normalized.startsWith('ranch 99 ')) return 'ranch 99';
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
}

export async function generateCategoryRuleSuggestions(excludeExistingRules = true) {
  const transactions = await getTable('txn_log') as Array<Record<string, any>>;
  const existingRules = await getTable('txn_category_rule') as Array<Record<string, any>>;
  const groups = new Map<string, Array<Record<string, any>>>();

  for (const transaction of transactions) {
    if (transaction.category_id == null || !normalizeRulePattern(transaction.description)) continue;
    const pattern = normalizeRulePattern(transaction.description);
    const key = `${transaction.account_id ?? ''}|${pattern}`;
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  return [...groups.entries()]
    .map(([key, rows]) => {
      const [accountId, pattern] = key.split('|');
      const byCategory = new Map<string, Array<Record<string, any>>>();
      rows.forEach((row) => {
        const categoryKey = `${row.category_id}|${row.subcategory_id ?? ''}`;
        byCategory.set(categoryKey, [...(byCategory.get(categoryKey) ?? []), row]);
      });
      const [categoryKey, matchingRows] = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
      if (!categoryKey || matchingRows.length < 3 || matchingRows.length / rows.length < 0.8) return null;
      if (excludeExistingRules && existingRules.some((rule) => String(rule.pattern ?? '').toLowerCase() === pattern
        && String(rule.account_id ?? '') === accountId)) return null;
      const [categoryId, subcategoryId = ''] = categoryKey.split('|');
      return {
        rule_name: pattern,
        pattern,
        match_field: 'description',
        match_type: 'contains',
        category_id: Number(categoryId),
        subcategory_id: subcategoryId && subcategoryId !== '0' ? Number(subcategoryId) : null,
        account_id: accountId ? Number(accountId) : null,
        occurrences: matchingRows.length,
      };
    })
    .filter((suggestion): suggestion is NonNullable<typeof suggestion> => Boolean(suggestion))
    .sort((left, right) => right.occurrences - left.occurrences);
}

export async function replaceCategoryRulesFromData() {
  const suggestions = await generateCategoryRuleSuggestions(false);
  if (suggestions.length === 0) {
    return { deleted: 0, created: 0, suggestions: [] };
  }

  const deleteRules = transactionDb.prepare('delete from txn_category_rule');
  const insertRule = transactionDb.prepare(`
    insert into txn_category_rule (
      rule_name, match_field, match_type, pattern, category_id,
      subcategory_id, account_id, priority, active, stop_after_match
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const replace = transactionDb.transaction(() => {
    const deleted = deleteRules.run().changes ?? 0;
    for (const suggestion of suggestions) {
      insertRule.run(
        suggestion.rule_name,
        suggestion.match_field,
        suggestion.match_type,
        suggestion.pattern,
        suggestion.category_id,
        suggestion.subcategory_id,
        suggestion.account_id,
        suggestion.occurrences,
        1,
        1,
      );
    }
    return { deleted, created: suggestions.length };
  });

  return { ...replace(), suggestions };
}

async function autoMapStagedTransactions() {
  const rules = sortRules((await getTable('txn_category_rule')) as Array<Record<string, any>>)
    .filter((rule) => Number(rule.active ?? 1) !== 0);

  if (rules.length === 0) {
    return 0;
  }

  const stagingRows = (await getTable('txn_log_stg')) as Array<Record<string, any>>;
  const updateStmt = transactionDb.prepare(`
    update txn_log_stg
    set category_id = ?,
        subcategory_id = ?,
        updated_at = current_timestamp
    where id = ?
  `);

  let updated = 0;
  for (const row of stagingRows) {
    const hasCategory = row.category_id !== null
      && row.category_id !== undefined
      && String(row.category_id).trim() !== ''
      && Number(row.category_id) !== 0;
    if (hasCategory) continue;

    const matchedRule = rules.find((rule) => {
      if (rule.account_id != null && String(rule.account_id) !== String(row.account_id ?? '')) {
        return false;
      }
      const candidateText = getRuleMatchText(row, rule.match_field);
      if (!candidateText) return false;
      return doesRuleMatch(candidateText, rule);
    });

    if (!matchedRule) continue;

    const result = updateStmt.run(
      matchedRule.category_id,
      matchedRule.subcategory_id ?? null,
      row.id,
    );
    updated += result.changes ?? 0;
  }

  return updated;
}

export async function getTable(table: string) {
  return all(transactionQueries.getTable(assertTableName(table)));
}

export async function addTable(table: string) {
  return run(transactionQueries.addTable(assertTableName(table)));
}

export async function updateTable(id: number, column: string, newValue: string | number | null, table: string) {
  const dateColumns = new Set(['date', 'start_date', 'end_date', 'last_txn_date', 'last_merge_date']);
  const normalizedValue = dateColumns.has(column) && newValue !== null
    ? (transactionDb.prepare('select STR_TO_DATE(?) as value').get(String(newValue)) as { value?: string }).value ?? null
    : newValue;
  return run(transactionQueries.updateTable(assertTableName(table), assertColumnName(column)), [normalizedValue, id]);
}

export async function deleteTable(id: number, table: string) {
  return run(transactionQueries.deleteTable(assertTableName(table)), [id]);
}

export async function getTripCost(tripId: number) {
  return all(
    `select coalesce(sum(amount), 0) as amount from txn_log where trip_id = ?`,
    [tripId],
  );
}

type StagingFileInput = {
  originalname: string;
  buffer: Buffer;
  accountId: number;
};

type StagingResult = {
  job: string;
  fileName: string;
  accountId: number;
  status: string;
  records?: number;
  message?: string;
};

function stageCsvFileIntoStaging(source: any, uploadedFile: StagingFileInput) {
  const csvText = uploadedFile.buffer.toString('utf8');
  const parsedHeaders = parseCsv(csvText);
  if (parsedHeaders.length > 0) saveCsvHeaders(source, Object.keys(parsedHeaders[0] ?? {}));

  const stagingParams = String(source.staging_params ?? '').trim();
  if (!stagingParams) {
    throw new Error(`No staging_params configured for source ${source.name ?? uploadedFile.accountId}`);
  }

  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    throw new Error(`CSV file is empty: ${uploadedFile.originalname}`);
  }

  const headers = Object.keys(rows[0] ?? {});
  if (headers.length === 0) {
    throw new Error(`CSV file has no headers: ${uploadedFile.originalname}`);
  }

  const tempTableName = `txn_log_upload_${uploadedFile.accountId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Keep the legacy staging contract and column order:
  // date, type, description, amount, account_id, owner.
  const stagingExpressions = splitArgs(stagingParams);
  while (stagingExpressions.length < 4) {
    stagingExpressions.push('null');
  }
  while (stagingExpressions.length < 6) {
    stagingExpressions.push('null');
  }
  const stagingSelect = normalizeSqlExpressionList(stagingExpressions.join(', '));
  const insertColumns = [
    'date',
    'type',
    'description',
    'amount',
    'account_id',
    'owner',
  ];

  transactionDb.exec(`
    create temporary table ${quoteIdentifier(tempTableName)} (
      ${headers.map((header) => `${quoteIdentifier(header)} text`).join(', ')}
    )
  `);

  try {
    const insert = transactionDb.prepare(`
      insert into ${quoteIdentifier(tempTableName)} (${headers.map((header) => quoteIdentifier(header)).join(', ')})
      values (${headers.map(() => '?').join(', ')})
    `);

    for (const row of rows) {
      insert.run(...headers.map((header) => row[header] ?? ''));
    }

    const stageTableColumns = insertColumns.map((column) => quoteIdentifier(column)).join(', ');
    const stageSql = `
      insert into txn_log_stg (${stageTableColumns})
      select ${stagingSelect}
      from ${quoteIdentifier(tempTableName)}
    `;

    transactionDb.exec(stageSql);
    transactionDb.prepare('update txn_log_stg set date = STR_TO_DATE(date)').run();
  } finally {
    transactionDb.exec(`drop table if exists ${quoteIdentifier(tempTableName)}`);
  }

  return {
    job: String(source.name ?? uploadedFile.accountId),
    fileName: uploadedFile.originalname,
    accountId: uploadedFile.accountId,
    status: 'success',
    records: rows.length,
  };
}

function stageMappedCsvFileIntoStaging(source: any, uploadedFile: StagingFileInput, stagingColumns: string[]) {
  const rows = parseMappedCsv(uploadedFile.buffer.toString('utf8'), String(source.mapping_json ?? ''), stagingColumns, source);
  if (rows.length === 0) throw new Error(`CSV file is empty: ${uploadedFile.originalname}`);
  const allowedColumns = new Set(['date', 'type', 'description', 'amount', 'owner', 'account_id', 'source']);
  const columns = stagingColumns.filter((column) => allowedColumns.has(column));
  if (columns.length === 0) throw new Error('No supported staging columns are configured.');
  const insert = transactionDb.prepare(`insert into txn_log_stg (${columns.map(quoteIdentifier).join(', ')}) values (${columns.map(() => '?').join(', ')})`);
  const insertRows = transactionDb.transaction(() => rows.forEach((row) => insert.run(...columns.map((column) => row[column] ?? null))));
  insertRows();
  return { job: String(source.name ?? uploadedFile.accountId), fileName: uploadedFile.originalname, accountId: uploadedFile.accountId, status: 'success', records: rows.length };
}

export async function mappedStagingTransaction(uploadedFiles: StagingFileInput[] = []) {
  const setting = corelogDb.prepare('select setting_value from app_setting where setting_key = ?').get('module.transaction.stgHeader') as { setting_value?: string } | undefined;
  let stagingColumns: string[] = [];
  try { stagingColumns = JSON.parse(setting?.setting_value ?? '[]'); } catch { stagingColumns = []; }
  if (stagingColumns.length === 0) throw new Error('No transaction staging columns are configured.');
  const sources = await getTable('txn_account') as Array<any>;
  return uploadedFiles.map((file) => {
    const source = sources.find((item) => Number(item.id) === Number(file.accountId));
    if (!source) return { fileName: file.originalname, accountId: file.accountId, status: 'error', message: 'Account not found.' };
    try { return stageMappedCsvFileIntoStaging(source, file, stagingColumns); }
    catch (error) { return { fileName: file.originalname, accountId: file.accountId, status: 'error', message: error instanceof Error ? error.message : String(error) }; }
  });
}

export async function stagingTransaction(uploadedFiles: StagingFileInput[] = []) {
  if (uploadedFiles.length === 0) {
    throw new Error('Please choose at least one CSV file to stage.');
  }
  const sources = await getTable('txn_account') as Array<any>;
  const sourceById = new Map(sources.map((row) => [Number(row.id), row]));
  const results: StagingResult[] = [];

  transactionDb.exec(`delete from txn_log_stg; delete from sqlite_sequence where name = 'txn_log_stg';`);

  for (const uploadedFile of uploadedFiles) {
    try {
      if (!Number.isFinite(uploadedFile.accountId)) {
        throw new Error(`Please select a source for ${uploadedFile.originalname}`);
      }

      const source = sourceById.get(Number(uploadedFile.accountId));
      if (!source) {
        throw new Error(`Account not found: ${uploadedFile.accountId}`);
      }

      results.push(stageCsvFileIntoStaging(source, uploadedFile));
    } catch (error: any) {
      results.push({
        job: String(uploadedFile.originalname ?? uploadedFile.accountId),
        fileName: uploadedFile.originalname,
        accountId: uploadedFile.accountId,
        status: 'error',
        message: error?.message || 'Staging failed',
      });
    }
  }

  transactionDb.prepare(`
    update txn_log_stg
    set import_flag = 0
    where account_id is not null
      and date is not null
      and date <> ''
      and exists (
        select 1
        from txn_account src
        where src.id = txn_log_stg.account_id
          and src.last_txn_date is not null
          and src.last_txn_date <> ''
          and date(STR_TO_DATE(txn_log_stg.date)) < date(STR_TO_DATE(src.last_txn_date))
      )
  `).run();

  return results;
}

export async function applyCategoryRulesToStaging() {
  return {
    updated: await autoMapStagedTransactions(),
  };
}

export async function mergeStagedTransactions() {
  return transactionDb.transaction(() => {
    const result = transactionDb.prepare(`
      insert into txn_log (
        date,
        description,
        amount,
        type,
        category_id,
        subcategory_id,
        note,
        trip_id,
        account_id,
        account_from,
        account_to,
        source,
        owner,
        active
      )
      select
        STR_TO_DATE(date),
        description,
        amount,
        type,
        category_id,
        subcategory_id,
        note,
        trip_id,
        account_id,
        account_from,
        account_to,
        source,
        owner,
        active
      from txn_log_stg
      where coalesce(import_flag, 0) = 1
    `).run();

    transactionDb.prepare(`
      update txn_account
      set
        last_txn_date = (
          select max(STR_TO_DATE(stg.date))
          from txn_log_stg stg
          where stg.account_id = txn_account.id
            and coalesce(stg.import_flag, 0) = 1
        ),
        last_merge_date = date('now')
      where exists (
        select 1
        from txn_log_stg stg
        where stg.account_id = txn_account.id
          and coalesce(stg.import_flag, 0) = 1
      )
    `).run();

    transactionDb.prepare(`
      delete from txn_log_stg
      where coalesce(import_flag, 0) = 1
    `).run();

    return {
      merged: result.changes ?? 0,
    };
  })();
}

export async function purgeStagedTransactions() {
  return transactionDb.transaction(() => {
    const result = transactionDb.prepare(`
      delete from txn_log_stg
      where coalesce(import_flag, 0) = 0
        or (
          account_id is not null
          and exists (
            select 1
            from txn_account src
            where src.id = txn_log_stg.account_id
              and src.last_txn_date is not null
              and src.last_txn_date <> ''
              and txn_log_stg.date is not null
              and txn_log_stg.date <> ''
              and date(txn_log_stg.date) < date(src.last_txn_date)
          )
        )
    `).run();

    return {
      deleted: result.changes ?? 0,
    };
  })();
}
