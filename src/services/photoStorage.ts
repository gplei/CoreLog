import { randomUUID } from 'crypto';
import { access, copyFile, mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { env } from '../config/env';
import { HttpError } from '../utils/http';
import { FAVORITE_DIRECTORY, normalizeUploadFilePath, THUMBNAIL_DIRECTORY } from '../utils/uploads';

const THUMBNAIL_MAX_SIZE = 480;
const THUMBNAIL_JPEG_QUALITY = 78;
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.heic', '.heif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp']);
const thumbnailCreationJobs = new Map<string, Promise<string>>();

function thumbnailDirectoryPath() {
  return path.join(env.uploadDirectory, THUMBNAIL_DIRECTORY);
}

function thumbnailFilePath(fileName: string) {
  return path.join(thumbnailDirectoryPath(), normalizeUploadFilePath(fileName));
}

function thumbnailPipeline(input: Buffer | string) {
  return sharp(input, { page: 0, pages: 1 })
    .rotate()
    .resize({
      width: THUMBNAIL_MAX_SIZE,
      height: THUMBNAIL_MAX_SIZE,
      fit: 'inside',
      withoutEnlargement: true,
    });
}

function shouldConvertToJpeg(file: Express.Multer.File, extension: string) {
  return (
    !['.jpg', '.jpeg', '.webp'].includes(extension) ||
    file.mimetype === 'image/heic' ||
    file.mimetype === 'image/heif'
  );
}

export async function saveUploadedPhoto(file: Express.Multer.File) {
  if (!file.mimetype.startsWith('image/')) {
    throw new HttpError(400, 'Only image uploads are allowed');
  }

  await Promise.all([
    mkdir(env.uploadDirectory, { recursive: true }),
    mkdir(thumbnailDirectoryPath(), { recursive: true }),
  ]);

  const extension = path.extname(file.originalname).toLowerCase();
  const storedExtension = extension === '.webp' && file.mimetype === 'image/webp' ? '.webp' : '.jpg';
  const safeFileName = `${randomUUID()}${storedExtension}`;
  const filePath = path.join(env.uploadDirectory, safeFileName);
  let outputBuffer = file.buffer;

  if (shouldConvertToJpeg(file, extension)) {
    try {
      const sharpOptions = {
        page: 0,
        pages: 1,
        ...(['.heic', '.heif'].includes(extension) ||
        file.mimetype === 'image/heic' ||
        file.mimetype === 'image/heif'
          ? { pagePrimary: 0 }
          : {}),
      };

      outputBuffer = await sharp(file.buffer, sharpOptions)
        .rotate()
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch {
      throw new HttpError(400, 'Unable to convert uploaded image to JPEG.');
    }
  } else if (storedExtension === '.webp') {
    try {
      outputBuffer = await sharp(file.buffer, { page: 0, pages: 1 })
        .rotate()
        .webp()
        .toBuffer();
    } catch {
      throw new HttpError(400, 'Unable to process uploaded WebP image.');
    }
  }

  const thumbnailBuffer = await thumbnailPipeline(outputBuffer)
    .jpeg({ quality: THUMBNAIL_JPEG_QUALITY })
    .toBuffer();

  try {
    await writeFile(filePath, outputBuffer);
    await writeFile(thumbnailFilePath(safeFileName), thumbnailBuffer);
  } catch (error) {
    await Promise.allSettled([
      unlink(filePath),
      unlink(thumbnailFilePath(safeFileName)),
    ]);
    throw error;
  }

  return safeFileName;
}

export async function saveUploadedPhotos(files: Express.Multer.File[] = []) {
  const filePaths: string[] = [];

  for (const file of files) {
    filePaths.push(await saveUploadedPhoto(file));
  }

  return filePaths;
}

export async function copyUploadedPhotoToFavorite(filePath: string, originalName: string) {
  const sourceName = normalizeUploadFilePath(filePath);
  if (!sourceName || sourceName === FAVORITE_DIRECTORY || sourceName.startsWith(`${FAVORITE_DIRECTORY}/`)) {
    throw new HttpError(400, 'Invalid uploaded image path');
  }

  const originalExtension = path.extname(originalName);
  const baseName = path.basename(originalName, originalExtension)
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^\.+|\.+$/g, '') || randomUUID();
  const sourceExtension = path.extname(sourceName).toLowerCase();
  const favoriteExtension = sourceExtension === '.webp' ? '.webp' : '.jpg';
  const favoriteName = `${FAVORITE_DIRECTORY}/${baseName}${favoriteExtension}`;
  const favoritePath = path.join(env.uploadDirectory, favoriteName);
  const favoriteThumbnailPath = thumbnailFilePath(favoriteName);

  await mkdir(path.dirname(favoritePath), { recursive: true });
  await mkdir(path.dirname(favoriteThumbnailPath), { recursive: true });

  try {
    await access(favoritePath);
  } catch {
    await copyFile(path.join(env.uploadDirectory, sourceName), favoritePath);
    try {
      await copyFile(thumbnailFilePath(sourceName), favoriteThumbnailPath);
    } catch {
      await thumbnailPipeline(favoritePath).jpeg({ quality: THUMBNAIL_JPEG_QUALITY }).toFile(favoriteThumbnailPath);
    }
  }

  await removePhotoFiles([sourceName]);
  return favoriteName;
}

export async function removePhotoFiles(filePaths: string[]) {
  await Promise.all(
    filePaths.map(async (filePath) => {
      const fileName = normalizeUploadFilePath(filePath);

      if (!fileName) {
        return;
      }

      // Favorite images are reusable source files and must never be removed
      // when an entry or media link is deleted.
      if (fileName === FAVORITE_DIRECTORY || fileName.startsWith(`${FAVORITE_DIRECTORY}/`)) {
        return;
      }

      await Promise.allSettled([
        unlink(path.join(env.uploadDirectory, fileName)),
        unlink(thumbnailFilePath(fileName)),
      ]);
    }),
  );
}

export function ensurePhotoThumbnail(fileName: string) {
  const safeFileName = normalizeUploadFilePath(fileName);
  if (!safeFileName
    || safeFileName === THUMBNAIL_DIRECTORY
    || safeFileName.startsWith(`${THUMBNAIL_DIRECTORY}/`)
    || !IMAGE_EXTENSIONS.has(path.extname(safeFileName).toLowerCase())) {
    throw new HttpError(404, 'Image not found');
  }

  const activeJob = thumbnailCreationJobs.get(safeFileName);
  if (activeJob) return activeJob;

  const creationJob = (async () => {
    const sourcePath = path.join(env.uploadDirectory, safeFileName);
    const targetPath = thumbnailFilePath(safeFileName);

    try {
      await access(sourcePath);
    } catch {
      throw new HttpError(404, 'Image not found');
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await thumbnailPipeline(sourcePath).toFile(targetPath);
    return targetPath;
  })();

  thumbnailCreationJobs.set(safeFileName, creationJob);
  void creationJob.then(
    () => thumbnailCreationJobs.delete(safeFileName),
    () => thumbnailCreationJobs.delete(safeFileName),
  );
  return creationJob;
}
