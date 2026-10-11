import { useState } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'

import { colors, radii } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'

// Records the modem / ONU serial number on the customer's account. The
// technician scans the barcode on the label with the camera or types it in;
// the database cleans it up, refuses one that is already on another account and
// keeps a log of who saved what.

type Props = {
  clientId: string
  /** The serial already on the account, if any. */
  current: string | null
  onSaved: (serial: string) => void
}

// Letters and numbers only: serial labels also carry a MAC address and other
// codes, and a scanned code sometimes has a prefix like "SN:".
export function cleanScannedSerial(raw: string) {
  const value = raw.trim().replace(/^(s\/?n|serial( number)?)\s*[:#-]?\s*/i, '')
  return value.replace(/\s+/g, '').toUpperCase().slice(0, 64)
}

export function ModemSerialCard({ clientId, current, onSaved }: Props) {
  const [serial, setSerial] = useState(current ?? '')
  const [saved, setSaved] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()

  const dirty = cleanScannedSerial(serial) !== (saved ?? '')

  async function openScanner() {
    setError('')
    if (!permission?.granted) {
      const asked = await requestPermission()
      if (!asked.granted) {
        setError('Allow camera access to scan the label, or type the serial number in.')
        return
      }
    }
    setScanning(true)
  }

  function onScanned(result: { data: string }) {
    const value = cleanScannedSerial(result.data)
    if (value.length < 4) return
    setSerial(value)
    setScanning(false)
  }

  async function save() {
    const value = cleanScannedSerial(serial)
    if (value.length < 4) {
      setError('A modem serial number has at least 4 characters.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('set_modem_serial', { p_client_id: clientId, p_serial: value })
      if (rpcError) throw rpcError
      const stored = String(data ?? value)
      setSaved(stored)
      setSerial(stored)
      onSaved(stored)
    } catch (e: any) {
      setError(friendlyError(e, 'Could not save the serial number.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.icon}>
          <Ionicons name="barcode-outline" size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Modem serial number</Text>
          <Text style={styles.sub}>
            {saved ? `Saved: ${saved}` : 'Scan the barcode on the modem label, or type it in.'}
          </Text>
        </View>
        {saved && !dirty ? <Ionicons name="checkmark-circle" size={22} color={colors.success} /> : null}
      </View>

      <View style={styles.row}>
        <TextInput
          value={serial}
          onChangeText={(text) => {
            setSerial(text)
            setError('')
          }}
          placeholder="e.g. ZTEGC1234567"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel="Modem serial number"
        />
        <Pressable
          onPress={() => void openScanner()}
          accessibilityRole="button"
          accessibilityLabel="Scan the modem label"
          style={({ pressed }) => [styles.scan, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="scan" size={22} color={colors.accent} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {dirty ? (
        <Pressable
          onPress={() => void save()}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.save, (pressed || busy) && { opacity: 0.7 }]}
        >
          {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.saveText}>Save serial number</Text>}
        </Pressable>
      ) : null}

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={styles.scanner}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'code93', 'qr', 'ean13', 'ean8', 'upc_a', 'datamatrix', 'pdf417'] }}
            onBarcodeScanned={onScanned}
          />
          <View style={styles.frameWrap} pointerEvents="none">
            <View style={styles.frame} />
            <Text style={styles.frameText}>Point the camera at the barcode on the modem label</Text>
          </View>
          <Pressable
            onPress={() => setScanning(false)}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
            style={styles.closeScan}
          >
            <Ionicons name="close" size={24} color={colors.white} />
            <Text style={styles.closeScanText}>Type it in instead</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 4,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scan: {
    width: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: 10 },
  save: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  saveText: { color: colors.bg, fontSize: 14, fontWeight: '900' },
  scanner: { flex: 1, backgroundColor: '#000' },
  frameWrap: { ...(StyleSheet.absoluteFill as object), alignItems: 'center', justifyContent: 'center', gap: 18 },
  frame: { width: '78%', height: 160, borderRadius: radii.md, borderWidth: 3, borderColor: colors.accent },
  frameText: { color: colors.white, fontSize: 14, fontWeight: '700', textAlign: 'center', paddingHorizontal: 30 },
  closeScan: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radii.round,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeScanText: { color: colors.white, fontSize: 14, fontWeight: '800' },
})
