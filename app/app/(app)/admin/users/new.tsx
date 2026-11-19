import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LIMITS, type Role } from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { Card, Notice, SectionTitle } from '@/components/Surface';
import { RequireRole } from '@/components/RequireRole';
import { TextField } from '@/components/TextField';
import { ApiError, apiFetch } from '@/lib/api';
import { sessionErrorMessage } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

export default function AdminUserNewScreen() {
  return (
    <RequireRole role="admin">
      <CreateUserForm />
    </RequireRole>
  );
}

const ROLE_OPTIONS: Array<{ role: Role; label: string; hint: string }> = [
  { role: 'employee', label: 'Employee', hint: 'Applies for leave and sees their own requests.' },
  { role: 'admin', label: 'Administrator', hint: 'Reviews applications and manages accounts, leave types and reports.' },
];

function CreateUserForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 && email.trim().length > 0 && password.length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { user } = await apiFetch<{ user: { id: number } }>('/admin/users', {
        method: 'POST',
        body: {
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          position: position.trim() || undefined,
          department: department.trim() || undefined,
          phone: phone.trim() ? phone.trim() : undefined,
          isActive: true,
        },
      });
      router.replace(`/admin/users/${user.id}`);
    } catch (signupError) {
      if (signupError instanceof ApiError && signupError.fields) {
        const first = Object.values(signupError.fields)[0];
        setError(first ?? signupError.message);
      } else {
        setError(sessionErrorMessage(signupError));
      }
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <PageHeader
        title="Add employee"
        subtitle="Create an account. There is no self-sign-up, so accounts start here."
        action={<Button label="Back" variant="ghost" size="sm" icon="chevron-back" onPress={() => router.back()} />}
      />

      <Card style={styles.formCard}>
        <SectionTitle title="Account" />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <View style={styles.row}>
          <View style={styles.field}>
            <TextField
              label="Full name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Maria Santos"
              autoComplete="name"
              autoCapitalize="words"
              editable={!submitting}
              maxLength={LIMITS.name}
            />
          </View>
          <View style={styles.field}>
            <TextField
              label="Work email"
              value={email}
              onChangeText={setEmail}
              placeholder="name@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              editable={!submitting}
              maxLength={LIMITS.email}
            />
          </View>
        </View>

        <TextField
          label="Temporary password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters, with a letter and a number"
          secure
          autoComplete="new-password"
          editable={!submitting}
          maxLength={LIMITS.passwordMax}
        />
        <AppText variant="small" tone="muted">
          The policy asks for at least {LIMITS.passwordMin} characters with a letter and a number —
          more is better. Share it over a private channel; it is not shown again after this page.
        </AppText>
      </Card>

      <Card style={styles.formCard}>
        <SectionTitle title="Role" />
        <View style={styles.roleRow}>
          {ROLE_OPTIONS.map(({ role: option, label, hint }) => {
            const selected = role === option;
            return (
              <Pressable
                key={option}
                onPress={() => setRole(option)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={label}
                style={({ pressed }) => [
                  styles.roleCard,
                  selected && styles.roleCardSelected,
                  pressed && !selected && styles.roleCardPressed,
                ]}
              >
                <AppText
                  variant="body"
                  style={{ fontFamily: fonts.medium, color: selected ? colors.brandInk : colors.ink }}
                >
                  {label}
                </AppText>
                <AppText variant="small" tone="muted">
                  {hint}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={styles.formCard}>
        <SectionTitle title="Position and contact" detail="Optional — used on lists and the applicant's own profile." />
        <View style={styles.row}>
          <View style={styles.field}>
            <TextField
              label="Position"
              value={position}
              onChangeText={setPosition}
              placeholder="e.g. Analyst"
              editable={!submitting}
              maxLength={100}
            />
          </View>
          <View style={styles.field}>
            <TextField
              label="Department"
              value={department}
              onChangeText={setDepartment}
              placeholder="e.g. Finance"
              editable={!submitting}
              maxLength={100}
            />
          </View>
        </View>
        <TextField
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="+63 917 000 0000"
          keyboardType="phone-pad"
          editable={!submitting}
          maxLength={LIMITS.phone}
        />
      </Card>

      <View style={styles.submitRow}>
        <Button
          label="Create account"
          icon="checkmark"
          loading={submitting}
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    minWidth: 240,
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
  submitRow: {
    flexDirection: 'row',
  },
});
