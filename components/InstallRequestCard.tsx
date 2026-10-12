import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { GlassCard } from '@/components/GlassCard'
import { colors, radii } from '@/constants/theme'

type RequestLike = { request_type: string | null; status: string | null }
type RepairLike = {
  id: string
  job_type: string | null
  status: string | null
  technician: string | null
  technician_user_id: string | null
}

const STEPS = ['Payment sent', 'With technicians', 'Technician accepted', 'Sign to finish']

const DONE = /(complete|resolved|done|fixed)/i

/** Which step the new customer's installation request is at, or null when there is nothing to show. */
export function installStep(requests: RequestLike[], repairs: RepairLike[]) {
  const job = repairs.find((row) => row.job_type === 'installation' && !DONE.test(row.status || '') && !/cancel/i.test(row.status || ''))
  if (job) {
    if (/awaiting signature/i.test(job.status || '')) return { step: 3, job }
    return { step: job.technician_user_id ? 2 : 1, job }
  }
  const request = requests.find((row) => row.request_type === 'plan_change')
  const status = String(request?.status || '').toLowerCase()
  if (/^(payment pending|pending|processing)$/.test(status)) return { step: 0, job: null }
  if (status === 'for installation') return { step: 1, job: null }
  return null
}

/**
 * Where a new customer's request stands: payment sent, with the technicians,
 * accepted, then waiting for their signature.
 */
export function InstallRequestCard({
  requests,
  repairs,
  onSign,
}: {
  requests: RequestLike[]
  repairs: RepairLike[]
  onSign: (repairId: string) => void
}) {
  const found = installStep(requests, repairs)
  if (!found) return null
  const { step, job } = found

  const message = [
    'Your payment was sent to Accounting. We will tell you as soon as it is confirmed.',
    'Your request was sent to the technicians. Please wait a short while for one to accept it.',
    `${job?.technician || 'A technician'} accepted your request and will visit you soon.`,
    'Your technician finished the work. Check the before and after photos, then sign to confirm.',
  ][step]

  return (
    <GlassCard style={styles.card}>
      <Text style={styles.title}>YOUR INSTALLATION REQUEST</Text>

      <View style={styles.row}>
        {STEPS.map((label, index) => {
          const done = index < step
          const current = index === step
          return (
            <View key={label} style={styles.item}>
              <View style={[styles.dot, (done || current) && styles.dotOn]}>
                <Ionicons
                  name={done ? 'checkmark' : 'ellipse'}
                  size={done ? 14 : 8}
                  color={done || current ? colors.bg : colors.muted}
                />
              </View>
              <Text style={[styles.label, (done || current) && styles.labelOn]}>{label}</Text>
            </View>
          )
        })}
      </View>

      <Text style={styles.message}>{message}</Text>

      {step === 3 && job ? (
        <Pressable
          onPress={() => onSign(job.id)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.signButton, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="create-outline" size={18} color={colors.bg} />
          <Text style={styles.signText}>Check and sign</Text>
        </Pressable>
      ) : null}

      <Text style={styles.note}>Your bills and payments show here once the installation is signed.</Text>
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  card: { paddingVertical: 18, paddingHorizontal: 16, marginBottom: 16 },
  title: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 16 },
  row: { flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center' },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.accent },
  label: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  labelOn: { color: colors.accent },
  message: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 16 },
  signButton: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 13,
  },
  signText: { color: colors.bg, fontSize: 15, fontWeight: '800' },
  note: { color: colors.muted, fontSize: 12, marginTop: 14 },
})
