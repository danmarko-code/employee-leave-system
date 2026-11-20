import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { ApiError, apiFetchRaw } from './api';

/**
 * Profile photos are served by an authenticated endpoint, so a browser <img>
 * cannot load them directly. This store fetches the bytes through the API
 * client and exposes a local URI:
 *   web    -> blob: object URL
 *   native -> a file in the cache directory
 *
 * Entries are keyed by user id + variant and cleared on sign-out. The URL is
 * never persisted, so no photo survives the session in storage.
 */
export type PhotoVariant = 'full' | 'thumb';

interface PhotoEntry {
  uri: string | null;
  status: 'loading' | 'ready' | 'missing';
}

const cache = new Map<string, PhotoEntry>();
const listeners = new Set<() => void>();
let snapshot = 0;

function keyFor(userId: number, variant: PhotoVariant): string {
  return `${userId}:${variant}`;
}

function emit(): void {
  snapshot += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function fetchPhoto(userId: number, variant: PhotoVariant): Promise<void> {
  const cacheKey = keyFor(userId, variant);
  try {
    const response = await apiFetchRaw(`/users/${userId}/photo?size=${variant}`);

    let uri: string;
    if (Platform.OS === 'web') {
      uri = URL.createObjectURL(await response.blob());
    } else {
      const { Directory, File, Paths } = await import('expo-file-system');
      const directory = new Directory(Paths.cache, 'avatars');
      if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
      const file = new File(directory, `${userId}-${variant}.webp`);
      await file.write(new Uint8Array(await response.arrayBuffer()));
      uri = file.uri;
    }

    cache.set(cacheKey, { uri, status: 'ready' });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      // A definitive "this person has no photo": cache the fallback.
      cache.set(cacheKey, { uri: null, status: 'missing' });
    } else {
      // Network trouble is temporary; retry on the next mount.
      cache.delete(cacheKey);
    }
  }
  emit();
}

function ensureLoaded(userId: number, variant: PhotoVariant): void {
  const cacheKey = keyFor(userId, variant);
  if (cache.has(cacheKey)) return;
  cache.set(cacheKey, { uri: null, status: 'loading' });
  void fetchPhoto(userId, variant);
}

/** Returns a renderable local URI, or null while loading / when absent. */
export function usePhoto(userId: number | null | undefined, variant: PhotoVariant = 'thumb'): string | null {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

  useEffect(() => {
    if (userId) ensureLoaded(userId, variant);
  }, [userId, variant, current]);

  if (!userId) return null;
  return cache.get(keyFor(userId, variant))?.uri ?? null;
}

/** Call after an upload or removal so every avatar for that person refreshes. */
export function invalidatePhoto(userId: number): void {
  for (const variant of ['full', 'thumb'] as const) {
    const cacheKey = keyFor(userId, variant);
    const entry = cache.get(cacheKey);
    if (entry?.uri && Platform.OS === 'web') URL.revokeObjectURL(entry.uri);
    cache.delete(cacheKey);
  }
  emit();
}

/** Called when the session ends: no photo bytes remain in memory or on disk. */
export function clearPhotoCache(): void {
  if (Platform.OS === 'web') {
    for (const entry of cache.values()) {
      if (entry.uri) URL.revokeObjectURL(entry.uri);
    }
  }
  cache.clear();
  emit();
}
