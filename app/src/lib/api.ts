import type { ApiErrorBody, AuthResponse } from '@leave/shared';
import { API_URL, isWeb } from './config';

/**
 * Thin API client.
 *
 * Web: the refresh token lives in an httpOnly cookie the page cannot read; the
 * access token is held only in memory. Native: both tokens are held in memory,
 * with the refresh token mirrored to SecureStore by the session provider.
 *
 * Nothing is ever written to localStorage/sessionStorage.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly requestId: string | null;

  constructor(status: number, body: ApiErrorBody['error'] | null, fallback: string) {
    super(body?.message ?? fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code ?? 'request_failed';
    this.fields = body?.fields ?? {};
    this.requestId = body?.requestId ?? null;
  }
}

export class NetworkError extends Error {
  constructor() {
    super('The server could not be reached.');
    this.name = 'NetworkError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  /** Internal: prevents a refresh loop on the retried request. */
  retried?: boolean;
  signal?: AbortSignal;
};

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshHandler: (() => Promise<boolean>) | null = null;
let authLostHandler: (() => void) | null = null;
let refreshInFlight: Promise<boolean> | null = null;

/** Called by the session provider whenever tokens change. */
export function setTokens(next: { accessToken: string | null; refreshToken?: string | null }): void {
  accessToken = next.accessToken;
  if (next.refreshToken !== undefined) refreshToken = next.refreshToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

/** Native only: the session provider knows how to rotate the stored token. */
export function setRefreshHandler(handler: (() => Promise<boolean>) | null): void {
  refreshHandler = handler;
}

/** Fired when a refresh fails, so the session provider can sign the person out. */
export function setAuthLostHandler(handler: (() => void) | null): void {
  authLostHandler = handler;
}

function headersFor(options: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Client': isWeb ? 'web' : 'native',
  };

  if (isWeb) {
    // Required by the server's CSRF check on auth routes; harmless elsewhere.
    headers['X-Requested-With'] = 'XMLHttpRequest';
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (options.form) {
    // Let the runtime set the multipart boundary itself.
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method: options.method ?? 'GET',
      headers: headersFor(options),
      credentials: isWeb ? 'include' : 'omit',
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      signal: options.signal,
    });
  } catch {
    throw new NetworkError();
  }
  return response;
}

async function toError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  return new ApiError(response.status, body?.error ?? null, 'Something went wrong. Try again.');
}

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return (await response.json()) as T;
  return (await response.text()) as unknown as T;
}

/** Runs the single-flight refresh; returns false when the session is gone. */
export async function refreshSession(): Promise<boolean> {
  if (!refreshHandler) return false;
  if (!refreshInFlight) {
    const run = () => refreshHandler!();
    // Two tabs share one httpOnly cookie. Serialise refreshes across them with
    // the Web Locks API, otherwise the second tab presents the pre-rotation
    // token and the server correctly treats it as reuse.
    const locks =
      isWeb && typeof navigator !== 'undefined'
        ? (navigator as Navigator & {
            locks?: { request(name: string, callback: () => Promise<boolean>): Promise<boolean> };
          }).locks
        : undefined;

    refreshInFlight = (locks ? locks.request('leave.session.refresh', run) : run()).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);

  if (response.status === 401 && !options.retried && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      authLostHandler?.();
      throw await toError(response);
    }
    return apiFetch<T>(path, { ...options, retried: true });
  }

  if (response.status === 401 && !path.startsWith('/auth/')) {
    authLostHandler?.();
  }

  return read<T>(response);
}

/**
 * Like `apiFetch` but returns the raw `Response` for binary downloads.
 * Handles 401 refresh transparently.
 */
export async function apiFetchRaw(path: string, options: RequestOptions = {}): Promise<Response> {
  const response = await send(path, options);

  if (response.status === 401 && !options.retried && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      authLostHandler?.();
      throw await toError(response);
    }
    return apiFetchRaw(path, { ...options, retried: true });
  }

  if (response.status === 401 && !path.startsWith('/auth/')) {
    authLostHandler?.();
  }

  if (!response.ok) throw await toError(response);
  return response;
}

/** Auth calls talk to the same client but keep their own error handling. */
export const authApi = {
  login(email: string, password: string): Promise<AuthResponse> {
    return apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
  },

  async refresh(): Promise<AuthResponse> {
    const body = isWeb ? undefined : refreshToken ? { refreshToken } : undefined;
    if (!isWeb && !body) throw new NetworkError();
    return apiFetch<AuthResponse>('/auth/refresh', { method: 'POST', body });
  },

  async logout(): Promise<void> {
    const body = isWeb ? undefined : refreshToken ? { refreshToken } : undefined;
    try {
      // No `retried`: an expired access token is refreshed once, then the
      // retry revokes the session instead of leaving it alive.
      await apiFetch<void>('/auth/logout', { method: 'POST', body });
    } catch {
      // The local session is cleared regardless; the server expires it anyway.
    }
  },
};
