import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../config/env';

function baseOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: 'strict',
    path: config.cookie.path,
    ...(config.cookie.domain ? { domain: config.cookie.domain } : {}),
  };
}

/** httpOnly, Secure, SameSite=Strict refresh cookie for the web flow. */
export function setRefreshCookie(res: Response, config: AppConfig, token: string): void {
  res.cookie(config.cookie.name, token, {
    ...baseOptions(config),
    maxAge: config.cookie.maxAgeMs,
    priority: 'high',
  });
}

export function clearRefreshCookie(res: Response, config: AppConfig): void {
  res.clearCookie(config.cookie.name, baseOptions(config));
}
