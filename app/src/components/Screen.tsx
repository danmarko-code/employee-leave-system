import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from './Text';
import { colors, layout, space } from '@/theme/tokens';

/** Shared page frame: capped width, even gutters, one scroll area. */
export function Screen({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const gutter = width >= layout.wideBreakpoint ? space.xxxl : space.lg;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { padding: gutter, gap: space.xxl }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>{children}</View>
    </ScrollView>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <AppText variant="heading">{title}</AppText>
        {subtitle ? (
          <AppText variant="body" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action ? <View style={styles.headerAction}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: layout.contentMax,
    gap: space.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.lg,
    flexWrap: 'wrap',
  },
  headerText: {
    gap: space.xs,
    flexShrink: 1,
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});
