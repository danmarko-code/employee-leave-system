import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { colors, fonts, fontSize, lineHeight, weight } from '@/theme/tokens';

type Variant = 'display' | 'heading' | 'title' | 'lead' | 'body' | 'small' | 'micro' | 'label';
type Tone = 'default' | 'muted' | 'faint' | 'brand' | 'inverse' | 'danger' | 'success';

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontSize: fontSize.display, lineHeight: lineHeight.display, fontFamily: fonts.semibold, letterSpacing: -0.6 },
  heading: { fontSize: fontSize.heading, lineHeight: lineHeight.heading, fontFamily: fonts.semibold, letterSpacing: -0.3 },
  title: { fontSize: fontSize.title, lineHeight: lineHeight.title, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  lead: { fontSize: fontSize.lead, lineHeight: lineHeight.lead, fontFamily: fonts.regular },
  body: { fontSize: fontSize.body, lineHeight: lineHeight.body, fontFamily: fonts.regular },
  small: { fontSize: fontSize.small, lineHeight: lineHeight.small, fontFamily: fonts.regular },
  micro: { fontSize: fontSize.micro, lineHeight: lineHeight.micro, fontFamily: fonts.regular },
  label: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
};

const TONES: Record<Tone, string> = {
  default: colors.ink,
  muted: colors.muted,
  faint: colors.faint,
  brand: colors.brand,
  inverse: colors.onDark,
  danger: colors.danger,
  success: colors.success,
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  /** Medium weight for emphasis inside a paragraph. */
  strong?: boolean;
  tabular?: boolean;
}

export function AppText({
  variant = 'body',
  tone = 'default',
  strong = false,
  tabular = false,
  style,
  ...rest
}: AppTextProps) {
  return (
    <RNText
      {...rest}
      style={[
        VARIANTS[variant],
        { color: TONES[tone] },
        strong && { fontFamily: fonts.semibold, fontWeight: weight.semibold },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}
