import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback } from 'react'

import { colors, radii } from '@/constants/theme'
import { FadeIn } from '@/components/FadeIn'
import { SpeedTestModal } from '@/components/SpeedTestModal'
import { NotificationsInbox, useInbox } from '@/components/NotificationsInbox'

type Route = '/payment' | '/requests'

const ACTIONS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; route?: Route; section?: 'pay' | 'plan' }[] = [
  { key: 'pay', label: 'Pay bill', icon: 'card', route: '/payment', section: 'pay' },
  { key: 'plan', label: 'Apply for plan', icon: 'swap-horizontal', route: '/payment', section: 'plan' },
  { key: 'help', label: 'Report issue', icon: 'construct', route: '/requests' },
  { key: 'speed', label: 'Speed test', icon: 'speedometer' },
]

/** Row of big shortcut tiles for the things customers do most. */
export function QuickActions() {
  const router = useRouter()
  const [speedOpen, setSpeedOpen] = useState(false)

  return (
    <>
      <FadeIn>
        <View style={styles.grid}>
          {ACTIONS.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => {
                if (!action.route) {
                  setSpeedOpen(true)
                } else if (action.section) {
                  // A fresh timestamp makes the Payment screen scroll again on every tap.
                  router.push({ pathname: action.route, params: { section: action.section, t: String(Date.now()) } })
                } else {
                  router.push(action.route)
                }
              }}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View style={styles.tileIcon}>
                <Ionicons name={action.icon} size={22} color={colors.accent} />
              </View>
              <Text style={styles.tileLabel} numberOfLines={1}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </FadeIn>

      <SpeedTestModal visible={speedOpen} onClose={() => setSpeedOpen(false)} />
    </>
  )
}

/** Bell for the home header. Shows how many things are new and opens the inbox. */
export function InboxBell() {
  const { items, unread, loading, refresh, markSeen } = useInbox()
  const [open, setOpen] = useState(false)

  // Re-check whenever the Home tab comes back into view.
  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  function openInbox() {
    setOpen(true)
    void markSeen()
  }

  return (
    <>
      <Pressable
        onPress={openInbox}
        style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
      >
        <Ionicons name={unread > 0 ? 'notifications' : 'notifications-outline'} size={21} color={colors.accent} />
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>

      <NotificationsInbox visible={open} onClose={() => setOpen(false)} items={items} loading={loading} />
    </>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  tile: {
    // two per row
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: radii.md,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.accentDark,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 8,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.75,
  },
})
