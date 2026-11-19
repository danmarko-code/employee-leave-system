import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthResponse, UserDto } from '@leave/shared';
import {
  ApiError,
  NetworkError,
  authApi,
  apiFetch,
  refreshSession,
  setAuthLostHandler,
  setRefreshHandler,
  setTokens,
} from './api';
import { isWeb } from './config';

/** Native only. The web flow keeps its refresh token in an httpOnly cookie. */
const REFRESH_KEY = 'leave.refreshToken';

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

export interface SessionState {
  status: SessionStatus;
  user: UserDto | null;
  sessionExpiresAt: string | null;
  /** Set when restoring failed for a reason other than "no session". */
  restoreError: string | null;
}

interface SessionContextValue extends SessionState {
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  savePhone(phone: string | null): Promise<UserDto>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function readStoredRefreshToken(): Promise<string | null> {
  if (isWeb) return null;
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    return null;
  }
}

async function writeStoredRefreshToken(token: string | null): Promise<void> {
  if (isWeb) return;
  try {
    if (token) {
      await SecureStore.setItemAsync(REFRESH_KEY, token, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } else {
      await SecureStore.deleteItemAsync(REFRESH_KEY);
    }
  } catch {
    // A device without a usable keychain keeps the token in memory only.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [state, setState] = useState<SessionState>({
    status: 'restoring',
    user: null,
    sessionExpiresAt: null,
    restoreError: null,
  });

  const applyAuth = useCallback(async (response: AuthResponse) => {
    setTokens({
      accessToken: response.accessToken,
      ...(response.refreshToken !== undefined ? { refreshToken: response.refreshToken } : {}),
    });
    if (!isWeb && response.refreshToken) {
      await writeStoredRefreshToken(response.refreshToken);
    }
    setState({
      status: 'signedIn',
      user: response.user,
      sessionExpiresAt: response.sessionExpiresAt,
      restoreError: null,
    });
  }, []);

  const clearLocal = useCallback(async () => {
    setTokens({ accessToken: null, refreshToken: null });
    await writeStoredRefreshToken(null);
    setState({
      status: 'signedOut',
      user: null,
      sessionExpiresAt: null,
      restoreError: null,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    // A failed refresh means the session is gone; drop the local copy.
    setAuthLostHandler(() => {
      void clearLocal();
    });

    setRefreshHandler(async () => {
      try {
        const response = await authApi.refresh();
        if (cancelled) return true;
        await applyAuth(response);
        return true;
      } catch (error) {
        // A network failure is not a dead session: keep the stored token so a
        // later request can recover, and let the caller show a connection
        // message instead of pretending the person signed out.
        if (error instanceof NetworkError) throw error;
        if (!cancelled) {
          setTokens({ accessToken: null, refreshToken: null });
          await writeStoredRefreshToken(null);
        }
        return false;
      }
    });

    const restore = async () => {
      if (!isWeb) {
        const stored = await readStoredRefreshToken();
        if (!stored) {
          if (!cancelled) {
            setState({ status: 'signedOut', user: null, sessionExpiresAt: null, restoreError: null });
          }
          return;
        }
        setTokens({ accessToken: null, refreshToken: stored });
      }

      try {
        const restored = await refreshSession();
        if (cancelled || restored) return;
        setState({
          status: 'signedOut',
          user: null,
          sessionExpiresAt: null,
          restoreError: null,
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: 'signedOut',
          user: null,
          sessionExpiresAt: null,
          restoreError: sessionErrorMessage(error),
        });
      }
    };

    void restore();

    return () => {
      cancelled = true;
      setAuthLostHandler(null);
      setRefreshHandler(null);
    };
  }, [applyAuth, clearLocal]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await authApi.login(email.trim().toLowerCase(), password);
      await applyAuth(response);
    },
    [applyAuth]
  );

  useEffect(() => {
    if (!isWeb || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('leave.session');
    channel.onmessage = (event: MessageEvent) => {
      if (event.data === 'signed-out') void clearLocal();
    };
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [clearLocal]);

  const signOut = useCallback(async () => {
    await authApi.logout();
    await clearLocal();
    // Other tabs drop the in-memory token without calling the server again.
    channelRef.current?.postMessage('signed-out');
  }, [clearLocal]);

  const savePhone = useCallback(async (phone: string | null) => {
    const result = await apiFetch<{ user: UserDto }>('/me', {
      method: 'PATCH',
      body: { phone: phone && phone.trim() !== '' ? phone.trim() : null },
    });
    setState((current) => ({ ...current, user: result.user }));
    return result.user;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ ...state, signIn, signOut, savePhone }),
    [state, signIn, signOut, savePhone]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

/** Turns an API failure into copy that is safe to show on screen. */
export function sessionErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'The server could not be reached. Check your connection and try again.';
  }
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'invalid_credentials':
        return 'Email or password is incorrect.';
      case 'invalid_client':
        return 'This client is not configured correctly. Contact your administrator.';
      case 'csrf_failed':
        return 'The request was blocked. Reload the page and try again.';
      case 'rate_limited':
        return 'Too many attempts. Wait a moment and try again.';
      case 'account_locked':
        return 'Too many failed attempts. Try again later or ask an administrator to reset your password.';
      case 'account_inactive':
        return 'This account is not active. Ask an administrator for help.';
      default:
        return error.message;
    }
  }
  return 'Something went wrong. Try again.';
}
