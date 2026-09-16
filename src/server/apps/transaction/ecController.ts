import type { Request, Response } from 'express';
import * as transactionDbExec from './db/transactionDbExec';
import { readParamString, readString, toNumber } from '../appCommon/controllerValues';
import { asyncHandler as catchAsync } from '../../../utils/http';

export const getTable = catchAsync(async (request, response) => {
  response.json(await transactionDbExec.getTable(readParamString(request.params.table)));
});

export const addTable = catchAsync(async (request, response) => {
  const tableName = readParamString(request.params.table);
  const result = await transactionDbExec.addTable(tableName);
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

  await transactionDbExec.updateTable(id, columnName, typeof newValue === 'string' || typeof newValue === 'number' || newValue === null ? newValue : String(newValue), tableName);
  response.json(`updateTable ${tableName}`);
});

export const deleteTable = catchAsync(async (request, response) => {
  const id = toNumber(request.params.id);
  if (id === null) {
    response.status(400).json({ error: 'id is required' });
    return;
  }

  const tableName = readParamString(request.params.table);
  await transactionDbExec.deleteTable(id, tableName);
  response.json(`deleteTable ${tableName}`);
});

export const getTripCost = catchAsync(async (request, response) => {
  const tripId = toNumber(request.params.id);
  if (tripId === null) {
    response.status(400).json({ error: 'id is required' });
    return;
  }

  const rows = await transactionDbExec.getTripCost(tripId);
  response.json(rows[0] ?? { amount: 0 });
});

export const stagingTransaction = catchAsync(async (_request, response) => {
  const request = _request as Request & { files?: Express.Multer.File[] };
  const files = Array.isArray(request.files) ? request.files : [];
  const rawAccountIds = request.body?.accountIds;
  let accountIds: unknown[] = [];
  try {
    accountIds = typeof rawAccountIds === 'string'
      ? JSON.parse(rawAccountIds) as unknown[]
      : Array.isArray(rawAccountIds)
        ? rawAccountIds
        : [];
  } catch {
    response.status(400).json({ error: 'accountIds must be valid JSON' });
    return;
  }

  if (files.length === 0) {
    response.status(400).json({ error: 'files are required' });
    return;
  }
  if (accountIds.length !== files.length) {
    response.status(400).json({ error: 'accountIds must match files length' });
    return;
  }

  const results = await transactionDbExec.stagingTransaction(files.map((file, index) => ({
    originalname: file.originalname,
    buffer: file.buffer,
    accountId: Number(accountIds[index]),
  })));
  response.json(results);
});

export const mappedStagingTransaction = catchAsync(async (_request, response) => {
  const request = _request as Request & { files?: Express.Multer.File[] };
  const files = Array.isArray(request.files) ? request.files : [];
  const rawAccountIds = request.body?.accountIds;
  const accountIds = typeof rawAccountIds === 'string' ? JSON.parse(rawAccountIds) as unknown[] : [];
  if (files.length === 0 || accountIds.length !== files.length) {
    response.status(400).json({ error: 'files and matching accountIds are required' });
    return;
  }
  response.json(await transactionDbExec.mappedStagingTransaction(files.map((file, index) => ({
    originalname: file.originalname,
    buffer: file.buffer,
    accountId: Number(accountIds[index]),
  }))));
});

export const mergeStagedTransactions = catchAsync(async (_request, response) => {
  const result = await transactionDbExec.mergeStagedTransactions();
  response.json({ message: `merged ${result.merged ?? 0} staging rows`, merged: result.merged ?? 0 });
});

export const applyCategoryRules = catchAsync(async (_request, response) => {
  const result = await transactionDbExec.applyCategoryRulesToStaging();
  response.json({
    message: `applied category rules to ${result.updated ?? 0} staging rows`,
    updated: result.updated ?? 0,
  });
});

export const generateCategoryRuleSuggestions = catchAsync(async (_request, response) => {
  response.json(await transactionDbExec.generateCategoryRuleSuggestions());
});

export const generateAndSaveCategoryRules = catchAsync(async (_request, response) => {
  response.json(await transactionDbExec.replaceCategoryRulesFromData());
});

export const purgeStagedTransactions = catchAsync(async (_request, response) => {
  const result = await transactionDbExec.purgeStagedTransactions();
  response.json({ message: `purged ${result.deleted ?? 0} staging rows` });
});
