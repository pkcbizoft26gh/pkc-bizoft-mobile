import { friendlyError } from '@/lib/errors'
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
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

// Lets a customer rate a finished job (and its technician) or the service as a
// whole: 1-5 stars and an optional comment. The server enforces one rating per
// job and one overall rating ever; the overall one is changed through the help bot.

type Target =
  | { kind: 'technician'; repairId: string; title: string; subtitle: string }
  | { kind: 'service'; repairId: null; title: string; subtitle: string }

const DONE = /(complete|resolved|done|fixed)/i
const LABELS = ['Very bad', 'Bad', 'Okay', 'Good', 'Excellent']

// Three quick yes/no questions that go with a technician rating. All optional.
const SURVEY = [
  { key: 'on_time', label: 'Did the technician arrive on time?' },
  { key: 'explained', label: 'Did they explain what they did clearly?' },
  { key: 'tidy', label: 'Did they leave the area tidy?' },
] as const

type SurveyKey = (typeof SURVEY)[number]['key']

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
  const [rated, setRated] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const found = await findUnratedJob()
      setJob(found)
      const { data: auth } = await supabase.auth.getUser()
      if (auth.user) {
        const { data: mine } = await supabase.from('ratings').select('id').eq('user_id', auth.user.id).eq('kind', 'service').limit(1)
        setRated((mine || []).length > 0)
      }
      // A finished job asks for its rating by itself, once. "Not now" leaves the card on Home.
      if (found?.repairId) {
        const key = `rating-popup-${found.repairId}`
        const shown = await AsyncStorage.getItem(key)
        if (!shown) {
          await AsyncStorage.setItem(key, '1')
          setTarget(found)
        }
      }
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

      {rated || thanks ? (
        <View style={styles.link}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.accent} />
          <Text style={styles.linkText}>Thanks for rating us! To change it, ask the help bot.</Text>
        </View>
      ) : (
        <Pressable onPress={() => setTarget(SERVICE_TARGET)} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.accent} />
          <Text style={styles.linkText}>Rate our service (one time)</Text>
        </Pressable>
      )}

      {target ? (
        <RatingModal
          key={target.repairId ?? 'service'}
          target={target}
          onClose={() => setTarget(null)}
          onDone={() => {
            setTarget(null)
            if (target.kind === 'service') setThanks(true)
            void refresh()
          }}
        />
      ) : null}
    </>
  )
}

export function ServiceRatingModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  // Opened from the help bot: changes the overall rating, or gives it if there is none yet.
  const [existing, setExisting] = useState<{ stars: number; comment: string | null } | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return live && setExisting(null)
      const { data } = await supabase
        .from('ratings')
        .select('stars, comment')
        .eq('user_id', auth.user.id)
        .eq('kind', 'service')
        .order('created_at', { ascending: false })
        .limit(1)
      if (live) setExisting(data && data[0] ? { stars: data[0].stars as number, comment: (data[0].comment as string | null) ?? null } : null)
    })().catch(() => live && setExisting(null))
    return () => {
      live = false
    }
  }, [])

  if (existing === undefined) return null
  return (
    <RatingModal
      target={{
        ...SERVICE_TARGET,
        title: existing ? 'Change your rating' : SERVICE_TARGET.title,
      }}
      change={!!existing}
      initialStars={existing?.stars ?? 0}
      initialComment={existing?.comment ?? ''}
      onClose={onClose}
      onDone={onDone}
    />
  )
}

function RatingModal({
  target,
  onClose,
  onDone,
  change = false,
  initialStars = 0,
  initialComment = '',
}: {
  target: Target
  onClose: () => void
  onDone: () => void
  change?: boolean
  initialStars?: number
  initialComment?: string
}) {
  const [stars, setStars] = useState(initialStars)
  const [comment, setComment] = useState(initialComment)
  const [answers, setAnswers] = useState<Partial<Record<SurveyKey, boolean>>>({})
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
    const { data: ratingId, error: rpcError } = change
      ? await supabase.rpc('change_my_service_rating', { p_stars: stars, p_comment: comment.trim() || null })
      : await supabase.rpc('submit_rating', {
          p_kind: target.kind,
          p_repair_id: target.repairId,
          p_stars: stars,
          p_comment: comment.trim() || null,
        })
    if (rpcError) {
      setBusy(false)
      setError(friendlyError(rpcError, 'Something went wrong. Please try again.'))
      return
    }

    // The survey is a bonus: the rating is already saved, so never fail on it.
    if (ratingId && target.kind === 'technician' && Object.keys(answers).length > 0) {
      await supabase.rpc('add_rating_survey', {
        p_rating_id: ratingId,
        p_on_time: answers.on_time ?? null,
        p_explained: answers.explained ?? null,
        p_tidy: answers.tidy ?? null,
      })
    }
    setBusy(false)
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

          {target.kind === 'technician' && stars > 0
            ? SURVEY.map((question) => (
                <View key={question.key} style={styles.surveyRow}>
                  <Text style={styles.surveyLabel}>{question.label}</Text>
                  <View style={styles.surveyChoices}>
                    {([true, false] as const).map((value) => {
                      const selected = answers[question.key] === value
                      return (
                        <Pressable
                          key={String(value)}
                          onPress={() =>
                            setAnswers((prev) => {
                              const next = { ...prev }
                              if (selected) delete next[question.key]
                              else next[question.key] = value
                              return next
                            })
                          }
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`${question.label} ${value ? 'Yes' : 'No'}`}
                          style={[styles.chip, selected && (value ? styles.chipYes : styles.chipNo)]}
                        >
                          <Text style={[styles.chipText, selected && styles.chipTextOn]}>{value ? 'Yes' : 'No'}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              ))
            : null}

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
  surveyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  surveyLabel: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  surveyChoices: { flexDirection: 'row', gap: 8 },
  chip: {
    minWidth: 52,
    paddingVertical: 8,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  chipYes: { backgroundColor: colors.success, borderColor: colors.success },
  chipNo: { backgroundColor: colors.danger, borderColor: colors.danger },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  chipTextOn: { color: colors.bg },
  error: { color: colors.danger, fontSize: 13, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, height: 46, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.bg, fontSize: 14, fontWeight: '800' },
})
