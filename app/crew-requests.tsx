import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Alert } from '@/components/AppAlert'
import { supabase } from '@/lib/supabase'
import { colors, radii } from '@/constants/theme'

const REFRESH_MS = 20000

type CrewRequest = {
  repair_id: string
  job_type: string | null
  customer: string
  address: string | null
  requested_by: string
  requested_by_id: string | null
  created_at: string
}

export default function CrewRequestsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<CrewRequest[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [declining, setDeclining] = useState<CrewRequest | null>(null)
  const [reason, setReason] = useState('')
  const alive = useRef(true)

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('my_crew_requests')
    if (!alive.current) return
    if (rpcError) setError(rpcError.message)
    else {
      setError('')
      setRequests((data as CrewRequest[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    alive.current = true
    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => {
      alive.current = false
      clearInterval(timer)
    }
  }, [load])

  async function accept(request: CrewRequest) {
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('respond_job_crew', {
      p_repair: request.repair_id,
      p_accept: true,
      p_reason: null,
    })
    setBusy(false)
    if (rpcError) {
      Alert.alert('Crew request', rpcError.message)
      return
    }
    Alert.alert('You joined the job', 'It now shows under Jobs.')
    await load()
  }

  async function sendDecline() {
    if (!declining) return
    if (reason.trim().length < 3) {
      Alert.alert('Reason needed', 'Please tell them why you are declining.')
      return
    }
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('respond_job_crew', {
      p_repair: declining.repair_id,
      p_accept: false,
      p_reason: reason.trim(),
    })
    setBusy(false)
    if (rpcError) {
      Alert.alert('Crew request', rpcError.message)
      return
    }
    setDeclining(null)
    setReason('')
    await load()
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>FIELD OPERATIONS</Text>
            <Text style={styles.title}>Crew requests</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} size="large" color={colors.accent} />
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.body}>{error}</Text>
          </View>
        ) : requests.length === 0 ? (
          <View style={styles.card}>
            <View style={styles.bigIcon}>
              <Ionicons name="people-outline" size={28} color={colors.accent} />
            </View>
            <Text style={styles.cardTitle}>No requests right now</Text>
            <Text style={styles.body}>
              When another technician wants you on a job, it shows up here. You can accept it, or decline
              with a reason.
            </Text>
          </View>
        ) : (
          requests.map((request) => (
            <View key={request.repair_id} style={[styles.card, { marginBottom: 12 }]}>
              <Text style={styles.cardTitle}>
                {request.requested_by}
                {request.requested_by_id ? ` (${request.requested_by_id})` : ''} wants you on{' '}
                {request.job_type === 'installation' ? 'an installation' : 'a repair'}
              </Text>
              <Text style={styles.body}>
                Customer: {request.customer || 'Customer'}
                {request.address ? `\n${request.address}` : ''}
              </Text>

              <View style={styles.buttons}>
                <Pressable
                  onPress={() => void accept(request)}
                  disabled={busy}
                  style={({ pressed }) => [styles.acceptButton, (pressed || busy) && styles.pressed]}
                >
                  <Text style={styles.acceptText}>Accept</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setReason('')
                    setDeclining(request)
                  }}
                  disabled={busy}
                  style={({ pressed }) => [styles.declineButton, (pressed || busy) && styles.pressed]}
                >
                  <Text style={styles.declineText}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Text style={styles.footnote}>Accepting needs you to be free: finish your current job first.</Text>
      </ScrollView>

      <Modal visible={declining !== null} transparent animationType="fade" onRequestClose={() => setDeclining(null)}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.sheetTitle}>Decline request</Text>
            <Text style={styles.body}>
              Tell {declining?.requested_by || 'them'} why you can&apos;t join.
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Your reason (required)"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={200}
              style={styles.input}
            />
            <View style={styles.buttons}>
              <Pressable
                onPress={() => setDeclining(null)}
                style={({ pressed }) => [styles.declineButton, pressed && styles.pressed]}
              >
                <Text style={styles.declineText}>Back</Text>
              </Pressable>
              <Pressable
                onPress={() => void sendDecline()}
                disabled={busy}
                style={({ pressed }) => [styles.acceptButton, (pressed || busy) && styles.pressed]}
              >
                <Text style={styles.acceptText}>Send reason & decline</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 18,
  },
  bigIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 6,
  },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  acceptButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
  declineButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  footnote: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 16 },
  pressed: { opacity: 0.75 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  input: {
    height: 90,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: 14,
    paddingTop: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    marginTop: 12,
  },
})
