import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

function bootstrapLocalFiles() {
  const projectRoot = process.cwd();
  const localEnvPath = path.join(projectRoot, '.env.local');
  const envPath = path.join(projectRoot, '.env');
  const envExamplePath = path.join(projectRoot, '.env.example');

  if (!fs.existsSync(localEnvPath) && !fs.existsSync(envPath)) {
    fs.copyFileSync(envExamplePath, localEnvPath);
    console.log('Created .env.local from .env.example.');
  }

  dotenv.config({ path: [localEnvPath, envPath], quiet: true });

}

function requireSetting(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var ${name}. Copy .env.example to .env.local first.`);
  }
  return value;
}

function createSqliteFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (fs.existsSync(filePath)) {
    if (!fs.statSync(filePath).isFile()) {
      throw new Error(`Configured SQLite path is not a file: ${filePath}`);
    }
    return 'existing';
  }

  const database = new Database(filePath);
  database.close();
  return 'created';
}

function ensureHaydaySchema(filePath: string) {
  const database = new Database(filePath);
  database.exec(`
    create table if not exists account (
      id integer primary key,
      name text not null,
      level integer not null default 0,
      barn_capacity integer,
      silo_capacity integer,
      note text,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp,
      bolt integer not null default 0,
      plank integer not null default 0,
      tape integer not null default 0,
      nail integer not null default 0,
      screw integer not null default 0,
      wood_panel integer not null default 0
    );
    create table if not exists building (
      id integer primary key,
      name text not null unique,
      level integer,
      type text not null,
      image_url text,
      image_file text
    );
    create table if not exists product (
      id integer primary key,
      name text not null unique,
      minute integer,
      building_id integer,
      level integer,
      barn_product_ratio integer,
      image_url text,
      image_file text,
      foreign key (building_id) references building (id)
    );
    create table if not exists ingredient (
      id integer primary key,
      product_id integer,
      ingredient_id integer,
      count integer default 0,
      foreign key (product_id) references product (id),
      foreign key (ingredient_id) references product (id)
    );
  `);
  database.close();
}

async function setup() {
  bootstrapLocalFiles();

  const dataRoot = path.resolve(process.cwd(), requireSetting('DATA_ROOT'));
  const sqliteRoot = path.join(dataRoot, requireSetting('SQLITE_DB_DIR'));
  const databaseDirectories = [
    requireSetting('SQLITE_CORELOG_DB_DIR'),
    requireSetting('SQLITE_TRADE_DB_DIR'),
    requireSetting('SQLITE_TRANSACTION_DB_DIR'),
    requireSetting('SQLITE_HAYDAY_DB_DIR'),
  ];

  const databases = databaseDirectories.map((directory) => ({
    directory,
    filePath: path.join(sqliteRoot, directory, `${directory}.sqlite`),
  }));

  const results = databases.map((database) => ({
    ...database,
    status: createSqliteFile(database.filePath),
  }));

  const haydayDatabase = results.find((database) => database.directory === process.env.SQLITE_HAYDAY_DB_DIR);
  if (haydayDatabase) ensureHaydaySchema(haydayDatabase.filePath);

  fs.mkdirSync(path.resolve(dataRoot, requireSetting('UPLOAD_DIR')), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, requireSetting('FAVICON_DIR')), { recursive: true });

  const [{ closePool }, { closeTradeDb }, { closeTransactionDb }] = await Promise.all([
    import('../db/pool'),
    import('../server/apps/trade/db/tradeDb'),
    import('../server/apps/transaction/db/transactionDb'),
  ]);

  await closePool();
  closeTradeDb();
  closeTransactionDb();

  for (const result of results) {
    console.log(`${result.directory}: ${result.status} ${result.filePath}`);
  }
  console.log('Database setup complete.');
}

setup().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
