import { Image, StyleSheet, View } from 'react-native';
import { AppText } from './Text';
import { colors, fonts, radius } from '@/theme/tokens';
import { initials } from '@/lib/format';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const DIMENSIONS: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 96,
};

/**
 * Profile photo with an initials fallback. `photo` is a URL the app has
 * already authorised (a blob/object URL or a native file URI), never a URL
 * that needs a bearer header the browser cannot send.
 */
export function Avatar({
  name,
  photo,
  size = 'md',
  tone = 'light',
  label,
}: {
  name: string;
  photo?: string | null;
  size?: AvatarSize;
  tone?: 'light' | 'dark';
  /** Overrides the accessible label when the name is not already next to it. */
  label?: string;
}) {
  const dimension = DIMENSIONS[size];
  const background = tone === 'dark' ? 'rgba(255,255,255,0.12)' : colors.brandSoft;

  return (
    <View
      style={[
        styles.avatar,
        {
          width: dimension,
          height: dimension,
          borderRadius: radius.pill,
          backgroundColor: background,
          borderColor: tone === 'dark' ? 'rgba(255,255,255,0.16)' : colors.border,
        },
      ]}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'auto' : 'no-hide-descendants'}
    >
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={{ width: dimension, height: dimension, borderRadius: radius.pill }}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : (
        <AppText
          variant={size === 'xl' || size === 'lg' ? 'title' : size === 'xs' ? 'micro' : 'small'}
          style={{
            color: tone === 'dark' ? colors.onDark : colors.brandInk,
            fontFamily: fonts.semibold,
          }}
        >
          {initials(name)}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
});
