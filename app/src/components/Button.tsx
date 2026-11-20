import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { colors, fonts, radius, space } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  size?: 'md' | 'sm';
  accessibilityHint?: string;
}

const BACKGROUND: Record<Variant, string> = {
  primary: colors.brand,
  secondary: colors.surface,
  ghost: 'transparent',
  danger: colors.danger,
};

const BACKGROUND_PRESSED: Record<Variant, string> = {
  primary: colors.brandPressed,
  secondary: colors.surfaceMuted,
  ghost: colors.surfaceMuted,
  danger: '#8F1B13',
};

const LABEL_COLOR: Record<Variant, string> = {
  primary: colors.onDark,
  secondary: colors.ink,
  ghost: colors.muted,
  danger: colors.onDark,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  size = 'md',
  accessibilityHint,
}: ButtonProps) {
  const [focused, setFocused] = useState(false);
  const inactive = disabled || loading;
  const labelColor = LABEL_COLOR[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.small,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: pressed ? BACKGROUND_PRESSED[variant] : BACKGROUND[variant],
          borderColor: variant === 'secondary' ? colors.borderStrong : 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
        focused && styles.focus,
        Platform.OS === 'web'
          ? ({ cursor: inactive ? 'default' : 'pointer', transitionDuration: '120ms' } as unknown as ViewStyle)
          : null,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={labelColor} />
        ) : icon ? (
          <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={labelColor} />
        ) : null}
        <AppText
          variant={size === 'sm' ? 'small' : 'label'}
          style={{ color: labelColor, fontFamily: fonts.semibold }}
        >
          {loading ? `${label}…` : label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    minHeight: 44,
    paddingHorizontal: space.md,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  focus: {
    borderColor: colors.focus,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 0 0 2px ${colors.canvas}, 0 0 0 4px ${colors.focus}` } as unknown as ViewStyle)
      : null),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Square icon-only control for reveal, sign-out and similar actions. */
export function IconButton({
  icon,
  onPress,
  label,
  tone = 'muted',
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  tone?: 'muted' | 'inverse' | 'danger';
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const color = tone === 'inverse' ? colors.onDarkMuted : tone === 'danger' ? colors.danger : colors.muted;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && { backgroundColor: colors.surfaceMuted },
        focused && styles.focus,
        Platform.OS === 'web'
          ? ({ cursor: disabled ? 'default' : 'pointer' } as unknown as ViewStyle)
          : null,
      ]}
    >
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}
