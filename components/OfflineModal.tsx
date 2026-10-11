import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radii } from '@/constants/theme'
import { useConnection } from '@/lib/connection'

// A popup that sits above every screen, including login, whenever the
// backend can't be reached. It can't be dismissed: it closes by itself the
// moment the connection is back, so nobody can sign in or submit anything
// while offline.
export function OfflineModal() {
  const { isOnline, checking, recheck, offlineWorkAvailable, workingOffline, continueOffline } = useConnection()

  // Working offline: the popup steps aside and a small strip says what is happening.
  if (!isOnline && workingOffline) {
    return (
      <View style={styles.strip} pointerEvents="none" accessibilityRole="alert">
        <Ionicons name="cloud-offline-outline" size={14} color="#001018" />
        <Text style={styles.stripText}>Offline mode. Finished jobs send when you are back online.</Text>
      </View>
    )
  }

  return (
    <Modal
      visible={!isOnline}
      transparent
      animationType="fade"
      statusBarTranslucent
      // Android back button: swallow it, the popup is not dismissible.
      onRequestClose={() => {}}
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={styles.card} accessibilityRole="alert">
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-offline-outline" size={38} color={colors.danger} />
          </View>

          <Text style={styles.title}>No Internet Connection</Text>

          <Text style={styles.message}>
            PKC BIZOFT needs an internet connection to sign you in and keep your account up to
            date. Check your Wi-Fi or mobile data. We&apos;ll reconnect automatically.
          </Text>

          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.statusText}>Waiting for connection…</Text>
          </View>

          <Pressable
            onPress={recheck}
            disabled={checking}
            accessibilityRole="button"
            accessibilityLabel="Try connecting again"
            style={({ pressed }) => [
              styles.button,
              (pressed || checking) && styles.buttonPressed,
            ]}
          >
            <Ionicons name="refresh" size={17} color="#001018" />
            <Text style={styles.buttonText}>{checking ? 'CHECKING…' : 'TRY AGAIN'}</Text>
          </Pressable>

          {offlineWorkAvailable ? (
            <Pressable
              onPress={continueOffline}
              accessibilityRole="button"
              accessibilityLabel="Continue working offline"
              style={({ pressed }) => [styles.linkButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.linkText}>Continue offline (finish jobs)</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 34,
    paddingBottom: 6,
    backgroundColor: colors.medium,
  },

  stripText: { color: '#001018', fontSize: 12, fontWeight: '800' },

  linkButton: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 12 },

  linkText: { color: colors.accent, fontSize: 14, fontWeight: '800' },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 9, 20, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: radii.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },

  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#2B101A',
    borderWidth: 1,
    borderColor: '#5E1F31',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },

  message: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 22,
  },

  statusText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.accent,
  },

  buttonPressed: {
    opacity: 0.8,
  },

  buttonText: {
    color: '#001018',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
})
