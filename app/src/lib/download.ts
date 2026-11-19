import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiFetchRaw } from './api';
import { bytesToBase64 } from './document';

/**
 * Downloads anything the API serves behind Bearer auth (CSV reports, for
 * example) with the same session token as every other request. Web: a blob
 * saved with a download link. Native: bytes written to the cache directory,
 * then the system share sheet, because RN cannot "save" arbitrary files.
 * Callers use short-lived, single-purpose URLs; nothing is cached.
 */
export async function downloadAttachment(
  path: string,
  filename: string,
  mimeType: string
): Promise<void> {
  const response = await apiFetchRaw(path);
  const bytes = new Uint8Array(await response.arrayBuffer());

  if (Platform.OS === 'web') {
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const doc = (globalThis as unknown as { document: {
      createElement: (tag: 'a') => { href: string; download: string; click: () => void; remove: () => void };
      body: { appendChild: (node: unknown) => void };
    } }).document;
    const link = doc.createElement('a');
    link.href = url;
    link.download = filename;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('The device cache is not available.');
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(-60);
  const fileUri = `${cacheDir}${safe}`;
  await FileSystem.writeAsStringAsync(fileUri, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing files is not available on this device.');
  await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: filename });
}
