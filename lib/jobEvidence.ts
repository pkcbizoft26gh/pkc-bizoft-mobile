import * as ImagePicker from 'expo-image-picker'

import { supabase } from '@/lib/supabase'

// Photos and the customer's signature for a job. Files go in the private
// client-media bucket under jobs/<client id>/<job id>/ and each one gets a row
// in repair_photos, which the customer can read for their own jobs.

export type EvidenceType = 'before' | 'after' | 'signature'

export type Stroke = { x: number; y: number }[]

const BUCKET = 'client-media'

/** Opens the camera (or gallery as a fallback) and returns the chosen photo. */
export async function takePhoto(): Promise<{ uri: string; name: string } | null> {
  const camera = await ImagePicker.requestCameraPermissionsAsync()
  const result = camera.granted
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 })
  if (result.canceled || !result.assets?.[0]?.uri) return null
  const asset = result.assets[0]
  return { uri: asset.uri, name: asset.fileName || `photo-${Date.now()}.jpg` }
}

async function record(clientId: string, repairId: string, type: EvidenceType, path: string) {
  const { error } = await supabase.from('repair_photos').insert({ repair_id: repairId, photo_type: type, storage_path: path })
  if (error) throw error
}

export async function uploadJobPhoto(clientId: string, repairId: string, type: 'before' | 'after', uri: string) {
  const bytes = await (await fetch(uri)).arrayBuffer()
  const path = `jobs/${clientId}/${repairId}/${type}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  await record(clientId, repairId, type, path)
}

/** The signature is saved as its drawn strokes (a small JSON file). */
export async function uploadSignature(clientId: string, repairId: string, strokes: Stroke[], signedBy: string) {
  const body = JSON.stringify({ signedBy, signedAt: new Date().toISOString(), strokes })
  const path = `jobs/${clientId}/${repairId}/signature-${Date.now()}.json`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, new TextEncoder().encode(body).buffer as ArrayBuffer, { contentType: 'application/json', upsert: false })
  if (error) throw error
  await record(clientId, repairId, 'signature', path)
}

export type JobPhoto = { id: string; photo_type: string; url: string }

/** Before/after photos of a job with short-lived links. */
export async function loadJobPhotos(repairId: string): Promise<{ photos: JobPhoto[]; signed: boolean }> {
  const { data } = await supabase.from('repair_photos').select('id, photo_type, storage_path').eq('repair_id', repairId).order('created_at')
  const rows = data || []
  const photos: JobPhoto[] = []
  for (const row of rows) {
    if (row.photo_type !== 'before' && row.photo_type !== 'after') continue
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 3600)
    if (signed?.signedUrl) photos.push({ id: row.id, photo_type: row.photo_type, url: signed.signedUrl })
  }
  return { photos, signed: rows.some((row) => row.photo_type === 'signature') }
}
