import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dataRoot = path.resolve(process.cwd(), process.env.DATA_ROOT ?? 'data');
const targetPath = path.join(dataRoot, 'db', 'corelog', 'corelog.sqlite');
const sourcePath = path.join(dataRoot, 'db', 'ec_log', 'ec_log.sqlite');

type Entry = {
  id: number;
  entry_date: string;
  raw_text: string;
  pin: number;
  created_at: string | null;
  updated_at: string | null;
};

type Tag = { id: number; name: string; created_at: string | null };
type EntryTag = { entry_id: number; tag_id: number };
type Media = { id: number; file_path: string; created_at: string | null };
type EntryMedia = { entry_id: number; media_id: number; sort_order: number; is_cover: number; created_at: string | null };

function text(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

async function main() {
  if (!fs.existsSync(sourcePath)) throw new Error(`Source database not found: ${sourcePath}`);
  if (!fs.existsSync(targetPath)) throw new Error(`Target database not found: ${targetPath}`);

  const source = new Database(sourcePath, { readonly: true });
  const target = new Database(targetPath);
  target.pragma('foreign_keys = ON');

  const backupPath = `${targetPath}.pre-merge-${new Date().toISOString().replace(/[.:]/g, '-')}`;
  await target.backup(backupPath);

  try {
    const entries = source.prepare('select id, entry_date, raw_text, pin, created_at, updated_at from entry order by id').all() as Entry[];
    const tags = source.prepare('select id, name, created_at from tag order by id').all() as Tag[];
    const entryTags = source.prepare('select entry_id, tag_id from entry_tag order by entry_id, tag_id').all() as EntryTag[];
    const media = source.prepare('select id, file_path, created_at from media order by id').all() as Media[];
    const entryMedia = source.prepare('select entry_id, media_id, sort_order, is_cover, created_at from entry_media order by entry_id, sort_order, id').all() as EntryMedia[];

    const existingEntries = target.prepare('select id, entry_date, raw_text from entry').all() as Array<Pick<Entry, 'id' | 'entry_date' | 'raw_text'>>;
    const entryByKey = new Map(existingEntries.map((entry) => [`${entry.entry_date}\u0000${entry.raw_text}`, entry.id]));
    const entryIdMap = new Map<number, number>();

    const existingTags = target.prepare('select id, name from tag').all() as Array<Pick<Tag, 'id' | 'name'>>;
    const tagIdByName = new Map(existingTags.map((tag) => [normalize(tag.name), tag.id]));
    const tagIdMap = new Map<number, number>();

    const existingMedia = target.prepare('select id, file_path from media').all() as Array<Pick<Media, 'id' | 'file_path'>>;
    const mediaIdByPath = new Map(existingMedia.map((item) => [normalize(item.file_path), item.id]));
    const mediaIdMap = new Map<number, number>();

    const insertEntry = target.prepare(`insert into entry (entry_date, raw_text, pin, created_at, updated_at)
      values (?, ?, ?, coalesce(?, current_timestamp), coalesce(?, current_timestamp))`);
    const insertTag = target.prepare(`insert into tag (name, created_at, updated_at)
      values (?, coalesce(?, current_timestamp), current_timestamp)`);
    const insertMedia = target.prepare(`insert into media (file_path, created_at, updated_at)
      values (?, coalesce(?, current_timestamp), current_timestamp)`);
    const getEntryMediaState = target.prepare('select count(*) as count, coalesce(max(is_cover), 0) as has_cover from entry_media where entry_id = ?') as Database.Statement<[number], { count: number; has_cover: number }>;
    const insertEntryTag = target.prepare('insert or ignore into entry_tag (entry_id, tag_id) values (?, ?)');
    const insertEntryMedia = target.prepare(`insert or ignore into entry_media
      (entry_id, media_id, sort_order, is_cover, created_at, updated_at)
      values (?, ?, ?, ?, coalesce(?, current_timestamp), current_timestamp)`);

    let newEntries = 0;
    let reusedEntries = 0;
    let newTags = 0;
    let reusedTags = 0;
    let newMedia = 0;
    let reusedMedia = 0;
    let entryTagLinks = 0;
    let entryMediaLinks = 0;

    target.transaction(() => {
      for (const entry of entries) {
        const key = `${entry.entry_date}\u0000${entry.raw_text}`;
        const existingId = entryByKey.get(key);
        if (existingId) {
          entryIdMap.set(entry.id, existingId);
          reusedEntries += 1;
          continue;
        }
        const result = insertEntry.run(entry.entry_date, entry.raw_text, entry.pin ? 1 : 0, text(entry.created_at), text(entry.updated_at));
        const newId = Number(result.lastInsertRowid);
        entryIdMap.set(entry.id, newId);
        entryByKey.set(key, newId);
        newEntries += 1;
      }

      for (const tag of tags) {
        const key = normalize(tag.name);
        const existingId = tagIdByName.get(key);
        if (existingId) {
          tagIdMap.set(tag.id, existingId);
          reusedTags += 1;
          continue;
        }
        const result = insertTag.run(tag.name, text(tag.created_at));
        const newId = Number(result.lastInsertRowid);
        tagIdMap.set(tag.id, newId);
        tagIdByName.set(key, newId);
        newTags += 1;
      }

      for (const item of media) {
        const key = normalize(item.file_path);
        const existingId = mediaIdByPath.get(key);
        if (existingId) {
          mediaIdMap.set(item.id, existingId);
          reusedMedia += 1;
          continue;
        }
        const result = insertMedia.run(item.file_path, text(item.created_at));
        const newId = Number(result.lastInsertRowid);
        mediaIdMap.set(item.id, newId);
        mediaIdByPath.set(key, newId);
        newMedia += 1;
      }

      for (const link of entryTags) {
        const entryId = entryIdMap.get(link.entry_id);
        const tagId = tagIdMap.get(link.tag_id);
        if (!entryId || !tagId) continue;
        const result = insertEntryTag.run(entryId, tagId);
        entryTagLinks += result.changes;
      }

      const mediaOrderByEntry = new Map<number, number>();
      for (const link of entryMedia) {
        const entryId = entryIdMap.get(link.entry_id);
        const mediaId = mediaIdMap.get(link.media_id);
        if (!entryId || !mediaId) continue;
        const state = getEntryMediaState.get(entryId) ?? { count: 0, has_cover: 0 };
        const nextOrder = mediaOrderByEntry.get(entryId) ?? link.sort_order;
        const makeCover = state.has_cover === 0 && state.count === 0 && link.is_cover === 1 ? 1 : 0;
        const result = insertEntryMedia.run(entryId, mediaId, nextOrder, makeCover, text(link.created_at));
        entryMediaLinks += result.changes;
        if (result.changes > 0) mediaOrderByEntry.set(entryId, nextOrder + 1);
      }
    })();

    console.log(JSON.stringify({
      source: sourcePath,
      target: targetPath,
      backup: backupPath,
      entries: { imported: newEntries, reused: reusedEntries },
      tags: { imported: newTags, reused: reusedTags },
      media: { imported: newMedia, reused: reusedMedia },
      links: { entryTag: entryTagLinks, entryMedia: entryMediaLinks },
    }, null, 2));
  } finally {
    source.close();
    target.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
