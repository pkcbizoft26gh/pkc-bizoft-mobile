import React, { useEffect, useRef, useState } from 'react'
import { Animated, AppState, ColorValue, Platform, StyleSheet, View } from 'react-native'
import * as Notifications from 'expo-notifications'
import { Tabs, usePathname, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AmbientGlow } from '@/components/AmbientGlow'
import { HelpBot } from '@/components/HelpBot'
import { AppTour } from '@/components/AppTour'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../../constants/theme'
import { supabase } from '@/lib/supabase'
import { registerForPush } from '@/lib/push'
import { subscribeUnread } from '@/components/NotificationsInbox'

type UserRole =
  | 'customer'
  | 'technician'
  | 'admin'

type IconName = React.ComponentProps<typeof Ionicons>['name']

// Icon that springs up and shows a glowing indicator while its tab is active.
function TabIcon({
  name,
  activeName,
  color,
  size,
  focused,
}: {
  name: IconName
  activeName: IconName
  color: ColorValue
  size: number
  focused: boolean
}) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current

  useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      friction: 6,
      tension: 140,
      useNativeDriver: true,
    }).start()
  }, [focused, progress])

  return (
    <Animated.View
      style={{
        alignItems: 'center',
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.16],
            }),
          },
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -2],
            }),
          },
        ],
      }}
    >
      <Animated.View style={[styles.indicator, { opacity: progress }]} />
      <Ionicons name={focused ? activeName : name} color={color} size={size} />
    </Animated.View>
  )
}

// Every screen the tab bar can show. `roles` decides who sees the tab; screens
// that are not visible for the current role are registered with href: null.
const SCREENS: {
  name: string
  title: string
  icon: IconName
  activeIcon: IconName
  roles: UserRole[]
}[] = [
  { name: 'customer', title: 'Home', icon: 'home-outline', activeIcon: 'home', roles: ['customer'] },
  { name: 'requests', title: 'Requests', icon: 'construct-outline', activeIcon: 'construct', roles: ['customer'] },
  { name: 'referrals', title: 'Referrals', icon: 'people-outline', activeIcon: 'people', roles: ['customer'] },
  { name: 'profile', title: 'Profile', icon: 'person-outline', activeIcon: 'person', roles: ['customer'] },
  { name: 'technician', title: 'Dashboard', icon: 'speedometer-outline', activeIcon: 'speedometer', roles: ['technician'] },
  { name: 'jobs', title: 'Jobs', icon: 'briefcase-outline', activeIcon: 'briefcase', roles: ['technician'] },
  { name: 'materials', title: 'Materials', icon: 'cube-outline', activeIcon: 'cube', roles: ['technician'] },
  { name: 'technician-profile', title: 'Profile', icon: 'person-outline', activeIcon: 'person', roles: ['technician'] },
]

// Number bubbles on tabs, keyed by tab name.
type TabBadges = Record<string, number>

export default function TabsLayout() {
  // Lift the tab bar above Android's back/home/recents buttons or the iOS home bar.
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const pathname = usePathname()
  const [role, setRole] =
    useState<UserRole | null>(null)

  const [tourUserId, setTourUserId] = useState<string | null>(null)

  const [loadingRole, setLoadingRole] =
    useState(true)

  const [badges, setBadges] = useState<TabBadges>({})

  // Customers: Home shows how many notifications are new (same count as the bell).
  useEffect(() => {
    if (role !== 'customer') return
    return subscribeUnread((count) => setBadges((current) => ({ ...current, customer: count })))
  }, [role])

  // Technicians: Jobs shows how many open jobs are waiting for someone to take them.
  useEffect(() => {
    if (role !== 'technician') return
    let cancelled = false

    async function loadOpenJobs() {
      const { count, error } = await supabase
        .from('repair_records')
        .select('id', { count: 'exact', head: true })
        .is('technician_user_id', null)
        .not('status', 'ilike', '%complete%')
        .not('status', 'ilike', '%cancel%')
        .not('status', 'ilike', '%resolved%')
        .not('status', 'ilike', '%done%')
        .not('status', 'ilike', '%fixed%')
      if (!cancelled && !error) setBadges((current) => ({ ...current, jobs: count ?? 0 }))
    }

    void loadOpenJobs()
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void loadOpenJobs()
    }, 30_000)
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadOpenJobs()
    })
    const channel = supabase
      .channel('tab-open-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_records' }, () => void loadOpenJobs())
      .subscribe()

    return () => {
      cancelled = true
      clearInterval(timer)
      appState.remove()
      void supabase.removeChannel(channel)
    }
  }, [role])

  // The same number on the app icon, where the phone supports it.
  const iconCount = role === 'customer' ? badges.customer ?? 0 : role === 'technician' ? badges.jobs ?? 0 : 0
  useEffect(() => {
    void Notifications.setBadgeCountAsync(iconCount).catch(() => {})
  }, [iconCount])

  useEffect(() => {
    let mounted = true

    async function loadRole() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()
        if (mounted) setTourUserId(user?.id ?? null)

        if (authError) {
          console.warn(
            'Unable to get authenticated user:',
            authError.message
          )

          if (mounted) {
            setRole(null)
          }

          return
        }

        if (!user) {
          if (mounted) {
            setRole(null)
          }

          return
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()

        if (profileError) {
          console.warn(
            'Unable to load user role:',
            profileError.message
          )

          if (mounted) {
            setRole(null)
          }

          return
        }

        const userRole = profile?.role

        if (
          userRole === 'customer' ||
          userRole === 'technician' ||
          userRole === 'admin'
        ) {
          if (mounted) {
            setRole(userRole)
          }
        } else {
          console.warn(
            'Unknown user role:',
            userRole
          )

          if (mounted) {
            setRole(null)
          }
        }
      } catch (error) {
        console.warn(
          'Role loading error:',
          error
        )

        if (mounted) {
          setRole(null)
        }
      } finally {
        if (mounted) {
          setLoadingRole(false)
        }
      }
    }

    loadRole()

    return () => {
      mounted = false
    }
  }, [])

  // Push alerts (team invitations, crew, payments, job updates) need this
  // phone's token on the server. Customers used to register only from the
  // Home bell; technicians never did, so they received nothing.
  useEffect(() => {
    if (!loadingRole && role) void registerForPush()
  }, [role, loadingRole])

  // Each role has its own tabs. If something lands a person on the other
  // role's screen (for example the Android back button), send them home.
  useEffect(() => {
    if (loadingRole || !role) return
    const customerOnly = ['/customer', '/requests', '/referrals', '/profile']
    const technicianOnly = ['/technician', '/jobs', '/materials', '/technician-profile']

    if (role === 'technician' && customerOnly.includes(pathname)) {
      router.replace('/technician')
    } else if (role === 'customer' && technicianOnly.includes(pathname)) {
      router.replace('/customer')
    }
  }, [role, loadingRole, pathname, router])

  /*
   * Admin/accounting users intentionally do not
   * receive an accounting navbar in the mobile app.
   *
   * Accounting will be handled by the separate
   * web-based PKC BIZOFT Accounting application.
   */

  return (
    <View style={styles.root}>
    {/* Decorative backdrop sits behind the (transparent) screens. */}
    <AmbientGlow />
    <Tabs
      // "history" makes Back return to the tab you came from. The default sends
      // you to the first tab in the list, which is the customer's Home, even
      // for technicians.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },

        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,

        tabBarStyle: {
          backgroundColor: colors.panel,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 62 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 10,

          // Soft lift so the bar reads as floating above the content.
          shadowColor: colors.accent,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.12,
          shadowRadius: 14,
          elevation: 14,
        },

        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '800',
          letterSpacing: 0.4,
        },
      }}
    >
      {SCREENS.map((screen) => (
        <Tabs.Screen
          key={screen.name}
          name={screen.name}
          options={{
            href:
              !loadingRole && role && screen.roles.includes(role)
                ? (`/${screen.name}` as any)
                : null,

            title: screen.title,

            tabBarBadge:
              (screen.name === 'customer' && (badges.customer ?? 0) > 0) ||
              (screen.name === 'jobs' && (badges.jobs ?? 0) > 0)
                ? Math.min(screen.name === 'jobs' ? badges.jobs : badges.customer, 99)
                : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.danger, color: colors.white, fontSize: 11, fontWeight: '800' },

            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon
                name={screen.icon}
                activeName={screen.activeIcon}
                color={color}
                size={size}
                focused={focused}
              />
            ),
          }}
        />
      ))}

      {/* Client details is opened from other screens, never from the bar. */}
      <Tabs.Screen
        name="client-details"
        options={{
          href: null,
          title: 'Client Details',
        }}
      />

      {/*
        Kept registered so Expo Router recognizes the route, but it is NOT
        part of the mobile navigation. Accounting uses the separate web
        application.
      */}
      <Tabs.Screen
        name="accounting-profile"
        options={{
          href: null,
          title: 'Accounting',
        }}
      />
    </Tabs>

    {role === 'customer' ? <HelpBot /> : null}
    {role === 'customer' || role === 'technician' ? <AppTour userId={tourUserId} role={role} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  indicator: {
    position: 'absolute',
    top: -10,
    width: 22,
    height: 3,
    borderRadius: 3,
    backgroundColor: colors.accent,
    ...Platform.select({
      ios: {
        shadowColor: colors.accent,
        shadowOpacity: 0.9,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
      },
      default: {},
    }),
  },
})
