import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import type { Role } from '@leave/shared';
import { useSession } from '@/lib/session';

/**
 * Route-level role guard. The API is the enforcement point (it returns 403);
 * this keeps non-admins from ever seeing admin screens in a direct navigation
 * or pasted URL. The (app) layout has already resolved the session.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useSession();

  if (!user) return null;
  if (user.role !== role) return <Redirect href="/home" />;
  return <>{children}</>;
}
