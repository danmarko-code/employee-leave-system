import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
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
  danger: colors.dangerSoft,
};

const BACKGROUND_PRESSED: Record<Variant, string> = {
  primary: colors.brandPressed,
  secondary: colors.surfaceMuted,
  ghost: colors.brandSoft,
  danger: '#F2D3D0',
};

const LABEL_COLOR: Record<Variant, string> = {
  primary: colors.onDark,
  secondary: colors.ink,
  ghost: colors.muted,
  danger: colors.danger,
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
  const inactive = disabled || loading;
  const labelColor = variant === 'primary' ? LABEL_COLOR.primary : LABEL_COLOR[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.small,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: pressed ? BACKGROUND_PRESSED[variant] : BACKGROUND[variant],
          borderColor: variant === 'secondary' ? colors.border : 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
        variant === 'primary' && !disabled && styles.primaryShadow,
        Platform.OS === 'web'
          ? ({
              cursor: inactive ? 'default' : 'pointer',
              outlineStyle: 'none',
              transitionDuration: '120ms',
            } as unknown as ViewStyle)
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
    paddingHorizontal: space.xl,
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    minHeight: 36,
    paddingHorizontal: space.lg,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryShadow: {
    shadowColor: '#0A2533',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
});

/** Circular icon-only control, used for the password reveal and sign-out. */
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
  const color = tone === 'inverse' ? colors.onDarkMuted : tone === 'danger' ? colors.danger : colors.muted;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && { backgroundColor: colors.surfaceMuted },
        Platform.OS === 'web'
          ? ({ cursor: disabled ? 'default' : 'pointer', outlineStyle: 'none' } as unknown as ViewStyle)
          : null,
      ]}
    >
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}

