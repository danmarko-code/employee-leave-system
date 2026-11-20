export const ROLES = ['employee', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const CLIENT_TYPES = ['web', 'native'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

/**
 * Session timings shared by client and server.
 * The server is the enforcement point; the client mirrors them for UX.
 */
export const SESSION = {
  accessTokenSeconds: 15 * 60,
  idleTimeoutMs: 30 * 60 * 1000,
  absoluteLifetimeMs: 12 * 60 * 60 * 1000,
} as const;

export const LIMITS = {
  name: 100,
  email: 255,
  phone: 30,
  passwordMin: 8,
  passwordRecommended: 12,
  passwordMax: 128,
  reason: 500,
  remarks: 500,
  pageSizeMax: 100,
  uploadBytes: 1024 * 1024,
} as const;

export const ACTIVITY_ACTIONS = [
  'login_success',
  'login_failure',
  'logout',
  'session_reuse',
  'access_denied',
  'profile_update',
  'account_created',
  'account_updated',
  'account_activation_changed',
  'password_reset',
  'leave_submitted',
  'leave_approved',
  'leave_rejected',
  'leave_type_changed',
  'report_generated',
  'holiday_created',
  'holiday_deleted',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const BROWSER_CACHE_CONTROL = 'no-store';
