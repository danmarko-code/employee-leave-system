import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from './Text';
import { colors, radius, space } from '@/theme/tokens';

export interface Crumb {
  label: string;
  /** Omit on the last crumb: it is the current page. */
  href?: string;
}

/**
 * Replaces the old top-right Back button. The last crumb is plain text; the
 * earlier ones navigate. Below 768px the trail scrolls horizontally rather
 * than wrapping into the page title.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const router = useRouter();

  return (
    <View style={styles.row} accessibilityRole="navigation" accessibilityLabel="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <View key={`${item.label}-${index}`} style={styles.item}>
            {index > 0 ? (
              <AppText variant="small" tone="faint" accessibilityElementsHidden>
                /
              </AppText>
            ) : null}
            {item.href && !isLast ? (
              <Pressable
                onPress={() => router.push(item.href!)}
                accessibilityRole="link"
                accessibilityLabel={`Go to ${item.label}`}
                style={({ pressed }) => [
                  styles.link,
                  pressed && { backgroundColor: colors.surfaceMuted },
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as unknown as ViewStyle) : null,
                ]}
              >
                <AppText variant="small" tone="muted">
                  {item.label}
                </AppText>
              </Pressable>
            ) : (
              <AppText variant="small" tone="faint" numberOfLines={1}>
                {item.label}
              </AppText>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    maxWidth: '100%',
  },
  link: {
    paddingVertical: space.xxs,
    paddingHorizontal: space.xs,
    marginHorizontal: -space.xs,
    borderRadius: radius.sm,
  },
});
