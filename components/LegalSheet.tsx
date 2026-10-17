import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { WebView } from 'react-native-webview'

import { API_BASE_URL } from '@/lib/api'
import { colors, radii } from '@/constants/theme'

// The Terms, Privacy Policy and Cookie Notice open in a pop-up inside the app instead of the
// phone's browser. The pages themselves come from the website, so there is one copy to keep up
// to date; inside the pop-up the website's menu, its own legal tabs and its cookie banner are hidden.

export type LegalPage = 'terms' | 'privacy' | 'cookies'

const PAGES: { key: LegalPage; label: string; title: string }[] = [
  { key: 'terms', label: 'Terms', title: 'Terms and Conditions' },
  { key: 'privacy', label: 'Privacy', title: 'Privacy Policy' },
  { key: 'cookies', label: 'Cookies', title: 'Cookie Notice' },
]

const HIDE_SITE_CHROME = `
(function () {
  var style = document.createElement('style');
  style.textContent =
    'nav[aria-label="Primary navigation"], nav[aria-label="Legal pages"], [aria-label="Cookie notice"] { display: none !important; }' +
    'main > div { padding-top: 8px !important; }';
  (document.head || document.documentElement).appendChild(style);
})();
true;
`

let current: LegalPage | null = null
const listeners = new Set<() => void>()
const setCurrent = (page: LegalPage | null) => {
  current = page
  listeners.forEach((fn) => fn())
}

/** Opens a legal page in the pop-up. */
export function openLegal(page: LegalPage) {
  setCurrent(page)
}

/** The pop-up itself. Mounted once at the top of the app. */
export function LegalSheet() {
  const insets = useSafeAreaInsets()
  const [page, setPage] = useState<LegalPage | null>(current)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const webview = useRef<WebView>(null)

  useEffect(() => {
    const update = () => setPage(current)
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setFailed(false)
  }, [page])

  const close = () => setCurrent(null)
  const info = PAGES.find((p) => p.key === page)
  const url = page ? `${API_BASE_URL}/${page}` : ''

  return (
    <Modal visible={!!page} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        <View style={[styles.sheet, { marginTop: insets.top + 24, paddingBottom: insets.bottom }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title} numberOfLines={1}>
              {info?.title}
            </Text>
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.tabs}>
            {PAGES.map((p) => (
              <Pressable
                key={p.key}
                onPress={() => setCurrent(p.key)}
                style={[styles.tab, p.key === page && styles.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: p.key === page }}
              >
                <Text style={[styles.tabText, p.key === page && styles.tabTextOn]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.body}>
            {page && !failed ? (
              <WebView
                key={page}
                ref={webview}
                source={{ uri: url }}
                injectedJavaScriptBeforeContentLoaded={HIDE_SITE_CHROME}
                injectedJavaScript={HIDE_SITE_CHROME}
                onLoadEnd={() => setLoading(false)}
                onError={() => setFailed(true)}
                onHttpError={() => setFailed(true)}
                onShouldStartLoadWithRequest={(request) => {
                  // The page itself, and the other legal pages, stay in the pop-up.
                  const inside = request.url.match(/\/(terms|privacy|cookies)(\?|#|$)/)
                  if (request.url.startsWith(API_BASE_URL) && inside) {
                    if (inside[1] !== page) setCurrent(inside[1] as LegalPage)
                    return inside[1] === page
                  }
                  // Email links and anything else open outside the app.
                  Linking.openURL(request.url).catch(() => {})
                  return false
                }}
                style={styles.web}
                containerStyle={styles.web}
              />
            ) : null}

            {loading && !failed ? (
              <View style={styles.center} pointerEvents="none">
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : null}

            {failed ? (
              <View style={styles.center}>
                <Ionicons name="cloud-offline-outline" size={36} color={colors.muted} />
                <Text style={styles.failText}>This page could not load. Check your connection.</Text>
                <Pressable
                  onPress={() => {
                    setFailed(false)
                    setLoading(true)
                  }}
                  style={styles.retry}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(3, 8, 14, 0.7)', justifyContent: 'flex-end' },
  sheet: {
    flex: 1,
    backgroundColor: '#02070b',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 12, gap: 12 },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  tabOn: { borderColor: colors.accent, backgroundColor: 'rgba(76, 232, 255, 0.08)' },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  tabTextOn: { color: colors.accent },
  body: { flex: 1, borderTopWidth: 1, borderTopColor: colors.border },
  web: { flex: 1, backgroundColor: '#02070b' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  failText: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  retry: { paddingVertical: 10, paddingHorizontal: 22, borderRadius: 12, backgroundColor: colors.accent },
  retryText: { color: '#04101A', fontSize: 14, fontWeight: '800' },
})
