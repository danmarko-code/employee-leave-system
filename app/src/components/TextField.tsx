import { useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { colors, fonts, fontSize, radius, space } from '@/theme/tokens';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label: string;
  /** Helper line shown under the field (e.g. a password strength hint). */
  hint?: string;
  error?: string | null;
  secure?: boolean;
  inputRef?: React.Ref<TextInputInstance>;
}

export function TextField({
  label,
  hint,
  error,
  secure = false,
  inputRef,
  onFocus,
  onBlur,
  value,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const fallbackRef = useRef<TextInputInstance>(null);
  const ref = inputRef ?? fallbackRef;

  const borderColor = error ? colors.danger : focused ? colors.brand : colors.borderStrong;

  return (
    <View style={styles.group}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>

      <View
        style={[
          styles.field,
          { borderColor },
          focused && !error && styles.fieldFocused,
          error ? styles.fieldError : null,
          Platform.OS === 'web'
            ? ({ transitionProperty: 'border-color, box-shadow', transitionDuration: '120ms' } as unknown as ViewStyle)
            : null,
        ]}
      >
        <TextInput
          {...rest}
          ref={ref}
          value={value}
          secureTextEntry={secure && !revealed}
          placeholderTextColor={colors.faint}
          selectionColor={colors.brand}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint ?? rest.accessibilityHint}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            styles.input,
            Platform.OS === 'web'
              ? ({ outlineStyle: 'none', outlineWidth: 0 } as unknown as ViewStyle)
              : null,
          ]}
        />

        {secure ? (
          <Pressable
            onPress={() => setRevealed((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            style={({ pressed }) => [
              styles.reveal,
              pressed && { backgroundColor: colors.surfaceMuted },
              Platform.OS === 'web' ? ({ cursor: 'pointer' } as unknown as ViewStyle) : null,
            ]}
          >
            <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={15} color={colors.danger} />
          <AppText variant="small" tone="danger">
            {error}
          </AppText>
        </View>
      ) : hint ? (
        <AppText variant="small" tone="faint">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: space.xs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    paddingLeft: space.md,
  },
  fieldFocused: {
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 0 0 2px ${colors.brandSoft}` } as unknown as ViewStyle)
      : null),
  },
  fieldError: {
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 42,
    paddingVertical: 0,
    paddingRight: space.md,
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.ink,
  },
  reveal: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopRightRadius: radius.control,
    borderBottomRightRadius: radius.control,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
});
