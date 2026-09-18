import { db } from '../db/pool';
import type { JournalEntryDetail, JournalTag } from '../types/journal';
import { parseTagNames } from '../utils/tags';
import { normalizeUploadFilePath, resolveThumbnailPublicPath, resolveUploadPublicPath } from '../utils/uploads';

type DbRow = Record<string, unknown>;

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];

  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    uniqueValues.push(value);
  }

  return uniqueValues;
}

function allRows<T extends DbRow = DbRow>(sql: string, params: unknown[] = []) {
  return db.prepare(sql).all(...params) as T[];
}

function getRow<T extends DbRow = DbRow>(sql: string, params: unknown[] = []) {
  return db.prepare(sql).get(...params) as T | undefined;
}

function formatEntry(row: DbRow) {
  return {
    id: Number(row.id),
    entry_date: String(row.entry_date),
    raw_text: String(row.raw_text),
    created_at: String(row.created_at),
    pin: Number(row.pin) === 1,
    photo_count: Number(row.photo_count ?? 0),
    cover_photo_path: row.cover_photo_path ? resolveUploadPublicPath(String(row.cover_photo_path)) : null,
    cover_thumbnail_path: row.cover_photo_path ? resolveThumbnailPublicPath(String(row.cover_photo_path)) : null,
  };
}

function getMediaRowsByPaths(filePaths: string[]) {
  const normalizedFilePaths = uniqueStrings(
    filePaths
      .map((filePath) => normalizeUploadFilePath(filePath))
      .filter((filePath) => filePath.trim().length > 0),
  );

  if (normalizedFilePaths.length === 0) {
    return [] as Array<{ id: number; file_path: string }>;
  }

  const insertMedia = db.prepare('insert or ignore into media (file_path) values (?)');
  for (const filePath of normalizedFilePaths) {
    insertMedia.run(filePath);
  }

  const rows = allRows<{ id: number; file_path: string }>(
    `select id, file_path
     from media
     where file_path in (${placeholders(normalizedFilePaths.length)})`,
    normalizedFilePaths,
  );

  const rowByPath = new Map(rows.map((row) => [String(row.file_path), row]));
  return normalizedFilePaths
    .map((filePath) => rowByPath.get(filePath))
    .filter((row): row is { id: number; file_path: string } => Boolean(row));
}

function getEntryMediaRows(entryId: number) {
  return allRows<{
    id: number;
    entry_id: number;
    media_id: number;
    file_path: string;
    sort_order: number;
    is_cover: number;
  }>(
    `select em.id, em.entry_id, em.media_id, m.file_path, em.sort_order, em.is_cover
     from entry_media em
     join media m on m.id = em.media_id
     where em.entry_id = ?
     order by em.sort_order asc, em.id asc`,
    [entryId],
  );
}

function getNextEntryMediaSortOrder(entryId: number) {
  const row = getRow<{ max_sort_order: number }>(
    `select coalesce(max(sort_order), -1) as max_sort_order
     from entry_media
     where entry_id = ?`,
    [entryId],
  );

  return Number(row?.max_sort_order ?? -1) + 1;
}

function reorderEntryMedia(entryId: number, orderedMediaIds: number[]) {
  const currentRows = getEntryMediaRows(entryId);

  if (currentRows.length === 0) {
    return;
  }

  const currentRowsById = new Map(currentRows.map((row) => [Number(row.id), row]));
  const orderedRows: typeof currentRows = [];
  const seen = new Set<number>();

  for (const mediaId of orderedMediaIds) {
    if (seen.has(mediaId)) continue;
    const row = currentRowsById.get(mediaId);
    if (!row) continue;
    orderedRows.push(row);
    seen.add(mediaId);
  }

  for (const row of currentRows) {
    const rowId = Number(row.id);
    if (seen.has(rowId)) continue;
    orderedRows.push(row);
  }

  const updateEntryMedia = db.prepare(
    `update entry_media
     set sort_order = ?, updated_at = CURRENT_TIMESTAMP
     where id = ?`,
  );

  orderedRows.forEach((row, index) => {
    const rowId = Number(row.id);
    updateEntryMedia.run(index, rowId);
  });
}

function updateEntryMediaMetadata(entryId: number) {
  db.prepare(
    `update entry
     set updated_at = CURRENT_TIMESTAMP
     where id = ?`,
  ).run(entryId);
}

function hasMediaReferences(mediaId: number) {
  const row = getRow<{ ref_count: number }>(
    `select count(*) as ref_count
     from entry_media
     where media_id = ?`,
    [mediaId],
  );

  return Number(row?.ref_count ?? 0) > 0;
}

function insertEntryMedia(entryId: number, filePaths: string[], startingSortOrder = 0) {
  const mediaRows = getMediaRowsByPaths(filePaths);

  if (mediaRows.length === 0) {
    return;
  }

  const existingMediaIds = new Set(
    allRows<{ media_id: number }>(
      `select media_id
       from entry_media
       where entry_id = ?`,
      [entryId],
    ).map((row) => Number(row.media_id)),
  );

  const insertEntryMediaRow = db.prepare(
    `insert into entry_media (entry_id, media_id, sort_order, is_cover)
     values (?, ?, ?, 0)`,
  );

  let offset = 0;
  mediaRows.forEach((mediaRow) => {
    if (existingMediaIds.has(mediaRow.id)) {
      return;
    }

    const sortOrder = startingSortOrder + offset;
    insertEntryMediaRow.run(entryId, mediaRow.id, sortOrder);
    offset += 1;
  });
}

function createTags(tagNames: string[]) {
  if (tagNames.length === 0) {
    return [] as JournalTag[];
  }

  const insertTag = db.prepare('insert or ignore into tag (name) values (?)');

  for (const tagName of tagNames) {
    insertTag.run(tagName);
  }

  return allRows(`select id, name from tag where name in (${placeholders(tagNames.length)})`, tagNames)
    .map((row) => ({
      id: Number(row.id),
      name: String(row.name),
    }));
}

function linkEntryTags(entryId: number, tagNames: string[]) {
  const tags = createTags(tagNames);

  if (tags.length === 0) {
    return;
  }

  const insertEntryTag = db.prepare(
    'insert or ignore into entry_tag (entry_id, tag_id) values (?, ?)',
  );

  for (const tag of tags) {
    insertEntryTag.run(entryId, tag.id);
  }
}

function getTagsForEntry(entryId: number) {
  return allRows(
    `select t.id, t.name
     from entry_tag et
     join tag t on t.id = et.tag_id
     where et.entry_id = ?
     order by t.name asc`,
    [entryId],
  ).map((row) => ({
    id: Number(row.id),
    name: String(row.name),
  }));
}

function localToday() {
  const row = getRow<{ entry_date: string }>(
    `select date('now', 'localtime') as entry_date`,
  );

  return row?.entry_date ?? '';
}

export async function createJournalEntry(
  rawText: string,
  filePaths: string[],
  tags: string[] = [],
  entryDate: string | null = null,
) {
  const createEntry = db.transaction(() => {
    const resolvedEntryDate = entryDate ?? localToday();
    const entryResult = db
      .prepare(
        `insert into entry (entry_date, raw_text, pin)
         values (?, ?, 0)`,
      )
      .run(resolvedEntryDate, rawText);

    const entryId = Number(entryResult.lastInsertRowid);
    insertEntryMedia(entryId, filePaths);

    const normalizedTags = parseTagNames(tags);
    if (normalizedTags.length > 0) {
      linkEntryTags(entryId, normalizedTags);
    }

    return entryId;
  });

  return createEntry();
}

export async function getJournalEntries(
  tag?: string | null,
  date?: string | null,
  month?: string | null,
  monthDay?: string | null,
  pin?: boolean | null,
  untagged?: boolean | null,
  limit = 20,
  offset = 0,
  description?: string | null,
  includeDeleted = false,
) {
  const filters: string[] = [];
  const params: unknown[] = [];

  filters.push(includeDeleted ? 'e.deleted_at is not null' : 'e.deleted_at is null');

  if (typeof date === 'string' && date.trim().length > 0) {
    filters.push('e.entry_date = ?');
    params.push(date.trim());
  } else if (typeof monthDay === 'string' && /^\d{2}-\d{2}$/.test(monthDay.trim())) {
    filters.push("substr(e.entry_date, 6, 5) = ?");
    params.push(monthDay.trim());
  } else if (typeof month === 'string' && month.trim().length > 0) {
    filters.push('substr(e.entry_date, 1, 7) = ?');
    params.push(month.trim());
  }

  if (typeof tag === 'string' && tag.trim().length > 0) {
    const tagNames = parseTagNames(tag);

    if (tagNames.length > 0) {
      filters.push(`e.id in (
        select et.entry_id
        from entry_tag et
        join tag t on t.id = et.tag_id
        where t.name in (${placeholders(tagNames.length)})
        group by et.entry_id
        having count(distinct t.name) = ?
      )`);
      params.push(...tagNames);
      params.push(tagNames.length);
    }
  }

  if (typeof description === 'string' && description.trim().length > 0) {
    filters.push('instr(lower(e.raw_text), lower(?)) > 0');
    params.push(description.trim());
  }

  if (pin) {
    filters.push('e.pin = 1');
  }

  if (untagged) {
    filters.push(`not exists (
      select 1
      from entry_tag et
      where et.entry_id = e.id
    )`);
  }

  const filterClause = filters.length > 0 ? `where ${filters.join(' and ')}` : '';

  const rows = allRows(
    `select e.id, e.entry_date, e.raw_text, e.created_at,
      e.pin,
      count(*) over() as total_count,
      (select count(*) from entry_media where entry_id = e.id) as photo_count,
      m.file_path as cover_photo_path
     from entry e
     left join entry_media em
       on em.id = (
         select id
         from entry_media
         where entry_id = e.id
         order by sort_order asc, id asc
         limit 1
       )
     left join media m
       on m.id = em.media_id
     ${filterClause}
     order by e.entry_date desc, e.created_at desc, e.id desc
     limit ? offset ?`,
    [...params, limit, offset],
  );

  return {
    entries: rows.map((row) => ({
      ...formatEntry(row),
      tags: getTagsForEntry(Number(row.id)),
    })),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
  };
}

export async function getJournalEntryDates() {
  const rows = allRows(
    `select distinct entry_date
     from entry
     where deleted_at is null
     order by entry_date desc`,
  );

  return rows.map((row) => String(row.entry_date));
}

export async function getJournalEntry(id: number) {
  const entryRow = getRow(
    `select entry.id, entry.entry_date, entry.raw_text, entry.created_at,
      entry.pin,
      m.file_path as cover_photo_path
     from entry
     left join entry_media em
       on em.id = (
         select id
         from entry_media
         where entry_id = entry.id
         order by sort_order asc, id asc
         limit 1
       )
     left join media m
       on m.id = em.media_id
     where entry.id = ?`,
    [id],
  );

  if (!entryRow) {
    return null;
  }

  const photos = allRows(
    `select em.id, em.entry_id, m.file_path, em.sort_order, em.is_cover
     from entry_media em
     join media m on m.id = em.media_id
     where em.entry_id = ?
     order by em.sort_order asc, em.id asc`,
    [id],
  );

  return {
    id: Number(entryRow.id),
    entry_date: String(entryRow.entry_date),
    raw_text: String(entryRow.raw_text),
    created_at: String(entryRow.created_at),
    pin: Number(entryRow.pin) === 1,
    cover_photo_path: entryRow.cover_photo_path ? resolveUploadPublicPath(String(entryRow.cover_photo_path)) : null,
    cover_thumbnail_path: entryRow.cover_photo_path ? resolveThumbnailPublicPath(String(entryRow.cover_photo_path)) : null,
    photos: photos.map((row) => ({
      id: Number(row.id),
      entry_id: Number(row.entry_id),
      file_path: resolveUploadPublicPath(String(row.file_path)),
      thumbnail_path: resolveThumbnailPublicPath(String(row.file_path)),
      sort_order: Number(row.sort_order),
      is_cover: Number(row.sort_order) === 0,
    })),
    tags: getTagsForEntry(id),
  } satisfies JournalEntryDetail;
}

export async function updateJournalEntry(
  id: number,
  rawText: string,
  entryDate: string | null,
  addedFilePaths: string[],
  orderedMediaIds: number[] = [],
  tags: string[] = [],
) {
  const updateEntry = db.transaction(() => {
    const entryResult = db
      .prepare(
        `update entry
         set raw_text = ?,
           entry_date = coalesce(?, entry_date),
           updated_at = CURRENT_TIMESTAMP
         where id = ?`,
      )
      .run(rawText, entryDate, id);

    if (entryResult.changes === 0) {
      return null;
    }

    const normalizedTags = parseTagNames(tags);
    db.prepare('delete from entry_tag where entry_id = ?').run(id);

    if (normalizedTags.length > 0) {
      linkEntryTags(id, normalizedTags);
    }

    const nextSortOrder = getNextEntryMediaSortOrder(id);
    insertEntryMedia(id, addedFilePaths, nextSortOrder);
    if (orderedMediaIds.length > 0) {
      reorderEntryMedia(id, orderedMediaIds);
    }
    updateEntryMediaMetadata(id);

    return [];
  });

  return updateEntry();
}

export async function reorderJournalEntryMedia(
  id: number,
  orderedMediaIds: number[] = [],
) {
  const reorderMedia = db.transaction(() => {
    const entry = getRow<{ id: number }>(
      `select id
       from entry
       where id = ?`,
      [id],
    );

    if (!entry) {
      return null;
    }

    reorderEntryMedia(id, orderedMediaIds);
    updateEntryMediaMetadata(id);
    return id;
  });

  return reorderMedia();
}

export async function removeJournalEntryMedia(entryId: number, entryMediaId: number) {
  const removeMedia = db.transaction(() => {
    const mediaRow = getRow<{ media_id: number; file_path: string }>(
      `select em.media_id, m.file_path
       from entry_media em
       join media m on m.id = em.media_id
       where em.entry_id = ?
         and em.id = ?`,
      [entryId, entryMediaId],
    );

    if (!mediaRow) {
      return null;
    }

    const deleteResult = db
      .prepare(
        `delete from entry_media
         where entry_id = ?
           and id = ?`,
      )
      .run(entryId, entryMediaId);

    if (deleteResult.changes === 0) {
      return null;
    }

    const normalizedFilePath = normalizeUploadFilePath(String(mediaRow.file_path));
    const isReusableUpload = normalizedFilePath.includes('/');
    if (!hasMediaReferences(Number(mediaRow.media_id)) && !isReusableUpload) {
      db.prepare('delete from media where id = ?').run(Number(mediaRow.media_id));
      updateEntryMediaMetadata(entryId);
      return [resolveUploadPublicPath(String(mediaRow.file_path))];
    }

    updateEntryMediaMetadata(entryId);
    return [];
  });

  return removeMedia();
}

export async function toggleJournalEntryPin(id: number) {
  const togglePin = db.transaction(() => {
    const entryResult = db
      .prepare(
        `update entry
         set pin = case when coalesce(pin, 0) = 1 then 0 else 1 end,
           updated_at = CURRENT_TIMESTAMP
         where id = ?`,
      )
      .run(id);

    if (entryResult.changes === 0) {
      return null;
    }

    const entry = getRow(
      `select id, pin
       from entry
       where id = ?`,
      [id],
    );

    if (!entry) {
      return null;
    }

    return {
      id: Number(entry.id),
      pin: Number(entry.pin) === 1,
    };
  });

  return togglePin();
}

export async function deleteJournalEntry(id: number) {
  const deleteEntry = db.transaction(() => {
    const photoRows = allRows(
      `select m.file_path
       from entry_media em
       join media m on m.id = em.media_id
       where em.entry_id = ?`,
      [id],
    );

    const entryResult = db.prepare('delete from entry where id = ?').run(id);

    if (entryResult.changes === 0) {
      return null;
    }

    return photoRows.map((row) => resolveUploadPublicPath(String(row.file_path)));
  });

  return deleteEntry();
}

export async function trashJournalEntries(ids: number[]) {
  const trash = db.transaction(() => {
    if (ids.length === 0) return 0;
    const placeholdersText = placeholders(ids.length);
    return db.prepare(`update entry set deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP where id in (${placeholdersText}) and deleted_at is null`).run(...ids).changes;
  });
  return trash();
}

export async function restoreJournalEntries(ids: number[]) {
  const restore = db.transaction(() => {
    if (ids.length === 0) return 0;
    const placeholdersText = placeholders(ids.length);
    return db.prepare(`update entry set deleted_at = null, updated_at = CURRENT_TIMESTAMP where id in (${placeholdersText}) and deleted_at is not null`).run(...ids).changes;
  });
  return restore();
}

export async function permanentlyDeleteJournalEntries(ids: number[]) {
  const remove = db.transaction(() => {
    const removedPaths: string[] = [];
    const idsToRemove = ids.length > 0
      ? ids
      : allRows<{ id: number }>('select id from entry where deleted_at is not null').map((row) => Number(row.id));
    for (const id of idsToRemove) {
      const photoRows = allRows(
        `select m.file_path from entry_media em join media m on m.id = em.media_id where em.entry_id = ?`,
        [id],
      );
      const result = db.prepare('delete from entry where id = ? and deleted_at is not null').run(id);
      if (result.changes > 0) removedPaths.push(...photoRows.map((row) => resolveUploadPublicPath(String(row.file_path))));
    }
    return removedPaths;
  });
  return remove();
}

export async function getTags(search?: string | null, limit = 20) {
  const query = search?.trim();
  if (!query) {
    return [];
  }

  const rows = allRows(
    `select name
     from tag
     where name like ?
     order by name asc
    limit ?`,
      [`%${query}%`, Math.min(Math.max(limit, 1), 100)],
  );

  return rows.map((row) => String(row.name));
}
