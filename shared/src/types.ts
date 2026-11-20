import type { ClientType, Role } from './constants';

/** The authenticated user as returned to the client. Never includes secrets. */
export interface UserDto {
  id: number;
  name: string;
  email: string;
  role: Role;
  position: string;
  department: string;
  phone: string | null;
}

export interface AuthResponse {
  user: UserDto;
  accessToken: string;
  expiresIn: number;
  sessionExpiresAt: string;
  /** Present only for X-Client: native. Never returned to web clients. */
  refreshToken?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    fields?: Record<string, string>;
  };
}

export interface ActivityLogItem {
  id: number;
  action: string;
  targetType: string | null;
  targetId: number | null;
  ipAddress: string | null;
  createdAt: string;
  actorName: string | null;
}

export interface ActivityLogPage {
  items: ActivityLogItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface HolidayDto {
  id: number;
  name: string;
  date: string;
  isActive: boolean;
}

export interface HolidayDto {
  id: number;
  name: string;
  date: string;
  isActive: boolean;
}

export type { ClientType, Role };
