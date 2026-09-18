import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

function readNumber(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function requirePathEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }

  return value;
}

function resolveDataRoot() {
  return path.resolve(process.cwd(), requirePathEnv('DATA_ROOT'));
}

function resolveBackupRoot() {
  const resolvedPath = path.resolve(process.cwd(), requirePathEnv('BACKUP_ROOT'));
  const dataRoot = resolveDataRoot();

  if (resolvedPath === dataRoot || resolvedPath.startsWith(`${dataRoot}${path.sep}`)) {
    throw new Error(`BACKUP_ROOT must be outside DATA_ROOT: ${resolvedPath}`);
  }

  return resolvedPath;
}

function requireExistingFile(resolvedPath: string, description: string) {
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`${description} does not exist: ${resolvedPath}`);
  }

  if (!fs.statSync(resolvedPath).isFile()) {
    throw new Error(`${description} is not a file: ${resolvedPath}`);
  }

  return resolvedPath;
}

function resolveSqliteDatabasePath() {
  const configuredDir = requirePathEnv('SQLITE_DB_DIR');
  const configuredCorelogDir = requirePathEnv('SQLITE_CORELOG_DB_DIR');
  const resolvedPath = path.join(resolveDataRoot(), configuredDir, configuredCorelogDir, `${configuredCorelogDir}.sqlite`);
  return requireExistingFile(resolvedPath, `${configuredCorelogDir} SQLite database`);
}

function resolveNamedSqliteDatabasePath(directoryEnvName: string, dbDirectoryEnvName: string) {
  const configuredDir = requirePathEnv(directoryEnvName);
  const configuredDbDir = requirePathEnv(dbDirectoryEnvName);
  const resolvedPath = path.join(resolveDataRoot(), configuredDir, configuredDbDir, `${configuredDbDir}.sqlite`);
  return requireExistingFile(resolvedPath, `${dbDirectoryEnvName} SQLite database`);
}

function resolveUploadDirectory() {
  const resolvedPath = path.resolve(resolveDataRoot(), requirePathEnv('UPLOAD_DIR'));

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`UPLOAD_DIR path does not exist: ${resolvedPath}`);
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`UPLOAD_DIR is not a directory: ${resolvedPath}`);
  }

  return resolvedPath;
}

function resolveFaviconDirectory() {
  return path.join(resolveDataRoot(), requirePathEnv('FAVICON_DIR'));
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: readNumber('PORT', 3002),
  host: process.env.HOST?.trim() || '0.0.0.0',
  dataRoot: resolveDataRoot(),
  backupRoot: resolveBackupRoot(),
  sqlite: {
    databasePath: resolveSqliteDatabasePath(),
    tradeDatabasePath: resolveNamedSqliteDatabasePath('SQLITE_DB_DIR', 'SQLITE_TRADE_DB_DIR'),
    transactionDatabasePath: resolveNamedSqliteDatabasePath('SQLITE_DB_DIR', 'SQLITE_TRANSACTION_DB_DIR'),
    haydayDatabasePath: resolveNamedSqliteDatabasePath('SQLITE_DB_DIR', 'SQLITE_HAYDAY_DB_DIR'),
  },
  faviconDirectory: resolveFaviconDirectory(),
  faviconPublicPath: requirePathEnv('FAVICON_PUBLIC_PATH'),
  uploadDirectory: resolveUploadDirectory(),
  uploadPublicPath: requirePathEnv('UPLOAD_PUBLIC_PATH'),
  defaultImagePath: requirePathEnv('DEFAULT_IMAGE_PATH'),
  maxUploadMb: readNumber('MAX_UPLOAD_MB', 25),
};
