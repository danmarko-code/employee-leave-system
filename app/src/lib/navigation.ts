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
    { href: '/profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
  ],
};

export function navItemsFor(role: Role): NavItem[] {
  return NAV_ITEMS[role];
}
