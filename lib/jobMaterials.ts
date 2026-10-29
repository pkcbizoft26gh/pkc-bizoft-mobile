import { supabase } from '@/lib/supabase'

// Per-job materials: Out (taken from the store for one job) -> Used (declared
// when the job is finished) -> Returned (must be exactly Out - Used; anything
// else needs a reason and warns the admins). Works for customer jobs and for
// backbone (infrastructure) jobs.

export type KitJobType = 'new_installation' | 'repair' | 'replacement' | 'upgrade' | 'other'

export type JobRef = {
  kind: 'client' | 'backbone'
  id: string
  title: string
  sub: string
  jobType: KitJobType
  clientId: string | null
}

export type MaterialLine = {
  item_id: string
  name: string
  unit: string | null
  out: number
  returned: number
  used: number | null
  return_done: boolean
}

const FINISHED = /(complete|resolved|done|fixed|cancel)/i

const refArgs = (job: Pick<JobRef, 'kind' | 'id'>) => ({
  p_repair: job.kind === 'client' ? job.id : null,
  p_backbone: job.kind === 'backbone' ? job.id : null,
})

/** The technician's open jobs, customer and backbone, to take materials for. */
export async function fetchMyOpenJobs(): Promise<JobRef[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const [rep, bb] = await Promise.all([
    supabase
      .from('repair_records')
      .select('id, client_id, job_type, status, problem_description, clients(customer_name, area)')
      .eq('technician_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('backbone_jobs')
      .select('id, title, job_type, area, landmark, status')
      .eq('technician_user_id', user.id)
      .in('status', ['assigned', 'in_progress'])
      .order('created_at', { ascending: false }),
  ])

  const client: JobRef[] = (rep.data ?? [])
    .filter((r: any) => !FINISHED.test(r.status || ''))
    .map((r: any) => {
      const c = Array.isArray(r.clients) ? r.clients[0] : r.clients
      return {
        kind: 'client' as const,
        id: r.id,
        title: c?.customer_name || 'Customer',
        sub: [r.job_type === 'installation' ? 'New install' : 'Repair', c?.area].filter(Boolean).join(' · '),
        jobType: r.job_type === 'installation' ? 'new_installation' : 'repair',
        clientId: r.client_id,
      }
    })
  const backbone: JobRef[] = (bb.data ?? []).map((b: any) => ({
    kind: 'backbone' as const,
    id: b.id,
    title: b.title,
    sub: ['Backbone', b.job_type === 'new_installation' ? 'new install' : 'repair', b.area].filter(Boolean).join(' · '),
    jobType: b.job_type === 'new_installation' ? 'new_installation' : 'repair',
    clientId: null,
  }))
  return [...client, ...backbone]
}

export async function fetchJobMaterialLines(job: Pick<JobRef, 'kind' | 'id'>): Promise<MaterialLine[]> {
  const { data, error } = await supabase.rpc('job_material_lines', refArgs(job))
  if (error) throw error
  return ((data ?? []) as any[]).map((l) => ({
    item_id: l.item_id,
    name: l.name,
    unit: l.unit,
    out: Number(l.out),
    returned: Number(l.returned),
    used: l.used == null ? null : Number(l.used),
    return_done: !!l.return_done,
  }))
}

export async function declareUsed(job: Pick<JobRef, 'kind' | 'id'>, used: Record<string, number>) {
  const lines = Object.entries(used).map(([item_id, qty]) => ({ item_id, qty }))
  const { error } = await supabase.rpc('declare_job_materials_used', { ...refArgs(job), p_lines: lines })
  if (error) throw error
}

/** Returns the mismatch descriptions (empty when the return was exact). */
export async function returnLeftovers(job: Pick<JobRef, 'kind' | 'id'>, returned: Record<string, number>, note: string) {
  const lines = Object.entries(returned).map(([item_id, qty]) => ({ item_id, qty }))
  const { data, error } = await supabase.rpc('return_job_materials', {
    ...refArgs(job),
    p_lines: lines,
    p_note: note.trim() || null,
  })
  if (error) throw error
  return ((data as { mismatches?: string[] } | null)?.mismatches ?? []) as string[]
}

/** What should come back for one line once "used" is known. */
export const expectedBack = (line: MaterialLine) => Math.max(0, line.out - (line.used ?? line.out) - line.returned)

export const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))
