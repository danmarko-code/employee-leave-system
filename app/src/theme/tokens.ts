import { Platform } from 'react-native';

/**
 * The one place design decisions live. Components read these; no raw hex
 * values, magic spacing or one-off radii anywhere else.
 *
 * Palette comes from the original prototype: lagoon teal, sun amber, ink and
 * a cool paper background. Neutrals lean toward the teal, never purple.
 */
export const colors = {
  canvas: '#E8F0F3',
  surface: '#FFFFFF',
  surfaceMuted: '#F2F7F8',
  surfaceSunken: '#DEE9EC',

  ink: '#10212B',
  muted: '#52646E',
  faint: '#7C8D97',
  onDark: '#FFFFFF',
  onDarkMuted: '#A9BEC9',

  brand: '#0F8B8D',
  brandPressed: '#0B6B6C',
  brandSoft: '#DCEFEF',
  brandInk: '#074C4D',

  accent: '#F6B93B',
  accentSoft: '#FBEED2',

  border: '#D5E1E5',
  borderStrong: '#B9CBD1',

  sidebar: '#0A2533',
  sidebarActive: '#14394A',

  success: '#13804B',
  successSoft: '#DFF2E8',
  warning: '#8A5600',
  warningSoft: '#FBEDD2',
  danger: '#B3342E',
  dangerSoft: '#F8E3E1',
  focus: '#0F8B8D',
} as const;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 56,
} as const;

export const radius = {
  control: 10,
  card: 16,
  pill: 999,
} as const;

export const fontSize = {
  micro: 12,
  small: 13,
  body: 15,
  lead: 17,
  title: 20,
  heading: 26,
  display: 34,
} as const;

export const lineHeight = {
  micro: 16,
  small: 18,
  body: 22,
  lead: 24,
  title: 26,
  heading: 32,
  display: 40,
} as const;

export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
} as const;

export const fonts = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
} as const;

export const shadow = {
  card: Platform.select({
    web: { boxShadow: '0 1px 2px rgba(10, 37, 51, 0.06)' },
    default: {
      shadowColor: '#0A2533',
      shadowOpacity: 0.06,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
  }),
  overlay: Platform.select({
    web: { boxShadow: '0 16px 40px rgba(10, 37, 51, 0.18)' },
    default: {
      shadowColor: '#0A2533',
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
  }),
} as const;

export const motion = {
  fast: 120,
  base: 200,
} as const;

/** Layout constants shared by the shell and screens. */
export const layout = {
  sidebarWidth: 264,
  contentMax: 1040,
  pageGutter: 20,
  wideBreakpoint: 920,
} as const;

export const brand = {
  name: 'Leave system',
  tagline: 'Employee leave applications',
} as const;
