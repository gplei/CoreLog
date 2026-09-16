import Database from 'better-sqlite3';
import { env } from '../../../../config/env';

export const transactionDb = new Database(env.sqlite.transactionDatabasePath, { fileMustExist: true });

transactionDb.pragma('foreign_keys = ON');
transactionDb.pragma('journal_mode = WAL');

function normalizeDateValue(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }
  const mmddyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const [, mm, dd, yyyy] = mmddyyyy;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const ymd = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymd) {
    const [, yyyy, mm, dd] = ymd;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return raw;
}

transactionDb.function('if', (condition: unknown, whenTrue: unknown, whenFalse: unknown) => {
  return condition ? whenTrue : whenFalse;
});

transactionDb.function('STR_TO_DATE', (value: unknown) => {
  return normalizeDateValue(value);
});

function getTableSql(tableName: string) {
  return transactionDb.prepare(`select sql from sqlite_master where type = 'table' and name = ?`).get(tableName) as { sql?: string } | undefined;
}

function getTableColumns(tableName: string) {
  return transactionDb.prepare(`pragma table_info(${JSON.stringify(tableName)})`).all() as Array<{ name?: string }>;
}

function renameTransactionSourceSchema() {
  const tableExists = (tableName: string) => Boolean(transactionDb.prepare(
    "select 1 from sqlite_master where type = 'table' and name = ?",
  ).get(tableName));
  const renameColumn = (tableName: string) => {
    const columns = new Set(getTableColumns(tableName).map((column) => String(column.name ?? '')));
    if (columns.has('source_id') && !columns.has('account_id')) {
      transactionDb.exec(`alter table ${tableName} rename column source_id to account_id`);
    }
  };
  const renameTable = (oldName: string, newName: string) => {
    if (!tableExists(newName) && tableExists(oldName)) {
      transactionDb.exec(`alter table ${oldName} rename to ${newName}`);
    }
  };

  if (
    (!tableExists('txn_account') && tableExists('txn_sources'))
    || (!tableExists('txn_log') && tableExists('txn_transactions'))
    || (!tableExists('txn_log_stg') && tableExists('txn_transactions_stg'))
    || (!tableExists('txn_log_line') && tableExists('txn_transaction_lines'))
  ) {
    transactionDb.pragma('foreign_keys = OFF');
    try {
      renameTable('txn_sources', 'txn_account');
      renameTable('txn_transactions', 'txn_log');
      renameTable('txn_transactions_stg', 'txn_log_stg');
      renameTable('txn_transaction_lines', 'txn_log_line');
    } finally {
      transactionDb.pragma('foreign_keys = ON');
    }
  }

  renameColumn('txn_log');
  renameColumn('txn_log_stg');
  renameColumn('txn_category_rule');
}

function ensureTxnSourceMappingColumn() {
  const columns = getTableColumns('txn_account');
  if (columns.some((column) => column.name === 'mapping_json')) return;
  transactionDb.exec('alter table txn_account add column mapping_json text');
}

function renameTransactionLookupTables() {
  const tableExists = (tableName: string) => Boolean(transactionDb.prepare(
    "select 1 from sqlite_master where type = 'table' and name = ?",
  ).get(tableName));
  const renames: Array<[string, string]> = [
    ['txn_trips', 'txn_trip'],
    ['txn_categories', 'txn_category'],
  ];
  const pending = renames.filter(([oldName, newName]) => !tableExists(newName) && tableExists(oldName));
  if (pending.length === 0) return;

  transactionDb.pragma('foreign_keys = OFF');
  try {
    pending.forEach(([oldName, newName]) => {
      transactionDb.exec(`alter table ${oldName} rename to ${newName}`);
    });
  } finally {
    transactionDb.pragma('foreign_keys = ON');
  }
}

function removeUnusedTransactionTables() {
  transactionDb.pragma('foreign_keys = OFF');
  try {
    transactionDb.exec('drop table if exists transaction_city; drop table if exists txn_category_keyword;');
  } finally {
    transactionDb.pragma('foreign_keys = ON');
  }
}

function splitMappingExpressions(value: string) {
  const expressions: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (quote) {
      current += char;
      if (char === quote && next === quote) {
        current += next;
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '`' || char === "'" || char === '"') {
      quote = char;
      current += char;
    } else if (char === '(') {
      depth += 1;
      current += char;
    } else if (char === ')') {
      depth -= 1;
      current += char;
    } else if (char === ',' && depth === 0) {
      expressions.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) expressions.push(current.trim());
  return expressions;
}

function unquoteMappingValue(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('`') && trimmed.endsWith('`'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function csvHeadersInExpression(expression: string) {
  const headers = expression.match(/`([^`]+)`|\b(?:date|description|debit|credit|amount|type|details|symbol|quantity|price)\b/gi) ?? [];
  return [...new Set(headers.map((header) => unquoteMappingValue(header)))];
}

function mappingEntry(expression: string, stgHeader: string) {
  const raw = expression.trim();
  const cleaned = unquoteMappingValue(raw);
  const metadata = { stgHeader, csvHeader: csvHeadersInExpression(raw) };
  const branch = (value: string) => {
    const branchValue = unquoteMappingValue(value);
    const isKnownConstant = /^(transfer|expense|income|buy|sell|dividend|other)$/i.test(branchValue);
    const isColumn = !isKnownConstant && /^`[^`]+`$|^[A-Za-z][A-Za-z0-9 _()-]*$/.test(value.trim());
    return isColumn
      ? { type: 'direct', column: branchValue, stgHeader, csvHeader: branchValue }
      : { type: 'constant', value: branchValue, stgHeader, csvHeader: [] };
  };
  const likeIf = raw.match(/^if\(\s*upper\(([^)]+)\)\s+like\s+'%([^%]+)%'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)$/i);
  const equalsIf = raw.match(/^if\(\s*upper\(([^)]+)\)\s*=\s*'([^']+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)$/i);
  const valueIf = raw.match(/^if\(\s*`?([^,()]+)`?\s*,\s*([^,()]+)\s*,\s*([^,()]+)\s*\)$/i);
  if (likeIf || equalsIf) {
    const match = likeIf ?? equalsIf;
    return {
      type: 'if_else',
      condition: {
        column: unquoteMappingValue(match?.[1] ?? ''),
        operator: likeIf ? 'contains' : 'equals',
        value: match?.[2] ?? '',
      },
      then: branch(match?.[3] ?? ''),
      else: branch(match?.[4] ?? ''),
      ...metadata,
    };
  }
  if (valueIf) {
    return {
      type: 'if_else',
      condition: { column: unquoteMappingValue(valueIf[1]), operator: 'not_empty', value: '' },
      then: branch(valueIf[2]),
      else: branch(valueIf[3]),
      ...metadata,
    };
  }
  const directColumn = raw.match(/^`[^`]+`$|^[A-Za-z][A-Za-z0-9 _()-]*$/);
  if (directColumn && !/^if$/i.test(cleaned)) {
    return {
      type: 'direct',
      column: cleaned,
      ...metadata,
      ...(stgHeader === 'date' ? { transform: 'date' } : {}),
    };
  }
  if (/^null$/i.test(raw) || /^['"]{2}$/.test(raw)) {
    return { type: 'constant', value: '', ...metadata };
  }
  if (/^-?[0-9]+(?:\.[0-9]+)?$/.test(raw)) {
    return { type: 'constant', value: Number(raw), ...metadata };
  }
  if (/^-[A-Za-z`]/.test(raw) || /[+*/]/.test(raw)) {
    return { type: 'math', expression: raw, ...metadata, ...(stgHeader === 'amount' ? { transform: 'number' } : {}) };
  }
  return { type: 'if_else', expression: raw, ...metadata };
}

function enrichMappingEntry(entry: any, stgHeader: string): any {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  if (entry.type === 'if_else' && entry.expression && !entry.condition) {
    return mappingEntry(String(entry.expression), stgHeader);
  }
  if (entry.type === 'direct' && /^(transfer|expense|income|buy|sell|dividend|other)$/i.test(String(entry.column ?? ''))) {
    return { type: 'constant', value: entry.column, stgHeader, csvHeader: [] };
  }
  const enriched = { ...entry, stgHeader };
  if (enriched.csvHeader === undefined) {
    enriched.csvHeader = enriched.column
      ? String(enriched.column)
      : csvHeadersInExpression(String(enriched.expression ?? ''));
  }
  if (enriched.then && typeof enriched.then === 'object') enriched.then = enrichMappingEntry(enriched.then, stgHeader);
  if (enriched.else && typeof enriched.else === 'object') enriched.else = enrichMappingEntry(enriched.else, stgHeader);
  return enriched;
}

function mappingCsvHeaders(mapping: Record<string, any>) {
  const headers: string[] = [];
  const collect = (entry: any) => {
    if (!entry || typeof entry !== 'object') return;
    const values = Array.isArray(entry.csvHeader) ? entry.csvHeader : [entry.csvHeader];
    values.forEach((value: unknown) => {
      const header = String(value ?? '').trim();
      if (header && !headers.some((item) => item.toLowerCase() === header.toLowerCase())) headers.push(header);
    });
    collect(entry.then);
    collect(entry.else);
  };
  Object.values(mapping).forEach(collect);
  return headers;
}

function migrateStagingParamsToMapping() {
  const targets = ['date', 'type', 'description', 'amount', 'account_id', 'owner'];
  const sources = transactionDb.prepare(
    'select id, staging_params, mapping_json from txn_account where staging_params is not null and trim(staging_params) <> ? or mapping_json is not null and trim(mapping_json) <> ?',
  ).all('', '') as Array<{ id?: number; staging_params?: string; mapping_json?: string }>;
  const update = transactionDb.prepare('update txn_account set mapping_json = ?, updated_at = current_timestamp where id = ?');
  const migrate = transactionDb.transaction(() => {
    sources.forEach((source) => {
      const mapping: Record<string, unknown> = {};
      let existing: Record<string, any> | null = null;
      try {
        const parsed = JSON.parse(String(source.mapping_json ?? ''));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          existing = parsed.mapping && typeof parsed.mapping === 'object' ? parsed.mapping : parsed;
        }
      } catch {
        existing = null;
      }
      if (existing) {
        targets.forEach((target) => {
          if (existing?.[target]) mapping[target] = enrichMappingEntry(existing[target], target);
        });
      } else {
        const expressions = splitMappingExpressions(String(source.staging_params ?? ''));
        targets.forEach((target, index) => {
          const expression = expressions[index];
          if (expression) mapping[target] = mappingEntry(expression, target);
        });
      }
      if (Object.keys(mapping).length > 0) {
        update.run(JSON.stringify({
          csv_header: mappingCsvHeaders(mapping),
          stg_header: Object.keys(mapping),
          mapping,
        }), source.id);
      }
    });
  });
  migrate();
}

function rebuildTxnTripsTable() {
  const hasTripsTable = Boolean(getTableSql('txn_trip'));
  const existingSql = getTableSql('txn_trip')?.sql ?? '';
  if (!hasTripsTable || (/generated\s+always/i.test(existingSql) && !/\+\s*1/i.test(existingSql))) {
    return;
  }

  const migrate = transactionDb.transaction(() => {
    transactionDb.exec(`
      alter table txn_trip rename to txn_trip_old;

      create table txn_trip (
        id integer primary key autoincrement,
        name text,
        start_date text,
        end_date text,
        days integer generated always as (
          case
            when start_date is null or end_date is null then null
            else cast(julianday(end_date) - julianday(start_date) as integer)
          end
        ) virtual,
        amount numeric default 0.00,
        notes text,
        created_at text default current_timestamp,
        updated_at text default current_timestamp
      );

      create index if not exists txn_trip_start_date_idx on txn_trip (start_date);
      create index if not exists txn_trip_end_date_idx on txn_trip (end_date);
    `);

    transactionDb.exec(`
      insert into txn_trip (id, name, start_date, end_date, amount, notes, created_at, updated_at)
      select id, name, start_date, end_date, amount, notes, created_at, updated_at
      from txn_trip_old;

      drop table txn_trip_old;
    `);
  });

  transactionDb.pragma('foreign_keys = OFF');
  try {
    migrate();
  } finally {
    transactionDb.pragma('foreign_keys = ON');
  }
}

function rebuildTxnTransactionsStgTable() {
  const hasStagingTable = Boolean(getTableSql('txn_log_stg'));
  const existingSql = getTableSql('txn_log_stg')?.sql ?? '';
  const existingColumns = new Set(getTableColumns('txn_log_stg').map((column) => String(column.name ?? '')));
  const hasActiveColumn = existingColumns.has('active');
  const hasTripColumn = existingColumns.has('trip_id');
  const hasAccountFromColumn = existingColumns.has('account_from');
  const hasAccountToColumn = existingColumns.has('account_to');
  const needsRebuild =
    !hasStagingTable
    || !existingColumns.has('trip_id')
    || !existingColumns.has('account_from')
    || !existingColumns.has('account_to')
    || !/active\s+integer\s+default\s+1/i.test(existingSql)
    || !/import_flag\s+integer\s+default\s+1/i.test(existingSql)
    || !/foreign key \(category_id\) references txn_category \(id\)/i.test(existingSql)
    || !/foreign key \(subcategory_id\) references txn_category \(id\)/i.test(existingSql)
    || !/foreign key \(trip_id\) references txn_trip \(id\)/i.test(existingSql)
    || /txn_trip_old/i.test(existingSql)
    || !/foreign key \(account_id\) references txn_account \(id\)/i.test(existingSql);

  if (!needsRebuild) {
    return;
  }

  const migrate = transactionDb.transaction(() => {
    transactionDb.exec(`
      alter table txn_log_stg rename to txn_log_stg_old;

      create table txn_log_stg (
        id integer primary key autoincrement,
        date text,
        description text,
        amount numeric,
        type text not null,
        category_id integer,
        subcategory_id integer,
        note text,
        trip_id integer,
        account_id integer,
        account_from text,
        account_to text,
        source text,
        owner text,
        active integer default 1,
        created_at text default current_timestamp,
        updated_at text default current_timestamp,
        import_flag integer default 1,
        foreign key (category_id) references txn_category (id),
        foreign key (subcategory_id) references txn_category (id),
        foreign key (trip_id) references txn_trip (id),
        foreign key (account_id) references txn_account (id)
      );

      create index if not exists txn_log_stg_date_idx on txn_log_stg (date);
      create index if not exists txn_log_stg_category_id_idx on txn_log_stg (category_id);
      create index if not exists txn_log_stg_subcategory_id_idx on txn_log_stg (subcategory_id);
      create index if not exists txn_log_stg_trip_id_idx on txn_log_stg (trip_id);
      create index if not exists txn_log_stg_account_id_idx on txn_log_stg (account_id);
    `);

    transactionDb.exec(`
      insert into txn_log_stg (
        id,
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
        active,
        created_at,
        updated_at,
        import_flag
      )
      select
        id,
        date,
        description,
        amount,
        type,
        category_id,
        subcategory_id,
        note,
        ${hasTripColumn ? 'trip_id' : 'null'},
        account_id,
        ${hasAccountFromColumn ? 'account_from' : 'null'},
        ${hasAccountToColumn ? 'account_to' : 'null'},
        source,
        owner,
        ${hasActiveColumn ? 'coalesce(active, 1)' : '1'},
        created_at,
        updated_at,
        coalesce(import_flag, 1)
      from txn_log_stg_old;

      drop table txn_log_stg_old;
    `);
  });

  transactionDb.pragma('foreign_keys = OFF');
  try {
    migrate();
  } finally {
    transactionDb.pragma('foreign_keys = ON');
  }
}

function repairTxnTransactionsTripForeignKey() {
  const existingSql = getTableSql('txn_log')?.sql ?? '';
  if (!/txn_trip_old/i.test(existingSql)) return;

  transactionDb.pragma('foreign_keys = OFF');
  transactionDb.pragma('legacy_alter_table = ON');
  try {
    const migrate = transactionDb.transaction(() => {
      transactionDb.exec(`
        alter table txn_log rename to txn_log_old;

        create table txn_log (
          id integer primary key autoincrement,
          date text,
          description text,
          amount numeric,
          type text not null,
          category_id integer,
          subcategory_id integer,
          note text,
          trip_id integer,
          account_id integer,
          account_from text,
          account_to text,
          source text,
          owner text,
          active integer default 1,
          created_at text default current_timestamp,
          updated_at text default current_timestamp,
          foreign key (category_id) references txn_category (id),
          foreign key (subcategory_id) references txn_category (id),
          foreign key (trip_id) references txn_trip (id),
          foreign key (account_id) references txn_account (id)
        );

        insert into txn_log (
          id, date, description, amount, type, category_id, subcategory_id,
          note, trip_id, account_id, account_from, account_to, source, owner,
          active, created_at, updated_at
        )
        select
          id, date, description, amount, type, category_id, subcategory_id,
          note, trip_id, account_id, account_from, account_to, source, owner,
          coalesce(active, 1), created_at, updated_at
        from txn_log_old;

        drop table txn_log_old;
      `);
    });
    migrate();
  } finally {
    transactionDb.pragma('legacy_alter_table = OFF');
    transactionDb.pragma('foreign_keys = ON');
  }
}

function ensureTransactionSchema() {
  transactionDb.exec(`
    create table if not exists txn_category (
      id integer primary key autoincrement,
      name text,
      parent_id integer,
      description text,
      active integer default 1,
      created_at text default current_timestamp,
      updated_at text default current_timestamp,
      foreign key (parent_id) references txn_category (id)
    );

    create index if not exists txn_category_parent_id_idx
      on txn_category (parent_id);

    create index if not exists txn_category_name_idx
      on txn_category (name);

    create table if not exists txn_category_rule (
      id integer primary key autoincrement,
      rule_name text,
      match_field text not null default 'description',
      match_type text not null default 'contains',
      pattern text not null,
      category_id integer not null,
      subcategory_id integer,
      account_id integer,
      priority integer not null default 100,
      active integer not null default 1,
      stop_after_match integer not null default 1,
      notes text,
      created_at text default current_timestamp,
      updated_at text default current_timestamp,
      foreign key (category_id) references txn_category (id),
      foreign key (subcategory_id) references txn_category (id),
      foreign key (account_id) references txn_account (id)
    );

    create index if not exists txn_category_rule_active_idx
      on txn_category_rule (active);

    create index if not exists txn_category_rule_category_idx
      on txn_category_rule (category_id);

    create index if not exists txn_category_rule_account_idx
      on txn_category_rule (account_id);

    create index if not exists txn_category_rule_priority_idx
      on txn_category_rule (priority);

    create table if not exists txn_account (
      id integer primary key autoincrement,
      name text,
      url text,
      staging_params text,
      type text,
      notes text,
      created_at text default current_timestamp,
      updated_at text default current_timestamp,
      last_txn_date text,
      last_merge_date text
    );

    create index if not exists txn_account_name_idx on txn_account (name);

    create table if not exists txn_trip (
      id integer primary key autoincrement,
      name text,
      start_date text,
      end_date text,
      days integer generated always as (
        case
          when start_date is null or end_date is null then null
          else cast(julianday(end_date) - julianday(start_date) as integer)
        end
      ) virtual,
      amount numeric default 0.00,
      notes text,
      created_at text default current_timestamp,
      updated_at text default current_timestamp
    );

    create index if not exists txn_trip_start_date_idx on txn_trip (start_date);
    create index if not exists txn_trip_end_date_idx on txn_trip (end_date);

    create table if not exists txn_log (
      id integer primary key autoincrement,
      date text,
      description text,
      amount numeric,
      type text not null,
      category_id integer,
      subcategory_id integer,
      note text,
      trip_id integer,
      account_id integer,
      account_from text,
      account_to text,
      source text,
      owner text,
      active integer default 1,
      created_at text default current_timestamp,
      updated_at text default current_timestamp,
      foreign key (category_id) references txn_category (id),
      foreign key (subcategory_id) references txn_category (id),
      foreign key (trip_id) references txn_trip (id),
      foreign key (account_id) references txn_account (id)
    );

    create index if not exists txn_log_date_idx on txn_log (date);
    create index if not exists txn_log_category_id_idx on txn_log (category_id);
    create index if not exists txn_log_subcategory_id_idx on txn_log (subcategory_id);
    create index if not exists txn_log_trip_id_idx on txn_log (trip_id);
    create index if not exists txn_log_account_id_idx on txn_log (account_id);

    create table if not exists txn_log_line (
      id integer primary key autoincrement,
      transaction_id integer not null,
      description text,
      amount numeric,
      category_id integer,
      subcategory_id integer,
      note text,
      created_at text default current_timestamp,
      updated_at text default current_timestamp,
      foreign key (transaction_id) references txn_log (id) on delete cascade,
      foreign key (category_id) references txn_category (id),
      foreign key (subcategory_id) references txn_category (id)
    );

    create index if not exists txn_log_line_transaction_id_idx on txn_log_line (transaction_id);
    create index if not exists txn_log_line_category_id_idx on txn_log_line (category_id);

    create table if not exists txn_log_stg (
      id integer primary key autoincrement,
      date text,
      description text,
      amount numeric,
      type text not null,
      category_id integer,
      subcategory_id integer,
      note text,
      account_id integer,
      source text,
      owner text,
      created_at text default current_timestamp,
      updated_at text default current_timestamp,
      active integer default 1,
      import_flag integer default 1,
      foreign key (category_id) references txn_category (id),
      foreign key (subcategory_id) references txn_category (id),
      foreign key (account_id) references txn_account (id)
    );

    create index if not exists txn_log_stg_date_idx on txn_log_stg (date);
    create index if not exists txn_log_stg_category_id_idx on txn_log_stg (category_id);
    create index if not exists txn_log_stg_subcategory_id_idx on txn_log_stg (subcategory_id);
    create index if not exists txn_log_stg_account_id_idx on txn_log_stg (account_id);
  `);
}

function normalizeStoredDates() {
  transactionDb.exec(`
    update txn_log set date = STR_TO_DATE(date) where date is not null and date <> '';
    update txn_log_stg set date = STR_TO_DATE(date) where date is not null and date <> '';
    update txn_account set last_txn_date = STR_TO_DATE(last_txn_date) where last_txn_date is not null and last_txn_date <> '';
    update txn_account set last_merge_date = STR_TO_DATE(last_merge_date) where last_merge_date is not null and last_merge_date <> '';
    update txn_trip set start_date = STR_TO_DATE(start_date) where start_date is not null and start_date <> '';
    update txn_trip set end_date = STR_TO_DATE(end_date) where end_date is not null and end_date <> '';
  `);
}

renameTransactionSourceSchema();
renameTransactionLookupTables();
removeUnusedTransactionTables();
ensureTransactionSchema();
ensureTxnSourceMappingColumn();
rebuildTxnTripsTable();
rebuildTxnTransactionsStgTable();
repairTxnTransactionsTripForeignKey();
normalizeStoredDates();

export function closeTransactionDb() {
  transactionDb.close();
}
