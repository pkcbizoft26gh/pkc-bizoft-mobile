import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { postApi } from '../lib/api'
import { passwordWarning } from '@/lib/passwordStrength'
import { colors, radii } from '../constants/theme'

type Props = {
  visible: boolean
  initialEmail?: string
  onClose: () => void
  onDone: (email: string) => void
}

const RESEND_SECONDS = 45

// Two steps: ask for the email (a 6-digit code is sent from our server), then
// enter the code with a new password.
export function ForgotPasswordModal({ visible, initialEmail, onClose, onDone }: Props) {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (!visible) return
    setStep('email')
    setEmail((initialEmail || '').trim())
    setCode('')
    setPassword('')
    setConfirm('')
    setError('')
    setInfo('')
    setWait(0)
  }, [visible, initialEmail])

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  async function sendCode() {
    const clean = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setError('Enter the email address of your account.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const result = await postApi('/api/auth/forgot-password', { email: clean })
      setBusy(false)
      if (!result.ok) {
        setError(result.data.error || 'Unable to send the code.')
        return
      }
      setEmail(clean)
      setInfo('If that email has an account, a 6-digit code is on its way.')
      setWait(RESEND_SECONDS)
      setStep('reset')
    } catch {
      setBusy(false)
      setError('Unable to reach the server. Check your connection and try again.')
    }
  }

  async function resend() {
    if (wait > 0) return
    setError('')
    setInfo('')
    try {
      const result = await postApi('/api/auth/forgot-password', { email })
      if (!result.ok) {
        setError(result.data.error || 'Unable to send the code.')
        return
      }
      setInfo('A new code is on its way.')
      setWait(RESEND_SECONDS)
    } catch {
      setError('Unable to reach the server. Check your connection and try again.')
    }
  }

  async function reset() {
    const token = code.replace(/\s+/g, '')
    if (token.length !== 6) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    if (password.length < 8) {
      setError('Your new password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const result = await postApi('/api/auth/reset-password', { email, code: token, password })
      setBusy(false)
      if (!result.ok) {
        setError(result.data.error || 'Unable to reset your password.')
        return
      }
      onDone(email)
    } catch {
      setBusy(false)
      setError('Unable to reach the server. Check your connection and try again.')
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: 20 + insets.top, paddingBottom: 20 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.icon}>
              <Ionicons name="key-outline" size={28} color={colors.accent} />
            </View>

            {step === 'email' ? (
              <>
                <Text style={styles.title}>Forgot password?</Text>
                <Text style={styles.text}>
                  Enter your account email. We will send a 6-digit code to reset your password.
                </Text>

                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor={colors.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </>
            ) : (
              <>
                <Text style={styles.title}>Reset your password</Text>
                <Text style={styles.text}>
                  Enter the code sent to <Text style={styles.strong}>{email}</Text> and choose a new password.
                </Text>

                <TextInput
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  style={[styles.input, styles.codeInput]}
                />

                <View style={styles.passwordRow}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="New password (8+ characters)"
                    placeholderTextColor={colors.muted}
                    secureTextEntry={!show}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.input, styles.passwordInput]}
                  />
                  <Pressable onPress={() => setShow((v) => !v)} style={styles.eye} hitSlop={8}>
                    <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
                  </Pressable>
                </View>

                {!!passwordWarning(password, email) && (
                  <Text style={{ color: '#FCD34D', fontSize: 11, lineHeight: 16, marginBottom: 8 }}>
                    ⚠ {passwordWarning(password, email)} You can still use it, but a harder one is safer.
                  </Text>
                )}

                <TextInput
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}
            {!!info && !error && <Text style={styles.info}>{info}</Text>}

            <Pressable
              onPress={step === 'email' ? sendCode : reset}
              disabled={busy}
              style={({ pressed }) => [styles.button, busy && styles.disabled, pressed && !busy && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator color="#00141B" size="small" />
              ) : (
                <Text style={styles.buttonText}>{step === 'email' ? 'Send code' : 'Reset password'}</Text>
              )}
            </Pressable>

            {step === 'reset' ? (
              <Pressable onPress={resend} disabled={wait > 0} style={styles.linkRow}>
                <Text style={[styles.link, wait > 0 && { color: colors.muted }]}>
                  {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
                </Text>
              </Pressable>
            ) : null}

            <Pressable onPress={onClose} style={styles.linkRow}>
              <Text style={styles.cancel}>Back to log in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 8, 14, 0.92)',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    padding: 24,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.panel,
  },
  icon: {
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.accentDark,
  },
  title: {
    textAlign: 'center',
    fontSize: 21,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  text: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    marginBottom: 16,
  },
  strong: {
    color: colors.text,
    fontWeight: '700',
  },
  input: {
    fontSize: 15,
    color: colors.text,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.cardLight,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 6,
    fontWeight: '700',
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 46,
  },
  eye: {
    position: 'absolute',
    right: 14,
    top: 14,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
  },
  info: {
    color: colors.success,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
  },
  button: {
    height: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#00141B',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  linkRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  link: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  cancel: {
    color: colors.muted,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})
