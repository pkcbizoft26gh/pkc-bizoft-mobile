import React, { useEffect, useRef, useState } from 'react'
import { Animated, ColorValue, Platform, StyleSheet } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../../constants/theme'
import { supabase } from '@/lib/supabase'

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
  { name: 'payment', title: 'Payment', icon: 'card-outline', activeIcon: 'card', roles: ['customer'] },
  { name: 'referrals', title: 'Referrals', icon: 'people-outline', activeIcon: 'people', roles: ['customer'] },
  { name: 'profile', title: 'Profile', icon: 'person-outline', activeIcon: 'person', roles: ['customer'] },
  { name: 'technician', title: 'Dashboard', icon: 'speedometer-outline', activeIcon: 'speedometer', roles: ['technician'] },
  { name: 'jobs', title: 'Jobs', icon: 'briefcase-outline', activeIcon: 'briefcase', roles: ['technician'] },
  { name: 'materials', title: 'Materials', icon: 'cube-outline', activeIcon: 'cube', roles: ['technician'] },
  { name: 'technician-profile', title: 'Profile', icon: 'person-outline', activeIcon: 'person', roles: ['technician'] },
]

export default function TabsLayout() {
  const [role, setRole] =
    useState<UserRole | null>(null)

  const [loadingRole, setLoadingRole] =
    useState(true)

  useEffect(() => {
    let mounted = true

    async function loadRole() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

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

  /*
   * Admin/accounting users intentionally do not
   * receive an accounting navbar in the mobile app.
   *
   * Accounting will be handled by the separate
   * web-based PKC BIZOFT Accounting application.
   */

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,

        tabBarStyle: {
          backgroundColor: colors.panel,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 74,
          paddingBottom: 12,
          paddingTop: 10,

          // Soft lift so the bar reads as floating above the content.
          shadowColor: colors.accent,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.12,
          shadowRadius: 14,
          elevation: 14,
        },

        tabBarLabelStyle: {
          fontSize: 10,
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
  )
}

const styles = StyleSheet.create({
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
