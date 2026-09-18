import type { Request, Response } from 'express';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { env } from '../../../config/env';
import { db } from '../../../db/pool';

const databases = [
  { key: 'corelog', directory: path.basename(path.dirname(env.sqlite.databasePath)), fileName: path.basename(env.sqlite.databasePath), sourcePath: env.sqlite.databasePath },
  { key: 'trade', directory: 'trade', fileName: 'trade.sqlite', sourcePath: env.sqlite.tradeDatabasePath },
  { key: 'transaction', directory: 'transaction', fileName: 'transaction.sqlite', sourcePath: env.sqlite.transactionDatabasePath },
  { key: 'hayday', directory: path.basename(path.dirname(env.sqlite.haydayDatabasePath)), fileName: path.basename(env.sqlite.haydayDatabasePath), sourcePath: env.sqlite.haydayDatabasePath },
];

let dataBackupInProgress = false;

const moduleSettingsKey = 'modules.enabled';

const stagingColumnKeys = {
  trade: 'module.trade.stgHeader',
  transaction: 'module.transaction.stgHeader',
} as const;
const quickLinkGroupSettingsKey = 'qlinks.groups';

type QuickLinkGroupSettings = {
  qLink: boolean;
  group: Record<string, boolean>;
};

function parseQuickLinkGroupSettings(value: string | undefined): QuickLinkGroupSettings {
  if (!value) return { qLink: true, group: {} };
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return { qLink: true, group: Object.fromEntries(parsed.filter((name: unknown): name is string => typeof name === 'string' && Boolean(name.trim())).map((name: string) => [name.trim(), true])) };
    }
    if (!parsed || typeof parsed !== 'object') return { qLink: true, group: {} };
    if (parsed.group && typeof parsed.group === 'object' && !Array.isArray(parsed.group)) {
      return { qLink: parsed.qLink !== false, group: Object.fromEntries(Object.entries(parsed.group).filter(([, expanded]) => typeof expanded === 'boolean')) as Record<string, boolean> };
    }
    const expanded = Array.isArray(parsed.expanded)
      ? parsed.expanded
      : parsed.expanded && typeof parsed.expanded === 'object'
        ? Object.entries(parsed.expanded).filter(([, isExpanded]) => isExpanded === true).map(([name]) => name)
        : Object.entries(parsed).filter(([, isExpanded]) => isExpanded === true).map(([name]) => name);
    return { qLink: true, group: Object.fromEntries(expanded.map((name: unknown) => [String(name), true])) };
  } catch {
    return { qLink: true, group: {} };
  }
}

function readQuickLinkGroupSettings(): QuickLinkGroupSettings {
  const row = db.prepare('select setting_value from app_setting where setting_key = ?').get(quickLinkGroupSettingsKey) as { setting_value?: string } | undefined;
  return parseQuickLinkGroupSettings(row?.setting_value);
}

function ensureHaydayAccountTable() {
  const database = new Database(env.sqlite.haydayDatabasePath);
  database.exec(`
    create table if not exists account (
      id integer primary key,
      name text not null,
      level integer not null default 0,
      barn_capacity integer,
      silo_capacity integer,
      note text,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    )
  `);
  const columns = new Set(database.prepare('pragma table_info(account)').all().map((column: any) => column.name));
  for (const column of ['bolt', 'plank', 'tape', 'nail', 'screw', 'wood_panel']) {
    if (!columns.has(column)) database.exec(`alter table account add column ${column} integer not null default 0`);
  }
  database.close();
}

function ensureHaydaySingularTables() {
  const database = new Database(env.sqlite.haydayDatabasePath);
  try {
    const tables = new Set(database.prepare("select name from sqlite_master where type = 'table'").all().map((row: any) => row.name));
    if (tables.has('buildings') && !tables.has('building')) database.exec('alter table buildings rename to building');
    if (tables.has('products') && !tables.has('product')) database.exec('alter table products rename to product');
    if (tables.has('ingredients') && !tables.has('ingredient')) database.exec('alter table ingredients rename to ingredient');
  } finally {
    database.close();
  }
}

function ensureHaydayImageColumns() {
  const database = new Database(env.sqlite.haydayDatabasePath);
  try {
    const tables = new Set(database.prepare("select name from sqlite_master where type = 'table'").all().map((row: any) => row.name));
    for (const table of ['building', 'product']) {
      if (!tables.has(table)) continue;
      const columns = new Set(database.prepare(`pragma table_info(${table})`).all().map((column: any) => column.name));
      if (!columns.has('image_url')) database.exec(`alter table ${table} add column image_url text`);
      if (!columns.has('image_file')) database.exec(`alter table ${table} add column image_file text`);
    }
    const manifestPath = path.join(env.dataRoot, 'hayday', 'images', 'manifest.json');
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, Record<string, { file?: string; source?: string }>>;
      for (const [type, entries] of Object.entries(manifest)) {
        const table = type === 'buildings' ? 'building' : type === 'products' ? 'product' : '';
        if (!table || !tables.has(table) || !entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
        const update = database.prepare(`update ${table} set image_url = coalesce(image_url, ?), image_file = coalesce(image_file, ?) where name = ?`);
        for (const [name, item] of Object.entries(entries)) {
          if (item?.source && item.file) update.run(item.source, item.file, name);
        }
      }
    } catch {
      // The manifest is only used for the one-time migration.
    }
  } finally {
    database.close();
  }
}

ensureHaydayAccountTable();
ensureHaydaySingularTables();
ensureHaydayImageColumns();

function backupDate() {
  const now = new Date();
  return `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

function getDatabase(key: string) {
  return databases.find((item) => item.key === key);
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function openDatabase(key: string) {
  const database = getDatabase(key);
  if (!database) return undefined;
  return new Database(database.sourcePath, { readonly: true, fileMustExist: true });
}

function tableExists(database: Database.Database, tableName: string) {
  return Boolean(database.prepare(
    "select name from sqlite_master where type = 'table' and name = ? and name not like 'sqlite_%'",
  ).get(tableName));
}

function getTableInfo(database: Database.Database, tableName: string) {
  if (!tableExists(database, tableName)) return undefined;
  return database.prepare(`pragma table_info(${quoteIdentifier(tableName)})`).all() as Array<{ name: string; pk: number }>;
}

function readModuleSettings() {
  const row = db.prepare('select setting_value from app_setting where setting_key = ?').get(moduleSettingsKey) as { setting_value?: string } | undefined;
  try {
    const settings = JSON.parse(row?.setting_value ?? '{}');
    return {
      trade: settings?.trade === true,
      transaction: settings?.transaction === true,
      hayday: settings?.hayday === true,
    };
  } catch {
    return { trade: false, transaction: false, hayday: false };
  }
}

async function findHaydayImageSource(name: string) {
  const searchName = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const apiUrl = new URL('https://hayday.fandom.com/api.php');
  apiUrl.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: searchName,
    gsrnamespace: '6',
    gsrlimit: '5',
    prop: 'imageinfo',
    iiprop: 'url',
  }).toString();
  const lookupResponse = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
  if (!lookupResponse.ok) throw new Error(`Image search HTTP ${lookupResponse.status}`);
  const result = await lookupResponse.json() as { query?: { pages?: Record<string, { title?: string; imageinfo?: Array<{ url?: string }> }> } };
  const expected = `file:${searchName.toLowerCase()}`;
  const pages = Object.values(result.query?.pages ?? {});
  const page = pages.find((item) => item.title?.toLowerCase().replace(/\s+/g, ' ') === expected)
    ?? pages.find((item) => item.imageinfo?.[0]?.url);
  const source = page?.imageinfo?.[0]?.url;
  if (!source) throw new Error('No matching image was found online.');
  return source;
}

export async function seedHaydayIcons(_request: Request, response: Response) {
  let seeded = 0;
  let skipped = 0;
  const failed: Array<{ type: string; name: string; error: string }> = [];
  const database = haydayDatabase();
  try {
    for (const [table, imageType] of [['building', 'buildings'], ['product', 'products']] as const) {
      const rows = database.prepare(`select id, name, image_url as imageUrl, image_file as imageFile from ${table}`).all() as Array<{ id: number; name: string; imageUrl?: string; imageFile?: string }>;
      for (const row of rows) {
        const imageFile = row.imageFile || `${imageType}/${row.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')}.png`;
        const targetPath = path.join(env.dataRoot, 'hayday', 'images', imageFile);
      try {
        const existing = await fs.stat(targetPath);
        if (existing.isFile() && existing.size > 0) {
          skipped += 1;
          continue;
        }
      } catch {
          // The image is missing and will be downloaded below.
        }
      try {
        const imageUrl = row.imageUrl || await findHaydayImageSource(row.name);
        const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
        if (!imageResponse.ok) throw new Error(`HTTP ${imageResponse.status}`);
        const body = Buffer.from(await imageResponse.arrayBuffer());
        if (!body.length) throw new Error('Empty image response');
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, body);
        database.prepare(`update ${table} set image_url = ?, image_file = ? where id = ?`).run(imageUrl, imageFile, row.id);
        seeded += 1;
      } catch (error) {
        failed.push({ type: imageType, name: row.name, error: error instanceof Error ? error.message : String(error) });
      }
        if (!row.imageFile) database.prepare(`update ${table} set image_file = ? where id = ?`).run(imageFile, row.id);
      }
    }
  } finally {
    database.close();
  }
  response.json({ seeded, skipped, failed });
}

export function getModuleSettings(_request: Request, response: Response) {
  response.json(readModuleSettings());
}

export function updateModuleSettings(request: Request, response: Response) {
  const trade = request.body?.trade;
  const transaction = request.body?.transaction;
  const hayday = request.body?.hayday;
  if (typeof trade !== 'boolean' || typeof transaction !== 'boolean' || typeof hayday !== 'boolean') {
    response.status(400).json({ error: 'Trade, transaction, and Hay Day must be boolean values.' });
    return;
  }

  const update = db.transaction(() => {
    const statement = db.prepare(`
      insert into app_setting (setting_key, setting_value)
      values (?, ?)
      on conflict(setting_key) do update set setting_value = excluded.setting_value
    `);
    statement.run(moduleSettingsKey, JSON.stringify({ trade, transaction, hayday }));
  });
  update();
  response.json(readModuleSettings());
}

export function getModuleStagingColumns(request: Request, response: Response) {
  const moduleName = String(request.query.module ?? '');
  const settingKey = stagingColumnKeys[moduleName as keyof typeof stagingColumnKeys];
  if (!settingKey) {
    response.status(400).json({ error: 'Unknown module.' });
    return;
  }
  const row = db.prepare('select setting_value from app_setting where setting_key = ?').get(settingKey) as { setting_value?: string } | undefined;
  let columns: string[] = [];
  try {
    const parsed = JSON.parse(row?.setting_value ?? '[]');
    if (Array.isArray(parsed)) columns = parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    columns = [];
  }
  response.json({ module: moduleName, columns });
}

export function updateModuleStagingColumns(request: Request, response: Response) {
  const moduleName = String(request.body?.module ?? '');
  const settingKey = stagingColumnKeys[moduleName as keyof typeof stagingColumnKeys];
  const columns = request.body?.columns;
  if (!settingKey || !Array.isArray(columns) || columns.some((column: unknown) => typeof column !== 'string' || !column.trim())) {
    response.status(400).json({ error: 'Module and a valid columns array are required.' });
    return;
  }
  const normalized = [...new Set(columns.map((column: string) => column.trim()))];
  db.prepare(`
    insert into app_setting (setting_key, setting_value)
    values (?, ?)
    on conflict(setting_key) do update set setting_value = excluded.setting_value
  `).run(settingKey, JSON.stringify(normalized));
  response.json({ module: moduleName, columns: normalized });
}

export function getQuickLinkGroupSettings(_request: Request, response: Response) {
  response.json(readQuickLinkGroupSettings());
}

export function updateQuickLinkGroupSetting(request: Request, response: Response) {
  const group = typeof request.body?.group === 'string' ? request.body.group.trim() : '';
  const expanded = request.body?.expanded;
  const qLink = request.body?.qLink;
  if ((!group || typeof expanded !== 'boolean') && typeof qLink !== 'boolean') {
    response.status(400).json({ error: 'Group state or qLink panel state is required.' });
    return;
  }

  const row = db.prepare('select setting_value from app_setting where setting_key = ?').get(quickLinkGroupSettingsKey) as { setting_value?: string } | undefined;
  const settings = parseQuickLinkGroupSettings(row?.setting_value);
  if (typeof qLink === 'boolean') settings.qLink = qLink;
  if (group && typeof expanded === 'boolean') settings.group[group] = expanded;
  db.prepare(`
    insert into app_setting (setting_key, setting_value)
    values (?, ?)
    on conflict(setting_key) do update set setting_value = excluded.setting_value
  `).run(quickLinkGroupSettingsKey, JSON.stringify(settings));
  response.json(settings);
}

export function listDatabases(_request: Request, response: Response) {
  response.json(databases.map(({ key, directory, fileName, sourcePath }) => ({
    key,
    directory,
    fileName,
    defaultPath: path.dirname(path.dirname(sourcePath)),
  })));
}

export function getBackupPaths(_request: Request, response: Response) {
  response.json({
    dataRoot: env.dataRoot,
    backupRoot: env.backupRoot,
    databaseRoot: path.dirname(path.dirname(env.sqlite.databasePath)),
  });
}

export async function backupDataRoot(_request: Request, response: Response) {
  if (dataBackupInProgress) {
    response.status(409).json({ error: 'A full data backup is already in progress.' });
    return;
  }

  dataBackupInProgress = true;
  const dateFolder = backupDate();
  const backupPath = path.join(env.backupRoot, dateFolder);
  const temporaryPath = path.join(env.backupRoot, `.${dateFolder}-${process.pid}-${Date.now()}`);

  try {
    await fs.mkdir(env.backupRoot, { recursive: true });

    const liveDatabasePaths = new Set(databases.flatMap((database) => [
      path.resolve(database.sourcePath),
      path.resolve(`${database.sourcePath}-wal`),
      path.resolve(`${database.sourcePath}-shm`),
    ]));

    await fs.cp(env.dataRoot, temporaryPath, {
      recursive: true,
      filter: (sourcePath) => !liveDatabasePaths.has(path.resolve(sourcePath)),
    });

    for (const database of databases) {
      const relativeDatabasePath = path.relative(env.dataRoot, database.sourcePath);
      const destinationPath = path.join(temporaryPath, relativeDatabasePath);
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      const source = new Database(database.sourcePath, { readonly: true, fileMustExist: true });
      try {
        await source.backup(destinationPath);
      } finally {
        source.close();
      }
    }

    let previousPath: string | undefined;
    try {
      await fs.access(backupPath);
      previousPath = `${backupPath}.previous-${process.pid}-${Date.now()}`;
      await fs.rename(backupPath, previousPath);
    } catch {
      // A missing dated folder is expected on the first backup of the day.
    }
    await fs.rename(temporaryPath, backupPath);
    if (previousPath) await fs.rm(previousPath, { recursive: true, force: true });
    response.json({ status: 'backed_up', backupPath, message: `${dateFolder} backup created or replaced.` });
  } catch (error) {
    await fs.rm(temporaryPath, { recursive: true, force: true });
    throw error;
  } finally {
    dataBackupInProgress = false;
  }
}

export function listDatabaseTables(request: Request, response: Response) {
  const key = Array.isArray(request.params.key) ? request.params.key[0] : request.params.key;
  const database = openDatabase(key);
  if (!database) {
    response.status(404).json({ error: 'Unknown database' });
    return;
  }
  try {
    response.json(database.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").all());
  } finally {
    database.close();
  }
}

export function getDatabaseTable(request: Request, response: Response) {
  const key = Array.isArray(request.params.key) ? request.params.key[0] : request.params.key;
  const tableName = Array.isArray(request.params.table) ? request.params.table[0] : request.params.table;
  const database = openDatabase(key);
  if (!database) {
    response.status(404).json({ error: 'Unknown database' });
    return;
  }
  try {
    const columns = getTableInfo(database, tableName);
    if (!columns) {
      response.status(404).json({ error: 'Unknown table' });
      return;
    }
    const primaryKey = columns.find((column) => column.pk > 0)?.name ?? (columns.some((column) => column.name === 'id') ? 'id' : '');
    const rows = database.prepare(`select * from ${quoteIdentifier(tableName)}`).all();
    response.json({ columns: columns.map((column) => column.name), primaryKey, rows });
  } finally {
    database.close();
  }
}

export async function updateDatabaseTable(request: Request, response: Response) {
  const key = Array.isArray(request.params.key) ? request.params.key[0] : request.params.key;
  const tableName = Array.isArray(request.params.table) ? request.params.table[0] : request.params.table;
  const databaseInfo = getDatabase(key);
  if (!databaseInfo) {
    response.status(404).json({ error: 'Unknown database' });
    return;
  }
  const database = new Database(databaseInfo.sourcePath);
  try {
    const columns = getTableInfo(database, tableName);
    const columnName = String(request.body?.column ?? '');
    const primaryKey = columns?.find((column) => column.pk > 0)?.name ?? columns?.find((column) => column.name === 'id')?.name;
    if (!columns || !primaryKey || !columns.some((column) => column.name === columnName)) {
      response.status(400).json({ error: 'Invalid table, column, or primary key' });
      return;
    }
    database.prepare(`update ${quoteIdentifier(tableName)} set ${quoteIdentifier(columnName)} = ? where ${quoteIdentifier(primaryKey)} = ?`)
      .run(request.body?.newValue ?? null, request.body?.id);
    response.json({ updated: true });
  } finally {
    database.close();
  }
}

export async function deleteDatabaseTableRow(request: Request, response: Response) {
  const key = Array.isArray(request.params.key) ? request.params.key[0] : request.params.key;
  const tableName = Array.isArray(request.params.table) ? request.params.table[0] : request.params.table;
  const databaseInfo = getDatabase(key);
  if (!databaseInfo) {
    response.status(404).json({ error: 'Unknown database' });
    return;
  }
  const database = new Database(databaseInfo.sourcePath);
  try {
    const columns = getTableInfo(database, tableName);
    const primaryKey = columns?.find((column) => column.pk > 0)?.name ?? columns?.find((column) => column.name === 'id')?.name;
    if (!columns || !primaryKey) {
      response.status(400).json({ error: 'Invalid table or primary key' });
      return;
    }
    database.prepare(`delete from ${quoteIdentifier(tableName)} where ${quoteIdentifier(primaryKey)} = ?`).run(request.params.id);
    response.json({ deleted: true });
  } finally {
    database.close();
  }
}

export function addHaydayIngredient(request: Request, response: Response) {
  const productId = Number(request.body?.productId);
  const ingredientId = Number(request.body?.ingredientId);
  const count = Number(request.body?.count);
  const databaseInfo = getDatabase('hayday');
  if (!databaseInfo || !Number.isInteger(productId) || productId < 1 || !Number.isInteger(ingredientId) || ingredientId < 1 || !Number.isInteger(count) || count < 1) {
    response.status(400).json({ error: 'Product, ingredient, and a positive count are required.' });
    return;
  }

  const database = new Database(databaseInfo.sourcePath);
  try {
    const product = database.prepare('select id from product where id = ?').get(productId);
    const ingredient = database.prepare('select id from product where id = ?').get(ingredientId);
    if (!product || !ingredient) {
      response.status(400).json({ error: 'Unknown product or ingredient.' });
      return;
    }
    const existing = database.prepare('select id from ingredient where product_id = ? and ingredient_id = ? order by id limit 1').get(productId, ingredientId) as { id?: number } | undefined;
    if (existing?.id) {
      database.prepare('update ingredient set count = ? where id = ?').run(count, existing.id);
    } else {
      database.prepare('insert into ingredient (product_id, ingredient_id, count) values (?, ?, ?)').run(productId, ingredientId, count);
    }
    response.json({ saved: true });
  } finally {
    database.close();
  }
}

function haydayDatabase() {
  return new Database(getDatabase('hayday')!.sourcePath);
}

export function saveHaydayBuilding(request: Request, response: Response) {
  const id = Number(request.body?.id);
  const name = String(request.body?.name ?? '').trim();
  const type = String(request.body?.type ?? '').trim();
  const imageUrl = String(request.body?.imageUrl ?? '').trim() || null;
  const level = Number(request.body?.level);
  if (!name || !type || !Number.isInteger(level) || level < 0) { response.status(400).json({ error: 'Building name, type, and level are required.' }); return; }
  const database = haydayDatabase();
  try {
    if (Number.isInteger(id) && id > 0) database.prepare('update building set name = ?, type = ?, level = ?, image_url = ? where id = ?').run(name, type, level, imageUrl, id);
    else database.prepare('insert into building (name, type, level, image_url) values (?, ?, ?, ?)').run(name, type, level, imageUrl);
    response.json({ saved: true });
  } finally { database.close(); }
}

export function saveHaydayProduct(request: Request, response: Response) {
  const id = Number(request.body?.id);
  const name = String(request.body?.name ?? '').trim();
  const requestedBuildingId = Number(request.body?.buildingId);
  const level = Number(request.body?.level);
  const minute = Number(request.body?.minute);
  const ratio = Number(request.body?.barnProductRatio);
  const imageUrl = String(request.body?.imageUrl ?? '').trim() || null;
  const database = haydayDatabase();
  try {
    const current = Number.isInteger(id) && id > 0
      ? database.prepare('select building_id from product where id = ?').get(id) as { building_id?: number } | undefined
      : undefined;
    const buildingId = Number.isInteger(requestedBuildingId) && requestedBuildingId > 0
      ? requestedBuildingId
      : Number(current?.building_id);
    if (!name || !Number.isInteger(buildingId) || buildingId < 1 || [level, minute, ratio].some((value) => !Number.isInteger(value) || value < 0)) { response.status(400).json({ error: 'Product name, building, level, time, and barn ratio are required.' }); return; }
    if (Number.isInteger(id) && id > 0) database.prepare('update product set name = ?, minute = ?, building_id = ?, level = ?, barn_product_ratio = ?, image_url = ? where id = ?').run(name, minute, buildingId, level, ratio, imageUrl, id);
    else database.prepare('insert into product (name, minute, building_id, level, barn_product_ratio, image_url) values (?, ?, ?, ?, ?, ?)').run(name, minute, buildingId, level, ratio, imageUrl);
    response.json({ saved: true });
  } finally { database.close(); }
}

export function deleteHaydayEntity(request: Request, response: Response) {
  const table = request.params.entity === 'building' ? 'building' : request.params.entity === 'product' ? 'product' : request.params.entity === 'account' ? 'account' : '';
  const id = Number(request.params.id);
  if (!table || !Number.isInteger(id) || id < 1) { response.status(400).json({ error: 'Invalid Hay Day record.' }); return; }
  const database = haydayDatabase();
  try { database.prepare(`delete from ${table} where id = ?`).run(id); response.json({ deleted: true }); } finally { database.close(); }
}

export function saveHaydayAccount(request: Request, response: Response) {
  const id = Number(request.body?.id);
  const name = String(request.body?.name ?? '').trim();
  if (!name) {
    response.status(400).json({ error: 'Account name is required.' });
    return;
  }
  const database = haydayDatabase();
  try {
    if (Number.isInteger(id) && id > 0) database.prepare('update account set name = ?, updated_at = current_timestamp where id = ?').run(name, id);
    else database.prepare('insert into account (name) values (?)').run(name);
    response.json({ saved: true });
  } finally { database.close(); }
}

export async function downloadDatabaseBackup(request: Request, response: Response) {
  const key = Array.isArray(request.params.key) ? request.params.key[0] : request.params.key;
  const database = getDatabase(key);
  if (!database) {
    response.status(404).json({ error: 'Unknown database' });
    return;
  }

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'core-log-backup-'));
  const tempPath = path.join(tempDirectory, database.fileName);
  let source: Database.Database | undefined;
  try {
    source = new Database(database.sourcePath, { readonly: true, fileMustExist: true });
    await source.backup(tempPath);
    const data = await fs.readFile(tempPath);
    response.setHeader('Content-Type', 'application/x-sqlite3');
    response.setHeader('Content-Disposition', `attachment; filename="${database.fileName}"`);
    response.send(data);
  } finally {
    source?.close();
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}
