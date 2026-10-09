import React, { useState } from 'react'
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

import { supabase } from '@/lib/supabase'
import { API_BASE_URL } from '@/lib/api'
import { passwordWarning } from '@/lib/passwordStrength'
import { colors, radii } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'

// Tells the server the person has made their choice about the default password
// (changed it, or decided to keep it), which lifts the "must change" lock and
// the 24-hour expiry set when an admin created the account.
export async function clearDefaultPasswordFlag() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return false
  const response = await fetch(`${API_BASE_URL}/api/auth/password-changed`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null)
  return Boolean(response?.ok)
}

export function ChangePasswordModal({
  visible,
  email,
  first,
  onClose,
  onDone,
}: {
  visible: boolean
  email?: string
  // true right after signing in with the default password an admin generated
  first?: boolean
  onClose?: () => void
  onDone: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const warning = passwordWarning(password, email || '')

  function reset() {
    setPassword('')
    setConfirm('')
    setShow(false)
    setError('')
  }

  async function save() {
    setError('')
    if (password.length < 8) {
      setError('Your password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }
      if (first && !(await clearDefaultPasswordFlag())) {
        setError('Your password was saved, but we could not finish the setup. Please try again.')
        return
      }
      reset()
      onDone()
    } finally {
      setBusy(false)
    }
  }

  async function keepDefault() {
    setError('')
    setBusy(true)
    try {
      if (first && !(await clearDefaultPasswordFlag())) {
        setError('We could not save your choice. Check your connection and try again.')
        return
      }
      reset()
      if (first) onDone()
      else onClose?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="key-outline" size={26} color={colors.accent} />
            </View>

            <Text style={styles.title}>
              {first ? 'Choose your password' : 'Change your password'}
            </Text>
            <Text style={styles.body}>
              {first
                ? 'Your account started with a default password from your admin. Change it to one you are comfortable with, or keep the default.'
                : 'Want a password that is easier for you to remember? Change it here, or keep the one you have now.'}
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="New password (8+ characters)"
                placeholderTextColor={colors.muted}
                secureTextEntry={!show}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <Pressable onPress={() => setShow((v) => !v)} hitSlop={8}>
                <Ionicons
                  name={show ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.muted}
                />
              </Pressable>
            </View>

            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Confirm new password"
              placeholderTextColor={colors.muted}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.inputBox]}
            />

            {!!warning && (
              <Text style={styles.warning}>
                ⚠ {warning} You can still use it, but a harder one is safer.
              </Text>
            )}
            {!!error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              onPress={save}
              disabled={busy}
              style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.primaryText}>Save my new password</Text>
              )}
            </Pressable>

            <Pressable
              onPress={keepDefault}
              disabled={busy}
              style={({ pressed }) => [styles.secondary, (pressed || busy) && styles.pressed]}
            >
              <Text style={styles.secondaryText}>
                {first ? 'Keep the default password' : 'Keep my current password'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// Profile card: "do you want a more comfortable password, or keep the one you have?"
export function PasswordCard({ email }: { email?: string }) {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState('')

  return (
    <>
      <GlassCard style={styles.profileCard}>
        <View style={styles.profileRow}>
          <View style={styles.profileIcon}>
            <Ionicons name="key-outline" size={21} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileTitle}>Password</Text>
            <Text style={styles.profileText}>
              Change your password to a more comfortable one, or keep the one you have now.
            </Text>
          </View>
        </View>

        {!!notice && <Text style={styles.notice}>{notice}</Text>}

        <Pressable
          onPress={() => {
            setNotice('')
            setOpen(true)
          }}
          style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
        >
          <Text style={styles.profileButtonText}>CHANGE PASSWORD</Text>
        </Pressable>
      </GlassCard>

      <ChangePasswordModal
        visible={open}
        email={email}
        onClose={() => setOpen(false)}
        onDone={() => {
          setOpen(false)
          setNotice('Password updated.')
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 20,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  body: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  input: { flex: 1, color: colors.text, fontSize: 14 },
  inputBox: {
    flex: 0,
    height: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  warning: { color: '#FCD34D', fontSize: 11, lineHeight: 16, marginBottom: 8 },
  error: { color: colors.danger, fontSize: 12, marginBottom: 8 },
  primary: {
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryText: { color: colors.bg, fontSize: 14, fontWeight: '900' },
  secondary: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  secondaryText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.75 },

  profileCard: { padding: 16, marginBottom: 14 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  profileText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  notice: { color: colors.success, fontSize: 12, marginTop: 10 },
  profileButton: {
    height: 42,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  profileButtonText: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
})
