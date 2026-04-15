import { mkdir, writeFile, readFile, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { randomBytes } from 'crypto';

/**
 * Ensure a directory and all parent directories exist.
 */
export async function mkdirp(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/**
 * Write a file only if it does not already exist.
 * Returns true if written, false if skipped.
 */
export async function writeIfNotExists(filePath: string, content: string): Promise<boolean> {
  if (existsSync(filePath)) return false;
  await mkdirp(dirname(filePath));
  await writeFile(filePath, content, 'utf8');
  return true;
}

/**
 * Atomically write a file: write to a temp path, then rename.
 * Safe for concurrent readers of the target file.
 */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdirp(dir);
  const tmp = join(dir, `.tmp-${randomBytes(6).toString('hex')}`);
  try {
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup of temp file
    try {
      const { unlink } = await import('fs/promises');
      await unlink(tmp);
    } catch {
      // ignore
    }
    throw err;
  }
}

/**
 * Read a JSON file and parse it. Returns null if file does not exist.
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) return null;
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

/**
 * Write a value as pretty-printed JSON.
 */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await mkdirp(dirname(filePath));
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Atomically write a value as pretty-printed JSON.
 */
export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await atomicWrite(filePath, JSON.stringify(data, null, 2) + '\n');
}
