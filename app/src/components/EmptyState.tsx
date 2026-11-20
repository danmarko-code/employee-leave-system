import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './Text';
import { Button } from './Button';
import { colors, radius, space } from '@/theme/tokens';

/**
 * One line of text and at most one action. No tinted icon circle, no
 * decorative illustration, no paragraph restating the title.
 *
 * `icon` and `body` are accepted for existing call sites and deliberately
 * ignored / treated as an optional second line while each screen is migrated.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.empty}>
      <AppText variant="body" tone="muted" style={styles.title}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="small" tone="faint" style={styles.body}>
          {body}
        </AppText>
      ) : null}
      {action ? (
        <View style={styles.action}>
          <Button label={action.label} variant="secondary" size="sm" onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    maxWidth: 360,
  },
  action: {
    marginTop: space.xs,
  },
});
