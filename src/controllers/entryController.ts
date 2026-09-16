import type { Request, Response } from 'express';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import {
  createJournalEntry,
  permanentlyDeleteJournalEntries,
  restoreJournalEntries,
  trashJournalEntries,
  getJournalEntries,
  getJournalEntry,
  getJournalEntryDates,
  reorderJournalEntryMedia,
  removeJournalEntryMedia,
  updateJournalEntry,
  toggleJournalEntryPin,
} from '../repositories/journalRepository';
import { env } from '../config/env';
import { copyUploadedPhotoToFavorite, removePhotoFiles, saveUploadedPhotos } from '../services/photoStorage';
import { HttpError } from '../utils/http';
import { parseTagNames } from '../utils/tags';
import { normalizeUploadFilePath, resolveUploadPublicPath, THUMBNAIL_DIRECTORY } from '../utils/uploads';

function parseEntryId(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

type MediaItemInput =
  | { type: 'existing'; file_path: string }
  | { type: 'upload' };

function parseMediaItems(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(value) as unknown;

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map((item): MediaItemInput | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const type = typeof (item as { type?: unknown }).type === 'string'
          ? (item as { type: string }).type
          : '';

        if (type === 'existing') {
          const filePath = typeof (item as { file_path?: unknown }).file_path === 'string'
            ? (item as { file_path: string }).file_path.trim()
            : '';

          const normalizedFilePath = normalizeUploadFilePath(filePath);
          return normalizedFilePath ? { type: 'existing', file_path: normalizedFilePath } : null;
        }

        if (type === 'upload') {
          return { type: 'upload' };
        }

        return null;
      })
      .filter((item): item is MediaItemInput => Boolean(item));
  } catch {
    return [];
  }
}

function parseMediaId(value: unknown) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseMediaIds(value: unknown) {
  if (!value) {
    return [];
  }

  const parsedValue =
    typeof value === 'string'
      ? JSON.parse(value) as unknown
      : value;

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue
    .map((mediaId) => Number(mediaId))
    .filter((mediaId) => Number.isInteger(mediaId) && mediaId > 0);
}

function readTrimmedBodyString(request: Request, fieldName: string) {
  const value = request.body[fieldName] as unknown;
  return typeof value === 'string' ? value.trim() : '';
}

function readEntryDate(request: Request) {
  const value = readTrimmedBodyString(request, 'entry_date');

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, 'entry_date must use YYYY-MM-DD format');
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new HttpError(400, 'entry_date is invalid');
  }

  const normalizedDate = [
    parsedDate.getFullYear(),
    String(parsedDate.getMonth() + 1).padStart(2, '0'),
    String(parsedDate.getDate()).padStart(2, '0'),
  ].join('-');
  if (normalizedDate !== value) {
    throw new HttpError(400, 'entry_date is invalid');
  }

  return value;
}

function uploadedFiles(request: Request) {
  return Array.isArray(request.files) ? request.files : [];
}

const uploadFileExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.tif', '.tiff']);

function toUploadPublicPath(fileName: string) {
  return resolveUploadPublicPath(fileName);
}

function parsePositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function listEntries(request: Request, response: Response) {
  const pin = request.query.pin?.toString();
  const untagged = request.query.untagged?.toString();
  const result = await getJournalEntries(
    request.query.tag?.toString(),
    request.query.date?.toString(),
    request.query.month?.toString(),
    request.query.month_day?.toString(),
    pin === '1' || pin === 'true',
    untagged === '1' || untagged === 'true',
    parsePositiveInteger(request.query.limit, 20),
    parsePositiveInteger(request.query.offset, 0),
    request.query.description?.toString(),
    request.query.trash === '1' || request.query.trash === 'true',
  );

  response.json(result);
}

export async function listEntryDates(_request: Request, response: Response) {
  const dates = await getJournalEntryDates();
  response.json({ dates });
}

async function listUploadImagePaths(directoryPath = env.uploadDirectory, relativeDirectory = ''): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const filePaths: string[] = [];

  for (const entry of entries) {
    const relativePath = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (relativePath === THUMBNAIL_DIRECTORY) continue;
      filePaths.push(...await listUploadImagePaths(path.join(directoryPath, entry.name), relativePath));
    } else if (entry.isFile() && uploadFileExtensions.has(path.extname(entry.name).toLowerCase())) {
      filePaths.push(relativePath);
    }
  }

  return filePaths;
}

export async function listUploads(_request: Request, response: Response) {
  const fileNames = await listUploadImagePaths();
  const files = await Promise.all(
    fileNames
      .filter((fileName) => uploadFileExtensions.has(path.extname(fileName).toLowerCase()))
      .sort((left, right) => left.localeCompare(right))
      .map(async (fileName) => {
        const fileStat = await stat(path.join(env.uploadDirectory, fileName));
        return {
          name: path.basename(fileName),
          relative_path: fileName,
          file_path: toUploadPublicPath(fileName),
          size: fileStat.size,
          modified_at: Math.round(fileStat.mtimeMs),
        };
      }),
  );

  response.json({ files });
}

function resolveRequestedMediaPaths(request: Request, uploadedPhotoPaths: string[]) {
  const mediaItems = parseMediaItems(request.body.media_items);

  if (mediaItems.length === 0) {
    return null;
  }

  const resolvedPaths: string[] = [];
  const uploadedQueue = [...uploadedPhotoPaths];

  for (const item of mediaItems) {
    if (item.type === 'existing') {
      resolvedPaths.push(item.file_path);
      continue;
    }

    const nextUploadedPath = uploadedQueue.shift();
    if (!nextUploadedPath) {
      throw new HttpError(400, 'Missing uploaded image for media_items');
    }

    resolvedPaths.push(nextUploadedPath);
  }

  if (uploadedQueue.length > 0) {
    throw new HttpError(400, 'Unexpected uploaded images');
  }

  return resolvedPaths;
}

export async function uploadEntryPhotos(request: Request, response: Response) {
  const fileNames = await saveUploadedPhotos(uploadedFiles(request));
  response.status(201).json({ file_paths: fileNames.map(resolveUploadPublicPath) });
}

export async function uploadFavoritePhotos(request: Request, response: Response) {
  const files = uploadedFiles(request);
  const uploadedPaths = await saveUploadedPhotos(files);
  const favoritePaths = await Promise.all(
    uploadedPaths.map((filePath, index) => copyUploadedPhotoToFavorite(filePath, files[index].originalname)),
  );
  response.status(201).json({ file_paths: favoritePaths.map(resolveUploadPublicPath) });
}

export async function createEntry(request: Request, response: Response) {
  const rawText = readTrimmedBodyString(request, 'raw_text');

  if (!rawText) {
    throw new HttpError(400, 'raw_text is required');
  }

  const entryDate = readEntryDate(request);
  const tags = parseTagNames(request.body.tags as string | undefined);
  const uploadedPhotoPaths = await saveUploadedPhotos(uploadedFiles(request));
  const orderedMediaPaths = resolveRequestedMediaPaths(request, uploadedPhotoPaths);
  const filePaths = orderedMediaPaths ?? uploadedPhotoPaths;
  const id = await createJournalEntry(rawText, filePaths, tags, entryDate);

  response.status(201).json({ id });
}

export async function getEntry(request: Request, response: Response) {
  const id = parseEntryId(request.params.id);

  if (!id) {
    throw new HttpError(400, 'Invalid entry id');
  }

  const entry = await getJournalEntry(id);

  if (!entry) {
    throw new HttpError(404, 'Entry not found');
  }

  response.json({ entry });
}

export async function updateEntry(request: Request, response: Response) {
  const id = parseEntryId(request.params.id);

  if (!id) {
    throw new HttpError(400, 'Invalid entry id');
  }

  const rawText = readTrimmedBodyString(request, 'raw_text');

  if (!rawText) {
    throw new HttpError(400, 'raw_text is required');
  }

  const entryDate = readEntryDate(request);
  const orderedMediaIds = parseMediaIds(request.body.ordered_media_ids);
  const tags = parseTagNames(request.body.tags as string | undefined);
  const uploadedPhotoPaths = await saveUploadedPhotos(uploadedFiles(request));
  const orderedMediaPaths = resolveRequestedMediaPaths(request, uploadedPhotoPaths);
  const addedFilePaths = orderedMediaPaths ?? uploadedPhotoPaths;

  await updateJournalEntry(
    id,
    rawText,
    entryDate,
    addedFilePaths,
    orderedMediaIds,
    tags,
  );

  response.json({ id });
}

export async function reorderEntryMedia(request: Request, response: Response) {
  const id = parseEntryId(request.params.id);

  if (!id) {
    throw new HttpError(400, 'Invalid entry id');
  }

  const orderedMediaIds = parseMediaIds(request.body.ordered_media_ids);
  const updatedId = await reorderJournalEntryMedia(id, orderedMediaIds);

  if (!updatedId) {
    throw new HttpError(404, 'Entry not found');
  }

  response.json({ id: updatedId });
}

export async function deleteEntryMedia(request: Request, response: Response) {
  const entryId = parseEntryId(request.params.id);
  const mediaId = parseMediaId(request.params.mediaId);

  if (!entryId || !mediaId) {
    throw new HttpError(400, 'Invalid media id');
  }

  const removedFilePaths = await removeJournalEntryMedia(entryId, mediaId);

  if (!removedFilePaths) {
    throw new HttpError(404, 'Photo not found');
  }

  if (removedFilePaths.length > 0) {
    await removePhotoFiles(removedFilePaths);
  }

  response.json({ id: mediaId, removed_file_paths: removedFilePaths });
}

export async function toggleEntryPin(request: Request, response: Response) {
  const id = parseEntryId(request.params.id);

  if (!id) {
    throw new HttpError(400, 'Invalid entry id');
  }

  const updatedEntry = await toggleJournalEntryPin(id);

  if (!updatedEntry) {
    throw new HttpError(404, 'Entry not found');
  }

  response.json(updatedEntry);
}

export async function deleteEntry(request: Request, response: Response) {
  const id = parseEntryId(request.params.id);

  if (!id) {
    throw new HttpError(400, 'Invalid entry id');
  }

  const deleted = await trashJournalEntries([id]);

  if (!deleted) {
    throw new HttpError(404, 'Entry not found');
  }

  response.json({ id });
}

function readEntryIds(request: Request) {
  const values = Array.isArray(request.body?.ids) ? request.body.ids : [];
  const ids = values
    .map((value: unknown) => Number(value))
    .filter((value: number) => Number.isInteger(value) && value > 0);
  if (ids.length === 0) throw new HttpError(400, 'At least one entry id is required');
  return [...new Set(ids)] as number[];
}

export async function trashEntries(request: Request, response: Response) {
  const ids = readEntryIds(request);
  const count = await trashJournalEntries(ids);
  response.json({ count });
}

export async function restoreEntries(request: Request, response: Response) {
  const ids = readEntryIds(request);
  const count = await restoreJournalEntries(ids);
  response.json({ count });
}

export async function permanentlyDeleteEntries(request: Request, response: Response) {
  const ids = readEntryIds(request);
  const removedFilePaths = await permanentlyDeleteJournalEntries(ids);
  if (removedFilePaths.length > 0) await removePhotoFiles(removedFilePaths);
  response.json({ count: ids.length, removed_file_paths: removedFilePaths });
}

export async function emptyTrash(_request: Request, response: Response) {
  const removedFilePaths = await permanentlyDeleteJournalEntries([]);
  if (removedFilePaths.length > 0) await removePhotoFiles(removedFilePaths);
  response.json({ removed_file_paths: removedFilePaths });
}
