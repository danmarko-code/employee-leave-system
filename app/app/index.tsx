import { Redirect } from 'expo-router';
import { BootScreen } from '@/components/BootScreen';
import { useSession } from '@/lib/session';

export default function Index() {
  const { status } = useSession();
  if (status === 'restoring') return <BootScreen />;
  return <Redirect href={status === 'signedIn' ? '/home' : '/sign-in'} />;
}
