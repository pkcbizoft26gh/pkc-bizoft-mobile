import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { Alert } from '@/components/AppAlert'
import { colors, radii } from '@/constants/theme'
import { friendlyError } from '@/lib/errors'
import {
  declareUsed,
  expectedBack,
  fetchJobMaterialLines,
  fmtQty,
  returnLeftovers,
  type JobRef,
  type MaterialLine,
} from '@/lib/jobMaterials'

/** Steppers for "how much of what I took did I use" (0 .. taken). */
export function UsedMaterialsEditor({
  lines,
  used,
  onChange,
}: {
  lines: MaterialLine[]
  used: Record<string, number>
  onChange: (next: Record<string, number>) => void
}) {
  return (
    <>
      {lines.map((line) => {
        const value = used[line.item_id] ?? line.out
        const step = (delta: number) =>
          onChange({ ...used, [line.item_id]: Math.min(line.out, Math.max(0, Math.round((value + delta) * 100) / 100)) })
        return (
          <View key={line.item_id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{line.name}</Text>
              <Text style={styles.muted}>
                Took {fmtQty(line.out)} {line.unit ?? ''} · bring back {fmtQty(Math.max(0, line.out - value - line.returned))}
              </Text>
            </View>
            <Pressable onPress={() => step(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Used one less ${line.name}`}>
              <Ionicons name="remove-circle-outline" size={26} color={colors.accent} />
            </Pressable>
            <Text style={styles.qty}>{fmtQty(value)}</Text>
            <Pressable onPress={() => step(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Used one more ${line.name}`}>
              <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
            </Pressable>
          </View>
        )
      })}
    </>
  )
}

/**
 * One job's materials: declare what was used (if not yet), then return the
 * leftovers. The return should be exactly what is left; a different amount
 * needs a reason and the admins are warned.
 */
export function JobMaterialsSheet({
  job,
  onClose,
  onChanged,
}: {
  job: Pick<JobRef, 'kind' | 'id' | 'title'> | null
  onClose: () => void
  onChanged?: () => void
}) {
  const [lines, setLines] = useState<MaterialLine[] | null>(null)
  const [used, setUsed] = useState<Record<string, number>>({})
  const [back, setBack] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!job) return
    try {
      const list = await fetchJobMaterialLines(job)
      setLines(list)
      setUsed(Object.fromEntries(list.map((l) => [l.item_id, l.used ?? l.out])))
      setBack(Object.fromEntries(list.map((l) => [l.item_id, fmtQty(expectedBack(l))])))
    } catch (e) {
      setError(friendlyError(e, 'Could not load the materials for this job.'))
    }
  }, [job])

  useEffect(() => {
    setLines(null)
    setNote('')
    setError('')
    void load()
  }, [load])

  if (!job) return null

  const declared = !!lines && lines.every((l) => l.used != null)
  const open = (lines ?? []).filter((l) => !l.return_done)
  const settled = !!lines && lines.length > 0 && open.length === 0
  const mismatch = open.some((l) => Number(back[l.item_id] || 0) !== expectedBack(l))

  async function saveUsed() {
    if (!job) return
    setSaving(true)
    setError('')
    try {
      await declareUsed(job, used)
      await load()
      onChanged?.()
    } catch (e) {
      setError(friendlyError(e, 'Could not save what you used.'))
    } finally {
      setSaving(false)
    }
  }

  async function saveReturn() {
    if (!job) return
    const values = Object.fromEntries(open.map((l) => [l.item_id, Number(back[l.item_id] || 0)]))
    if (Object.values(values).some((v) => !Number.isFinite(v) || v < 0)) return setError('Amounts must be 0 or more.')
    if (mismatch && !note.trim()) return setError('The amounts do not match what should come back. Write the reason.')
    setSaving(true)
    setError('')
    try {
      const problems = await returnLeftovers(job, values, note)
      await load()
      onChanged?.()
      if (problems.length > 0) {
        Alert.alert('Return saved with a warning', `The admin was told: ${problems.join('; ')}.`)
      } else {
        Alert.alert('Returned', 'Everything that should come back is back. Thank you!')
      }
    } catch (e) {
      setError(friendlyError(e, 'Could not save the return.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Materials</Text>
              <Text style={styles.muted} numberOfLines={1}>{job.title}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {lines === null ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
          ) : lines.length === 0 ? (
            <Text style={[styles.muted, { marginVertical: 16 }]}>No materials were taken for this job.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.step}>1 · WHAT YOU USED</Text>
              {declared && open.length < lines.length ? (
                lines.map((l) => (
                  <Text key={l.item_id} style={styles.muted}>
                    {l.name}: used {fmtQty(l.used ?? 0)} of {fmtQty(l.out)}
                  </Text>
                ))
              ) : (
                <UsedMaterialsEditor lines={lines} used={used} onChange={setUsed} />
              )}
              {!settled && (
                <Pressable onPress={() => void saveUsed()} disabled={saving} style={[styles.btn, styles.ghost, saving && { opacity: 0.6 }]}>
                  <Text style={[styles.btnText, { color: colors.text }]}>{declared ? 'Update what I used' : 'Save what I used'}</Text>
                </Pressable>
              )}

              {declared && (
                <>
                  <Text style={styles.step}>2 · RETURN THE LEFTOVERS</Text>
                  {settled ? (
                    <Text style={[styles.muted, { color: colors.success }]}>✓ All settled for this job.</Text>
                  ) : (
                    <>
                      <Text style={styles.muted}>Bring these back to the store. The amounts must match exactly.</Text>
                      {open.map((l) => {
                        const expected = expectedBack(l)
                        const off = Number(back[l.item_id] || 0) !== expected
                        return (
                          <View key={l.item_id} style={styles.row}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.name} numberOfLines={1}>{l.name}</Text>
                              <Text style={[styles.muted, off && { color: colors.warning }]}>
                                Should return {fmtQty(expected)} {l.unit ?? ''}
                                {off ? ' — not exact' : ''}
                              </Text>
                            </View>
                            <TextInput
                              value={back[l.item_id] ?? ''}
                              onChangeText={(v) => setBack((b) => ({ ...b, [l.item_id]: v }))}
                              keyboardType="decimal-pad"
                              style={[styles.input, styles.qtyInput, off && { borderColor: colors.warning }]}
                              accessibilityLabel={`Returned ${l.name}`}
                            />
                          </View>
                        )
                      })}
                      {mismatch && (
                        <TextInput
                          value={note}
                          onChangeText={setNote}
                          placeholder="Why is it different? (e.g. 1 connector broke on site)"
                          placeholderTextColor={colors.muted}
                          style={styles.input}
                          multiline
                        />
                      )}
                      <Pressable onPress={() => void saveReturn()} disabled={saving} style={[styles.btn, saving && { opacity: 0.6 }]}>
                        <Text style={styles.btnText}>{saving ? 'Saving…' : 'Confirm return'}</Text>
                      </Pressable>
                    </>
                  )}
                </>
              )}
            </ScrollView>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  step: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  name: { color: colors.text, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  qty: { color: colors.text, fontSize: 16, fontWeight: '800', minWidth: 30, textAlign: 'center' },
  input: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginTop: 8,
  },
  qtyInput: { width: 72, marginTop: 0, textAlign: 'center', fontSize: 15, fontWeight: '800' },
  btn: { marginTop: 14, backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center' },
  ghost: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  btnText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
  error: { color: colors.danger, fontSize: 12, marginTop: 10 },
})
