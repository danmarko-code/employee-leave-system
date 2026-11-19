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
import { colors, fonts, radius, space } from '@/theme/tokens';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label: string;
  error?: string | null;
  secure?: boolean;
  inputRef?: React.Ref<TextInputInstance>;
}

export function TextField({
  label,
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

  const borderColor = error ? colors.danger : focused ? colors.brand : colors.border;

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
          accessibilityHint={error ?? undefined}
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
            hitSlop={8}
            style={({ pressed }) => [
              styles.reveal,
              pressed && { backgroundColor: colors.surfaceMuted },
              Platform.OS === 'web' ? ({ cursor: 'pointer', outlineStyle: 'none' } as unknown as ViewStyle) : null,
            ]}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.muted}
            />
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: space.xs + 2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    paddingLeft: space.md,
  },
  fieldFocused: {
    shadowColor: colors.brand,
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  fieldError: {
    backgroundColor: '#FFFBFB',
  },
  input: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 0,
    paddingRight: space.md,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  reveal: {
    width: 40,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopRightRadius: radius.control,
    borderBottomRightRadius: radius.control,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
  },
});
