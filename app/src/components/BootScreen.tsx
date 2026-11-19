import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText } from './Text';
import { colors, space } from '@/theme/tokens';

/** Shown while fonts load and while the stored session is checked. */
export function BootScreen({ message = 'Checking your session…' }: { message?: string }) {
  return (
    <View style={styles.root}>
      <View style={styles.mark}>
        <View style={styles.markInner} />
      </View>
      <AppText variant="title">Leave system</AppText>
      <View style={styles.status}>
        <ActivityIndicator size="small" color={colors.brand} />
        <AppText variant="small" tone="muted">
          {message}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    backgroundColor: colors.canvas,
    padding: space.xxl,
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  markInner: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.onDark,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
  },
});
