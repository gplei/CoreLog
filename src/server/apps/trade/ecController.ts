import type { Request, Response } from 'express';
import multer from 'multer';
import * as tradeDbExec from './db/tradeDbExec';
import { readParamString, readString, toNumber } from '../appCommon/controllerValues';
import { asyncHandler as catchAsync } from '../../../utils/http';

export const tradeUpload = multer({ storage: multer.memoryStorage() });

const quoteCache = new Map<string, { quote: { c: number; pc: number }; ts: number }>();
const QUOTE_CACHE_TTL_MS = 60 * 1000;

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function getStockQuote(ticker: string) {
  const normalizedTicker = ticker.trim().toUpperCase();
  const cached = quoteCache.get(normalizedTicker);
  if (cached && Date.now() - cached.ts < QUOTE_CACHE_TTL_MS) {
    return cached.quote;
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    throw new Error('FINNHUB_API_KEY is missing. Set it in your .env and restart the server.');
  }

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(normalizedTicker)}&token=${apiKey}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { c?: unknown; pc?: unknown };
      const current = Number(data.c);
      const previous = Number(data.pc);
      if (!Number.isFinite(current) || !Number.isFinite(previous)) {
        throw new Error(`Invalid quote data for ${normalizedTicker}`);
      }

      const quote = { c: current, pc: previous };
      quoteCache.set(normalizedTicker, { quote, ts: Date.now() });
      return quote;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
  }

  throw new Error(`Finnhub quote failed for ${normalizedTicker}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

const PRICE_REQUEST_DELAY_MS = 1500;

async function fetchAndUpdateAllPrices() {
  const symbols = await tradeDbExec.getTable('trd_symbol') as Array<{ symbol?: unknown }>;
  const failed: Array<{ symbol: string; error: string }> = [];
  let updated = 0;

  for (const [index, row] of symbols.entries()) {
    const ticker = readString(row.symbol);
    if (!ticker) continue;

    try {
      const quote = await getStockQuote(ticker);
      await tradeDbExec.updatePrice(ticker, quote.c, quote.pc);
      updated += 1;
    } catch (error) {
      failed.push({
        symbol: ticker,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (index < symbols.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, PRICE_REQUEST_DELAY_MS));
    }
  }

  return {
    message: failed.length === 0 ? 'all prices are updated' : 'prices updated with some failures',
    updated,
    failed,
  };
}

export const getTrade = catchAsync(async (_request, response) => {
  response.json(await tradeDbExec.getTrade());
});

export const addSymbol = catchAsync(async (request, response) => {
  const symbol = readString(request.body.symbol);
  const companyName = readString(request.body.company_name);
  const assetType = readString(request.body.asset_type) || 'Stock';
  const result = await tradeDbExec.addSymbol(symbol, companyName, assetType);
  response.json({ message: 'symbol added', id: result.lastInsertRowid });
});

export const addTradeType = catchAsync(async (request, response) => {
  const name = readString(request.body.name);
  const displayName = readString(request.body.display_name) || name;
  const sortOrder = toNumber(request.body.sort_order) ?? 100;
  const active = toNumber(request.body.active) ?? 1;
  if (!name) {
    response.status(400).json({ error: 'name is required' });
    return;
  }
  const result = await tradeDbExec.addTradeType(name, displayName, sortOrder, active ? 1 : 0);
  response.json({ message: 'trade type added', id: result.lastInsertRowid });
});

export const addTrade = catchAsync(async (request, response) => {
  const tradeDate = readString(request.body.tradeDate);
  const accountId = toNumber(request.body.accountId);
  const symbolId = toNumber(request.body.symbolId);
  const tradeType = readString(request.body.tradeType);
  const share = toNumber(request.body.share);
  const price = toNumber(request.body.price);

  if (!tradeDate || accountId === null || symbolId === null || !tradeType || share === null || price === null) {
    response.status(400).json({ error: 'tradeDate, accountId, symbolId, tradeType, share and price are required' });
    return;
  }

  const result = await tradeDbExec.addTrade(tradeDate, symbolId, tradeType, share, price, accountId);
  response.json({ message: 'trade added', id: result.lastInsertRowid });
});

export const stageTrades = catchAsync(async (request, response) => {
  const files = (request.files as Express.Multer.File[] | undefined) ?? [];
  const rawAccountIds = request.body.accountIds;
  let accountIds: unknown[] = [];
  try {
    accountIds = typeof rawAccountIds === 'string' ? JSON.parse(rawAccountIds) as unknown[] : [];
  } catch {
    response.status(400).json({ error: 'accountIds must be valid JSON' });
    return;
  }
  if (files.length === 0 || accountIds.length !== files.length) {
    response.status(400).json({ error: 'files and accountIds are required and must have matching lengths' });
    return;
  }
  await tradeDbExec.clearTradeStaging();
  const results = [];
  for (const [index, file] of files.entries()) {
    const accountId = toNumber(accountIds[index]);
    if (accountId === null) {
      results.push({ fileName: file.originalname, error: 'A valid account is required' });
      continue;
    }
    try {
      results.push({ fileName: file.originalname, ...(await tradeDbExec.stageTradeCsv(accountId, file.buffer)) });
    } catch (error) {
      results.push({ fileName: file.originalname, error: error instanceof Error ? error.message : String(error) });
    }
  }
  response.json({
    results,
    staged: results.reduce((sum, item) => sum + Number('staged' in item ? item.staged : 0), 0),
    skipped: results.reduce((sum, item) => sum + Number('skipped' in item ? item.skipped : 0), 0),
  });
});

export const preloadTradeSymbols = catchAsync(async (request, response) => {
  const files = (request.files as Express.Multer.File[] | undefined) ?? [];
  const rawAccountIds = request.body.accountIds;
  let accountIds: unknown[] = [];
  try {
    accountIds = typeof rawAccountIds === 'string' ? JSON.parse(rawAccountIds) as unknown[] : [];
  } catch {
    response.status(400).json({ error: 'accountIds must be valid JSON' });
    return;
  }
  if (files.length === 0 || accountIds.length !== files.length) {
    response.status(400).json({ error: 'files and accountIds are required and must have matching lengths' });
    return;
  }
  const results = [];
  for (const [index, file] of files.entries()) {
    const accountId = toNumber(accountIds[index]);
    if (accountId === null) {
      results.push({ fileName: file.originalname, error: 'A valid account is required' });
      continue;
    }
    try {
      results.push({ fileName: file.originalname, ...(await tradeDbExec.preloadTradeSymbols(accountId, file.buffer)) });
    } catch (error) {
      results.push({ fileName: file.originalname, error: error instanceof Error ? error.message : String(error) });
    }
  }
  response.json({ results, preloaded: results.reduce((sum, item) => sum + Number('preloaded' in item ? item.preloaded : 0), 0) });
});

export const mergeStagedTrades = catchAsync(async (_request, response) => {
  const result = await tradeDbExec.mergeStagedTrades();
  response.json({ message: `merged ${result.merged ?? 0} staged trades`, merged: result.merged ?? 0 });
});

export const purgeStagedTrades = catchAsync(async (_request, response) => {
  const result = await tradeDbExec.purgeStagedTrades();
  response.json({ message: `purged ${result.purged ?? 0} staged trades`, purged: result.purged ?? 0 });
});

export const getAvailableBuyLots = catchAsync(async (request, response) => {
  const accountId = toNumber(request.query.accountId);
  const symbolId = toNumber(request.query.symbolId);
  if (accountId === null || symbolId === null) {
    response.status(400).json({ error: 'accountId and symbolId are required' });
    return;
  }

  response.json(await tradeDbExec.getAvailableBuyLots(accountId, symbolId));
});

export const getSellMatchSummary = catchAsync(async (request, response) => {
  const sellId = toNumber(request.params.id);
  if (sellId === null) {
    response.status(400).json({ error: 'id is required' });
    return;
  }

  response.json(await tradeDbExec.getSellMatchSummary(sellId));
});

export const addTradeMatch = catchAsync(async (request, response) => {
  const buyId = toNumber(request.body.buyId);
  const sellId = toNumber(request.body.sellId);
  const matchedShare = toNumber(request.body.matchedShare);

  if (buyId === null || sellId === null || matchedShare === null) {
    response.status(400).json({ error: 'buyId, sellId and matchedShare are required' });
    return;
  }

  const result = await tradeDbExec.addTradeMatch(buyId, sellId, matchedShare);
  response.json({ message: 'trade match added', id: result.lastInsertRowid });
});

export const getQuote = catchAsync(async (request, response) => {
  const symbol = readParamString(request.params.symbol);
  if (!symbol) {
    response.status(400).json({ error: 'symbol is required' });
    return;
  }

  const quote = await getStockQuote(symbol);
  response.json({ price: quote.c, previousClose: quote.pc, symbol: symbol.toUpperCase() });
});

export const fetchAllPrices = catchAsync(async (_request, response) => {
  response.json(await fetchAndUpdateAllPrices());
});

export const updatePrice = catchAsync(async (request, response) => {
  const symbol = readString(request.body?.symbol);
  if (!symbol) {
    response.json(await fetchAndUpdateAllPrices());
    return;
  }

  const quote = await getStockQuote(symbol);
  await tradeDbExec.updatePrice(symbol.toUpperCase(), quote.c, quote.pc);
  response.json({ price: quote.c, previousClose: quote.pc, symbol: symbol.toUpperCase() });
});

export const addAccount = catchAsync(async (request, response) => {
  const institutionId = toNumber(request.body.institutionId);
  const accountName = readString(request.body.account_name);

  if (institutionId === null || !accountName) {
    response.status(400).json({ error: 'institutionId and account_name are required' });
    return;
  }

  const result = await tradeDbExec.addAccount(institutionId, accountName);
  response.json({ message: 'account added', id: result.lastInsertRowid });
});

export const addInstitution = catchAsync(async (request, response) => {
  const name = readString(request.body.name);
  const type = readString(request.body.type) || 'bank';
  if (!name) {
    response.status(400).json({ error: 'name is required' });
    return;
  }

  const result = await tradeDbExec.addInstitution(name, type);
  response.json({ message: 'institution added', id: result.lastInsertRowid });
});

export const getAccount = catchAsync(async (_request, response) => {
  response.json(await tradeDbExec.getAccount());
});

export const getAccountBalanceByDate = catchAsync(async (request, response) => {
  const date = readParamString(request.params.date) || localToday();
  response.json(await tradeDbExec.getAccountBalanceByDate(date));
});

export const getTable = catchAsync(async (request, response) => {
  response.json(await tradeDbExec.getTable(readParamString(request.params.table)));
});

export const addTable = catchAsync(async (request, response) => {
  const tableName = readParamString(request.params.table);
  const result = await tradeDbExec.addTable(tableName);
  response.status(201).json({ message: `new row is added into table ${tableName}`, id: result.lastInsertRowid });
});

export const updateTable = catchAsync(async (request, response) => {
  const id = toNumber(request.body.id);
  const { column, newValue, table } = request.body as { column?: unknown; newValue?: unknown; table?: unknown; id?: unknown };
  const tableName = readString(table);
  const columnName = readString(column);
  if (id === null || !tableName || !columnName) {
    response.status(400).json({ error: 'id, column and table are required' });
    return;
  }

  await tradeDbExec.updateTable(id, columnName, typeof newValue === 'string' || typeof newValue === 'number' || newValue === null ? newValue : String(newValue), tableName);
  response.json(`updateTable ${tableName}`);
});

export const deleteTable = catchAsync(async (request, response) => {
  const id = toNumber(request.params.id);
  if (id === null) {
    response.status(400).json({ error: 'id is required' });
    return;
  }

  const tableName = readParamString(request.params.table);
  await tradeDbExec.deleteTable(id, tableName);
  response.json(`deleteTable ${tableName}`);
});
