import Database from 'better-sqlite3';
import { env } from '../config/env';

export const db = new Database(env.sqlite.databasePath, { fileMustExist: true });

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function ensureBaseSchema() {
  db.exec(`
    create table if not exists entry (
      id integer primary key autoincrement,
      entry_date text not null,
      raw_text text not null,
      pin integer not null default 0,
      deleted_at text,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create index if not exists entry_created_at_idx
      on entry (created_at);

    create trigger if not exists entry_updated_at_trg
    after update on entry
    for each row
    when new.updated_at = old.updated_at
    begin
      update entry
      set updated_at = current_timestamp
      where id = new.id;
    end;

    create table if not exists tag (
      id integer primary key autoincrement,
      name text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create unique index if not exists tag_name_uq
      on tag (name);

    create index if not exists tag_name_idx
      on tag (name);

    create trigger if not exists tag_updated_at_trg
    after update on tag
    for each row
    when new.updated_at = old.updated_at
    begin
      update tag
      set updated_at = current_timestamp
      where id = new.id;
    end;

    create table if not exists entry_tag (
      entry_id integer not null,
      tag_id integer not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp,
      primary key (entry_id, tag_id),
      constraint entry_tag_entry_id_fk
        foreign key (entry_id) references entry (id)
        on delete cascade,
      constraint entry_tag_tag_id_fk
        foreign key (tag_id) references tag (id)
        on delete cascade
    );

    create index if not exists entry_tag_tag_id_idx
      on entry_tag (tag_id);

    create trigger if not exists entry_tag_updated_at_trg
    after update on entry_tag
    for each row
    when new.updated_at = old.updated_at
    begin
      update entry_tag
      set updated_at = current_timestamp
      where entry_id = new.entry_id
        and tag_id = new.tag_id;
    end;

    create table if not exists media (
      id integer primary key autoincrement,
      file_path text not null unique,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create index if not exists media_file_path_idx
      on media (file_path);

    create trigger if not exists media_updated_at_trg
    after update on media
    for each row
    when new.updated_at = old.updated_at
    begin
      update media
      set updated_at = current_timestamp
      where id = new.id;
    end;

    create table if not exists entry_media (
      id integer primary key autoincrement,
      entry_id integer not null,
      media_id integer not null,
      sort_order integer not null default 0,
      is_cover integer not null default 0,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp,
      constraint entry_media_entry_id_fk
        foreign key (entry_id) references entry (id)
        on delete cascade,
      constraint entry_media_media_id_fk
        foreign key (media_id) references media (id)
        on delete restrict,
      constraint entry_media_entry_media_uq
        unique (entry_id, media_id)
    );

    create index if not exists entry_media_entry_id_idx
      on entry_media (entry_id);

    create index if not exists entry_media_media_id_idx
      on entry_media (media_id);

    create index if not exists entry_media_entry_sort_idx
      on entry_media (entry_id, sort_order);

    create unique index if not exists entry_media_one_cover_uq
      on entry_media (entry_id)
      where is_cover = 1;

    create trigger if not exists entry_media_updated_at_trg
    after update on entry_media
    for each row
    when new.updated_at = old.updated_at
    begin
      update entry_media
      set updated_at = current_timestamp
      where id = new.id;
    end;

    create table if not exists app_setting (
      setting_key text primary key,
      setting_value text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create trigger if not exists app_setting_updated_at_trg
    after update on app_setting
    for each row
    when new.updated_at = old.updated_at
    begin
      update app_setting
      set updated_at = current_timestamp
      where setting_key = new.setting_key;
    end;

    create table if not exists qlink (
      id integer primary key autoincrement,
      group_name text,
      name text not null,
      url text,
      tip text,
      img_url text,
      note text,
      sort_order integer not null default 0,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create trigger if not exists qlink_updated_at_trg
    after update on qlink
    for each row
    when new.updated_at = old.updated_at
    begin
      update qlink
      set updated_at = current_timestamp
      where id = new.id;
    end;

  `);
}

function getEntryColumns() {
  return db.prepare('pragma table_info(entry)').all() as Array<{ name: string }>;
}

function ensureQuickLinkGroupNameColumn() {
  const columns = db.prepare('pragma table_info(qlink)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'group_name')) {
    db.exec('alter table qlink add column group_name text');
  }

  const hasLegacyGroupId = columns.some((column) => column.name === 'group_id');
  if (hasLegacyGroupId) {
    db.exec(`
      update qlink
      set group_name = (
        select name from qlink_group where qlink_group.id = qlink.group_id
      )
      where (group_name is null or trim(group_name) = '') and group_id is not null
    `);

    db.pragma('foreign_keys = OFF');
    try {
      db.exec('begin');
      db.exec(`
        create table qlink_new (
          id integer primary key autoincrement,
          group_name text,
          name text not null,
          url text,
          tip text,
          img_url text,
          note text,
          sort_order integer not null default 0,
          created_at text not null default current_timestamp,
          updated_at text not null default current_timestamp
        );
        insert into qlink_new (id, group_name, name, url, tip, img_url, note, sort_order, created_at, updated_at)
          select id, group_name, name, url, tip, img_url, note, sort_order, created_at, updated_at
          from qlink;
        drop table qlink;
        alter table qlink_new rename to qlink;
        drop table qlink_group;
        create index qlink_group_name_sort_idx on qlink (group_name, sort_order, id);
        create trigger qlink_updated_at_trg
        after update on qlink
        for each row
        when new.updated_at = old.updated_at
        begin
          update qlink
          set updated_at = current_timestamp
          where id = new.id;
        end;
      `);
      db.exec('commit');
    } catch (error) {
      db.exec('rollback');
      throw error;
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  db.prepare("delete from qlink where lower(trim(name)) = 'more...'").run();
  db.exec('create index if not exists qlink_group_name_sort_idx on qlink (group_name, sort_order, id)');
}

function ensureModuleSettings() {
  const key = 'modules.enabled';
  const oldKeys = ['module.trade.enabled', 'module.transaction.enabled', 'module.hayday.enabled'];
  const current = db.prepare('select setting_value from app_setting where setting_key = ?').get(key) as { setting_value?: string } | undefined;
  if (!current) {
    const oldRows = db.prepare(`select setting_key, setting_value from app_setting where setting_key in (${oldKeys.map(() => '?').join(',')})`).all(...oldKeys) as Array<{ setting_key: string; setting_value: string }>;
    const values = new Map(oldRows.map((row) => [row.setting_key, row.setting_value === 'true']));
    db.prepare('insert into app_setting (setting_key, setting_value) values (?, ?)').run(key, JSON.stringify({
      trade: values.get(oldKeys[0]) ?? false,
      transaction: values.get(oldKeys[1]) ?? false,
      hayday: values.get(oldKeys[2]) ?? false,
    }));
  }
  db.prepare(`delete from app_setting where setting_key in (${oldKeys.map(() => '?').join(',')})`).run(...oldKeys);
  db.prepare("delete from app_setting where setting_key = 'module.tool.enabled'").run();
}

function ensureQuickLinkGroupSettings() {
  const key = 'qlinks.groups';
  const row = db.prepare('select setting_value from app_setting where setting_key = ?').get(key) as { setting_value?: string } | undefined;
  let parsed: any = null;
  try {
    parsed = JSON.parse(row?.setting_value ?? '');
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.qLink !== undefined && parsed.group && typeof parsed.group === 'object') return;
  const group = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Array.isArray(parsed.expanded)
      ? Object.fromEntries(parsed.expanded.filter((name: unknown): name is string => typeof name === 'string' && Boolean(name.trim())).map((name: string) => [name.trim(), true]))
      : Object.fromEntries(Object.entries(parsed.expanded && typeof parsed.expanded === 'object' ? parsed.expanded : parsed)
        .filter(([, value]) => value === true)
        .map(([name]) => [name, true]))
    : Array.isArray(parsed)
      ? Object.fromEntries(parsed.filter((name: unknown): name is string => typeof name === 'string' && Boolean(name.trim())).map((name: string) => [name.trim(), true]))
      : {};
  db.prepare(`
    insert into app_setting (setting_key, setting_value)
    values (?, ?)
    on conflict(setting_key) do update set setting_value = excluded.setting_value
  `).run(key, JSON.stringify({ qLink: true, group }));
}

function ensureEntryPinColumn() {
  const columns = getEntryColumns();

  if (columns.some((column) => column.name === 'pin')) {
    return;
  }

  db.exec('alter table entry add column pin integer not null default 0');
}

function ensureEntryDeletedColumn() {
  const columns = getEntryColumns();

  if (!columns.some((column) => column.name === 'deleted_at')) {
    db.exec('alter table entry add column deleted_at text');
  }
}

function ensureEntryColumnOrder() {
  const columns = getEntryColumns().map((column) => column.name);
  const desiredColumns = ['id', 'entry_date', 'raw_text', 'pin', 'deleted_at', 'created_at', 'updated_at'];

  if (columns.length !== desiredColumns.length || desiredColumns.some((column, index) => columns[index] !== column)) {
    db.pragma('foreign_keys = OFF');

    try {
      db.exec(`
        begin immediate;

        create table entry_new (
          id integer primary key autoincrement,
          entry_date text not null,
          raw_text text not null,
          pin integer not null default 0,
          deleted_at text,
          created_at text not null default current_timestamp,
          updated_at text not null default current_timestamp
        );

        insert into entry_new (id, entry_date, raw_text, pin, deleted_at, created_at, updated_at)
        select id, entry_date, raw_text, coalesce(pin, 0), deleted_at, created_at, updated_at
        from entry;

        drop table entry;
        alter table entry_new rename to entry;

        create index entry_created_at_idx on entry (created_at);

        create trigger entry_updated_at_trg
        after update on entry
        for each row
        when new.updated_at = old.updated_at
        begin
          update entry
          set updated_at = current_timestamp
          where id = new.id;
        end;

        commit;
      `);

      const seqRow = db.prepare('select coalesce(max(id), 0) as seq from entry').get() as { seq: number };
      db.prepare('delete from sqlite_sequence where name = ?').run('entry');
      db.prepare('insert into sqlite_sequence (name, seq) values (?, ?)').run('entry', seqRow.seq);
    } catch (error) {
      db.exec('rollback');
      throw error;
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }
}

ensureBaseSchema();
ensureModuleSettings();
ensureQuickLinkGroupNameColumn();
ensureQuickLinkGroupSettings();
ensureEntryPinColumn();
ensureEntryDeletedColumn();
ensureEntryColumnOrder();

export async function closePool() {
  db.close();
}
