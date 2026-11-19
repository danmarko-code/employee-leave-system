/**
 * Supporting documents: pick a PDF/JPEG/PNG (contract on
 * `requiresDocument` leave types), submit it as multipart, and open the stored
 * file later with the same auth the app uses for everything else.
 */
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { LeaveApplicationDto } from '@leave/shared';
import { LIMITS } from '@leave/shared';
import { apiFetchRaw } from './api';

export interface PickedDocument {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Set on web, where the picker hands back the File itself. */
  file?: File;
}

const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'];

export async function pickDocument(): Promise<
  { document: PickedDocument } | { cancelled: true } | { error: string }
> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ACCEPTED,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) return { cancelled: true };
  const asset = result.assets[0];
  if (!asset) return { cancelled: true };

  const mimeType = (asset.mimeType ?? '').toLowerCase();
  if (!ACCEPTED.includes(mimeType)) {
    return { error: 'Attach a PDF, JPEG or PNG file.' };
  }
  if (typeof asset.size === 'number' && asset.size > LIMITS.uploadBytes) {
    return { error: 'Keep the file under 1 MB.' };
  }

  const picked: PickedDocument = {
    uri: asset.uri,
    name: asset.name || 'document',
    mimeType,
    sizeBytes: typeof asset.size === 'number' ? asset.size : 0,
  };
  const file = (asset as DocumentPicker.DocumentPickerAsset & { file?: File }).file;
  if (typeof File !== 'undefined' && file instanceof File) picked.file = file;
  return { document: picked };
}

/** Builds the multipart body the server expects, handling web and native. */
export async function buildApplicationForm(input: {
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  reason: string;
  document: PickedDocument | null;
}): Promise<FormData> {
  const form = new FormData();
  form.append('leaveTypeId', String(input.leaveTypeId));
  form.append('startDate', input.startDate);
  form.append('endDate', input.endDate);
  form.append('reason', input.reason);

  const asset = input.document;
  if (!asset) return form;

  if (Platform.OS === 'web') {
    // Web pickers hand back a File; fall back to fetching the blob URL.
    let part: Blob | File | null = asset.file ?? null;
    if (!part) {
      try {
        const response = await fetch(asset.uri);
        part = await response.blob();
      } catch {
        part = null;
      }
    }
    if (!part) throw new Error('The selected file could not be read.');
    form.append('document', part, asset.name);
    return form;
  }

  form.append('document', {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType,
  } as unknown as Blob);
  return form;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index] ?? 0;
    const b1 = index + 1 < bytes.length ? (bytes[index + 1] ?? 0) : 0;
    const b2 = index + 2 < bytes.length ? (bytes[index + 2] ?? 0) : 0;
    const chunk = (b0 << 16) | (b1 << 8) | b2;
    output += table[(chunk >> 18) & 63];
    output += table[(chunk >> 12) & 63];
    output += index + 1 < bytes.length ? table[(chunk >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? table[chunk & 63] : '=';
  }
  return output;
}

function safeCacheName(name: string, mimeType: string): string {
  const extension =
    mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const base = name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-40);
  return base.includes('.') ? base : `document-${Date.now()}.${extension}`;
}

/**
 * Downloads the application's document with the app's auth and opens it.
 * Web: object URL in a new tab. Native: written to the cache directory, then
 * the system share sheet (the user picks an app that can show PDF/images).
 */
export async function openDocument(application: LeaveApplicationDto): Promise<void> {
  const response = await apiFetchRaw(`/leaves/${application.id}/document`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const mimeType =
    application.document?.mimeType ?? response.headers.get('content-type') ?? 'application/pdf';
  const name = application.document?.originalName ?? `document-${application.id}.pdf`;

  if (Platform.OS === 'web') {
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const base64 = bytesToBase64(bytes);
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('The device cache is not available.');
  const fileUri = `${cacheDir}${safeCacheName(name, mimeType)}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Opening files is not available on this device.');
  }
  await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: name, UTI: mimeType });
}
