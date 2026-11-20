import { Platform } from 'react-native';

/**
 * The one place design decisions live. Components read these; no raw hex
 * values, magic spacing or one-off radii anywhere else.
 *
 * Direction: a deliberately plain internal HR tool. Near-white canvas, white
 * surfaces, 1px borders, no soft shadows, 6-8px radii. One accent (the lagoon
 * teal) for primary actions and the active nav item only. Amber, green and red
 * are reserved for pending, approved and rejected.
 *
 * Type scale: 12 / 14 / 16 / 20 / 28. Nothing smaller than 12 and nothing in
 * the body copy smaller than 14. Spacing sits on a 4px grid.
 */
export const colors = {
  canvas: '#F7F8F9',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4F6',
  surfaceSunken: '#E9ECEF',

  ink: '#111827',
  muted: '#4B5563',
  faint: '#6B7280',
  onDark: '#FFFFFF',
  onDarkMuted: '#C3CBD5',

  // The single accent. Dark enough for white text at AA.
  brand: '#0B6B6C',
  brandPressed: '#095456',
  brandSoft: '#E8F2F2',
  brandInk: '#064445',

  // Kept as an alias so nothing can quietly introduce a second accent.
  accent: '#0B6B6C',
  accentSoft: '#E8F2F2',

  border: '#DDE1E5',
  borderStrong: '#C6CCD2',

  sidebar: '#111C24',
  sidebarActive: '#1D2C36',

  success: '#166534',
  successSoft: '#DCFCE7',
  warning: '#8A5600',
  warningSoft: '#FDF0D5',
  danger: '#B42318',
  dangerSoft: '#FEE4E2',
  focus: '#0B6B6C',
} as const;

/** 4px grid. Names are kept from the previous scale for compatibility. */
export const space = {
  xxs: 4,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 48,
} as const;

export const radius = {
  sm: 4,
  control: 6,
  card: 8,
  pill: 999,
} as const;

export const fontSize = {
  micro: 12,
  small: 14,
  body: 14,
  lead: 16,
  title: 20,
  heading: 28,
  display: 28,
} as const;

export const lineHeight = {
  micro: 16,
  small: 20,
  body: 20,
  lead: 24,
  title: 28,
  heading: 36,
  display: 36,
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

/**
 * Flat surfaces use a 1px border, not a shadow. The names stay so old call
 * sites keep compiling; they intentionally carry no elevation.
 */
export const shadow = {
  card: {},
  overlay: {},
} as const;

export const motion = {
  fast: 120,
  base: 200,
} as const;

/** Layout constants shared by the shell and screens. */
export const layout = {
  sidebarWidth: 240,
  contentMax: 1120,
  pageGutter: 24,
  wideBreakpoint: 768,
} as const;

export const brand = {
  name: 'Leave system',
  tagline: 'Employee leave applications',
} as const;

/** Visible keyboard focus ring, shared by every interactive control. */
export const focusRing =
  Platform.OS === 'web'
    ? ({ outlineStyle: 'solid', outlineWidth: 2, outlineColor: colors.focus, outlineOffset: 2 } as const)
    : ({ borderColor: colors.focus } as const);
