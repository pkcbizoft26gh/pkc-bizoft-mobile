import { SkeletonRows } from '@/components/Skeleton'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'

// Everything done at this customer before: past jobs, what was found, who did
// it, and the modem serial. The database only shows it to staff who are working
// for that customer, so a technician sees it while the job is open.

type PastJob = {
  id: string
  repair_date: string | null
  job_type: string | null
  status: string | null
  problem: string | null
  resolution: string | null
  technician: string
  created_at: string
  completed_at: string | null
  arrived_at: string | null
  has_checklist: boolean
}

type History = { modem_serial: string | null; jobs: PastJob[] }

type Props = {
  visible: boolean
  clientId: string | null
  customerName: string
  /** The job being looked at now; left out of the list. */
  currentJobId?: string | null
  onClose: () => void
}

function day(value: string | null) {
  if (!value) return ''
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function JobHistorySheet({ visible, clientId, customerName, currentJobId, onClose }: Props) {
  const [history, setHistory] = useState<History | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visible || !clientId) return
    let cancelled = false
    setLoading(true)
    setError('')
    setHistory(null)
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc('client_job_history', { p_client_id: clientId })
      if (cancelled) return
      if (rpcError) setError(friendlyError(rpcError, 'Could not load the history.'))
      else setHistory(data as History)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [visible, clientId])

  const jobs = (history?.jobs ?? []).filter((job) => job.id !== currentJobId)

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="time-outline" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Past jobs</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {customerName}
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close history" style={styles.close}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {loading ? <SkeletonRows count={3} /> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            {history?.modem_serial ? (
              <View style={styles.serial}>
                <Ionicons name="barcode-outline" size={18} color={colors.accent} />
                <Text style={styles.serialText}>Modem serial: {history.modem_serial}</Text>
              </View>
            ) : null}

            {history && jobs.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="checkmark-circle-outline" size={36} color={colors.muted} />
                <Text style={styles.emptyText}>No earlier jobs for this customer.</Text>
              </View>
            ) : null}

            {jobs.map((job) => (
              <View key={job.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardKind}>{job.job_type === 'installation' ? 'Installation' : 'Repair'}</Text>
                  <Text style={styles.cardDate}>{day(job.completed_at || job.repair_date || job.created_at)}</Text>
                </View>
                {job.problem ? <Text style={styles.problem}>{job.problem}</Text> : null}
                {job.resolution ? (
                  <Text style={styles.resolution}>
                    <Text style={styles.label}>Result: </Text>
                    {job.resolution}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  {job.technician} · {job.status || 'Unknown'}
                  {job.has_checklist ? ' · checklist done' : ''}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.panel,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 18,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.white, fontSize: 18, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  close: {
    width: 38,
    height: 38,
    borderRadius: radii.round,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 18, paddingBottom: 34, gap: 10 },
  error: { color: colors.danger, fontSize: 13 },
  serial: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
  },
  serialText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  emptyText: { color: colors.muted, fontSize: 14 },
  card: {
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  cardKind: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  cardDate: { color: colors.muted, fontSize: 12 },
  problem: { color: colors.text, fontSize: 14, lineHeight: 20 },
  resolution: { color: colors.text, fontSize: 13, lineHeight: 19 },
  label: { color: colors.success, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 12 },
})
