import type { Ionicons } from '@expo/vector-icons';
import type { Role } from '@leave/shared';

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}

/**
 * Every destination that has a screen. Steps 5 and 6 append their own entries
 * here, so both the sidebar and the bottom bar stay in one place.
 */
export const NAV_ITEMS: Record<Role, NavItem[]> = {
  employee: [
    { href: '/home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { href: '/requests', label: 'My Requests', icon: 'document-text-outline', activeIcon: 'document-text' },
    { href: '/profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
  ],
  admin: [
    { href: '/home', label: 'Overview', icon: 'grid-outline', activeIcon: 'grid' },
    { href: '/approvals', label: 'Applications', icon: 'file-tray-full-outline', activeIcon: 'file-tray-full' },
    { href: '/admin/users', label: 'Employees', icon: 'people-outline', activeIcon: 'people' },
    { href: '/admin/leave-types', label: 'Leave types', icon: 'layers-outline', activeIcon: 'layers' },
    { href: '/admin/reports', label: 'Reports', icon: 'bar-chart-outline', activeIcon: 'bar-chart' },
    { href: '/admin/activity', label: 'Activity', icon: 'pulse-outline', activeIcon: 'pulse' },
    { href: '/profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
  ],
};

/**
 * Narrow-screen bottom bar shows at most four destinations plus a "More" tab
 * for admins; the sidebar lists NAV_ITEMS in full. Employees fit entirely.
 */
export const BOTTOM_ITEMS: Record<Role, NavItem[]> = {
  employee: NAV_ITEMS.employee,
  admin: NAV_ITEMS.admin.filter((item) =>
    ['/home', '/approvals', '/admin/users', '/profile'].includes(item.href)
  ),
};

export function overflowItemsFor(role: Role): NavItem[] {
  const bottom = new Set(BOTTOM_ITEMS[role].map((item) => item.href));
  return NAV_ITEMS[role].filter((item) => !bottom.has(item.href));
}

export function navItemsFor(role: Role): NavItem[] {
  return NAV_ITEMS[role];
}
