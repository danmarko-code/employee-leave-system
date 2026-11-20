import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type TextInputInstance,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { LIMITS } from '@leave/shared';
import { AppText } from '@/components/Text';
import { BrandMark } from '@/components/Brand';
import { Button } from '@/components/Button';
import { Card, Notice } from '@/components/Surface';
import { TextField } from '@/components/TextField';
import { BootScreen } from '@/components/BootScreen';
import { ApiError } from '@/lib/api';
import { sessionErrorMessage, useSession } from '@/lib/session';
import { brand, colors, fonts, space } from '@/theme/tokens';

export default function SignInScreen() {
  const { status, restoreError } = useSession();

  if (status === 'restoring') return <BootScreen />;
  if (status === 'signedIn') return <Redirect href="/home" />;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <View style={styles.brandRow}>
            <BrandMark size={32} />
            <AppText variant="title" style={styles.brandName}>
              {brand.name}
            </AppText>
          </View>

          <Card style={styles.card}>
            <SignInForm restoreError={restoreError} />
          </Card>

          <AppText variant="small" tone="faint" style={styles.foot}>
            Accounts are managed by an administrator.
          </AppText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SignInForm({ restoreError }: { restoreError: string | null }) {
  const { signIn } = useSession();
  const router = useRouter();
  const passwordRef = useRef<TextInputInstance>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;

    const nextErrors: { email?: string; password?: string } = {};
    if (email.trim() === '') nextErrors.email = 'Enter your email address.';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (password === '') nextErrors.password = 'Enter your password.';

    setFieldErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await signIn(email, password);
      setPassword('');
      router.replace('/home');
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setFieldErrors({ email: error.fields.email, password: error.fields.password });
      } else {
        setFormError(sessionErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.form}>
      <AppText variant="title">Sign in</AppText>

      {restoreError ? <Notice tone="info">{restoreError}</Notice> : null}
      {formError ? <Notice tone="error">{formError}</Notice> : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
        }}
        placeholder="you@example.com"
        error={fieldErrors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        returnKeyType="next"
        maxLength={LIMITS.email}
        editable={!submitting}
        onSubmitEditing={() => passwordRef.current?.focus()}
      />

      <TextField
        label="Password"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
        }}
        placeholder="Your password"
        error={fieldErrors.password}
        secure
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        maxLength={LIMITS.passwordMax}
        editable={!submitting}
        inputRef={passwordRef}
        onSubmitEditing={() => void submit()}
      />

      <Button label="Sign in" onPress={() => void submit()} loading={submitting} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  column: {
    width: '100%',
    maxWidth: 400,
    gap: space.lg,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.xxs,
  },
  brandName: {
    color: colors.ink,
    fontFamily: fonts.semibold,
  },
  card: {
    padding: space.xl,
  },
  form: {
    gap: space.lg,
  },
  foot: {
    textAlign: 'center',
  },
});
