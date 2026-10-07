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
import { colors, radii } from '../constants/theme'

type Props = {
  // The address being verified. The popup is hidden while this is null.
  email: string | null
  // Send a fresh code as soon as the popup opens (used when a customer who
  // never verified tries to log in). After sign-up Supabase already sent one.
  sendOnOpen?: boolean
  onVerified: () => void
  onLater: () => void
}

const RESEND_SECONDS = 45

export function VerifyEmailModal({ email, sendOnOpen, onVerified, onLater }: Props) {
  const insets = useSafeAreaInsets()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (!email) return
    setCode('')
    setError('')
    setInfo('')
    setWait(RESEND_SECONDS)

    if (sendOnOpen) {
      postApi('/api/auth/resend-signup', { email })
        .then((result) => {
          if (!result.ok) setError(result.data.error || 'Unable to send the code.')
          else setInfo('We just sent a new verification code to your email.')
        })
        .catch(() => setError('Unable to reach the server. Check your connection.'))
    }
  }, [email, sendOnOpen])

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  async function verify() {
    const token = code.replace(/\s+/g, '')
    if (!email || token.length < 6) {
      setError('Enter the verification code from your email.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const result = await postApi('/api/auth/verify-signup', { email, code: token })
      setBusy(false)

      if (!result.ok) {
        setError(result.data.error || 'That code is wrong or has expired.')
        return
      }

      onVerified()
    } catch {
      setBusy(false)
      setError('Unable to reach the server. Check your connection and try again.')
    }
  }

  async function resend() {
    if (!email || wait > 0) return
    setError('')
    setInfo('')
    try {
      const result = await postApi('/api/auth/resend-signup', { email })
      if (!result.ok) {
        setError(result.data.error || 'Unable to send the code.')
        return
      }
      setInfo('A new verification code is on its way.')
      setWait(RESEND_SECONDS)
    } catch {
      setError('Unable to reach the server. Check your connection and try again.')
    }
  }

  return (
    <Modal visible={email !== null} transparent animationType="fade" onRequestClose={() => undefined}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 20 + insets.bottom, paddingTop: 20 + insets.top }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.icon}>
              <Ionicons name="mail-unread-outline" size={30} color={colors.accent} />
            </View>

            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.text}>
              We sent a verification code to <Text style={styles.email}>{email}</Text>. Open your email,
              enter the 6-digit code below. You must verify before you can log in.
            </Text>

            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 10))}
              placeholder="Verification code"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              style={styles.input}
            />

            {!!error && <Text style={styles.error}>{error}</Text>}
            {!!info && <Text style={styles.info}>{info}</Text>}

            <Pressable
              onPress={verify}
              disabled={busy}
              style={({ pressed }) => [styles.button, busy && styles.buttonDisabled, pressed && !busy && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Verify code</Text>
              )}
            </Pressable>

            <Pressable onPress={resend} disabled={wait > 0} style={styles.linkRow}>
              <Text style={[styles.link, wait > 0 && { color: colors.muted }]}>
                {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
              </Text>
            </Pressable>

            <Pressable onPress={onLater} style={styles.linkRow}>
              <Text style={styles.later}>I'll verify later</Text>
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
    backgroundColor: 'rgba(2, 8, 14, 0.9)',
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
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.accentDark,
  },
  title: {
    textAlign: 'center',
    fontSize: 22,
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
  email: {
    color: colors.text,
    fontWeight: '700',
  },
  input: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 6,
    fontWeight: '700',
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.cardLight,
    color: colors.text,
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
    minHeight: 50,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentDark,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
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
  later: {
    color: colors.muted,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})
