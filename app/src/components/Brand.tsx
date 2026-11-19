import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme/tokens';

/** The product mark: a square window cut out of a lagoon tile. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <View
      style={[styles.mark, { width: size, height: size, borderRadius: size / 3.4 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          width: size / 2.4,
          height: size / 2.4,
          borderRadius: Math.max(3, size / 12),
          borderWidth: 2,
          borderColor: colors.onDark,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
