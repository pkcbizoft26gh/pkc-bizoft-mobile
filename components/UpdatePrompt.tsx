import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii } from '@/constants/theme'
import { AvailableUpdate, checkForUpdate, downloadAndInstall, installedVersion } from '@/lib/updates'

// Do not hammer GitHub: re-check when the app returns to the foreground, but
// at most this often.
const RECHECK_MS = 30 * 60 * 1000

export function UpdatePrompt() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const lastCheck = useRef(0)

  const check = useCallback(async () => {
    lastCheck.current = Date.now()
    const found = await checkForUpdate()
    if (found) {
      setUpdate(found)
      setDismissed(false)
    }
  }, [])

  useEffect(() => {
    check()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheck.current > RECHECK_MS) check()
    })
    return () => sub.remove()
  }, [check])

  async function install() {
    if (!update) return
    setBusy(true)
    setError('')
    setProgress(0)
    try {
      await downloadAndInstall(update, setProgress)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The update could not be installed.')
    } finally {
      setBusy(false)
    }
  }

  if (!update || dismissed) return null

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => !busy && setDismissed(true)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name="cloud-download-outline" size={28} color={colors.accent} />
          </View>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.body}>
            PKC BIZOFT {update.version} is ready (you have {installedVersion}). Install it to get the latest fixes
            and features.
          </Text>

          {busy ? (
            <View style={styles.progressWrap}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={styles.small}>Downloading… {Math.round(progress * 100)}%</Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.small}>
            When the download finishes, Android will ask you to confirm. If it asks, allow installs from this app.
          </Text>

          <View style={styles.actions}>
            <Pressable onPress={() => setDismissed(true)} disabled={busy} style={[styles.btn, styles.ghost, busy && styles.off]}>
              <Text style={[styles.btnText, { color: colors.text }]}>Later</Text>
            </Pressable>
            <Pressable onPress={install} disabled={busy} style={[styles.btn, busy && styles.off]}>
              {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.btnText}>Update now</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: 'center',
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    marginBottom: 12,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  small: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 10 },
  error: { color: colors.danger, fontSize: 12, textAlign: 'center', marginTop: 10 },
  progressWrap: { alignSelf: 'stretch', marginTop: 14 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.input, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.accent },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18, alignSelf: 'stretch' },
  btn: { flex: 1, backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  off: { opacity: 0.5 },
  btnText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
})
