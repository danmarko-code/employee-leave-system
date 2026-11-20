import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { colors, radius, space } from '@/theme/tokens';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast(input: { title: string; description?: string; tone?: ToastTone }): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE: Record<ToastTone, { icon: keyof typeof Ionicons.glyphMap; color: string; background: string }> = {
  success: { icon: 'checkmark-circle', color: colors.success, background: colors.successSoft },
  error: { icon: 'alert-circle', color: colors.danger, background: colors.dangerSoft },
  info: { icon: 'information-circle', color: colors.brand, background: colors.brandSoft },
};

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);
  const { width } = useWindowDimensions();
  const wide = width >= 768;

  const dismiss = useCallback((id: number) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  const showToast = useCallback<ToastContextValue['showToast']>((input) => {
    nextId.current += 1;
    const id = nextId.current;
    setMessages((current) => [
      ...current.slice(-2),
      { id, title: input.title, description: input.description, tone: input.tone ?? 'info' },
    ]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View
        pointerEvents="box-none"
        style={[styles.layer, wide ? styles.layerWide : styles.layerNarrow]}
        accessibilityLiveRegion="polite"
      >
        {messages.map((message) => {
          const tone = TONE[message.tone];
          return (
            <View
              key={message.id}
              style={[styles.toast, { borderLeftColor: tone.color }]}
              accessibilityRole="alert"
            >
              <Ionicons name={tone.icon} size={18} color={tone.color} style={styles.icon} />
              <View style={styles.toastText}>
                <AppText variant="small" strong>
                  {message.title}
                </AppText>
                {message.description ? (
                  <AppText variant="small" tone="muted">
                    {message.description}
                  </AppText>
                ) : null}
              </View>
              <Pressable
                onPress={() => dismiss(message.id)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss notification"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.close,
                  pressed && { backgroundColor: colors.surfaceMuted },
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
                ]}
              >
                <Ionicons name="close" size={16} color={colors.muted} />
              </Pressable>
            </View>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    gap: space.sm,
    zIndex: 1000,
  },
  layerNarrow: {
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
  },
  layerWide: {
    right: space.xxl,
    bottom: space.xxl,
    width: 360,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(8,18,23,0.12)' } as object) : null),
  },
  icon: {
    marginTop: 1,
  },
  toastText: {
    flex: 1,
    gap: 2,
  },
  close: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
