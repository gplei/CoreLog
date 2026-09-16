import path from 'path';
import { env } from '../config/env';

export const THUMBNAIL_DIRECTORY = 'thumbnails';
export const FAVORITE_DIRECTORY = 'favorite';

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, '');
}

export function normalizeUploadFilePath(filePath: string) {
  const trimmedPath = filePath.trim();

  if (!trimmedPath) {
    return '';
  }

  const uploadPrefix = trimTrailingSlashes(env.uploadPublicPath);

  if (trimmedPath === uploadPrefix) {
    return '';
  }

  let relativePath = trimmedPath;
  if (trimmedPath.startsWith(`${uploadPrefix}/`)) {
    relativePath = trimmedPath.slice(uploadPrefix.length + 1);
  } else if (path.isAbsolute(trimmedPath)) {
    const uploadRelativePath = path.relative(env.uploadDirectory, trimmedPath);
    if (!uploadRelativePath || uploadRelativePath === '..' || uploadRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(uploadRelativePath)) {
      return path.basename(trimmedPath);
    }
    relativePath = uploadRelativePath;
  }

  const normalizedPath = path.posix.normalize(relativePath.replace(/\\/g, '/')).replace(/^\.\//, '');
  if (!normalizedPath || normalizedPath === '.' || normalizedPath === '..' || normalizedPath.startsWith('../') || path.posix.isAbsolute(normalizedPath)) {
    return '';
  }
  return normalizedPath;
}

export function resolveUploadPublicPath(filePath: string) {
  const normalizedFilePath = normalizeUploadFilePath(filePath);
  return normalizedFilePath
    ? path.posix.join(env.uploadPublicPath, normalizedFilePath)
    : env.uploadPublicPath;
}

export function resolveThumbnailPublicPath(filePath: string) {
  const normalizedFilePath = normalizeUploadFilePath(filePath);
  return normalizedFilePath
    ? path.posix.join(env.uploadPublicPath, THUMBNAIL_DIRECTORY, normalizedFilePath)
    : env.uploadPublicPath;
}
