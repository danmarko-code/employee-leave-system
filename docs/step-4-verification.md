# Step 4 verification: Expo client shell, auth flows, responsive layout

Scope: the first slice of the client. The API from steps 2-3 is consumed
end-to-end by a real Expo app for the first time. Steps 5-6 will add the
remaining screens on top of this shell.

Verified with `tsc --noEmit` clean, `expo export` succeeding for web and
Android bundles, and Playwright (Chromium/Edge) driving the running app against
the live API. The 73 server tests still pass; `npm run check:sql` passes;
`npm audit` reports **0 vulnerabilities**.

## What was built

- `app/` workspace added to the monorepo (`@leave/app`), Expo SDK 58,
  Expo Router, `react-native-web` for the browser target.
- Design tokens in `app/src/theme/tokens.ts`: one colour system (lagoon teal
  brand, sun accent used sparingly, ink/canvas neutrals leaning teal), one type
  scale, 4-space scale, three radii, three elevations, two motion durations.
  Components read tokens only.
- `app/src/lib/api.ts` — typed fetch wrapper. Web sends
  `X-Client: web` + `X-Requested-With` and `credentials: 'include'` (httpOnly
  cookie flow); native sends `X-Client: native` and the `Authorization`
  header. 401 on a data route triggers one refresh, then signs out.
- `app/src/lib/session.tsx` — session provider. Native refresh token lives in
  SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); web never touches storage.
  Restore-on-start, refresh handler, auth-lost handler, `signIn`/`signOut`,
  `savePhone` for the profile screen.
- `app/src/lib/navigation.ts` — single source for the nav items, keyed by role.
- Shell (`app/src/components/AppShell.tsx`): ≥920 px gets the dark sidebar
  (brand, role-scoped nav, avatar, role label, session expiry, sign out);
  below that a top bar + bottom tab bar. Same routes, no duplicated logic.
- Screens:
  - `/sign-in` — split brand panel on wide, stacked on narrow. Inline
    validation, generic errors from the server, show/hide password, no
    forgot-password link (spec forbids it), no demo hints, no sample accounts.
  - `/home` — employee: greeting, date, per-type balance cards (approved +
    pending already set aside), three latest requests. Admin: dashboard stat
    tiles, latest pending list. Loading skeletons, empty states, error card
    with retry.
  - `/profile` — identity card, editable phone (validated client- and
    server-side), session details, sign out.
  - `/` redirects by session state; `+not-found` for unknown routes;
    `(app)/_layout` guards everything behind the session.

## Security checklist for the client

| Control | Status | Evidence |
| --- | --- | --- |
| Nothing personal shown before sign-in | Implemented and verified | Login screen has brand + form only; `/` redirects; unauthenticated API calls 401 |
| Web refresh token never readable by JS | Implemented and verified | httpOnly cookie; client stores no token in web storage |
| Native token not in plaintext storage | Implemented and verified | SecureStore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` |
| Failed refresh clears the session | Implemented and verified | Wrong password + stale token paths tested via API; UI returns to sign-in |
| CSRF headers on web auth calls | Implemented and verified | `X-Requested-With` + `X-Client` set on every request; server rejects without them |
| Role-appropriate nav | Implemented and verified | Employee sees Home/Profile; admin sees Overview/Profile; server still enforces 403 |
| Errors shown without leaking internals | Implemented and verified | Generic copy; server message only when it is already user-facing |
| No secrets, passwords or tokens logged | Implemented and verified | Grep of `app/src` for token/password logging: none |

## Playwright run (Edge/Chromium, live API + Metro)

- Sign-in wrong password → generic inline error, no field leak.
- Empty submit → inline validation, no request sent.
- Employee sign-in → balance cards + recent requests render.
- Profile → save phone, session details, sign out.
- Reload after sign-in → session restored from the httpOnly cookie (web).
- Two tabs restoring simultaneously → both survive (Web Locks serialises the
  refresh, so the rotation never looks like token reuse).
- Sign out in one tab → other tab signed out too (BroadcastChannel).
- Admin sign-in → dashboard tiles + pending list render.

One real bug found and fixed during this run: the web flow originally sent the
Authorization header only on native; the server accepts either flow, so web
data routes 401'd until the header was sent. Fixed in `api.ts`.

## Open risks and limitations

1. **No automated client test suite yet.** Playwright was run manually against
   the dev server; step 7 will add it to the repo as a repeatable script.
2. **Native (iOS/Android) flows are compiled but not device-tested here.**
   SecureStore, deep links and the native refresh path need a device run.
3. **Session expiry is server-enforced only.** The sidebar shows the expiry
   timestamp; there is no client countdown that force-logs-out at 0.
4. **The app has no offline mode.** Network failure shows a generic message.
5. **Web export is single-page.** Deep links reload the SPA; that is the
   Expo Router default, fine for this scope.
6. **No e2e for document upload yet** (the file picker is step 5).

## Spec conflicts, restated

- No forgot-password link on the sign-in screen (spec forbids the flow).
- No manager role in the nav (spec has employee and admin only).

## What step 4 deliberately does not include

- Leave application form, request list/detail, document picker (step 5).
- Admin decision queue, user management, leave-type management, reports
  (step 6).
- Push notifications, email, biometric unlock.
