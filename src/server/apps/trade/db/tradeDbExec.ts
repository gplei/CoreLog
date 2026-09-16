import { tradeDb } from './tradeDb';
import * as tradeQueries from './tradeQueries';
import { getCsvValue as csvValue, parseCsv, splitCsvLine } from '../../appCommon/csv';
import { assertSqlIdentifier } from '../../appCommon/sqlIdentifiers';

type QueryValue = string | number | null;

function unquoteStageParam(value: string) {
  const trimmed = value.trim().replace(/[;}\s]+$/, '').trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'"))
    || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseStageParams(value: string) {
  const raw = value.trim();
  try {
    const parsed = JSON.parse(raw) as { header?: string | string[]; param?: string | string[] };
    if (parsed && typeof parsed === 'object' && (parsed.header !== undefined || parsed.param !== undefined)) {
      const header = Array.isArray(parsed.header) ? parsed.header.join(',') : String(parsed.header ?? '');
      const param = Array.isArray(parsed.param) ? parsed.param : splitMapping(String(parsed.param ?? ''));
      return { header, mapping: param };
    }
  } catch {
    // Keep supporting the legacy mapping formats below.
  }

  const paramMarker = raw.search(/\bparam\s*:/i);
  if (paramMarker < 0) {
    return { header: '', mapping: splitMapping(raw) };
  }

  const headerPart = unquoteStageParam(raw
    .slice(0, paramMarker)
    .replace(/^\s*\{?\s*header\s*:/i, '')
    .replace(/[;}]\s*$/, ''));
  const paramPart = unquoteStageParam(raw
    .slice(paramMarker + raw.slice(paramMarker).search(/:/) + 1)
    .replace(/[;}]\s*$/, ''));

  return {
    header: headerPart,
    mapping: splitMapping(paramPart),
  };
}

function localDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : value.trim();
}

function numberValue(value: string) {
  const parsed = Number(String(value).replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function splitMapping(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function mappedCsvValue(row: Record<string, string>, expression: string) {
  const absolute = expression.match(/^abs\((.*)\)$/i);
  const normalizedType = expression.match(/^normalize_type\((.*)\)$/i);
  const header = absolute ? absolute[1] : normalizedType ? normalizedType[1] : expression;
  const value = csvValue(row, header);
  return absolute ? (numberValue(value) === null ? '' : String(Math.abs(numberValue(value) as number))) : value;
}

function normalizeTradeType(value: string) {
  const action = value.trim().toUpperCase();
  if (action === 'CASH' || action.includes('INTEREST EARNED') || action === 'INTEREST') return 'interest';
  if (action.includes('LOAN RETURNED') || action.includes('YOU LOANED')) return 'loan';
  if (action.includes('EXCHANGED') || action.includes('TRANSFERRED') || action.includes('ROTH CONVERSION') || action.includes('CONV. TO ROTH')) return 'transfer';
  if (action.includes('LONG-TERM CAP GAIN')) return 'capital_gain';
  if (action.includes('FEE CHARGED')) return 'fee';
  if (action.includes('FOREIGN TAX PAID')) return 'tax';
  if (action.includes('NAME CHANGED') || action.includes('IN LIEU OF')) return 'corporate_action';
  if (action === 'BUY' || action.includes('BOUGHT') || action.includes('PURCHASE') || action.includes('REINVEST')) return 'BUY';
  if (action === 'SELL' || action.includes('SOLD') || action.includes('REDEMPTION')) return 'SELL';
  if (action === 'DIVIDEND' || action.includes('DIVIDEND') || action.includes('DISTRIBUTION')) return 'DIVIDEND';
  if (action === 'SPLIT' || action.includes('SPLIT')) return 'SPLIT';
  return 'OTHER';
}

const tradeParseMethods: Record<string, (value: string) => string> = {
  parseTradeAction: normalizeTradeType,
};

function resolveTradeParseRule(row: Record<string, string>, spec: Record<string, any>, fallbackColumn: string) {
  const method = String(spec.method ?? '').trim();
  const parser = tradeParseMethods[method];
  if (!parser) throw new Error(`Unknown trade parse method: ${method || '(empty)'}`);
  const column = String(spec.column ?? spec.csvHeader ?? fallbackColumn);
  return parser(csvValue(row, column));
}

function inferAssetType(row: Record<string, string>, symbolCode: string) {
  const securityType = csvValue(row, 'Security Type').trim();
  const companyName = csvValue(row, 'Description').trim();
  if (/\betf\b|exchange.?traded/i.test(`${securityType} ${companyName}`)) return 'etf';
  if (/money market|mutual fund|\bfund\b/i.test(`${securityType} ${companyName}`)) return 'fund';
  if (/united states treas|treasury|t-bill|treas.?bill|fixed.?income|bond|\bbill\b/i.test(`${securityType} ${companyName}`)
    || /^912797[A-Z0-9]+$/i.test(symbolCode)) {
    return 'bond';
  }
  if (symbolCode === 'BTC') return 'crypto';
  if (symbolCode === 'FCASH' || /^CASH$/i.test(symbolCode)) return 'cash';
  if (/fully paid/i.test(companyName) || symbolCode === '123990BL6') return 'other';
  return securityType || 'Stock';
}

function all<T = unknown>(sql: string, params: QueryValue[] = []) {
  return tradeDb.prepare(sql).all(...params) as T[];
}

function get<T = unknown>(sql: string, params: QueryValue[] = []) {
  return tradeDb.prepare(sql).get(...params) as T | undefined;
}

function run(sql: string, params: QueryValue[] = []) {
  return tradeDb.prepare(sql).run(...params);
}

function saveCsvHeaders(accountId: number, headers: string[]) {
  const account = get<{ mapping_json?: string | null }>('select mapping_json from trd_account where id = ?', [accountId]);
  if (!account) return;
  let envelope: Record<string, any> = {};
  if (String(account.mapping_json ?? '').trim()) {
    try {
      const parsed = JSON.parse(String(account.mapping_json));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) envelope = parsed;
    } catch {
      throw new Error(`Invalid mapping_json for trade account ${accountId}; refusing to overwrite it.`);
    }
  }
  const mapping = envelope.mapping && typeof envelope.mapping === 'object'
    ? envelope.mapping
    : Object.fromEntries(Object.entries(envelope).filter(([key]) => !['csv_header', 'stg_header'].includes(key)));
  delete envelope.stg_header;
  if (Array.isArray(envelope.csv_header) && envelope.csv_header.length > 0) return;
  tradeDb.prepare('update trd_account set mapping_json = ? where id = ?').run(JSON.stringify({
    ...envelope,
    csv_header: headers,
    mapping,
  }), accountId);
}

const assertTableName = (value: string) => assertSqlIdentifier(value, 'table name');
const assertColumnName = (value: string) => assertSqlIdentifier(value, 'column name');

export async function getTrade() {
  return all(tradeQueries.getTrade());
}

export async function addSymbol(symbol: string, companyName: string, assetType: string) {
  return run(tradeQueries.addSymbol(), [symbol, companyName, assetType]);
}

export async function addTradeType(name: string, displayName: string, sortOrder: number, active: number) {
  return run(tradeQueries.addTradeType(), [name, displayName, sortOrder, active]);
}

export async function addTrade(
  tradeDate: string,
  symbolId: number,
  tradeType: string,
  share: number,
  price: number,
  accountId: number,
) {
  return run(tradeQueries.addTrade(), [tradeDate, symbolId, tradeType, tradeType, share, price, accountId]);
}

export async function getAvailableBuyLots(accountId: number, symbolId: number) {
  return all(tradeQueries.getAvailableBuyLots(), [accountId, symbolId]);
}

export async function getSellMatchSummary(sellId: number) {
  return all(tradeQueries.getSellMatchSummary(), [sellId]);
}

export async function addTradeMatch(buyId: number, sellId: number, matchedShare: number) {
  return run(tradeQueries.addTradeMatch(), [buyId, sellId, matchedShare]);
}

export async function updatePrice(symbol: string, price: number, previousPrice: number) {
  return run(tradeQueries.updatePrice(), [price, previousPrice, symbol]);
}

export async function addAccount(institutionId: number, accountName: string) {
  return run(tradeQueries.addAccount(), [institutionId, accountName]);
}

export async function addInstitution(name: string, type: string) {
  return run(tradeQueries.addInstitution(), [name, type]);
}

export async function getAccount() {
  return all(tradeQueries.getAccount());
}

export async function getAccountBalanceByDate(date: string) {
  return all(tradeQueries.getAccountBalanceByDate(date), [date]);
}

export async function getTable(table: string) {
  return all(tradeQueries.getTable(assertTableName(table)));
}

export async function addTable(table: string) {
  return run(tradeQueries.addTable(assertTableName(table)));
}

export async function updateTable(id: number, column: string, newValue: string | number | null, table: string) {
  if (column === 'trade_type' && (table === 'trd_log' || table === 'trd_log_stg')) {
    const value = String(newValue ?? '').trim();
    tradeDb.prepare(`
      update ${assertTableName(table)}
      set trade_type = ?,
          trade_type_id = (select id from trd_trade_type where name = ?),
          updated_at = current_timestamp
      where id = ?
    `).run(value, value, id);
    return;
  }
  return run(tradeQueries.updateTable(assertTableName(table), assertColumnName(column)), [newValue, id]);
}

export async function deleteTable(id: number, table: string) {
  return run(tradeQueries.deleteTable(assertTableName(table)), [id]);
}

export async function preloadTradeSymbols(accountId: number, buffer: Buffer) {
  const account = get<{ id: number; staging_params?: string | null }>(
    'select id, staging_params from trd_account where id = ?', [accountId],
  );
  if (!account) throw new Error(`Account not found: ${accountId}`);
  const stageParams = parseStageParams(account.staging_params ?? 'Run Date, Symbol, Type, Quantity, Price ($), Amount ($)');
  const rows = parseCsv(buffer.toString('utf8'), stageParams.header);
  if (rows.length === 0) throw new Error('CSV file is empty or has no data rows.');
  saveCsvHeaders(accountId, Object.keys(rows[0] ?? {}));
  const mapping = stageParams.mapping;
  const symbolColumn = mapping[1] || 'Symbol';
  const symbols = all<{ id: number; symbol: string }>('select id, symbol from trd_symbol');
  const symbolByCode = new Map(symbols.map((item) => [String(item.symbol).toUpperCase(), item.id]));
  const insertSymbol = tradeDb.prepare('insert into trd_symbol (symbol, company_name, asset_type) values (?, ?, ?)');
  const updateSymbolType = tradeDb.prepare("update trd_symbol set asset_type = 'bond' where id = ?");
  let preloaded = 0;
  const preload = tradeDb.transaction(() => {
    for (const row of rows) {
      const symbolCode = mappedCsvValue(row, symbolColumn).trim().toUpperCase();
      if (!symbolCode) continue;
      if (symbolByCode.has(symbolCode)) {
        if (inferAssetType(row, symbolCode) === 'bond') updateSymbolType.run(symbolByCode.get(symbolCode));
        continue;
      }
      const result = insertSymbol.run(
        symbolCode,
        csvValue(row, 'Description') || symbolCode,
        inferAssetType(row, symbolCode),
      );
      symbolByCode.set(symbolCode, Number(result.lastInsertRowid));
      preloaded += 1;
    }
  });
  preload();
  return { preloaded, accountId, stagingParams: account.staging_params ?? '' };
}

export async function stageTradeCsv(accountId: number, buffer: Buffer) {
  const account = get<{ id: number; institution_id?: number | null; staging_params?: string | null; mapping_json?: string | null }>(
    'select id, institution_id, staging_params, mapping_json from trd_account where id = ?', [accountId],
  );
  if (!account) throw new Error(`Account not found: ${accountId}`);
  const stageParams = parseStageParams(account.staging_params ?? 'Run Date, Symbol, Type, Quantity, Price ($), Amount ($)');
  const rows = parseCsv(buffer.toString('utf8'), stageParams.header);
  if (rows.length === 0) throw new Error('CSV file is empty or has no data rows.');
  saveCsvHeaders(accountId, Object.keys(rows[0] ?? {}));
  const mapping = stageParams.mapping;
  let savedMapping: Record<string, any> = {};
  try {
    const parsed = JSON.parse(String(account.mapping_json ?? '{}')) as Record<string, any>;
    savedMapping = parsed.mapping && typeof parsed.mapping === 'object' ? parsed.mapping : {};
  } catch {
    savedMapping = {};
  }
  const tradeTypeRule = savedMapping.trade_type;
  const [dateColumn, symbolColumn, typeColumn, shareColumn, priceColumn, totalColumn, noteColumn] = mapping;

  const symbols = all<{ id: number; symbol: string }>('select id, symbol from trd_symbol');
  const symbolByCode = new Map(symbols.map((item) => [String(item.symbol).toUpperCase(), item.id]));
  const insertSymbol = tradeDb.prepare('insert into trd_symbol (symbol, company_name, asset_type) values (?, ?, ?)');
  const updateSymbolType = tradeDb.prepare("update trd_symbol set asset_type = 'bond' where id = ?");
  const insertStage = tradeDb.prepare(`
    insert into trd_log_stg (account_id, symbol_id, trade_date, trade_type, trade_type_id, share, price, lot, total, institution_id, note, import_flag)
    values (?, ?, ?, ?, (select id from trd_trade_type where name = ?), ?, ?, null, ?, ?, ?, 1)
  `);

  let staged = 0;
  let skipped = 0;
  let skippedMissingSymbol = 0;
  const stage = tradeDb.transaction(() => {
    for (const row of rows) {
      const symbolCode = mappedCsvValue(row, symbolColumn || 'Symbol').trim().toUpperCase();
      if (!symbolCode) {
        skipped += 1;
        skippedMissingSymbol += 1;
        continue;
      }
      let symbolId = symbolByCode.get(symbolCode);
      if (!symbolId) {
        const result = insertSymbol.run(symbolCode, csvValue(row, 'Description') || symbolCode, inferAssetType(row, symbolCode));
        symbolId = Number(result.lastInsertRowid);
        symbolByCode.set(symbolCode, symbolId);
      } else if (inferAssetType(row, symbolCode) === 'bond') {
        updateSymbolType.run(symbolId);
      }
      const rawType = tradeTypeRule?.type === 'parse'
        ? resolveTradeParseRule(row, tradeTypeRule, typeColumn || 'Action')
        : mappedCsvValue(row, typeColumn || 'Type');
      const actionNote = csvValue(row, 'Action').trim();
      const normalizedType = tradeTypeRule?.type === 'parse' ? rawType : normalizeTradeType(rawType);
      const mappedNote = noteColumn ? mappedCsvValue(row, noteColumn).trim() : '';
      const note = actionNote || mappedNote || csvValue(row, 'Description').trim() || csvValue(row, 'Note').trim();
      insertStage.run(
        accountId,
        symbolId,
        localDate(mappedCsvValue(row, dateColumn || 'Run Date')),
        normalizedType,
        normalizedType,
        numberValue(mappedCsvValue(row, shareColumn || 'Quantity')),
        numberValue(mappedCsvValue(row, priceColumn || 'Price ($)')),
        numberValue(mappedCsvValue(row, totalColumn || 'Amount ($)')),
        account.institution_id ?? null,
        note,
      );
      staged += 1;
    }
  });
  stage();
  return {
    staged,
    skipped,
    skippedMissingSymbol,
    sourceRows: rows.length,
    accountId,
    stagingParams: account.staging_params ?? '',
  };
}

export async function clearTradeStaging() {
  tradeDb.exec("delete from trd_log_stg; delete from sqlite_sequence where name = 'trd_log_stg';");
}

export async function mergeStagedTrades() {
  return tradeDb.transaction(() => {
    const result = tradeDb.prepare(`
      insert into trd_log (account_id, symbol_id, trade_date, trade_type, trade_type_id, share, price, lot, total, institution_id, note)
      select account_id, symbol_id, trade_date, trade_type, trade_type_id, share, price, lot, total, institution_id, note
      from trd_log_stg where coalesce(import_flag, 0) = 1
    `).run();
    tradeDb.prepare(`
      update trd_account set last_txn_date = (
        select max(trade_date) from trd_log_stg where account_id = trd_account.id and coalesce(import_flag, 0) = 1
      ), last_merge_date = current_timestamp
      where exists (select 1 from trd_log_stg where account_id = trd_account.id and coalesce(import_flag, 0) = 1)
    `).run();
    tradeDb.prepare('delete from trd_log_stg where coalesce(import_flag, 0) = 1').run();
    return { merged: result.changes ?? 0 };
  })();
}

export async function purgeStagedTrades() {
  const result = tradeDb.prepare('delete from trd_log_stg where coalesce(import_flag, 0) = 0').run();
  return { purged: result.changes ?? 0 };
}
