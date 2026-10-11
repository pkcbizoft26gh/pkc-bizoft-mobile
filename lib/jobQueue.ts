import AsyncStorage from '@react-native-async-storage/async-storage'

import { supabase } from '@/lib/supabase'
import { isNetworkError } from '@/lib/errors'
import { uploadJobPhoto, uploadSignature, type Stroke } from '@/lib/jobEvidence'

// Finishing a job with no signal. The technician fills in the checklist, notes,
// photos and signature as usual; if the phone is offline the completion is kept
// on the phone and sent automatically when the connection returns. Each step is
// remembered once it has gone through, so a retry never uploads a photo twice or
// counts truck stock twice.

export type TruckUse = { itemId: string; qty: number }

export type CompletionPayload = {
  jobId: string
  clientId: string
  customerName: string
  /** What is written on the job as the resolution. */
  resolution: string | null
  checklist: unknown
  beforePhoto: string | null
  afterPhoto: string | null
  signature: Stroke[]
  truckUse: TruckUse[]
}

export type Progress = {
  before?: boolean
  after?: boolean
  signature?: boolean
  completed?: boolean
  /** Truck lines already recorded (by item id). */
  truck?: Record<string, boolean>
}

type QueueTask = {
  id: string
  payload: CompletionPayload
  progress: Progress
  queuedAt: number
  lastError?: string
}

const KEY = 'job-queue:v1'
let flushing = false

async function read(): Promise<QueueTask[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as QueueTask[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

async function write(list: QueueTask[]) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // If the phone cannot store it, the technician keeps the sheet open instead.
    throw new Error('Could not save this job on your phone. Free some space and try again.')
  }
}

export async function queuedCount() {
  return (await read()).length
}

/**
 * Runs every step that has not gone through yet. Throws on the first failure;
 * `progress` is updated as it goes (and `onProgress` called) so the caller can
 * keep it for a retry. Truck stock is recorded last and never undoes a finished job.
 */
export async function submitCompletion(
  payload: CompletionPayload,
  progress: Progress,
  onProgress?: (progress: Progress) => void,
): Promise<{ truckProblems: string[] }> {
  const mark = (patch: Partial<Progress>) => {
    Object.assign(progress, patch)
    onProgress?.(progress)
  }

  // Photos and the signature go first: if one cannot be saved the job stays
  // open, so the proof is never lost.
  if (payload.beforePhoto && !progress.before) {
    await uploadJobPhoto(payload.clientId, payload.jobId, 'before', payload.beforePhoto)
    mark({ before: true })
  }
  if (payload.afterPhoto && !progress.after) {
    await uploadJobPhoto(payload.clientId, payload.jobId, 'after', payload.afterPhoto)
    mark({ after: true })
  }
  if (payload.signature.some((stroke) => stroke.length > 1) && !progress.signature) {
    await uploadSignature(payload.clientId, payload.jobId, payload.signature, payload.customerName || 'Customer')
    mark({ signature: true })
  }

  if (!progress.completed) {
    const { error } = await supabase
      .from('repair_records')
      .update({ status: 'Completed', resolution: payload.resolution, checklist: payload.checklist })
      .eq('id', payload.jobId)
    if (error) throw error
    mark({ completed: true })
  }

  const truckProblems: string[] = []
  for (const line of payload.truckUse) {
    if (progress.truck?.[line.itemId] || line.qty <= 0) continue
    const { error } = await supabase.rpc('use_truck_stock', {
      p_item: line.itemId,
      p_qty: line.qty,
      p_client: payload.clientId,
      p_repair: payload.jobId,
    })
    if (error) {
      if (isNetworkError(error)) throw error
      truckProblems.push(error.message)
    }
    mark({ truck: { ...(progress.truck ?? {}), [line.itemId]: true } })
  }

  return { truckProblems }
}

export async function queueCompletion(payload: CompletionPayload, progress: Progress) {
  const list = await read()
  const next = list.filter((task) => task.payload.jobId !== payload.jobId)
  next.push({ id: `${payload.jobId}:${Date.now()}`, payload, progress, queuedAt: Date.now() })
  await write(next)
}

/** Sends everything that is waiting. Returns how many went through and how many are still waiting. */
export async function flushQueue(): Promise<{ sent: number; waiting: number; offline: boolean }> {
  if (flushing) return { sent: 0, waiting: await queuedCount(), offline: false }
  flushing = true
  let sent = 0
  let offline = false
  try {
    const list = await read()
    const remaining: QueueTask[] = []
    for (const task of list) {
      if (offline) {
        remaining.push(task)
        continue
      }
      try {
        await submitCompletion(task.payload, task.progress)
        sent += 1
      } catch (error: any) {
        if (isNetworkError(error)) {
          offline = true
          remaining.push(task)
        } else {
          remaining.push({ ...task, lastError: error?.message || 'Could not send this job.' })
        }
      }
    }
    await write(remaining)
    return { sent, waiting: remaining.length, offline }
  } finally {
    flushing = false
  }
}

export async function lastQueueError() {
  const list = await read()
  return list.find((task) => task.lastError)?.lastError ?? null
}
