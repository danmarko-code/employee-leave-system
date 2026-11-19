import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { AppText } from './Text';
import { Avatar } from './Surface';
import { BrandMark } from './Brand';
import { brand, colors, fonts, layout, radius, space } from '@/theme/tokens';
import { formatDateTime, roleLabel } from '@/lib/format';
import { navItemsFor, type NavItem } from '@/lib/navigation';
import { useSession } from '@/lib/session';

export function AppShell({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= layout.wideBreakpoint;

  return wide ? (
    <View style={styles.wideRoot}>
      <Sidebar />
      <View style={styles.wideContent}>{children}</View>
    </View>
  ) : (
    <View style={styles.narrowRoot}>
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.topBrand}>
          <BrandMark size={28} />
          <AppText variant="label" strong>
            {brand.name}
          </AppText>
        </View>
        <MobileProfileButton />
      </View>
      <View style={styles.narrowContent}>{children}</View>
      <BottomBar bottomInset={insets.bottom} />
    </View>
  );
}

function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, sessionExpiresAt, signOut } = useSession();
  if (!user) return null;

  const items = navItemsFor(user.role);

  return (
    <View style={styles.sidebar}>
      <View style={styles.brandRow}>
        <BrandMark />
        <View style={styles.brandText}>
          <AppText variant="lead" style={{ color: colors.onDark, fontFamily: fonts.semibold }}>
            {brand.name}
          </AppText>
          <AppText variant="micro" style={{ color: colors.onDarkMuted }}>
            {brand.tagline}
          </AppText>
        </View>
      </View>

      <View style={styles.nav}>
        {items.map((item) => (
          <SidebarItem
            key={item.href}
            item={item}
            active={pathname === item.href}
            onPress={() => router.push(item.href)}
          />
        ))}
      </View>

      <View style={styles.sideFooter}>
        <View style={styles.userRow}>
          <Avatar name={user.name} tone="dark" />
          <View style={styles.userText}>
            <AppText variant="small" style={{ color: colors.onDark, fontFamily: fonts.medium }} numberOfLines={1}>
              {user.name}
            </AppText>
            <AppText variant="micro" style={{ color: colors.onDarkMuted }} numberOfLines={1}>
              {roleLabel(user.role)}
            </AppText>
          </View>
          <Pressable
            onPress={() => void signOut()}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            hitSlop={8}
            style={({ pressed }) => [
              styles.signOut,
              pressed && { backgroundColor: 'rgba(255,255,255,0.10)' },
              Platform.OS === 'web' ? ({ cursor: 'pointer', outlineStyle: 'none' } as unknown as ViewStyle) : null,
            ]}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.onDarkMuted} />
          </Pressable>
        </View>
        {sessionExpiresAt ? (
          <AppText variant="micro" style={{ color: colors.onDarkMuted }}>
            Session ends {formatDateTime(sessionExpiresAt)}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function SidebarItem({ item, active, onPress }: { item: NavItem; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.navItem,
        active && styles.navItemActive,
        pressed && !active && { backgroundColor: 'rgba(255,255,255,0.06)' },
        Platform.OS === 'web' ? ({ cursor: 'pointer', outlineStyle: 'none' } as unknown as ViewStyle) : null,
      ]}
    >
      {active ? <View style={styles.activeBar} /> : null}
      <Ionicons
        name={active ? item.activeIcon : item.icon}
        size={19}
        color={active ? colors.onDark : colors.onDarkMuted}
      />
      <AppText
        variant="small"
        style={{
          color: active ? colors.onDark : colors.onDarkMuted,
          fontFamily: active ? fonts.medium : fonts.regular,
        }}
      >
        {item.label}
      </AppText>
    </Pressable>
  );
}

function MobileProfileButton() {
  const router = useRouter();
  const { user } = useSession();
  if (!user) return null;
  return (
    <Pressable
      onPress={() => router.push('/profile')}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      style={({ pressed }) => [
        pressed && { opacity: 0.7 },
        Platform.OS === 'web' ? ({ cursor: 'pointer', outlineStyle: 'none' } as unknown as ViewStyle) : null,
      ]}
    >
      <Avatar name={user.name} size="sm" />
    </Pressable>
  );
}

function BottomBar({ bottomInset }: { bottomInset: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  if (!user) return null;

  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(bottomInset, space.sm) }]}>
      {navItemsFor(user.role).map((item) => {
        const active = pathname === item.href;
        return (
          <Pressable
            key={item.href}
            onPress={() => router.push(item.href)}
            accessibilityRole="link"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.bottomItem,
              pressed && { opacity: 0.7 },
              Platform.OS === 'web' ? ({ cursor: 'pointer', outlineStyle: 'none' } as unknown as ViewStyle) : null,
            ]}
          >
            <Ionicons
              name={active ? item.activeIcon : item.icon}
              size={22}
              color={active ? colors.brand : colors.faint}
            />
            <AppText
              variant="micro"
              style={{ color: active ? colors.brandInk : colors.muted, fontFamily: active ? fonts.medium : fonts.regular }}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wideRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.canvas,
  },
  wideContent: {
    flex: 1,
    minHeight: 0,
  },
  narrowRoot: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  narrowContent: {
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    width: layout.sidebarWidth,
    backgroundColor: colors.sidebar,
    paddingHorizontal: space.md,
    paddingTop: space.xxl,
    paddingBottom: space.xxl,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.sm,
    paddingBottom: space.xxl,
  },
  brandText: {
    gap: 1,
    flexShrink: 1,
  },
  nav: {
    gap: space.xxs + 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 42,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
  },
  navItemActive: {
    backgroundColor: colors.sidebarActive,
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 11,
    bottom: 11,
    width: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  sideFooter: {
    marginTop: 'auto',
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.09)',
    gap: space.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  userText: {
    flex: 1,
    gap: 1,
  },
  signOut: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 88,
    minHeight: 48,
  },
});
