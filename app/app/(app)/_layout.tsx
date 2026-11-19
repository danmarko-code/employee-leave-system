import { Redirect, Slot } from 'expo-router';
import { AppShell } from '@/components/AppShell';
import { BootScreen } from '@/components/BootScreen';
import { useSession } from '@/lib/session';

export default function AppLayout() {
  const { status } = useSession();

  if (status === 'restoring') return <BootScreen />;
  if (status !== 'signedIn') return <Redirect href="/sign-in" />;

  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}
