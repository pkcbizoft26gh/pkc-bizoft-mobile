import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

// Lets a customer rate a finished job (and its technician) or the service as a
// whole: 1-5 stars and an optional comment. The server enforces one rating per
// job and one overall rating per week.

type Target =
  | { kind: 'technician'; repairId: string; title: string; subtitle: string }
  | { kind: 'service'; repairId: null; title: string; subtitle: string }

const DONE = /(complete|resolved|done|fixed)/i
const LABELS = ['Very bad', 'Bad', 'Okay', 'Good', 'Excellent']

async function findUnratedJob(): Promise<Target | null> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null

  const { data: client } = await supabase.from('clients').select('id').eq('user_id', auth.user.id).maybeSingle()
  if (!client) return null

  const [repairs, rated] = await Promise.all([
    supabase
      .from('repair_records')
      .select('id, technician, problem_description, status, repair_date')
      .eq('client_id', client.id)
      .order('repair_date', { ascending: false })
      .limit(10),
    supabase.from('ratings').select('repair_record_id').eq('user_id', auth.user.id).not('repair_record_id', 'is', null),
  ])

  const ratedIds = new Set((rated.data || []).map((r) => r.repair_record_id as string))
  const job = (repairs.data || []).find((r) => DONE.test(r.status || '') && !ratedIds.has(r.id))
  if (!job) return null

  return {
    kind: 'technician',
    repairId: job.id,
    title: job.technician ? `How was ${job.technician}'s work?` : 'How was your recent job?',
    subtitle: job.problem_description || 'Completed job',
  }
}

const SERVICE_TARGET: Target = {
  kind: 'service',
  repairId: null,
  title: 'Rate our service',
  subtitle: 'Tell us how PKC BIZOFT is doing overall.',
}

export function RatingPrompt() {
  const [job, setJob] = useState<Target | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [thanks, setThanks] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setJob(await findUnratedJob())
    } catch {
      // Ratings are optional; never break the Home screen because of them.
    }
  }, [])

  useEffect(() => {
    void refresh()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh()
    })
    return () => sub.remove()
  }, [refresh])

  return (
    <>
      {job ? (
        <Pressable onPress={() => setTarget(job)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
          <Ionicons name="star" size={22} color={colors.warning} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{job.title}</Text>
            <Text style={styles.cardBody} numberOfLines={1}>
              {job.subtitle}
            </Text>
          </View>
          <Text style={styles.cardAction}>Rate</Text>
        </Pressable>
      ) : null}

      <Pressable onPress={() => setTarget(SERVICE_TARGET)} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.accent} />
        <Text style={styles.linkText}>{thanks ? 'Thanks for your feedback!' : 'Rate our service'}</Text>
      </Pressable>

      {target ? (
        <RatingModal
          key={target.repairId ?? 'service'}
          target={target}
          onClose={() => setTarget(null)}
          onDone={() => {
            setTarget(null)
            setThanks(true)
            void refresh()
          }}
        />
      ) : null}
    </>
  )
}

function RatingModal({
  target,
  onClose,
  onDone,
}: {
  target: Target
  onClose: () => void
  onDone: () => void
}) {
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (busy) return
    if (stars < 1) {
      setError('Please tap a star rating first.')
      return
    }
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('submit_rating', {
      p_kind: target.kind,
      p_repair_id: target.repairId,
      p_stars: stars,
      p_comment: comment.trim() || null,
    })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onDone()
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{target.title}</Text>
          <Text style={styles.sheetSub}>{target.subtitle}</Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setStars(n)} hitSlop={6} accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}>
                <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={40} color={n <= stars ? colors.warning : colors.muted} />
              </Pressable>
            ))}
          </View>
          <Text style={styles.starLabel}>{stars ? LABELS[stars - 1] : 'Tap a star'}</Text>

          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Add a comment (optional)"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={500}
            style={styles.input}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Not now</Text>
            </Pressable>
            <Pressable onPress={() => void submit()} disabled={busy} style={[styles.btn, styles.btnPrimary, busy && styles.pressed]}>
              {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.btnPrimaryText}>Send</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 10,
    borderRadius: radii.md,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.warning + '66',
  },
  cardText: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  cardBody: { color: colors.muted, fontSize: 12, marginTop: 2 },
  cardAction: { color: colors.warning, fontSize: 13, fontWeight: '800' },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginBottom: 6 },
  linkText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.7 },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 6, 12, 0.6)' },
  dismiss: { flex: 1 },
  sheet: {
    padding: 20,
    paddingBottom: 28,
    backgroundColor: colors.panel,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sheetSub: { color: colors.muted, fontSize: 13, marginTop: 4 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 20 },
  starLabel: { color: colors.muted, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  input: {
    minHeight: 80,
    marginTop: 16,
    padding: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  error: { color: colors.danger, fontSize: 13, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, height: 46, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.bg, fontSize: 14, fontWeight: '800' },
})
