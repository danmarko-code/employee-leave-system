import { useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { BrandMark } from '@/components/Brand';
import { colors, space } from '@/theme/tokens';

export default function NotFound() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <BrandMark size={36} />
      <AppText variant="heading" style={styles.copy}>
        That page does not exist.
      </AppText>
      <Button label="Go to home" variant="secondary" onPress={() => router.replace('/home')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    backgroundColor: colors.canvas,
    padding: space.xxl,
  },
  copy: {
    textAlign: 'center',
  },
});
