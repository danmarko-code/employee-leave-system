import { mkdir, stat } from 'node:fs/promises';
import sharp from 'sharp';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { execute, queryOne } from '../db/query';
import {
  ensureUploadDir,
  newPhotoStem,
  photoDir,
  photoFile,
  removeUpload,
  writeUpload,
} from '../lib/files';

export type PhotoVariant = 'full' | 'thumb';

const FULL_PX = 256;
const THUMB_PX = 64;
/** Refuse absurdly large decoded images before vips allocates memory for them. */
const MAX_INPUT_PIXELS = 40_000_000;

interface PhotoRow extends RowDataPacket {
  photo_path: string | null;
}

async function readStem(pool: Pool, userId: number): Promise<string | null> {
  const row = await queryOne<PhotoRow>(pool, 'SELECT photo_path FROM users WHERE id = ?', [userId]);
  return row?.photo_path ?? null;
}

/**
 * Re-encodes the upload with sharp: auto-orient from EXIF, centre-crop to a
 * square, produce 256px and 64px WebP files, and drop every metadata block
 * (sharp strips them unless withMetadata() is called).
 */
export async function storePhoto(
  pool: Pool,
  uploadDir: string,
  userId: number,
  buffer: Buffer
): Promise<void> {
  const source = sharp(buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) throw new Error('Image has no dimensions.');

  const [full, thumb] = await Promise.all([
    source
      .clone()
      .rotate()
      .resize(FULL_PX, FULL_PX, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer(),
    source
      .clone()
      .rotate()
      .resize(THUMB_PX, THUMB_PX, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toBuffer(),
  ]);

  const directory = photoDir(uploadDir);
  await ensureUploadDir(directory);

  const stem = newPhotoStem();
  const fullName = `${stem}.webp`;
  const thumbName = `${stem}_thumb.webp`;

  await writeUpload(directory, fullName, full);
  try {
    await writeUpload(directory, thumbName, thumb);
  } catch (error) {
    await removeUpload(directory, fullName);
    throw error;
  }

  const previous = await readStem(pool, userId);
  try {
    await execute(pool, 'UPDATE users SET photo_path = ? WHERE id = ? AND is_active = 1', [stem, userId]);
  } catch (error) {
    await removeUpload(directory, fullName);
    await removeUpload(directory, thumbName);
    throw error;
  }

  if (previous) await removeStemFiles(uploadDir, previous);
}

/** Removes the two files for a stem. Missing files are ignored. */
export async function removeStemFiles(uploadDir: string, stem: string): Promise<void> {
  const directory = photoDir(uploadDir);
  await removeUpload(directory, `${stem}.webp`);
  await removeUpload(directory, `${stem}_thumb.webp`);
}

/** Clears the column and deletes the files. Returns false when there was none. */
export async function clearPhoto(pool: Pool, uploadDir: string, userId: number): Promise<boolean> {
  const stem = await readStem(pool, userId);
  if (!stem) return false;
  await execute(pool, 'UPDATE users SET photo_path = NULL WHERE id = ?', [userId]);
  await removeStemFiles(uploadDir, stem);
  return true;
}

export interface PhotoLocation {
  path: string;
  size: number;
}

export async function findPhoto(
  pool: Pool,
  uploadDir: string,
  userId: number,
  variant: PhotoVariant
): Promise<PhotoLocation | null> {
  const stem = await readStem(pool, userId);
  if (!stem) return null;

  let filePath: string;
  try {
    filePath = photoFile(uploadDir, stem, variant);
  } catch {
    return null;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile() || info.size === 0) return null;
    return { path: filePath, size: info.size };
  } catch {
    return null;
  }
}

/** Used by the admin path: is the target a real account? */
export async function userExists(pool: Pool, userId: number): Promise<boolean> {
  const row = await queryOne<RowDataPacket & { id: number }>(pool, 'SELECT id FROM users WHERE id = ?', [userId]);
  return Boolean(row);
}

export async function ensurePhotoDir(uploadDir: string): Promise<void> {
  await mkdir(photoDir(uploadDir), { recursive: true });
}
