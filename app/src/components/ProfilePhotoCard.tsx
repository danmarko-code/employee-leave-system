import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { UserDto } from '@leave/shared';
import { AppText } from './Text';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Card } from './Surface';
import { useToast } from './Toast';
import { apiFetch, ApiError } from '@/lib/api';
import { invalidatePhoto, usePhoto } from '@/lib/photo';
import { sessionErrorMessage } from '@/lib/session';
import { colors, space } from '@/theme/tokens';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CROP_PX = 512;

export function ProfilePhotoCard({ user }: { user: UserDto }) {
  const remote = usePhoto(user.id, 'full');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { showToast } = useToast();

  const choose = async () => {
    if (busy) return;
    setError(null);

    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Allow access to your photos to choose a picture.');
        return;
      }
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (picked.canceled || picked.assets.length === 0) return;

    const asset = picked.assets[0]!;
    if (asset.mimeType && !ACCEPTED.has(asset.mimeType)) {
      setError('Use a JPEG, PNG or WebP image.');
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_BYTES) {
      setError('Choose an image under 2 MB.');
      return;
    }

    setBusy(true);
    try {
      // Centre-crop to a square, then downscale. The server crops and
      // re-encodes again; this step is for a predictable preview and a small
      // upload.
      const side = Math.min(asset.width, asset.height);
      const edited = await manipulateAsync(
        asset.uri,
        [
          {
            crop: {
              originX: Math.max(0, Math.round((asset.width - side) / 2)),
              originY: Math.max(0, Math.round((asset.height - side) / 2)),
              width: side,
              height: side,
            },
          },
          { resize: { width: CROP_PX, height: CROP_PX } },
        ],
        { compress: 0.9, format: SaveFormat.WEBP }
      );

      const form = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(edited.uri)).blob();
        if (blob.size > MAX_BYTES) {
          setError('Choose an image under 2 MB.');
          return;
        }
        form.append('photo', blob, 'photo.webp');
      } else {
        form.append('photo', {
          uri: edited.uri,
          name: 'photo.webp',
          type: 'image/webp',
        } as unknown as Blob);
      }

      await apiFetch('/me/photo', { method: 'POST', form });
      setPreview(edited.uri);
      invalidatePhoto(user.id);
      showToast({ title: 'Photo updated', tone: 'success' });
    } catch (uploadError) {
      setError(
        uploadError instanceof ApiError && uploadError.fields.photo
          ? uploadError.fields.photo
          : sessionErrorMessage(uploadError)
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/me/photo', { method: 'DELETE' });
      setPreview(null);
      invalidatePhoto(user.id);
      setConfirmRemove(false);
      showToast({ title: 'Photo removed', tone: 'success' });
    } catch (removeError) {
      setError(sessionErrorMessage(removeError));
      setConfirmRemove(false);
    } finally {
      setBusy(false);
    }
  };

  const shown = preview ?? remote;

  return (
    <Card style={styles.card}>
      <View style={styles.identity}>
        <Avatar name={user.name} photo={shown} size="xl" />
        <View style={styles.text}>
          <AppText variant="title">{user.name}</AppText>
          <AppText variant="small" tone="muted">
            {user.email}
          </AppText>
          <AppText variant="small" tone="faint">
            Your photo is visible to you and to administrators.
          </AppText>
        </View>
      </View>

      {error ? (
        <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={shown ? 'Change photo' : 'Add photo'}
          variant="secondary"
          size="sm"
          loading={busy}
          onPress={() => void choose()}
        />
        {shown ? (
          <Button
            label="Remove"
            variant="ghost"
            size="sm"
            disabled={busy}
            onPress={() => setConfirmRemove(true)}
          />
        ) : null}
      </View>

      <Dialog
        visible={confirmRemove}
        title="Remove your photo?"
        description="Your initials will be shown instead."
        confirmLabel="Remove photo"
        tone="danger"
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.lg,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    flexWrap: 'wrap',
  },
  text: {
    flex: 1,
    minWidth: 200,
    gap: space.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.lg,
  },
});
