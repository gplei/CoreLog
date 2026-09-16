import Database from 'better-sqlite3';
import { env } from '../../../../config/env';

export const tradeDb = new Database(env.sqlite.tradeDatabasePath, { fileMustExist: true });

tradeDb.pragma('foreign_keys = ON');
tradeDb.pragma('journal_mode = WAL');

function ensureColumn(table: string, column: string, definition: string) {
  const columns = tradeDb.prepare(`pragma table_info(${table})`).all() as Array<{ name?: string }>;
  if (!columns.some((item) => item.name === column)) {
    tradeDb.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}

function renameTradePluralTables() {
  const tableExists = (tableName: string) => Boolean(tradeDb.prepare(
    "select 1 from sqlite_master where type = 'table' and name = ?",
  ).get(tableName));
  const renames: Array<[string, string]> = [
    ['trd_institutions', 'trd_institution'],
    ['trd_account_balances', 'trd_account_balance'],
    ['trd_match', 'trd_lot_match'],
  ];
  const pending = renames.filter(([oldName, newName]) => !tableExists(newName) && tableExists(oldName));
  if (pending.length === 0) return;

  tradeDb.pragma('foreign_keys = OFF');
  try {
    pending.forEach(([oldName, newName]) => {
      tradeDb.exec(`alter table ${oldName} rename to ${newName}`);
    });
  } finally {
    tradeDb.pragma('foreign_keys = ON');
  }
}

function ensureTradeSchema() {
  tradeDb.exec(`
    create table if not exists trd_institution (
      id integer primary key autoincrement,
      name text not null,
      short_name text,
      type text not null default 'bank'
        check (type in ('bank', 'brokerage', 'credit_card', 'crypto', 'other')),
      website text,
      note text,
      created_at text default current_timestamp,
      updated_at text default current_timestamp
    );

    create table if not exists trd_account (
      id integer primary key autoincrement,
      institute text,
      account_name text,
      institution_id integer,
      foreign key (institution_id) references trd_institution (id)
    );

    create index if not exists trd_account_institution_id_idx
      on trd_account (institution_id);

    create table if not exists trd_symbol (
      id integer primary key autoincrement,
      symbol text,
      company_name text,
      price numeric,
      previous_price numeric,
      asset_type text default 'Stock',
      active integer not null default 1
    );

    create unique index if not exists trd_symbol_symbol_uq
      on trd_symbol (symbol);

    create table if not exists trd_trade_type (
      id integer primary key autoincrement,
      name text not null unique,
      display_name text not null,
      sort_order integer not null default 100,
      active integer not null default 1,
      created_at text default current_timestamp,
      updated_at text default current_timestamp
    );

    create table if not exists trd_log (
      id integer primary key autoincrement,
      account_id integer,
      symbol_id integer,
      trade_date text,
      trade_type text,
      share integer,
      price numeric,
      lot integer default 1,
      total numeric,
      institution_id integer,
      note text,
      created_at text default current_timestamp,
      updated_at text default current_timestamp,
      foreign key (account_id) references trd_account (id) on delete cascade,
      foreign key (symbol_id) references trd_symbol (id)
    );

    create index if not exists trd_log_account_id_idx
      on trd_log (account_id);

    create index if not exists trd_log_symbol_id_idx
      on trd_log (symbol_id);

    create table if not exists trd_lot_match (
      id integer primary key autoincrement,
      buy_trade_id integer not null,
      sell_trade_id integer not null,
      matched_share numeric not null,
      created_at text default current_timestamp,
      updated_at text default current_timestamp,
      foreign key (buy_trade_id) references trd_log (id) on delete cascade,
      foreign key (sell_trade_id) references trd_log (id) on delete cascade
    );

    create index if not exists trd_lot_match_buy_trade_id_idx
      on trd_lot_match (buy_trade_id);

    create index if not exists trd_lot_match_sell_trade_id_idx
      on trd_lot_match (sell_trade_id);

    create table if not exists trd_account_balance (
      id integer primary key autoincrement,
      account_id integer,
      date text not null default (date('now')),
      total_balance numeric,
      market_value numeric,
      cash_balance numeric,
      cost_basis numeric,
      notes text,
      created_at text default current_timestamp,
      updated_at text default current_timestamp,
      foreign key (account_id) references trd_account (id) on delete cascade
    );

    create index if not exists trd_account_balance_account_id_idx
      on trd_account_balance (account_id);

    create index if not exists trd_account_balance_date_idx
      on trd_account_balance (date);

    create table if not exists trd_log_stg (
      id integer primary key autoincrement,
      account_id integer,
      symbol_id integer,
      trade_date text,
      trade_type text,
      share numeric,
      price numeric,
      lot integer default null,
      total numeric,
      institution_id integer,
      note text,
      import_flag integer default 1,
      created_at text default current_timestamp,
      updated_at text default current_timestamp,
      foreign key (account_id) references trd_account (id) on delete cascade,
      foreign key (symbol_id) references trd_symbol (id)
    );

    create index if not exists trd_log_stg_account_id_idx on trd_log_stg (account_id);
    create index if not exists trd_log_stg_trade_date_idx on trd_log_stg (trade_date);
  `);

  ensureColumn('trd_account', 'url', 'text');
  ensureColumn('trd_account', 'staging_params', 'text');
  ensureColumn('trd_account', 'mapping_json', 'text');
  ensureColumn('trd_account', 'last_txn_date', 'text');
  ensureColumn('trd_account', 'last_merge_date', 'text');
  ensureColumn('trd_symbol', 'active', 'integer not null default 1');
  ensureColumn('trd_log', 'note', 'text');
  ensureColumn('trd_log_stg', 'note', 'text');
  ensureColumn('trd_log', 'trade_type_id', 'integer');
  ensureColumn('trd_log_stg', 'trade_type_id', 'integer');
  tradeDb.exec(`
    insert or ignore into trd_trade_type (name, display_name, sort_order) values
      ('BUY', 'BUY', 10),
      ('SELL', 'SELL', 20),
      ('DIVIDEND', 'DIVIDEND', 30),
      ('SPLIT', 'SPLIT', 40),
      ('interest', 'interest', 50),
      ('loan', 'loan', 60),
      ('transfer', 'transfer', 70),
      ('capital_gain', 'capital_gain', 80),
      ('fee', 'fee', 90),
      ('tax', 'tax', 95),
      ('corporate_action', 'corporate_action', 97),
      ('OTHER', 'OTHER', 100);
    insert or ignore into trd_trade_type (name, display_name, sort_order)
      select trim(trade_type), trim(trade_type), 100 from trd_log
      where trim(coalesce(trade_type, '')) <> '';
    insert or ignore into trd_trade_type (name, display_name, sort_order)
      select trim(trade_type), trim(trade_type), 100 from trd_log_stg
      where trim(coalesce(trade_type, '')) <> '';
    update trd_log set trade_type_id = (
      select id from trd_trade_type where name = trim(trd_log.trade_type)
    ) where trim(coalesce(trade_type, '')) <> '';
    update trd_log_stg set trade_type_id = (
      select id from trd_trade_type where name = trim(trd_log_stg.trade_type)
    ) where trim(coalesce(trade_type, '')) <> '';
    create index if not exists trd_log_trade_type_id_idx on trd_log (trade_type_id);
    create index if not exists trd_log_stg_trade_type_id_idx on trd_log_stg (trade_type_id);
  `);
}

renameTradePluralTables();
ensureTradeSchema();

export function closeTradeDb() {
  tradeDb.close();
}
