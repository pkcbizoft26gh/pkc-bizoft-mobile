import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

import { colors, radii, shadows } from '@/constants/theme'
import { requestInboxRefresh, showBanner, subscribeBanner, type BannerMessage } from '@/lib/inAppBanner'

// A banner that slides down from the top when something new arrives while the app is
// open. Tapping it opens the right screen. It also listens for pushes that arrive while
// the app is in front, so the phone's own alert does not have to be the only sign.

const SHOW_MS = 6000

/** A best guess at the screen for a push, from its words, until pushes carry an exact screen. */
function hrefFor(title: string, body: string, role: 'customer' | 'technician' | null) {
  const text = `${title} ${body}`.toLowerCase()
  if (role === 'technician') return '/jobs'
  if (/referral|reward|payout|withdraw/.test(text)) return '/referrals'
  if (/bill|payment|paid|verified|due|overdue|reminder/.test(text)) return '/payment'
  if (/repair|technician|installation|job|arrived|outage/.test(text)) return '/customer'
  return '/customer'
}

export function InAppBanner({ role }: { role: 'customer' | 'technician' | null }) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [message, setMessage] = useState<BannerMessage | null>(null)
  const slide = useRef(new Animated.Value(0)).current
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    Animated.timing(slide, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setMessage(null)
      },
    )
  }, [slide])

  useEffect(() => {
    return subscribeBanner((next) => {
      if (timer.current) clearTimeout(timer.current)
      setMessage(next)
      Animated.timing(slide, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
      timer.current = setTimeout(hide, SHOW_MS)
    })
  }, [slide, hide])

  // A push that arrives while the app is open: show it here and refresh the inbox.
  useEffect(() => {
    // The phone's own banner would repeat what this one says, so keep it out of the foreground.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    })
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content
      const title = content.title || 'PKC BIZOFT'
      const body = content.body || ''
      const route = (content.data as { route?: string } | undefined)?.route
      requestInboxRefresh()
      showBanner({ id: notification.request.identifier, title, body, href: route || hrefFor(title, body, role) })
    })
    return () => sub.remove()
  }, [role])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  if (!message) return null

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] })

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + 8, transform: [{ translateY }], opacity: slide }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`New notification: ${message.title}`}
        onPress={() => {
          const href = message.href
          hide()
          if (href) router.push(href as never)
        }}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      >
        <View style={styles.icon}>
          <Ionicons name="notifications" size={20} color={colors.bg} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {message.title}
          </Text>
          {message.body ? (
            <Text style={styles.body} numberOfLines={2}>
              {message.body}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={hide} hitSlop={10} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color={colors.muted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 1000, elevation: 30 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.panel,
    ...shadows.card,
  },
  pressed: { opacity: 0.85 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  text: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 18 },
})
