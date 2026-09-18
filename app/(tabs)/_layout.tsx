import React, { useEffect, useState } from 'react'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../../constants/theme'
import { supabase } from '@/lib/supabase'

type UserRole =
  | 'customer'
  | 'technician'
  | 'admin'

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

  const isCustomer =
    role === 'customer'

  const isTechnician =
    role === 'technician'

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

        tabBarActiveTintColor:
          colors.accent,

        tabBarInactiveTintColor:
          colors.muted,

        tabBarStyle: {
          backgroundColor:
            colors.panel,

          borderTopColor:
            colors.line,

          borderTopWidth: 1,

          height: 72,

          paddingBottom: 10,

          paddingTop: 8,
        },

        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '800',
        },
      }}
    >
      {/* ====================================================== */}
      {/* CUSTOMER HOME                                           */}
      {/* ====================================================== */}

      <Tabs.Screen
        name="customer"
        options={{
          href:
            !loadingRole &&
            isCustomer
              ? '/customer'
              : null,

          title: 'Home',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="home-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* ====================================================== */}
      {/* CUSTOMER REQUESTS                                       */}
      {/* ====================================================== */}

      <Tabs.Screen
        name="requests"
        options={{
          href:
            !loadingRole &&
            isCustomer
              ? '/requests'
              : null,

          title: 'Requests',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="construct-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* ====================================================== */}
      {/* CUSTOMER PAYMENT                                        */}
      {/* ====================================================== */}

      <Tabs.Screen
        name="payment"
        options={{
          href:
            !loadingRole &&
            isCustomer
              ? '/payment'
              : null,

          title: 'Payment',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="card-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* ====================================================== */}
      {/* CUSTOMER REFERRALS                                      */}
      {/* ====================================================== */}

      <Tabs.Screen
        name="referrals"
        options={{
          href:
            !loadingRole &&
            isCustomer
              ? '/referrals'
              : null,

          title: 'Referrals',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="people-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* ====================================================== */}
      {/* CUSTOMER PROFILE                                        */}
      {/* ====================================================== */}

      <Tabs.Screen
        name="profile"
        options={{
          href:
            !loadingRole &&
            isCustomer
              ? '/profile'
              : null,

          title: 'Profile',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="person-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* ====================================================== */}
      {/* TECHNICIAN DASHBOARD                                    */}
      {/* ====================================================== */}

      <Tabs.Screen
        name="technician"
        options={{
          href:
            !loadingRole &&
            isTechnician
              ? '/technician'
              : null,

          title: 'Dashboard',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="speedometer-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* ====================================================== */}
      {/* TECHNICIAN JOBS                                         */}
      {/* ====================================================== */}

      <Tabs.Screen
        name="jobs"
        options={{
          href:
            !loadingRole &&
            isTechnician
              ? '/jobs'
              : null,

          title: 'Jobs',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="briefcase-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* ====================================================== */}
      {/* TECHNICIAN PROFILE                                      */}
      {/* ====================================================== */}

      <Tabs.Screen
        name="technician-profile"
        options={{
          href:
            !loadingRole &&
            isTechnician
              ? '/technician-profile'
              : null,

          title: 'Profile',

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="person-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* ====================================================== */}
      {/* CLIENT DETAILS                                          */}
      {/* ====================================================== */}

      <Tabs.Screen
        name="client-details"
        options={{
          href: null,
          title: 'Client Details',
        }}
      />

      {/* ====================================================== */}
      {/* ACCOUNTING PROFILE                                      */}
      {/*                                                         */}
      {/* Kept registered so Expo Router recognizes the route,    */}
      {/* but it is NOT part of the mobile navigation.            */}
      {/* Accounting uses the separate web application.           */}
      {/* ====================================================== */}

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