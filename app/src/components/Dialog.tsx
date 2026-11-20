import { useEffect } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { AppText } from './Text';
import { Button } from './Button';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Confirmation dialog for actions that are destructive or hard to undo.
 * Escape and a tap on the backdrop cancel; the confirm action is the only
 * thing that proceeds.
 */
export function Dialog({
  visible,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  loading = false,
  dismissible = true,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  loading?: boolean;
  /** False hides the backdrop/Escape escape hatch (an idle warning, for example). */
  dismissible?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!visible || !dismissible || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible, dismissible, loading, onCancel]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (dismissible && !loading) onCancel();
      }}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (dismissible && !loading) onCancel();
          }}
          accessibilityRole={dismissible ? 'button' : undefined}
          accessibilityLabel={dismissible ? 'Close dialog' : undefined}
          disabled={!dismissible || loading}
        />
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.text}>
            <AppText variant="title" accessibilityRole="header">
              {title}
            </AppText>
            {description ? (
              <AppText variant="small" tone="muted">
                {description}
              </AppText>
            ) : null}
          </View>
          <View style={styles.actions}>
            <Button label={cancelLabel} variant="secondary" size="sm" onPress={onCancel} disabled={loading} />
            <Button
              label={confirmLabel}
              variant={tone === 'danger' ? 'danger' : 'primary'}
              size="sm"
              onPress={onConfirm}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    backgroundColor: 'rgba(8, 18, 23, 0.48)',
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    gap: space.lg,
    padding: space.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(8,18,23,0.16)' } as unknown as ViewStyle) : null),
  },
  text: {
    gap: space.xs,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
    flexWrap: 'wrap',
  },
});
