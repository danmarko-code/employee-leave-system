import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LIMITS, type AdminUserDto, type LeaveApplicationDto, type Page, type Role } from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { Card, Notice, SectionTitle, Skeleton, StatusPill } from '@/components/Surface';
import { RequireRole } from '@/components/RequireRole';
import { TextField } from '@/components/TextField';
import { ApiError, apiFetch } from '@/lib/api';
import {
  daysLabel,
  formatDateRange,
  formatDateTime,
  roleLabel,
} from '@/lib/format';
import { sessionErrorMessage, useSession } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

export default function AdminUserEditScreen() {
  return (
    <RequireRole role="admin">
      <UserEditor />
    </RequireRole>
  );
}

function UserEditor() {
  const router = useRouter();
  const { user: actingAdmin } = useSession();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);

  const [account, setAccount] = useState<AdminUserDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setAccount(null);
    setError(null);
    if (!Number.isInteger(id) || id <= 0) {
      setError('That account does not exist.');
      return;
    }
    let cancelled = false;
    apiFetch<{ user: AdminUserDto }>(`/admin/users/${id}`)
      .then((result) => {
        if (!cancelled) setAccount(result.user);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof ApiError && loadError.status === 404
            ? 'We could not find that account.'
            : sessionErrorMessage(loadError)
        );
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const isSelf = actingAdmin?.id === id;

  return (
    <Screen>
      <PageHeader
        title="Edit account"
        subtitle={account ? account.email : 'Load the account to edit it.'}
        action={<Button label="Back" variant="ghost" size="sm" icon="chevron-back" onPress={() => router.back()} />}
      />

      {error ? (
        <Card style={styles.errorCard}>
          <Notice tone="error">{error}</Notice>
          <View style={styles.errorActions}>
            <Button label="Try again" variant="secondary" size="sm" onPress={() => setAttempt((n) => n + 1)} />
            <Button label="All employees" variant="ghost" size="sm" onPress={() => router.replace('/admin/users')} />
          </View>
        </Card>
      ) : null}

      {account === null && !error ? (
        <Card style={styles.formCard}>
          <Skeleton height={16} width="35%" />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </Card>
      ) : account ? (
        <>
          <ProfileCard account={account} onSaved={setAccount} isSelf={isSelf} />
          <PasswordCard account={account} />
          <LeaveHistoryCard accountId={account.id} />
        </>
      ) : null}
    </Screen>
  );
}

function ProfileCard({
  account,
  onSaved,
  isSelf,
}: {
  account: AdminUserDto;
  onSaved: (next: AdminUserDto) => void;
  isSelf: boolean;
}) {
  const [name, setName] = useState(account.name);
  const [position, setPosition] = useState(account.position);
  const [department, setDepartment] = useState(account.department);
  const [phone, setPhone] = useState(account.phone ?? '');
  const [role, setRole] = useState<Role>(account.role);
  const [isActive, setIsActive] = useState(account.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dirty =
    name.trim() !== account.name ||
    position.trim() !== account.position ||
    department.trim() !== account.department ||
    (phone.trim() || null) !== (account.phone ?? null) ||
    role !== account.role ||
    isActive !== account.isActive;

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const { user } = await apiFetch<{ user: AdminUserDto }>(`/admin/users/${account.id}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          position: position.trim(),
          department: department.trim(),
          phone: phone.trim() ? phone.trim() : null,
          role,
          isActive,
        },
      });
      onSaved(user);
      setSavedAt(new Date().toISOString());
    } catch (saveError) {
      setError(sessionErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.formCard}>
      <SectionTitle
        title="Profile"
        detail={
          account.role === 'admin'
            ? 'Administrator accounts have full access to every screen here.'
            : 'Employees sign in to their own requests only.'
        }
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {savedAt ? <Notice tone="success">Saved.</Notice> : null}

      <View style={styles.row}>
        <View style={styles.field}>
          <TextField
            label="Full name"
            value={name}
            onChangeText={setName}
            editable={!saving}
            maxLength={LIMITS.name}
          />
        </View>
        <View style={styles.field}>
          <TextField
            label="Work email"
            value={account.email}
            editable={false}
            accessibilityHint="Email is the account identity and cannot be changed"
          />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.field}>
          <TextField
            label="Position"
            value={position}
            onChangeText={setPosition}
            editable={!saving}
            maxLength={100}
          />
        </View>
        <View style={styles.field}>
          <TextField
            label="Department"
            value={department}
            onChangeText={setDepartment}
            editable={!saving}
            maxLength={100}
          />
        </View>
        <View style={styles.field}>
          <TextField
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            editable={!saving}
            keyboardType="phone-pad"
            maxLength={LIMITS.phone}
          />
        </View>
      </View>

      <SectionTitle title="Role" />
      {isSelf ? (
        <AppText variant="small" tone="muted">
          You cannot change your own role or deactivate yourself. Ask another administrator.
        </AppText>
      ) : null}
      <View style={styles.roleRow}>
        {(['employee', 'admin'] as const).map((option) => {
          const selected = role === option;
          return (
            <Pressable
              key={option}
              onPress={() => !isSelf && setRole(option)}
              disabled={isSelf || saving}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: isSelf || saving }}
              accessibilityLabel={roleLabel(option)}
              style={({ pressed }) => [
                styles.roleCard,
                selected && styles.roleCardSelected,
                pressed && !selected && !isSelf && styles.roleCardPressed,
                (isSelf || saving) && styles.roleCardDisabled,
              ]}
            >
              <AppText
                variant="body"
                style={{ fontFamily: fonts.medium, color: selected ? colors.brandInk : colors.ink }}
              >
                {roleLabel(option)}
              </AppText>
              <AppText variant="small" tone="muted">
                {option === 'employee' ? 'Applies for leave only.' : 'Full access, including approvals and reports.'}
              </AppText>
            </Pressable>
          );
        })}
        <View style={styles.toggleBlock}>
          <AppText variant="label" tone="muted">
            Account active
          </AppText>
          <View style={styles.toggleRow}>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              disabled={isSelf || saving}
              trackColor={{ false: colors.borderStrong, true: colors.brand }}
              thumbColor={colors.surface}
              accessibilityLabel="Account active"
            />
            <AppText variant="small" tone={isActive ? 'default' : 'muted'}>
              {isActive ? 'Can sign in' : 'Cannot sign in; access tokens are revoked on save'}
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.saveRow}>
        <Button
          label="Save changes"
          icon="checkmark"
          onPress={() => void save()}
          loading={saving}
          disabled={!dirty}
        />
      </View>
    </Card>
  );
}

function PasswordCard({ account }: { account: AdminUserDto }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length > 0 && confirm === password && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      await apiFetch<undefined>(`/admin/users/${account.id}/reset-password`, {
        method: 'POST',
        body: { password },
      });
      setPassword('');
      setConfirm('');
      setDone(true);
    } catch (resetError) {
      setError(sessionErrorMessage(resetError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.formCard}>
      <SectionTitle
        title="Reset password"
        detail="Sets a new password directly. The person's sessions end and the old password stops working."
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="success">Password updated. Share it over a private channel.</Notice> : null}
      <View style={styles.row}>
        <View style={styles.field}>
          <TextField
            label="New password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters, with a letter and a number"
            secure
            autoComplete="new-password"
            editable={!saving}
            maxLength={LIMITS.passwordMax}
          />
        </View>
        <View style={styles.field}>
          <TextField
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            secure
            editable={!saving}
            error={mismatch ? 'Passwords do not match.' : null}
            maxLength={LIMITS.passwordMax}
          />
        </View>
      </View>
      <View style={styles.saveRow}>
        <Button
          label="Set password"
          icon="key-outline"
          variant="secondary"
          onPress={() => void submit()}
          loading={saving}
          disabled={!canSubmit}
        />
      </View>
    </Card>
  );
}

function LeaveHistoryCard({ accountId }: { accountId: number }) {
  const router = useRouter();
  const [history, setHistory] = useState<LeaveApplicationDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Page<LeaveApplicationDto>>(`/admin/leaves?userId=${accountId}&pageSize=5`)
      .then((result) => {
        if (!cancelled) setHistory(result.items);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(sessionErrorMessage(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return (
    <Card style={styles.formCard}>
      <SectionTitle title="Leave history" detail="The five most recent applications from this account." />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {history === null && !error ? (
        <View style={styles.historySkeleton}>
          {[0, 1].map((key) => (
            <Skeleton key={key} height={16} width={key === 0 ? '70%' : '55%'} />
          ))}
        </View>
      ) : history && history.length > 0 ? (
        history.map((application) => (
          <Pressable
            key={application.id}
            onPress={() => router.push(`/requests/${application.id}`)}
            accessibilityRole="button"
            accessibilityHint="Opens the application"
            accessibilityLabel={`${application.leaveTypeName}, ${application.status}`}
            style={({ pressed }) => [styles.historyRow, pressed && styles.historyRowPressed]}
          >
            <View style={styles.historyText}>
              <AppText variant="body" style={{ fontFamily: fonts.medium }} numberOfLines={1}>
                {application.leaveTypeName}
              </AppText>
              <AppText variant="small" tone="muted">
                {formatDateRange(application.startDate, application.endDate)} ·{' '}
                {daysLabel(application.workingDays)} · filed {formatDateTime(application.createdAt)}
              </AppText>
            </View>
            <StatusPill status={application.status} />
            <Ionicons name="chevron-forward" size={16} color={colors.faint} />
          </Pressable>
        ))
      ) : history ? (
        <AppText variant="small" tone="faint">
          No leave applications yet.
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  errorCard: {
    gap: space.md,
    alignItems: 'flex-start',
    maxWidth: 860,
  },
  errorActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  formCard: {
    gap: space.md,
    maxWidth: 860,
  },
  row: {
    flexDirection: 'row',
    gap: space.md,
    flexWrap: 'wrap',
  },
  field: {
    flex: 1,
    minWidth: 220,
  },
  roleRow: {
    flexDirection: 'row',
    gap: space.md,
    flexWrap: 'wrap',
  },
  roleCard: {
    flex: 1,
    minWidth: 220,
    gap: space.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.control,
    padding: space.lg,
  },
  roleCardSelected: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  roleCardPressed: {
    backgroundColor: colors.surface,
  },
  roleCardDisabled: {
    opacity: 0.6,
  },
  toggleBlock: {
    flex: 1,
    minWidth: 220,
    gap: space.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  saveRow: {
    flexDirection: 'row',
  },
  historySkeleton: {
    gap: space.md,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyRowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  historyText: {
    flex: 1,
    gap: 2,
    flexShrink: 1,
  },
});
