import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { WebView } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Alert } from '@/components/AppAlert'
import { colors, radii } from '@/constants/theme'
import { Fix, locateForPin, savePinFix } from '@/lib/pinCapture'

// A fixed, non-draggable map: the pin is wherever the phone's GPS says the
// customer is, and the customer can only confirm it or track again.
function mapHtml(fix: Fix) {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
<style>
  html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #0B1626; }
  .pin { width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; background: #22D3EE; border: 4px solid #fff; box-shadow: 0 0 0 6px rgba(34,211,238,.35); }
</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
  var lat = ${fix.latitude}, lon = ${fix.longitude}, acc = ${Math.max(fix.accuracy, 5)};
  var map = L.map('map', { zoomControl: false, attributionControl: false, dragging: false, touchZoom: false,
    doubleClickZoom: false, scrollWheelZoom: false, boxZoom: false, keyboard: false, tap: false }).setView([lat, lon], 18);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20 }).addTo(map);
  L.circle([lat, lon], { radius: acc, color: '#22D3EE', weight: 1, fillOpacity: 0.12 }).addTo(map);
  L.marker([lat, lon], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [0, 0] }) }).addTo(map);
</script></body></html>`
}

type Stage = 'idle' | 'locating' | 'confirm' | 'saving'

/**
 * "Track my address": reads the GPS, shows the pin on a fixed map, and saves it
 * only after the customer confirms it is where they are.
 */
export function PinConfirmModal({
  visible,
  onClose,
  onSaved,
  autoStart = false,
}: {
  visible: boolean
  onClose: () => void
  onSaved: () => void
  autoStart?: boolean
}) {
  const insets = useSafeAreaInsets()
  const [stage, setStage] = useState<Stage>('idle')
  const [fix, setFix] = useState<Fix | null>(null)
  const [problem, setProblem] = useState('')

  async function track() {
    setProblem('')
    setStage('locating')
    const result = await locateForPin()
    if (result.status === 'ok') {
      setFix(result.fix)
      setStage('confirm')
      return
    }
    setStage('idle')
    setProblem(
      result.status === 'no-location'
        ? 'We could not read your location. Turn on Location (GPS), allow PKC BIZOFT to use it, then try again.'
        : `Your GPS is only accurate to about ${Math.round(result.accuracy)} m. Step outside or next to a window and try again.`,
    )
  }

  useEffect(() => {
    if (!visible) return
    setFix(null)
    setProblem('')
    setStage('idle')
    if (autoStart) void track()
    // track only reads state it sets itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  async function confirm() {
    if (!fix) return
    setStage('saving')
    const result = await savePinFix(fix)
    if (result.status === 'saved') {
      Alert.alert('Address pinned', `Your location pin was updated automatically (about ${Math.max(Math.round(result.accuracy), 1)} m accurate).`)
      onSaved()
      onClose()
      return
    }
    setStage('confirm')
    if (result.status === 'error') Alert.alert('Unable to save', result.message)
  }

  const busy = stage === 'locating' || stage === 'saving'

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !busy && onClose()}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: 18 + insets.bottom }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Track my address</Text>
            <Pressable onPress={() => !busy && onClose()} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          {stage === 'confirm' || stage === 'saving' ? (
            <>
              <View style={styles.mapBox}>
                {fix ? <WebView source={{ html: mapHtml(fix) }} originWhitelist={['*']} scrollEnabled={false} style={styles.map} /> : null}
              </View>
              <Text style={styles.question}>Is the pin where you are right now?</Text>
              <Text style={styles.hint}>
                The pin cannot be moved. If it is not at your house, go to your house and track again. Accuracy: about{' '}
                {Math.max(Math.round(fix?.accuracy ?? 0), 1)} m.
              </Text>

              <Pressable
                onPress={() => void confirm()}
                disabled={busy}
                style={({ pressed }) => [styles.primary, (pressed || busy) && { opacity: 0.8 }]}
              >
                {stage === 'saving' ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.primaryText}>YES, THIS IS MY ADDRESS</Text>
                )}
              </Pressable>
              <Pressable onPress={() => void track()} disabled={busy} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.8 }]}>
                <Text style={styles.secondaryText}>TRACK AGAIN</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.idleIcon}>
                {stage === 'locating' ? (
                  <ActivityIndicator color={colors.accent} size="large" />
                ) : (
                  <Ionicons name="locate-outline" size={42} color={colors.accent} />
                )}
              </View>
              <Text style={styles.hint}>
                {stage === 'locating'
                  ? 'Finding your exact location. Stay where you are...'
                  : 'Stand at the place where the internet is (or will be) installed, then tap the button. Technicians use this pin to find your house.'}
              </Text>
              {!!problem && <Text style={styles.problem}>{problem}</Text>}
              <Pressable
                onPress={() => void track()}
                disabled={busy}
                style={({ pressed }) => [styles.primary, (pressed || busy) && { opacity: 0.8 }]}
              >
                <Text style={styles.primaryText}>TRACK MY ADDRESS</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(3,10,20,0.82)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: colors.text, fontSize: 17, fontWeight: '900' },
  mapBox: { height: 250, borderRadius: radii.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  map: { flex: 1, backgroundColor: '#0B1626' },
  question: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 14 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  problem: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 10 },
  idleIcon: { height: 90, alignItems: 'center', justifyContent: 'center' },
  primary: {
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  primaryText: { color: colors.bg, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  secondary: {
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  secondaryText: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
})
