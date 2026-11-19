import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
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
import { brand, colors, fonts, layout, radius, space } from '@/theme/tokens';

export default function SignInScreen() {
  const { status, restoreError } = useSession();
  const { width } = useWindowDimensions();

  if (status === 'restoring') return <BootScreen />;
  if (status === 'signedIn') return <Redirect href="/home" />;

  const wide = width >= layout.wideBreakpoint;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {wide ? (
        <View style={styles.wideRow}>
          <BrandPanel />
          <ScrollView contentContainerStyle={styles.formPanel} keyboardShouldPersistTaps="handled">
            <View style={styles.formColumn}>
              <SignInForm restoreError={restoreError} />
            </View>
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.narrowContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.narrowBrand}>
            <View style={styles.brandRow}>
              <BrandMark size={30} />
              <AppText variant="lead" style={styles.brandName}>
                {brand.name}
              </AppText>
            </View>
            <AppText variant="small" style={styles.brandTagline}>
              {brand.tagline}
            </AppText>
          </View>
          <Card style={styles.narrowCard}>
            <SignInForm restoreError={restoreError} />
          </Card>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function BrandPanel() {
  return (
    <View style={styles.panel}>
      <View style={styles.brandRow}>
        <BrandMark size={34} />
        <View>
          <AppText variant="lead" style={styles.brandName}>
            {brand.name}
          </AppText>
          <AppText variant="micro" style={styles.brandMuted}>
            {brand.tagline}
          </AppText>
        </View>
      </View>

      <View style={styles.panelMiddle}>
        <AppText variant="display" style={styles.panelHeadline}>
          Requests, approvals and balances in one place.
        </AppText>
        <AppText variant="body" style={styles.brandMuted}>
          Sign in with the account your administrator created for you.
        </AppText>
      </View>

      <AppText variant="micro" style={styles.brandMuted}>
        Internal use · Employee and administrator accounts
      </AppText>
    </View>
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
      <View style={styles.formHeading}>
        <AppText variant="heading">Sign in</AppText>
        <AppText variant="body" tone="muted">
          Use your work email and password.
        </AppText>
      </View>

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

      <AppText variant="small" tone="faint" style={styles.formFoot}>
        Accounts are created and passwords reset by an administrator.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  wideRow: {
    flex: 1,
    flexDirection: 'row',
  },
  panel: {
    flex: 0.95,
    maxWidth: 560,
    backgroundColor: colors.sidebar,
    padding: space.giant,
    justifyContent: 'space-between',
    gap: space.xxxl,
  },
  panelMiddle: {
    gap: space.lg,
    maxWidth: 420,
  },
  panelHeadline: {
    color: colors.onDark,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  brandName: {
    color: colors.onDark,
    fontFamily: fonts.semibold,
  },
  brandTagline: {
    color: colors.onDarkMuted,
  },
  brandMuted: {
    color: colors.onDarkMuted,
  },
  formPanel: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxxl,
  },
  formColumn: {
    width: '100%',
    maxWidth: 380,
  },
  form: {
    gap: space.lg,
  },
  formHeading: {
    gap: space.xs,
    marginBottom: space.xs,
  },
  formFoot: {
    textAlign: 'center',
  },
  narrowContent: {
    flexGrow: 1,
    paddingBottom: space.xxxl,
  },
  narrowBrand: {
    backgroundColor: colors.sidebar,
    paddingHorizontal: space.xl,
    paddingTop: space.huge,
    paddingBottom: space.xxxl,
    gap: space.xs,
  },
  narrowCard: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
    borderRadius: radius.card,
    padding: space.xl,
  },
});
