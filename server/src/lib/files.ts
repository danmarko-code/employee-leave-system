import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DOCUMENT_MIME_TYPES } from '@leave/shared';

export type AllowedMime = (typeof DOCUMENT_MIME_TYPES)[number];

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoMime = (typeof PHOTO_MIME_TYPES)[number];

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<AllowedMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * Trusts the bytes, not the browser's Content-Type. Only the three formats the
 * schema allows are recognised, and the declared type must match this result.
 */
export function sniffMime(buffer: Buffer): AllowedMime | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  return null;
}

export function extensionFor(mime: AllowedMime): string {
  return EXTENSIONS[mime];
}

/**
 * Photo formats only, decided from the bytes. SVG is text and is intentionally
 * never recognised, no matter what the browser claims the file is.
 */
export function sniffImageMime(buffer: Buffer): PhotoMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** The stored name is a random UUID stem; the extension is always .webp. */
export function newPhotoStem(): string {
  return randomUUID();
}

export function isValidPhotoStem(value: string): boolean {
  return /^[0-9a-f-]{36}$/.test(value);
}

export function photoDir(uploadDir: string): string {
  return path.join(uploadDir, 'photos');
}

export function photoFile(uploadDir: string, stem: string, variant: 'full' | 'thumb'): string {
  if (!isValidPhotoStem(stem)) throw new Error('Invalid photo identifier.');
  return path.join(photoDir(uploadDir), variant === 'thumb' ? `${stem}_thumb.webp` : `${stem}.webp`);
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** A random, non-guessable on-disk name that satisfies the schema CHECK. */
export function newStoredName(mime: AllowedMime): string {
  return `${randomUUID()}.${extensionFor(mime)}`;
}

/**
 * Keeps the client's name for display only: strips any directory components,
 * control characters and quotes, then enforces the column length.
 */
export function sanitizeOriginalName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const cleaned = base
    .replace(/[\u0000-\u001F\u007F"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
  return cleaned.length > 0 ? cleaned : 'document';
}

export function uploadPath(uploadDir: string, storedName: string): string {
  return path.join(uploadDir, storedName);
}

export async function ensureUploadDir(uploadDir: string): Promise<void> {
  await mkdir(uploadDir, { recursive: true });
}

/** `wx` refuses to overwrite an existing file, and the mode is owner-only. */
export async function writeUpload(
  uploadDir: string,
  storedName: string,
  buffer: Buffer
): Promise<void> {
  await writeFile(uploadPath(uploadDir, storedName), buffer, { flag: 'wx', mode: 0o600 });
}

export async function removeUpload(uploadDir: string, storedName: string): Promise<void> {
  await unlink(uploadPath(uploadDir, storedName)).catch(() => undefined);
}

/**
 * RFC 6266/5987 Content-Disposition. The ASCII fallback is stripped to a safe
 * character set and the real name is percent-encoded.
 */
export function contentDisposition(originalName: string): string {
  const ascii = originalName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(originalName)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
