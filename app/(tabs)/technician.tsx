import { SkeletonScreen } from '@/components/Skeleton'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'

import { colors, radii } from '../../constants/theme'
import { GlassCard } from '../../components/GlassCard'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { reportError } from '@/lib/errorReporter'
import { PerformanceCard, type TechnicianStats } from '@/components/PerformanceCard'
import { InboxBell } from '@/components/QuickActions'
import { TicketChat } from '@/components/TicketChat'
import { useConnection } from '@/lib/connection'
import { subscribeChatSeen, unreadChats } from '@/lib/chatSeen'
import { useLiveRefresh } from '@/lib/live'
import { planLabel } from '../../lib/plans'

// The technician's day at a glance: the job to do next, their own numbers,
// anything waiting on them, and a search to look up any customer.

const FINISHED = /(complete|resolved|done|fixed|cancel)/i

type NextJob = {
  id: string
  status: string
  job_type: string | null
  problem_description: string | null
  repair_date: string | null
  arrived_at: string | null
  service_request_id: string | null
  latitude: number | null
  longitude: number | null
  client: {
    id: string
    customer_name: string | null
    area: string | null
    mobile_number: string | null
    latitude: number | null
    longitude: number | null
  } | null
}

type FoundClient = {
  id: string
  customer_name: string | null
  account_id: string | null
  area: string | null
  plan_name: string | null
  account_status: string | null
}

type OpenBadge = { mine: boolean; taken: boolean; days: number }

/** In progress first (the one I am on), then the oldest assigned one. */
function pickNext(jobs: NextJob[]) {
  return [...jobs].sort((a, b) => {
    const pa = /progress|ongoing/i.test(a.status) ? 0 : 1
    const pb = /progress|ongoing/i.test(b.status) ? 0 : 1
    if (pa !== pb) return pa - pb
    return String(a.repair_date ?? '').localeCompare(String(b.repair_date ?? ''))
  })[0] ?? null
}

export default function TechnicianDashboard() {
  const router = useRouter()
  const { isOnline } = useConnection()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [fullName, setFullName] = useState('Technician')
  const [myJobs, setMyJobs] = useState<NextJob[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [stats, setStats] = useState<TechnicianStats | null>(null)
  const [crewRequests, setCrewRequests] = useState(0)
  const [unread, setUnread] = useState<Set<string>>(new Set())
  const [chatOpen, setChatOpen] = useState(false)

  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState<FoundClient[]>([])
  const [openJobs, setOpenJobs] = useState<Record<string, OpenBadge>>({})

  const loadDashboard = useCallback(async () => {
    try {
      setErrorMessage('')

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) {
        router.replace('/login')
        return
      }
      const [profile, jobs, open, statsResult, crew, joins] = await Promise.all([
        supabase.from('user_profiles').select('full_name').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('repair_records')
          .select(
            'id, status, job_type, problem_description, repair_date, arrived_at, service_request_id, latitude, longitude, client:clients(id, customer_name, area, mobile_number, latitude, longitude)',
          )
          .eq('technician_user_id', user.id)
          .not('status', 'ilike', '%complete%')
          .not('status', 'ilike', '%resolved%')
          .not('status', 'ilike', '%done%')
          .not('status', 'ilike', '%fixed%')
          .not('status', 'ilike', '%cancel%')
          .order('repair_date', { ascending: true })
          .limit(20),
        supabase.rpc('open_jobs_overview'),
        // Personal stats are a bonus: never fail the dashboard over them.
        supabase.rpc('my_technician_stats'),
        supabase.rpc('my_crew_requests'),
        supabase.rpc('join_requests_for_me'),
      ])

      if (jobs.error) throw jobs.error

      setFullName(profile.data?.full_name || user.email?.split('@')[0] || 'Technician')

      const mine = ((jobs.data ?? []) as unknown as NextJob[]).filter((job) => !FINISHED.test(job.status))
      setMyJobs(mine)

      const badges: Record<string, OpenBadge> = {}
      let waiting = 0
      for (const row of (open.data ?? []) as { client_id: string; technician_user_id: string | null; created_at: string }[]) {
        const age = Date.now() - new Date(row.created_at).getTime()
        if (!row.technician_user_id) waiting += 1
        badges[row.client_id] = {
          mine: row.technician_user_id === user.id,
          taken: !!row.technician_user_id,
          days: Number.isFinite(age) && age > 0 ? Math.floor(age / 86400000) : 0,
        }
      }
      setOpenJobs(badges)
      setOpenCount(waiting)

      setStats(statsResult.error || !statsResult.data ? null : (statsResult.data as TechnicianStats))
      setCrewRequests(
        (Array.isArray(crew.data) ? crew.data.length : 0) + (Array.isArray(joins.data) ? joins.data.length : 0),
      )

      const ids = mine.map((job) => job.service_request_id).filter((id): id is string => !!id)
      setUnread(new Set((await unreadChats(ids, user.id)).keys()))
    } catch (error: any) {
      console.error('Technician dashboard error:', error)
      reportError(error, 'Technician dashboard')
      setErrorMessage(friendlyError(error, 'Unable to load technician dashboard.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [router])

  // Fresh numbers every time the tab comes into view.
  useFocusEffect(
    useCallback(() => {
      void loadDashboard()
    }, [loadDashboard]),
  )

  // Jobs, crew, ratings and messages: show changes as they happen.
  useLiveRefresh(['repair_records', 'repair_job_crew', 'repair_join_requests', 'ratings', 'ticket_messages'], loadDashboard)

  // Reload by itself when the connection comes back.
  const wasOnline = useRef(true)
  useEffect(() => {
    if (isOnline && !wasOnline.current) void loadDashboard()
    wasOnline.current = isOnline
  }, [isOnline, loadDashboard])

  // Clear an unread dot as soon as that chat is read.
  useEffect(
    () =>
      subscribeChatSeen((requestId) =>
        setUnread((current) => {
          if (!current.has(requestId)) return current
          const next = new Set(current)
          next.delete(requestId)
          return next
        }),
      ),
    [],
  )

  // Customer search: only what was typed is loaded, never the whole list.
  useEffect(() => {
    const text = search.trim().replace(/[%,()]/g, ' ').trim()
    if (text.length < 2) {
      setFound([])
      setSearching(false)
      return undefined
    }
    setSearching(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      const like = `%${text}%`
      const { data } = await supabase
        .from('clients')
        .select('id, customer_name, account_id, area, plan_name, account_status')
        .or(`customer_name.ilike.${like},account_id.ilike.${like},area.ilike.${like},mobile_number.ilike.${like}`)
        .order('customer_name', { ascending: true })
        .limit(20)
      if (cancelled) return
      setFound((data ?? []) as FoundClient[])
      setSearching(false)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  if (loading) {
    return <SkeletonScreen variant="home" />
  }

  const firstName = fullName.trim().split(' ')[0] || 'Technician'
  const next = pickNext(myJobs)
  const nextSpot =
    next && (next.latitude ?? next.client?.latitude) != null && (next.longitude ?? next.client?.longitude) != null
      ? { latitude: (next.latitude ?? next.client?.latitude) as number, longitude: (next.longitude ?? next.client?.longitude) as number }
      : null
  const nextUnread = !!next?.service_request_id && unread.has(next.service_request_id)
  const searchText = search.trim()

  const tiles: { key: string; label: string; value: number; icon: keyof typeof Ionicons.glyphMap; tone: string }[] = [
    { key: 'active', label: 'My active', value: myJobs.length, icon: 'construct-outline', tone: colors.accent },
    { key: 'open', label: 'Open jobs', value: openCount, icon: 'hand-right-outline', tone: colors.warning },
    { key: 'messages', label: 'New messages', value: unread.size, icon: 'chatbubbles-outline', tone: colors.danger },
  ]

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void loadDashboard()
            }}
            tintColor={colors.accent}
          />
        }
      >
        {/* HEADER */}

        <View style={styles.header}>
          <Image source={require('../../assets/images/pkc-logo-480.png')} style={styles.logo} resizeMode="contain" />
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>PKC BIZOFT • FIELD OPERATIONS</Text>
            <Text style={styles.title} numberOfLines={1}>
              Hello, {firstName} 👋
            </Text>
            <View style={styles.onlineRow}>
              <View style={[styles.onlineDot, { backgroundColor: isOnline ? colors.success : colors.danger }]} />
              <Text style={[styles.onlineText, { color: isOnline ? colors.success : colors.danger }]}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>
          <InboxBell kind="technician" />
        </View>

        {errorMessage ? (
          <GlassCard style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>Could not load everything</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          </GlassCard>
        ) : null}

        {/* NEXT JOB */}

        <Text style={styles.sectionTitle}>Your next job</Text>
        {next ? (
          <GlassCard style={styles.nextCard}>
            <View style={styles.nextTop}>
              <View style={styles.nextIcon}>
                <Ionicons
                  name={next.job_type === 'installation' ? 'wifi-outline' : 'construct-outline'}
                  size={21}
                  color={colors.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nextName} numberOfLines={1}>
                  {next.client?.customer_name || 'Customer'}
                </Text>
                <Text style={styles.nextMeta} numberOfLines={1}>
                  {[next.job_type === 'installation' ? 'Installation' : 'Repair', next.client?.area].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={styles.nextStatus}>
                <Text style={styles.nextStatusText} numberOfLines={1}>
                  {next.arrived_at ? 'ARRIVED' : next.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {next.problem_description ? (
              <Text style={styles.nextProblem} numberOfLines={2}>
                {next.problem_description}
              </Text>
            ) : null}

            <View style={styles.nextActions}>
              {nextSpot ? (
                <Pressable
                  onPress={() =>
                    void Linking.openURL(
                      `https://www.google.com/maps/dir/?api=1&destination=${nextSpot.latitude},${nextSpot.longitude}`,
                    )
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                >
                  <Ionicons name="map-outline" size={16} color={colors.accent} />
                  <Text style={styles.actionText}>Directions</Text>
                </Pressable>
              ) : null}
              {next.client?.mobile_number ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${next.client?.mobile_number?.trim()}`)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                >
                  <Ionicons name="call-outline" size={16} color={colors.accent} />
                  <Text style={styles.actionText}>Call</Text>
                </Pressable>
              ) : null}
              {next.service_request_id ? (
                <Pressable
                  onPress={() => setChatOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={nextUnread ? 'Message, new message waiting' : 'Message'}
                  style={({ pressed }) => [styles.actionButton, nextUnread && styles.actionAlert, pressed && styles.pressed]}
                >
                  <Ionicons name={nextUnread ? 'chatbubbles' : 'chatbubbles-outline'} size={16} color={colors.accent} />
                  <Text style={styles.actionText}>Message</Text>
                  {nextUnread ? <View style={styles.unreadDot} /> : null}
                </Pressable>
              ) : null}
            </View>

            <Pressable
              onPress={() => router.push('/jobs')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>
                {next.arrived_at ? 'Finish this job in Jobs' : 'Open in Jobs'}
              </Text>
              <Ionicons name="arrow-forward" size={17} color={colors.bg} />
            </Pressable>
          </GlassCard>
        ) : (
          <GlassCard style={styles.nextCard}>
            <View style={styles.emptyRow}>
              <Ionicons name="checkmark-done-circle-outline" size={30} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.nextName}>No active job</Text>
                <Text style={styles.nextMeta}>
                  {openCount > 0
                    ? `${openCount} open job${openCount === 1 ? ' is' : 's are'} waiting for someone to take ${openCount === 1 ? 'it' : 'them'}.`
                    : 'Nothing is waiting right now.'}
                </Text>
              </View>
            </View>
            {openCount > 0 ? (
              <Pressable
                onPress={() => router.push('/jobs')}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryText}>See open jobs</Text>
                <Ionicons name="arrow-forward" size={17} color={colors.bg} />
              </Pressable>
            ) : null}
          </GlassCard>
        )}

        {/* MY NUMBERS */}

        <View style={styles.tiles}>
          {tiles.map((tile) => (
            <Pressable
              key={tile.key}
              onPress={() => router.push('/jobs')}
              accessibilityRole="button"
              accessibilityLabel={`${tile.label}: ${tile.value}`}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
            >
              <Ionicons name={tile.icon} size={18} color={tile.value > 0 ? tile.tone : colors.muted} />
              <Text style={styles.tileValue}>{tile.value}</Text>
              <Text style={styles.tileLabel} numberOfLines={1}>
                {tile.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* CREW REQUESTS: only when someone is waiting for an answer */}

        {crewRequests > 0 ? (
          <Pressable
            onPress={() => router.push('/crew-requests')}
            accessibilityRole="button"
            accessibilityLabel={`Crew requests, ${crewRequests} waiting`}
            style={({ pressed }) => [styles.crewCard, pressed && styles.pressed]}
          >
            <View style={styles.crewIcon}>
              <Ionicons name="people" size={20} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.crewTitle}>
                {crewRequests} crew request{crewRequests === 1 ? '' : 's'} waiting
              </Text>
              <Text style={styles.crewText}>Technicians are asking you to join or help on a job.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ) : null}

        {stats ? <PerformanceCard stats={stats} /> : null}

        {/* FIND A CUSTOMER */}

        <Text style={styles.sectionTitle}>Find a customer</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={17} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Name, account, area or number"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          {search && !searching ? (
            <Pressable onPress={() => setSearch('')} accessibilityLabel="Clear search" hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {searchText.length < 2 ? (
          <Text style={styles.hint}>Type at least 2 letters to look up a customer and open their full record.</Text>
        ) : !searching && found.length === 0 ? (
          <Text style={styles.hint}>No customer matches “{searchText}”.</Text>
        ) : (
          found.map((client) => {
            const badge = openJobs[client.id]
            const active = client.account_status?.toLowerCase() === 'active'
            return (
              <Pressable
                key={client.id}
                onPress={() => router.push({ pathname: '/client-details', params: { id: client.id } })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.clientRow, pressed && styles.pressed]}
              >
                <View style={[styles.clientDot, { backgroundColor: active ? colors.success : colors.muted }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName} numberOfLines={1}>
                    {client.customer_name || 'Unnamed customer'}
                  </Text>
                  <Text style={styles.clientMeta} numberOfLines={1}>
                    {[client.account_id, planLabel(client.plan_name), client.area].filter(Boolean).join(' · ') ||
                      'No details yet'}
                  </Text>
                </View>
                {badge ? (
                  <View style={[styles.jobBadge, { borderColor: badge.taken ? colors.accentDark : colors.warning }]}>
                    <Text style={[styles.jobBadgeText, { color: badge.taken ? colors.accent : colors.warning }]}>
                      {badge.mine ? 'MY JOB' : badge.taken ? 'TAKEN' : badge.days >= 1 ? `OPEN ${badge.days}D` : 'OPEN'}
                    </Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              </Pressable>
            )
          })
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>

      <TicketChat
        visible={chatOpen}
        requestId={next?.service_request_id ?? null}
        title={next?.client?.customer_name || 'Customer'}
        subtitle={next?.problem_description || 'Job chat'}
        onClose={() => setChatOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  scrollContent: {
    padding: 18,
    paddingTop: 24,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },

  logo: {
    width: 46,
    height: 46,
  },

  headerText: {
    flex: 1,
  },

  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 3,
  },

  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },

  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  onlineText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    marginBottom: 16,
    borderColor: 'rgba(255,92,122,0.3)',
  },

  errorTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },

  errorText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },

  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  nextCard: {
    padding: 16,
    marginBottom: 14,
  },

  nextTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  nextIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },

  nextName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },

  nextMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },

  nextStatus: {
    maxWidth: 120,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.accentSoft,
  },

  nextStatusText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  nextProblem: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },

  nextActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },

  actionButton: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.cardLight,
  },

  actionAlert: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },

  actionText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },

  primaryButton: {
    height: 46,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
  },

  primaryText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '900',
  },

  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  tiles: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },

  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },

  tileValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 6,
  },

  tileLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },

  crewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,200,87,0.45)',
    backgroundColor: 'rgba(255,200,87,0.08)',
  },

  crewIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,200,87,0.14)',
  },

  crewTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },

  crewText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
  },

  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 0,
  },

  hint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },

  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },

  clientDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  clientName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },

  clientMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },

  jobBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.round,
    borderWidth: 1,
  },

  jobBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  pressed: {
    opacity: 0.75,
  },

  bottomSpace: {
    height: 70,
  },
})
