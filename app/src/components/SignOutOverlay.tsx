import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText } from './Text';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Shown from the moment sign-out starts until the local session is cleared.
 * Sign-out is a short server round-trip with a hard 2 s budget, so without
 * this the screen simply freezes for a moment with no explanation.
 */
export function SignOutOverlay() {
  const { signingOut } = useSession();
  if (!signingOut) return null;

  return (
    <View
      style={styles.backdrop}
      accessibilityRole="progressbar"
      accessibilityLabel="Signing out"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.card}>
        <ActivityIndicator size="small" color={colors.brand} />
        <AppText variant="small" style={{ fontFamily: fonts.medium }}>
          Signing out…
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.36)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
    zIndex: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
  },
});
