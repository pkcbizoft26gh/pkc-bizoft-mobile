import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'

import { colors, radii } from '@/constants/theme'
import { supabase } from '../lib/supabase'

// Home-screen popups for referrals:
// - the new customer: "Welcome, you were referred by Maria" + choose a plan
// - the referrer: "Juan used your referral code!" for each new person
// What was already shown is remembered on this phone.

type Props = {
  client: {
    id: string
    plan_name?: string | null
    referred_by_client_id?: string | null
    referred_by_client_name?: string | null
  } | null
}

type Popup =
  | { kind: 'welcome'; referrer: string }
  | { kind: 'referred'; names: string[] }

export function ReferralPopups({ client }: Props) {
  const router = useRouter()
  const [queue, setQueue] = useState<Popup[]>([])

  useEffect(() => {
    if (!client?.id) return
    let cancelled = false

    const load = async () => {
      const next: Popup[] = []
      const welcomeKey = `referral-welcome:${client.id}`
      const seenKey = `referrals-seen:${client.id}`

      try {
        if (client.referred_by_client_id && !client.plan_name?.trim() && !(await AsyncStorage.getItem(welcomeKey))) {
          next.push({
            kind: 'welcome',
            referrer: client.referred_by_client_name?.trim() || 'a friend',
          })
          await AsyncStorage.setItem(welcomeKey, '1')
        }

        const { data } = await supabase.rpc('my_referred_customers')
        const people = (data ?? []) as { client_id: string; display_name: string | null }[]
        const raw = await AsyncStorage.getItem(seenKey)
        const ids = people.map((p) => p.client_id)

        if (raw === null) {
          // First time on this phone: remember everyone so old referrals don't pop up.
          await AsyncStorage.setItem(seenKey, JSON.stringify(ids))
        } else {
          const seen = new Set<string>(JSON.parse(raw))
          const fresh = people.filter((p) => !seen.has(p.client_id))
          if (fresh.length > 0) {
            next.push({ kind: 'referred', names: fresh.map((p) => p.display_name?.trim() || 'Someone') })
            await AsyncStorage.setItem(seenKey, JSON.stringify(ids))
          }
        }
      } catch (err) {
        console.error('Referral popups error:', err)
      }

      if (!cancelled && next.length > 0) setQueue(next)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [client?.id, client?.plan_name, client?.referred_by_client_id, client?.referred_by_client_name])

  const popup = queue[0]
  if (!popup) return null

  const close = () => setQueue((q) => q.slice(1))

  const title =
    popup.kind === 'welcome'
      ? 'Welcome to PKC BIZOFT!'
      : popup.names.length === 1
        ? 'New referral!'
        : `${popup.names.length} new referrals!`

  const body =
    popup.kind === 'welcome'
      ? `You were referred by ${popup.referrer} successfully. Ready to get connected? Choose a plan and we'll set up your installation.`
      : `${popup.names.join(', ')} used your referral code. Your reward is unlocked once they subscribe and are installed.`

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name={popup.kind === 'welcome' ? 'sparkles' : 'people'} size={30} color={colors.accent} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          {popup.kind === 'welcome' ? (
            <>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                onPress={() => {
                  close()
                  router.push('/payment')
                }}
              >
                <Text style={styles.primaryText}>Choose a plan</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.secondary} onPress={close}>
                <Text style={styles.secondaryText}>Maybe later</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                onPress={() => {
                  close()
                  router.push('/referrals')
                }}
              >
                <Text style={styles.primaryText}>See my referrals</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.secondary} onPress={close}>
                <Text style={styles.secondaryText}>Nice!</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 10, 20, 0.82)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: 'center',
  },
  icon: {
    width: 62,
    height: 62,
    borderRadius: radii.round,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  primary: {
    alignSelf: 'stretch',
    minHeight: 46,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: '900',
  },
  secondary: {
    alignSelf: 'stretch',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  secondaryText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
})
