import { SkeletonRows } from '@/components/Skeleton'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { Alert } from '@/components/AppAlert'
import { SignaturePad } from '@/components/SignaturePad'
import { colors, radii } from '@/constants/theme'
import { friendlyError } from '@/lib/errors'
import { loadJobPhotos, signOffOwnJob, type JobPhoto, type Stroke } from '@/lib/jobEvidence'

/**
 * The customer was not home when the technician finished. They look at the
 * before and after photos and sign here; signing finishes the job.
 */
export function SignOffSheet({
  repairId,
  clientId,
  customerName,
  onClose,
  onSigned,
}: {
  repairId: string | null
  clientId: string
  customerName: string
  onClose: () => void
  onSigned: () => void
}) {
  const [photos, setPhotos] = useState<JobPhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [signature, setSignature] = useState<Stroke[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!repairId) return undefined
    let active = true
    setSignature([])
    setError('')
    setPhotos([])
    setLoading(true)
    void loadJobPhotos(repairId)
      .then((result) => active && setPhotos(result.photos))
      .catch(() => {})
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [repairId])

  async function submit() {
    if (!repairId) return
    if (!signature.some((stroke) => stroke.length > 1)) {
      setError('Please sign in the box first.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await signOffOwnJob(clientId, repairId, signature, customerName || 'Customer')
      onSigned()
      Alert.alert('Thank you', 'Your installation is signed. Your bills and payments are now available.')
    } catch (e: any) {
      setError(friendlyError(e, 'Could not save your signature. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const before = photos.filter((photo) => photo.photo_type === 'before')
  const after = photos.filter((photo) => photo.photo_type === 'after')

  return (
    <Modal visible={!!repairId} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Check and sign</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }} scrollEnabled={!saving}>
            <Text style={styles.text}>
              Your technician finished the work. Look at the photos, then sign to confirm that it was done.
            </Text>

            {loading ? (
              <SkeletonRows count={2} />
            ) : (
              <View style={styles.photoRow}>
                {[
                  ['Before', before[0]],
                  ['After', after[0]],
                ].map(([label, photo]) => (
                  <View key={label as string} style={{ flex: 1 }}>
                    {photo ? (
                      <Image source={{ uri: (photo as JobPhoto).url }} style={styles.photo} resizeMode="cover" />
                    ) : (
                      <View style={[styles.photo, styles.noPhoto]}>
                        <Text style={styles.noPhotoText}>No photo</Text>
                      </View>
                    )}
                    <Text style={styles.photoLabel}>{label as string}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.label}>YOUR SIGNATURE</Text>
            <SignaturePad strokes={signature} onChange={setSignature} />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={() => void submit()}
              disabled={saving}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, (pressed || saving) && { opacity: 0.7 }]}
            >
              <Ionicons name="checkmark-done-outline" size={18} color={colors.bg} />
              <Text style={styles.buttonText}>{saving ? 'Saving...' : 'I confirm the work is done'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: 20,
    maxHeight: '92%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  text: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  photoRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  photo: { width: '100%', height: 150, borderRadius: radii.sm, backgroundColor: colors.input },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  noPhotoText: { color: colors.muted, fontSize: 12 },
  photoLabel: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  label: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginTop: 18, marginBottom: 8 },
  error: { color: colors.danger, fontSize: 13, marginTop: 10 },
  button: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 14,
  },
  buttonText: { color: colors.bg, fontSize: 15, fontWeight: '800' },
})
