import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Alert } from '@/components/AppAlert'
import { GlassCard } from '@/components/GlassCard'
import { JobMaterialsSheet, UsedMaterialsEditor } from '@/components/JobMaterialsSheet'
import { colors, radii } from '@/constants/theme'
import { friendlyError } from '@/lib/errors'
import { takePhoto } from '@/lib/jobEvidence'
import { declareUsed, fetchJobMaterialLines, type MaterialLine } from '@/lib/jobMaterials'
import { useLiveRefresh } from '@/lib/live'
import { supabase } from '@/lib/supabase'
import { photoBytes } from '@/lib/photoBytes'

// Backbone (infrastructure) jobs: work on the network itself — fiber lines,
// poles, NAP boxes — with no customer. Admins create them on the website; a
// technician can also start one here (e.g. a fiber cut found on the road).

type BackboneJob = {
  id: string
  tenant_id: string
  title: string
  job_type: 'repair' | 'new_installation'
  area: string | null
  landmark: string | null
  description: string | null
  status: 'open' | 'assigned' | 'in_progress' | 'done' | 'cancelled'
  technician_user_id: string | null
  latitude: number | null
  longitude: number | null
  created_at: string
  completed_at: string | null
}

const TYPE_LABEL = { repair: 'Repair', new_installation: 'New install' } as const
const STATUS_LABEL: Record<BackboneJob['status'], string> = {
  open: 'Open',
  assigned: 'Assigned to you',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
}

async function uploadBackbonePhoto(job: BackboneJob, kind: 'before' | 'after', uri: string) {
  const bytes = await photoBytes(uri)
  const path = `${job.tenant_id}/${job.id}/${kind}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from('backbone-photos').upload(path, bytes, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  return path
}

export default function BackboneScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [me, setMe] = useState<string | null>(null)
  const [jobs, setJobs] = useState<BackboneJob[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [finishing, setFinishing] = useState<BackboneJob | null>(null)
  const [materialsJob, setMaterialsJob] = useState<BackboneJob | null>(null)

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    setMe(user?.id ?? null)
    const { data, error } = await supabase
      .from('backbone_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80)
    if (error) Alert.alert('Could not load backbone jobs', friendlyError(error, 'Please try again.'))
    setJobs((data ?? []) as BackboneJob[])
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useLiveRefresh(['backbone_jobs'], load)

  const open = (jobs ?? []).filter((j) => j.status === 'open')
  const mine = (jobs ?? []).filter((j) => j.technician_user_id === me && (j.status === 'assigned' || j.status === 'in_progress'))
  const done = (jobs ?? []).filter((j) => j.technician_user_id === me && j.status === 'done').slice(0, 5)

  async function take(job: BackboneJob, action: 'accept' | 'start') {
    setBusyId(job.id)
    const { error } = await supabase.rpc('backbone_job_take', { p_job: job.id, p_action: action })
    setBusyId(null)
    if (error) return Alert.alert('Could not update the job', friendlyError(error, 'Please try again.'))
    void load()
  }

  function openMap(job: BackboneJob) {
    if (job.latitude == null || job.longitude == null) return
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${job.latitude},${job.longitude}`)
  }

  const card = (job: BackboneJob) => (
    <GlassCard key={job.id} style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.icon}>
          <Ionicons name={job.job_type === 'repair' ? 'build-outline' : 'git-network-outline'} size={18} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{job.title}</Text>
          <Text style={styles.muted}>
            {TYPE_LABEL[job.job_type]} · {STATUS_LABEL[job.status]}
            {job.area ? ` · ${job.area}` : ''}
          </Text>
          {job.landmark ? <Text style={styles.muted}>Landmark: {job.landmark}</Text> : null}
          {job.description ? <Text style={styles.body}>{job.description}</Text> : null}
        </View>
      </View>
      <View style={styles.actions}>
        {job.latitude != null ? (
          <Pressable onPress={() => openMap(job)} style={styles.ghostBtn}>
            <Ionicons name="navigate-outline" size={15} color={colors.accent} />
            <Text style={styles.ghostText}>Map</Text>
          </Pressable>
        ) : null}
        {job.status === 'open' ? (
          <Pressable onPress={() => void take(job, 'accept')} disabled={busyId === job.id} style={styles.mainBtn}>
            <Text style={styles.mainText}>{busyId === job.id ? 'Taking…' : 'Take this job'}</Text>
          </Pressable>
        ) : null}
        {job.status === 'assigned' && job.technician_user_id === me ? (
          <Pressable onPress={() => void take(job, 'start')} disabled={busyId === job.id} style={styles.mainBtn}>
            <Text style={styles.mainText}>Start</Text>
          </Pressable>
        ) : null}
        {job.status === 'in_progress' && job.technician_user_id === me ? (
          <>
            <Pressable onPress={() => router.push('/materials')} style={styles.ghostBtn}>
              <Ionicons name="cube-outline" size={15} color={colors.accent} />
              <Text style={styles.ghostText}>Take materials</Text>
            </Pressable>
            <Pressable onPress={() => setFinishing(job)} style={styles.mainBtn}>
              <Text style={styles.mainText}>Finish</Text>
            </Pressable>
          </>
        ) : null}
        {job.status === 'done' ? (
          <Pressable onPress={() => setMaterialsJob(job)} style={styles.ghostBtn}>
            <Ionicons name="cube-outline" size={15} color={colors.accent} />
            <Text style={styles.ghostText}>Materials / return</Text>
          </Pressable>
        ) : null}
      </View>
    </GlassCard>
  )

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void load()
            }}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.close} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-down" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>INFRASTRUCTURE</Text>
            <Text style={styles.title}>Backbone jobs</Text>
          </View>
        </View>

        <Pressable onPress={() => setCreating(true)} style={styles.newBtn}>
          <Ionicons name="add-circle-outline" size={18} color={colors.bg} />
          <Text style={styles.mainText}>Start a backbone job</Text>
        </Pressable>

        {jobs === null ? <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} /> : null}

        {mine.length > 0 ? <Text style={styles.section}>MY BACKBONE JOBS</Text> : null}
        {mine.map(card)}

        {jobs !== null ? <Text style={styles.section}>OPEN — ANYONE CAN TAKE</Text> : null}
        {jobs !== null && open.length === 0 ? <Text style={styles.muted}>Nothing open right now.</Text> : null}
        {open.map(card)}

        {done.length > 0 ? <Text style={styles.section}>RECENTLY FINISHED</Text> : null}
        {done.map(card)}
      </ScrollView>

      <CreateModal visible={creating} onClose={() => setCreating(false)} onCreated={() => void load()} />
      <FinishModal job={finishing} onClose={() => setFinishing(null)} onDone={() => void load()} />
      <JobMaterialsSheet
        job={materialsJob ? { kind: 'backbone', id: materialsJob.id, title: materialsJob.title } : null}
        onClose={() => setMaterialsJob(null)}
      />
    </View>
  )
}

function CreateModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'repair' | 'new_installation'>('repair')
  const [area, setArea] = useState('')
  const [landmark, setLandmark] = useState('')
  const [details, setDetails] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (title.trim().length < 3) return Alert.alert('Add a title', 'For example: “Fiber cut near the plaza”.')
    setSaving(true)
    let coords: { latitude: number; longitude: number } | null = null
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (permission.granted) {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        coords = position.coords
      }
    } catch {
      // The pin is optional; the area and landmark still say where it is.
    }
    const { error } = await supabase.rpc('backbone_job_create', {
      p_title: title.trim(),
      p_job_type: type,
      p_area: area,
      p_landmark: landmark,
      p_lat: coords?.latitude ?? null,
      p_lng: coords?.longitude ?? null,
      p_description: details,
    })
    setSaving(false)
    if (error) return Alert.alert('Could not start the job', friendlyError(error, 'Please try again.'))
    setTitle('')
    setArea('')
    setLandmark('')
    setDetails('')
    onCreated()
    onClose()
    Alert.alert('Backbone job started', 'The admin was told. Take the materials you need for it in Materials.')
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Start a backbone job</Text>
          <Text style={styles.muted}>Your current location is saved as the pin.</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="What is it? (e.g. Fiber cut near the plaza)" placeholderTextColor={colors.muted} style={styles.input} maxLength={120} />
          <View style={styles.chips}>
            {(['repair', 'new_installation'] as const).map((t) => (
              <Pressable key={t} onPress={() => setType(t)} style={[styles.chip, type === t && styles.chipOn]}>
                <Text style={[styles.chipText, type === t && { color: colors.bg }]}>{TYPE_LABEL[t]}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={area} onChangeText={setArea} placeholder="Area / purok" placeholderTextColor={colors.muted} style={styles.input} />
          <TextInput value={landmark} onChangeText={setLandmark} placeholder="Landmark (e.g. pole beside the chapel)" placeholderTextColor={colors.muted} style={styles.input} />
          <TextInput value={details} onChangeText={setDetails} placeholder="Details (optional)" placeholderTextColor={colors.muted} style={styles.input} multiline />
          <View style={styles.row}>
            <Pressable onPress={onClose} style={[styles.sheetBtn, styles.ghostSheetBtn]}>
              <Text style={[styles.mainText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => void save()} disabled={saving} style={[styles.sheetBtn, saving && { opacity: 0.6 }]}>
              <Text style={styles.mainText}>{saving ? 'Starting…' : 'Start job'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function FinishModal({ job, onClose, onDone }: { job: BackboneJob | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [before, setBefore] = useState<string | null>(null)
  const [after, setAfter] = useState<string | null>(null)
  const [lines, setLines] = useState<MaterialLine[]>([])
  const [used, setUsed] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setNote('')
    setBefore(null)
    setAfter(null)
    setUsed({})
    setLines([])
    setError('')
    if (job) {
      void fetchJobMaterialLines({ kind: 'backbone', id: job.id })
        .then(setLines)
        .catch(() => {})
    }
  }, [job])

  if (!job) return null
  const open = lines.filter((l) => !l.return_done)

  async function finish() {
    if (!job) return
    if (note.trim().length < 3) return setError('Write what you did.')
    if (!before || !after) return setError('Take the before and after photos.')
    setSaving(true)
    setError('')
    try {
      const beforePath = await uploadBackbonePhoto(job, 'before', before)
      const afterPath = await uploadBackbonePhoto(job, 'after', after)
      // Read again: a retry after a failed finish must not declare twice.
      const pending = (await fetchJobMaterialLines({ kind: 'backbone', id: job.id })).filter((l) => !l.return_done)
      if (pending.length > 0) {
        await declareUsed(
          { kind: 'backbone', id: job.id },
          Object.fromEntries(pending.map((l) => [l.item_id, used[l.item_id] ?? l.out])),
        )
      }
      const { error: rpcError } = await supabase.rpc('backbone_job_finish', {
        p_job: job.id,
        p_resolution: note.trim(),
        p_before: beforePath,
        p_after: afterPath,
      })
      if (rpcError) throw rpcError
      const back = open
        .map((l) => ({ l, qty: l.out - (used[l.item_id] ?? l.out) - l.returned }))
        .filter((x) => x.qty > 0)
      onDone()
      onClose()
      Alert.alert(
        'Backbone job done',
        back.length > 0
          ? `Bring back exactly: ${back.map((x) => `${x.qty} ${x.l.unit ?? ''} ${x.l.name}`).join(', ')}. Record it with “Materials / return”.`
          : 'Thank you! The admin was told.',
      )
    } catch (e) {
      setError(friendlyError(e, 'Could not finish the job.'))
    } finally {
      setSaving(false)
    }
  }

  const photoBox = (kind: 'before' | 'after', uri: string | null, set: (v: string | null) => void) => (
    <Pressable
      onPress={() => void takePhoto().then((p) => p && set(p.uri))}
      style={[styles.photo, uri ? { borderColor: colors.success } : null]}
      accessibilityRole="button"
      accessibilityLabel={`Take the ${kind} photo`}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.photoImg} />
      ) : (
        <>
          <Ionicons name="camera-outline" size={24} color={colors.accent} />
          <Text style={styles.muted}>{kind === 'before' ? 'Before' : 'After'}</Text>
        </>
      )}
    </Pressable>
  )

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }}>
            <Text style={styles.sheetTitle}>Finish: {job.title}</Text>
            <TextInput value={note} onChangeText={setNote} placeholder="What did you do?" placeholderTextColor={colors.muted} style={styles.input} multiline />
            <Text style={styles.section}>PHOTOS (REQUIRED)</Text>
            <View style={styles.row}>
              {photoBox('before', before, setBefore)}
              {photoBox('after', after, setAfter)}
            </View>
            {open.length > 0 ? (
              <>
                <Text style={styles.section}>MATERIALS YOU TOOK — HOW MUCH DID YOU USE?</Text>
                <UsedMaterialsEditor lines={open} used={used} onChange={setUsed} />
              </>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.row}>
              <Pressable onPress={onClose} style={[styles.sheetBtn, styles.ghostSheetBtn]}>
                <Text style={[styles.mainText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void finish()} disabled={saving} style={[styles.sheetBtn, saving && { opacity: 0.6 }]}>
                <Text style={styles.mainText}>{saving ? 'Saving…' : 'Finish job'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
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
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  section: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 18, marginBottom: 8 },
  card: { padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', gap: 12 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.text, fontSize: 15, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  body: { color: colors.text, fontSize: 13, marginTop: 6, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'flex-end' },
  mainBtn: { backgroundColor: colors.accent, borderRadius: radii.md, paddingHorizontal: 16, paddingVertical: 10 },
  mainText: { color: colors.bg, fontWeight: '900', fontSize: 13 },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ghostText: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 14,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: 20,
    paddingBottom: 32,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  input: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginTop: 10,
  },
  chips: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  sheetBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  ghostSheetBtn: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  photo: {
    flex: 1,
    height: 110,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  photoImg: { width: '100%', height: '100%' },
  error: { color: colors.danger, fontSize: 12, marginTop: 10 },
})
