import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { Dialog } from './Dialog';
import { refreshSession } from '@/lib/api';
import { useSession } from '@/lib/session';

/** Server rule: 30 minutes idle ends the session. Warn two minutes before. */
const IDLE_LIMIT_MS = 30 * 60 * 1000;
const WARNING_LEAD_MS = 2 * 60 * 1000;
const WARN_AT_MS = IDLE_LIMIT_MS - WARNING_LEAD_MS;

/**
 * Watches for inactivity and offers to extend the session before the server's
 * 30-minute idle deadline. "Stay signed in" genuinely rotates the refresh
 * token, which is what resets the server's idle clock; if that rotation fails,
 * the person is signed out rather than shown a lie.
 */
export function IdleSessionGuard({ children }: { children: ReactNode }) {
  const { signOut } = useSession();
  const [warningOpen, setWarningOpen] = useState(false);
  const [extending, setExtending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const lastActive = useRef(Date.now());
  const warningOpenRef = useRef(false);
  const leavingRef = useRef(false);

  const markActive = useCallback(() => {
    lastActive.current = Date.now();
  }, []);

  const leave = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    await signOut();
  }, [signOut]);

  const check = useCallback(() => {
    const idleFor = Date.now() - lastActive.current;
    if (idleFor >= IDLE_LIMIT_MS) {
      void leave();
      return;
    }
    if (idleFor >= WARN_AT_MS && !warningOpenRef.current) {
      warningOpenRef.current = true;
      setWarningOpen(true);
    }
  }, [leave]);

  useEffect(() => {
    const timer = setInterval(check, 15_000);
    check();
    return () => clearInterval(timer);
  }, [check]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onActivity = () => markActive();
    const events: (keyof DocumentEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    for (const event of events) {
      document.addEventListener(event, onActivity, { passive: true });
    }
    return () => {
      for (const event of events) document.removeEventListener(event, onActivity);
    };
  }, [markActive]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => subscription.remove();
  }, [check]);

  const staySignedIn = async () => {
    if (extending) return;
    setExtending(true);
    setFailure(null);
    try {
      const extended = await refreshSession();
      if (!extended) {
        await leave();
        return;
      }
      warningOpenRef.current = false;
      setWarningOpen(false);
      markActive();
    } catch {
      setFailure('We could not reach the server. Sign in again to continue.');
    } finally {
      setExtending(false);
    }
  };

  return (
    <View style={styles.root} onTouchStart={markActive}>
      {children}
      <Dialog
        visible={warningOpen}
        title="You will be signed out in 2 minutes"
        description={
          failure ??
          'There has been no activity for a while. Choose "Stay signed in" to keep working, or sign out now.'
        }
        confirmLabel="Stay signed in"
        cancelLabel="Sign out"
        loading={extending}
        dismissible={false}
        onConfirm={() => void staySignedIn()}
        onCancel={() => void leave()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
});
