import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LIMITS } from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { ProfilePhotoCard } from '@/components/ProfilePhotoCard';
import { Card, KeyValue, Notice, SectionTitle } from '@/components/Surface';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api';
import { formatDateTime, roleLabel } from '@/lib/format';
import { sessionErrorMessage, useSession } from '@/lib/session';
import { colors, space } from '@/theme/tokens';

export default function ProfileScreen() {
  const { user, sessionExpiresAt, savePhone, signOut, signingOut } = useSession();
  if (!user) return null;

  return (
    <Screen>
      <PageHeader title="Profile" subtitle="Your account details and current session." />

      <ProfilePhotoCard user={user} />

      <View style={styles.columns}>
        <Card style={styles.column}>
          <View style={styles.details}>
            <KeyValue label="Role" value={roleLabel(user.role)} />
            <KeyValue label="Email" value={user.email} />
            <KeyValue label="Position" value={user.position || 'Not set'} />
            <KeyValue label="Department" value={user.department || 'Not set'} />
          </View>
        </Card>

        <PhoneCard initialPhone={user.phone} onSave={savePhone} />
      </View>

      <Card style={styles.sessionCard}>
        <SectionTitle title="Session" detail="30 minutes idle, 12 hours absolute." />

        <View style={styles.sessionGrid}>
          <KeyValue label="Signed in as" value={user.email} />
          <KeyValue
            label="This session ends"
            value={sessionExpiresAt ? formatDateTime(sessionExpiresAt) : 'When the server session expires'}
          />
        </View>

        <AppText variant="small" tone="muted">
          Signing out revokes this session on the server and removes the saved token from this device.
          Passwords are reset by an administrator.
        </AppText>

        <View style={styles.sessionActions}>
          <Button
            label="Sign out"
            variant="danger"
            icon="log-out-outline"
            loading={signingOut}
            onPress={() => void signOut()}
          />
        </View>
      </Card>
    </Screen>
  );
}

function PhoneCard({
  initialPhone,
  onSave,
}: {
  initialPhone: string | null;
  onSave: (phone: string | null) => Promise<unknown>;
}) {
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPhone(initialPhone ?? '');
  }, [initialPhone]);

  const submit = async () => {
    if (saving) return;
    const trimmed = phone.trim();
    if (trimmed !== '' && (trimmed.length < 7 || !/^[0-9+()\-.\s]+$/.test(trimmed))) {
      setError('Use digits, spaces and + ( ) - . only, with at least 7 characters.');
      setSaved(false);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(trimmed === '' ? null : trimmed);
      setSaved(true);
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.fields.phone) {
        setError(saveError.fields.phone);
      } else {
        setError(sessionErrorMessage(saveError));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.column}>
      <SectionTitle title="Contact" detail="Shown to you and to administrators." />

      {saved ? <Notice tone="success">Phone number saved.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <TextField
        label="Phone number"
        value={phone}
        onChangeText={(value) => {
          setPhone(value);
          setError(null);
          setSaved(false);
        }}
        placeholder="+63 917 000 0000"
        error={null}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        editable={!saving}
        returnKeyType="done"
        maxLength={LIMITS.phone}
        onSubmitEditing={() => void submit()}
      />

      <View style={styles.saveRow}>
        <Button
          label="Save phone"
          variant="secondary"
          size="sm"
          loading={saving}
          onPress={() => void submit()}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  columns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.lg,
    alignItems: 'flex-start',
  },
  column: {
    flexGrow: 1,
    flexBasis: 320,
    gap: space.lg,
  },
  details: {
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.lg,
  },
  sessionCard: {
    gap: space.lg,
  },
  sessionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xxl,
  },
  sessionActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  saveRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
});
