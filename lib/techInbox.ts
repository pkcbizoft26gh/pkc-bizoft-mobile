import { supabase } from '@/lib/supabase'
import type { InboxItem } from '@/components/NotificationsInbox'

// The technician's inbox, built from records they can already see: messages on
// their jobs, crew requests, customers who signed off, and new open jobs.
// Like the customer inbox, nothing extra is stored on the server.

const DAY = 86_400_000
const FINISHED = /(complete|resolved|done|fixed|cancel)/i

type JobRow = {
  id: string
  client_id: string
  job_type: string | null
  status: string
  technician_user_id: string | null
  service_request_id: string | null
  created_at: string
  customer_signed_at?: string | null
}

type CrewRequest = { repair_id: string; job_type: string | null; customer: string; requested_by: string; created_at: string }
type JoinRequest = { repair_id: string; name: string; job_type: string | null; customer: string; created_at: string }

export async function loadTechInbox(): Promise<InboxItem[]> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id
  if (!me) return []

  const since = new Date(Date.now() - 14 * DAY).toISOString()

  const [mine, open, crew, joins] = await Promise.all([
    supabase
      .from('repair_records')
      .select('id, client_id, job_type, status, technician_user_id, service_request_id, created_at, customer_signed_at')
      .eq('technician_user_id', me)
      .gte('created_at', new Date(Date.now() - 60 * DAY).toISOString())
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('repair_records')
      .select('id, created_at, status')
      .is('technician_user_id', null)
      .gte('created_at', new Date(Date.now() - 3 * DAY).toISOString())
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.rpc('my_crew_requests').then((result) => (result.error ? [] : ((result.data ?? []) as CrewRequest[]))),
    supabase.rpc('join_requests_for_me').then((result) => (result.error ? [] : ((result.data ?? []) as JoinRequest[]))),
  ])

  const jobs = (mine.data ?? []) as JobRow[]
  const items: InboxItem[] = []

  // Names for the customers on my jobs.
  const clientIds = [...new Set(jobs.map((job) => job.client_id))]
  const names = new Map<string, string>()
  if (clientIds.length > 0) {
    const { data } = await supabase.from('clients').select('id, customer_name').in('id', clientIds)
    for (const row of (data ?? []) as { id: string; customer_name: string | null }[]) {
      names.set(row.id, row.customer_name || 'Customer')
    }
  }

  // The newest message from someone else on each of my jobs.
  const requestIds = jobs.map((job) => job.service_request_id).filter((id): id is string => !!id)
  if (requestIds.length > 0) {
    const { data } = await supabase
      .from('ticket_messages')
      .select('id, request_id, sender_name, sender_role, body, created_at')
      .in('request_id', requestIds)
      .neq('sender_user_id', me)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100)
    const seen = new Set<string>()
    for (const row of (data ?? []) as { id: string; request_id: string; sender_name: string | null; sender_role: string; body: string; created_at: string }[]) {
      if (seen.has(row.request_id)) continue
      seen.add(row.request_id)
      items.push({
        id: `msg-${row.id}`,
        icon: 'chatbubbles',
        tone: 'info',
        title: `New message from ${row.sender_name || (row.sender_role === 'staff' ? 'Support' : 'the customer')}`,
        body: row.body.length > 140 ? `${row.body.slice(0, 140)}…` : row.body,
        at: new Date(row.created_at).getTime(),
        href: `/chat?request=${row.request_id}`,
      })
    }
  }

  for (const job of jobs) {
    if (!job.customer_signed_at) continue
    const at = new Date(job.customer_signed_at).getTime()
    if (at < Date.now() - 14 * DAY) continue
    items.push({
      id: `signed-${job.id}`,
      icon: 'create',
      tone: 'success',
      title: `${names.get(job.client_id) || 'The customer'} signed off`,
      body: `The ${job.job_type === 'installation' ? 'installation' : 'repair'} is confirmed by the customer. Good work!`,
      at,
      href: '/jobs',
    })
  }

  for (const request of crew) {
    items.push({
      id: `crew-${request.repair_id}`,
      icon: 'people',
      tone: 'warning',
      title: `${request.requested_by} wants you on a job`,
      body: `${request.job_type === 'installation' ? 'Installation' : 'Repair'} for ${request.customer}. Accept or decline in Crew requests.`,
      at: new Date(request.created_at).getTime(),
      href: '/crew-requests',
    })
  }

  for (const request of joins) {
    items.push({
      id: `join-${request.repair_id}-${request.name}`,
      icon: 'person-add',
      tone: 'warning',
      title: `${request.name} wants to join your job`,
      body: `${request.job_type === 'installation' ? 'Installation' : 'Repair'} for ${request.customer}. Answer in Crew requests.`,
      at: new Date(request.created_at).getTime(),
      href: '/crew-requests',
    })
  }

  const waiting = ((open.data ?? []) as { created_at: string; status: string }[]).filter((job) => !FINISHED.test(job.status))
  if (waiting.length > 0) {
    items.push({
      id: `open-${waiting[0].created_at}`,
      icon: 'construct',
      tone: 'info',
      title: waiting.length === 1 ? 'A new job is waiting' : `${waiting.length} new jobs are waiting`,
      body: 'Nobody has taken them yet. Open Jobs to see the nearest ones.',
      at: new Date(waiting[0].created_at).getTime(),
      href: '/jobs',
    })
  }

  return items.sort((a, b) => b.at - a.at)
}
