import { SkeletonScreen } from '@/components/Skeleton'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { RoutePreview } from '@/components/RoutePreview'
import { ModemSerialCard } from '@/components/ModemSerialCard'
import { TicketChat } from '@/components/TicketChat'
import { subscribeChatSeen, unreadChats } from '@/lib/chatSeen'
import { useLiveRefresh } from '@/lib/live'
import { checklistRecord, completionBlockers, ruleFor } from '@/lib/checklists'
import { supabase } from '@/lib/supabase'
import { distanceKm, formatDistance, getCurrentCoords, type Coords } from '@/lib/location'
import { friendlyError, isNetworkError } from '@/lib/errors'
import { useConnection } from '@/lib/connection'
import { JobHistorySheet } from '@/components/JobHistorySheet'
import { flushQueue, queueCompletion, queuedCount, submitCompletion, type CompletionPayload, type Progress } from '@/lib/jobQueue'
import { fetchTruckStock, type TruckItem } from '@/lib/truck'
import { fetchJobMaterialLines, fmtQty, type MaterialLine } from '@/lib/jobMaterials'
import { UsedMaterialsEditor } from '@/components/JobMaterialsSheet'
import { colors } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'
import { Alert } from '@/components/AppAlert'
import { SignaturePad } from '@/components/SignaturePad'
import { takePhoto, uploadJobPhoto, uploadSignature, type Stroke } from '@/lib/jobEvidence'
import { planLabel } from '../../lib/plans'
import { useShareTechLocation } from '../../lib/techTracking'
import { tourRef, tourScroll } from '@/lib/tour'


// Lets the app tour scroll this screen to the element it points at.
const tourScrollRef = tourScroll('/jobs')
type RepairRecord = {
  id: string
  client_id: string
  technician: string | null
  technician_user_id: string | null
  repair_date: string
  problem_description: string
  resolution: string | null
  status: string
  created_at: string
  job_type: string | null
  latitude: number | null
  longitude: number | null
  accepted_at: string | null
  service_request_id: string | null
  arrived_at: string | null
}

type Client = {
  id: string
  customer_name: string | null
  account_id: string | null
  area: string | null
  mobile_number: string | null
  installation_status: string | null
  account_status: string | null
  plan_name: string | null
  modem_serial: string | null
  latitude: number | null
  longitude: number | null
}

type Job = RepairRecord & {
  client: Client | null
  /** Straight-line km from this technician, when both positions are known. */
  distance: number | null
  /** Where the customer reported from (falls back to their saved pin). */
  spot: Coords | null
}

type CrewPerson = {
  user_id: string
  name: string
  employee_number: string | null
  phone: string | null
  role: 'lead' | 'helper'
}

type DirectoryTech = {
  user_id: string
  full_name: string
  employee_number: string | null
  status: 'available' | 'busy'
  job_type: string | null
}

type CrewRequestRow = {
  user_id: string
  name: string
  employee_number: string | null
  status: 'pending' | 'accepted' | 'declined'
  reason: string | null
}

const MAX_ACTIVE_JOBS = 3

const JOB_FIELDS =
  'id, client_id, technician, technician_user_id, repair_date, problem_description, resolution, status, created_at, job_type, latitude, longitude, accepted_at, service_request_id, arrived_at'

/** How far back finished jobs are listed, before and after "Show older". */
const RECENT_DAYS = 30
const OLDER_DAYS = 365

/** Whole days an open job has been waiting for someone to take it. */
function waitingDays(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime()
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 86400000) : 0
}

function isFinished(status: string) {
  return /(complete|resolved|done|fixed|cancel)/i.test(status)
}

const COMPLETED = 'COMPLETED'

/** The lists on this screen: title, which jobs go in it, short name for the summary. */
const GROUPS: [string, (job: Job) => boolean, string][] = [
  ['MY ACTIVE JOBS', job => !!job.technician_user_id && !isFinished(job.status), 'MY ACTIVE'],
  ['OPEN JOBS - NEAREST FIRST', job => !job.technician_user_id, 'OPEN'],
  [COMPLETED, job => !!job.technician_user_id && isFinished(job.status), 'DONE'],
]

/** Chats on jobs I am on that have a message I have not read. */
async function loadUnread(jobs: Job[], myId: string) {
  const ids = jobs
    .filter(job => job.technician_user_id && job.service_request_id)
    .map(job => job.service_request_id as string)
  return new Set((await unreadChats(ids, myId)).keys())
}

export default function JobsScreen() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [myCoords, setMyCoords] = useState<Coords | null>(null)
  const [routePlan, setRoutePlan] = useState<{ ordered: Job[]; legs: (number | null)[] } | null>(null)
  const [locationOff, setLocationOff] = useState(false)
  const [completing, setCompleting] = useState<Job | null>(null)
  const [resolutionText, setResolutionText] = useState('')
  const [completeError, setCompleteError] = useState('')
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null)
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null)
  const [ticks, setTicks] = useState<boolean[]>([])
  const [historyJob, setHistoryJob] = useState<Job | null>(null)
  const [queued, setQueued] = useState(0)
  const [truckItems, setTruckItems] = useState<TruckItem[]>([])
  const [truckUsed, setTruckUsed] = useState<Record<string, number>>({})
  // Materials taken from the store for this job: the technician says how much was used.
  const [jobLines, setJobLines] = useState<MaterialLine[]>([])
  const [jobUsed, setJobUsed] = useState<Record<string, number>>({})
  const progressRef = useRef<Record<string, Progress>>({})
  const [serialSaved, setSerialSaved] = useState(false)
  const [chatJob, setChatJob] = useState<Job | null>(null)
  const [signature, setSignature] = useState<Stroke[]>([])
  // The customer is not there: they sign later in their own app.
  const [remoteSign, setRemoteSign] = useState(false)
  const [directory, setDirectory] = useState<DirectoryTech[]>([])
  const [loadingDirectory, setLoadingDirectory] = useState(false)
  const [requestsByJob, setRequestsByJob] = useState<Record<string, CrewRequestRow[]>>({})
  const [modeFor, setModeFor] = useState<Job | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const scrollRefWithTour = useCallback((node: ScrollView | null) => {
    scrollRef.current = node
    tourScrollRef(node)
  }, [])
  const groupY = useRef<Record<string, number>>({})
  const scrollToGroup = useCallback((title: string) => {
    const y = groupY.current[title]
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true })
  }, [])
  const [crewByJob, setCrewByJob] = useState<Record<string, CrewPerson[]>>({})
  const [crewFor, setCrewFor] = useState<Job | null>(null)
  const [crewPick, setCrewPick] = useState<string[]>([])
  const [savingCrew, setSavingCrew] = useState(false)
  const hasActiveRef = useRef(false)
  const [historyDays, setHistoryDays] = useState(RECENT_DAYS)
  // Job chats (by service request id) with a message I have not read yet.
  const [unreadChat, setUnreadChat] = useState<Set<string>>(new Set())
  const refreshUnread = useCallback(async (list: Job[], userId: string) => {
    try {
      setUnreadChat(await loadUnread(list, userId))
    } catch {
      // Keep the dots shown before.
    }
  }, [])

  const jobsRef = useRef<Job[]>([])
  jobsRef.current = jobs

  const loadJobs = useCallback(async () => {
    try {
      setErrorMessage('')

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        throw userError
      }

      if (!user) {
        setAuthorized(false)
        setJobs([])
        return
      }

      /*
       * JOBS IS TECHNICIAN-ONLY.
       *
       * Check the authenticated user's profile first.
       */
      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) {
        throw profileError
      }

      if (profile?.role !== 'technician') {
        setAuthorized(false)
        setJobs([])
        return
      }

      setAuthorized(true)
      setMyId(user.id)

      const coords = await getCurrentCoords()
      setMyCoords(coords)
      setLocationOff(!coords)

      /*
       * Repair records assigned to the signed-in technician, plus open
       * customer issues nobody has accepted yet (row-level security only
       * shows those to technicians of the customer's own tenant).
       *
       * technician_user_id is the assignment field.
       */
      // Unfinished jobs (mine and open ones), plus only my recently finished
      // ones: the full history would grow forever and slow this screen down.
      const finishedSince = new Date(Date.now() - historyDays * 86_400_000).toISOString().slice(0, 10)
      const [activeResult, finishedResult] = await Promise.all([
        supabase
          .from('repair_records')
          .select(JOB_FIELDS)
          .or(`technician_user_id.eq.${user.id},technician_user_id.is.null`)
          .not('status', 'ilike', '%complete%')
          .not('status', 'ilike', '%resolved%')
          .not('status', 'ilike', '%done%')
          .not('status', 'ilike', '%fixed%')
          .not('status', 'ilike', '%cancel%')
          .order('repair_date', { ascending: false }),
        supabase
          .from('repair_records')
          .select(JOB_FIELDS)
          .eq('technician_user_id', user.id)
          .or('status.ilike.%complete%,status.ilike.%resolved%,status.ilike.%done%,status.ilike.%fixed%,status.ilike.%cancel%')
          .gte('repair_date', finishedSince)
          .order('repair_date', { ascending: false })
          .limit(60),
      ])
      const repairError = activeResult.error ?? finishedResult.error
      const assignedRepairs = [...(activeResult.data ?? []), ...(finishedResult.data ?? [])]

      if (repairError) {
        throw repairError
      }

      // Jobs assigned to someone else that I may still see: ones where I am on
      // the crew, or (for a team leader) ones my team members took.
      const { data: sharedRepairs } = await supabase
        .from('repair_records')
        .select(JOB_FIELDS)
        .not('technician_user_id', 'is', null)
        .neq('technician_user_id', user.id)
        .or(
          `repair_date.gte.${finishedSince},and(status.not.ilike.%complete%,status.not.ilike.%resolved%,status.not.ilike.%done%,status.not.ilike.%fixed%,status.not.ilike.%cancel%)`,
        )
        .order('repair_date', { ascending: false })
        .limit(100)

      const seen = new Set<string>()
      const repairs = [
        ...((assignedRepairs ?? []) as RepairRecord[]),
        ...((sharedRepairs ?? []) as RepairRecord[]),
      ].filter(repair => {
        if (seen.has(repair.id)) return false
        seen.add(repair.id)
        return true
      })

      // Who is on each active job (lead + helpers).
      const crewEntries = await Promise.all(
        repairs
          .filter(repair => repair.technician_user_id && !isFinished(repair.status))
          .slice(0, 25)
          .map(async repair => {
            const { data } = await supabase.rpc('job_crew', { p_repair: repair.id })
            return [repair.id, (data as CrewPerson[]) ?? []] as const
          }),
      )
      setCrewByJob(Object.fromEntries(crewEntries))

      const requestEntries = await Promise.all(
        repairs
          .filter(repair => repair.technician_user_id === user.id && !isFinished(repair.status))
          .slice(0, 25)
          .map(async repair => {
            const { data } = await supabase.rpc('job_crew_requests', { p_repair: repair.id })
            return [repair.id, (data as CrewRequestRow[]) ?? []] as const
          }),
      )
      setRequestsByJob(Object.fromEntries(requestEntries))

      if (repairs.length === 0) {
        setJobs([])
        return
      }

      /*
       * Get the client records for the assigned repairs.
       */
      const clientIds = [
        ...new Set(
          repairs.map(
            repair => repair.client_id,
          ),
        ),
      ]

      const {
        data: clients,
        error: clientError,
      } = await supabase
        .from('clients')
        .select(
          `
            id,
            customer_name,
            account_id,
            area,
            mobile_number,
            installation_status,
            account_status,
            plan_name,
            modem_serial,
            latitude,
            longitude
          `,
        )
        .in('id', clientIds)

      if (clientError) {
        throw clientError
      }

      const clientRows =
        (clients ?? []) as Client[]

      const clientMap = new Map(
        clientRows.map(client => [
          client.id,
          client,
        ]),
      )

      const mappedJobs: Job[] =
        repairs.map(repair => {
          const client =
            clientMap.get(repair.client_id) ?? null

          const lat = repair.latitude ?? client?.latitude ?? null
          const lon = repair.longitude ?? client?.longitude ?? null
          const spot =
            lat !== null && lon !== null
              ? { latitude: lat, longitude: lon }
              : null

          return {
            ...repair,
            client,
            spot,
            distance:
              coords && spot
                ? distanceKm(coords, spot)
                : null,
          }
        })

      // Open jobs first and nearest first; then my active jobs; finished last.
      const rank = (job: Job) =>
        isFinished(job.status) ? 2 : job.technician_user_id ? 1 : 0

      mappedJobs.sort((a, b) => {
        const byRank = rank(a) - rank(b)
        if (byRank !== 0) return byRank
        if (rank(a) === 0) {
          const da = a.distance ?? Number.POSITIVE_INFINITY
          const db = b.distance ?? Number.POSITIVE_INFINITY
          if (da !== db) return da - db
        }
        return b.repair_date.localeCompare(a.repair_date)
      })

      hasActiveRef.current = mappedJobs.some(
        job =>
          job.technician_user_id === user.id &&
          !isFinished(job.status),
      )

      setJobs(mappedJobs)
      void refreshUnread(mappedJobs, user.id)
    } catch (error) {
      console.error(
        'Technician jobs loading error:',
        error,
      )

      const message =
        friendlyError(error, 'Unable to load technician jobs.')

      setErrorMessage(message)
      setJobs([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [historyDays, refreshUnread])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  // Unread dots: check again every 30 seconds, and clear one as soon as its chat is read.
  useEffect(() => {
    if (!myId) return undefined
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refreshUnread(jobsRef.current, myId)
    }, 30_000)
    const unsubscribe = subscribeChatSeen(requestId =>
      setUnreadChat(current => {
        if (!current.has(requestId)) return current
        const next = new Set(current)
        next.delete(requestId)
        return next
      }),
    )
    return () => {
      clearInterval(timer)
      unsubscribe()
    }
  }, [myId])

  // A job taken, started or added by someone else, crew changes and new
  // messages show up without pulling down.
  useLiveRefresh(['repair_records', 'repair_job_crew', 'repair_join_requests', 'ticket_messages'], loadJobs)

  // Arriving from Client Details after accepting a job: ask solo or team up.
  const { teamup, chat } = useLocalSearchParams<{ teamup?: string; chat?: string }>()
  const router = useRouter()
  useEffect(() => {
    if (!teamup || !myId) return
    const job = jobs.find(item => item.id === teamup)
    if (job && job.technician_user_id === myId) {
      setModeFor(job)
      router.setParams({ teamup: undefined })
    }
  }, [teamup, jobs, myId, router])

  // Arriving from a notification about a message: open that job's chat.
  useEffect(() => {
    if (!chat) return
    const job = jobs.find(item => item.service_request_id === chat)
    if (job) {
      setChatJob(job)
      router.setParams({ chat: undefined })
    }
  }, [chat, jobs, router])

  const acceptJob = useCallback(async (job: Job) => {
    try {
      setAcceptingId(job.id)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error('Your session has expired. Please log in again.')

      const { data, error } = await supabase
        .from('repair_records')
        .update({ technician_user_id: user.id, status: 'Assigned' })
        .eq('id', job.id)
        .is('technician_user_id', null)
        .select('id')

      if (error) throw error

      if (!data || data.length === 0) {
        Alert.alert('Already taken', 'Another technician accepted this job first.')
      }

      await loadJobs()

      // Everyone can take a job. Next: do it solo, or team up?
      if (data && data.length > 0) {
        setModeFor({ ...job, technician_user_id: user.id })
      }
    } catch (error: any) {
      Alert.alert('Unable to accept job', friendlyError(error, 'Please try again.'))
    } finally {
      setAcceptingId(null)
    }
  }, [loadJobs])

  // Opens the picker with every other technician, available or busy.
  const openCrewPicker = useCallback(
    async (job: Job) => {
      setModeFor(null)
      setCrewPick(
        (requestsByJob[job.id] ?? [])
          .filter(row => row.status === 'pending' || row.status === 'accepted')
          .map(row => row.user_id),
      )
      setCrewFor(job)
      setLoadingDirectory(true)
      const { data, error } = await supabase.rpc('tech_directory')
      setLoadingDirectory(false)
      if (error) {
        Alert.alert('Crew', friendlyError(error, 'Please try again.'))
        setCrewFor(null)
        return
      }
      setDirectory((data as DirectoryTech[]) ?? [])
    },
    [requestsByJob],
  )


  // Started jobs the technician has not arrived at: share the phone's position.
  const enRouteIds = useMemo(
    () =>
      jobs
        .filter((j) => j.technician_user_id === myId && /progress|ongoing/i.test(j.status) && !j.arrived_at)
        .map((j) => j.id),
    [jobs, myId],
  )
  useShareTechLocation(enRouteIds)

  const startJob = useCallback(async (job: Job) => {
    try {
      setWorkingId(job.id)
      const { error } = await supabase
        .from('repair_records')
        .update({ status: 'In Progress' })
        .eq('id', job.id)
      if (error) throw error
      await loadJobs()
    } catch (error: any) {
      Alert.alert('Unable to start job', friendlyError(error, 'Please try again.'))
    } finally {
      setWorkingId(null)
    }
  }, [loadJobs])

  const finishJob = useCallback(async () => {
    if (!completing) return

    const isInstall = completing.job_type === 'installation'
    const note = resolutionText.trim()

    if (!isInstall && note.length < 3) {
      setCompleteError('Write a short note about what was fixed.')
      return
    }

    const blockers = completionBlockers(completing.job_type, {
      ticked: ticks,
      hasBeforePhoto: !!beforePhoto,
      hasAfterPhoto: !!afterPhoto,
      serialSaved,
    })
    if (blockers.length > 0) {
      setCompleteError(`Before you finish: ${blockers.join('; ')}.`)
      return
    }

    // The customer's signature is required: drawn now, or asked for in their app.
    if (!remoteSign && !signature.some((stroke) => stroke.length > 1)) {
      setCompleteError('The customer must sign before you can finish. Ask them to sign above, or send it to their app.')
      return
    }

    if (remoteSign && !afterPhoto) {
      setCompleteError('Take the after photo first, so the customer can see the finished work before signing.')
      return
    }

    // Already returned (settled in the Materials tab): nothing more to declare.
    const declareLines = jobLines.filter((line) => !line.return_done)
    const payload: CompletionPayload = {
      remoteSign,
      jobUsed: declareLines.length
        ? Object.fromEntries(declareLines.map((line) => [line.item_id, jobUsed[line.item_id] ?? line.out]))
        : undefined,
      jobId: completing.id,
      clientId: completing.client_id,
      customerName: completing.client?.customer_name || 'Customer',
      resolution: note || (isInstall ? 'Installation completed' : null),
      checklist: checklistRecord(completing.job_type, ticks),
      beforePhoto,
      afterPhoto,
      signature,
      truckUse: Object.entries(truckUsed)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, qty]) => ({ itemId, qty })),
    }
    // Kept per job, so a retry never uploads the same photo twice.
    const progress = progressRef.current[completing.id] ?? (progressRef.current[completing.id] = {})

    const closeSheet = () => {
      setCompleting(null)
      setResolutionText('')
      setBeforePhoto(null)
      setAfterPhoto(null)
      setTicks([])
      setSignature([])
      setRemoteSign(false)
      setTruckUsed({})
      setJobLines([])
      setJobUsed({})
    }
    const leftovers = declareLines
      .map((line) => ({ line, back: line.out - (jobUsed[line.item_id] ?? line.out) - line.returned }))
      .filter((x) => x.back > 0)

    try {
      setWorkingId(completing.id)
      setCompleteError('')

      const { truckProblems } = await submitCompletion(payload, progress)
      delete progressRef.current[completing.id]
      closeSheet()
      if (truckProblems.length > 0) {
        Alert.alert(
          remoteSign ? 'Waiting for signature' : 'Job completed',
          `${remoteSign ? 'The customer was asked to sign' : 'The job is done'}, but the truck stock could not be updated: ${truckProblems[0]}`,
        )
      } else if (remoteSign) {
        Alert.alert('Waiting for the customer', 'We told the customer to open the app, check your photos and sign. The job finishes as soon as they sign.')
      }
      if (leftovers.length > 0) {
        Alert.alert(
          'Bring the leftovers back',
          `Return exactly: ${leftovers.map((x) => `${fmtQty(x.back)} ${x.line.unit ?? ''} ${x.line.name}`).join(', ')}. ` +
            'Record it in Materials → My history when you hand them in.',
        )
      }
      await loadJobs()
    } catch (error: any) {
      if (isNetworkError(error)) {
        // No signal: keep it on the phone and send it when the connection is back.
        try {
          await queueCompletion(payload, progress)
          delete progressRef.current[completing.id]
          closeSheet()
          setQueued(await queuedCount())
          Alert.alert('Saved on your phone', 'There is no signal right now. This job will be sent automatically as soon as you are back online.')
        } catch (queueError: any) {
          setCompleteError(friendlyError(queueError, 'Could not save this job on your phone.'))
        }
      } else {
        setCompleteError(friendlyError(error, 'Unable to complete this job.'))
      }
    } finally {
      setWorkingId(null)
    }
  }, [completing, resolutionText, beforePhoto, afterPhoto, ticks, serialSaved, signature, remoteSign, truckUsed, jobLines, jobUsed, loadJobs])

  // The customer has not signed yet and the technician wants the job back open.
  const takeBackSignature = useCallback(async (job: Job) => {
    try {
      setWorkingId(job.id)
      const { error } = await supabase.rpc('cancel_signature_request', { p_repair: job.id })
      if (error) throw error
      await loadJobs()
    } catch (error: any) {
      Alert.alert('Unable to take it back', friendlyError(error, 'Please try again.'))
    } finally {
      setWorkingId(null)
    }
  }, [loadJobs])

  // Jobs finished with no signal go out by themselves when the connection returns.
  const { isOnline, setOfflineWorkAvailable } = useConnection()

  // While the Jobs tab is open the technician may choose to keep working with no signal.
  useFocusEffect(
    useCallback(() => {
      setOfflineWorkAvailable(true)
      return () => setOfflineWorkAvailable(false)
    }, [setOfflineWorkAvailable]),
  )
  const runFlush = useCallback(async () => {
    const result = await flushQueue()
    setQueued(result.waiting)
    if (result.sent > 0) await loadJobs()
  }, [loadJobs])

  useEffect(() => {
    void queuedCount().then(setQueued)
  }, [])

  useEffect(() => {
    if (isOnline) void runFlush()
  }, [isOnline, runFlush])

  function confirmRelease(job: Job) {
    Alert.alert(
      'Hand this job back?',
      'It goes back to the open list and any crew requests are cancelled. Another technician can take it.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Hand back',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setWorkingId(job.id)
              const { error } = await supabase.rpc('release_repair_job', { p_repair: job.id })
              setWorkingId(null)
              if (error) {
                Alert.alert('Could not hand back', friendlyError(error, 'Please try again.'))
                return
              }
              await loadJobs()
            })()
          },
        },
      ],
    )
  }

  async function arrive(job: Job) {
    try {
      setWorkingId(job.id)
      const coords = await getCurrentCoords({ ask: true }).catch(() => null)
      const { error } = await supabase.rpc('check_in_arrival', {
        p_repair_id: job.id,
        p_lat: coords?.latitude ?? null,
        p_lon: coords?.longitude ?? null,
      })
      if (error) throw error

      // Arriving starts the job, so there is no separate "Start job" step.
      if (/^(assigned|pending)$/i.test(job.status)) {
        const started = await supabase.from('repair_records').update({ status: 'In Progress' }).eq('id', job.id)
        if (started.error) throw started.error
      }
      await loadJobs()
    } catch (error: any) {
      Alert.alert('Could not check in', friendlyError(error, 'Please try again.'))
    } finally {
      setWorkingId(null)
    }
  }

  async function pick(setter: (uri: string | null) => void) {
    try {
      const photo = await takePhoto()
      if (photo) setter(photo.uri)
    } catch {
      Alert.alert('Camera unavailable', 'Allow camera or photo access and try again.')
    }
  }

  // Orders my unfinished stops nearest-next (starting from where I am), shows
  // the plan in a preview sheet, and only then hands it to Google Maps.
  function planRoute() {
    const stops = jobs.filter(
      (job) => job.technician_user_id === myId && !isFinished(job.status) && job.spot,
    )
    if (stops.length === 0) return

    const ordered: Job[] = []
    const legs: (number | null)[] = []
    let here: Coords | null = myCoords
    const left = [...stops]
    while (left.length > 0) {
      let best = 0
      let bestKm: number | null = null
      if (here) {
        let nearest = Number.POSITIVE_INFINITY
        left.forEach((job, index) => {
          const km = distanceKm(here as Coords, job.spot as Coords)
          if (km < nearest) {
            nearest = km
            best = index
          }
        })
        bestKm = nearest
      }
      const [next] = left.splice(best, 1)
      ordered.push(next)
      legs.push(bestKm)
      here = next.spot
    }

    setRoutePlan({ ordered, legs })
  }

  function startRoute() {
    if (!routePlan) return
    const point = (job: Job) => `${(job.spot as Coords).latitude},${(job.spot as Coords).longitude}`
    // Google Maps takes at most 9 stops in between.
    const limited = routePlan.ordered.slice(0, 10)
    const destination = point(limited[limited.length - 1])
    const waypoints = limited.slice(0, -1).map(point).join('|')
    const origin = myCoords ? `&origin=${myCoords.latitude},${myCoords.longitude}` : ''
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`,
    )
    setRoutePlan(null)
  }

  function openDirections(job: Job) {
    if (!job.spot) return
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${job.spot.latitude},${job.spot.longitude}`,
    )
  }

  function callCustomer(job: Job) {
    const phone = job.client?.mobile_number?.trim()
    if (phone) void Linking.openURL(`tel:${phone}`)
  }

  // While the Jobs tab is open and a job is active, share the technician's
  // position so the customer can see how far away they are. Foreground only.
  useFocusEffect(
    useCallback(() => {
      if (!authorized || !myId) return undefined

      let stopped = false

      const share = async () => {
        if (stopped || !hasActiveRef.current) return
        const coords = await getCurrentCoords({ ask: false })
        if (!coords || stopped) return
        await supabase.from('technician_locations').upsert({
          user_id: myId,
          latitude: coords.latitude,
          longitude: coords.longitude,
          updated_at: new Date().toISOString(),
        })
      }

      void share()
      const timer = setInterval(() => void share(), 25000)
      return () => {
        stopped = true
        clearInterval(timer)
      }
    }, [authorized, myId]),
  )

  async function refreshJobs() {
    setRefreshing(true)
    await loadJobs()
  }

  function getStatusIcon(
    status: string,
  ) {
    const normalized =
      status.toLowerCase()

    if (
      normalized.includes('complete') ||
      normalized.includes('resolved')
    ) {
      return 'checkmark-circle-outline' as const
    }

    if (
      normalized.includes('progress') ||
      normalized.includes('ongoing')
    ) {
      return 'construct-outline' as const
    }

    if (
      normalized.includes('pending') ||
      normalized.includes('open')
    ) {
      return 'time-outline' as const
    }

    if (
      normalized.includes('cancel')
    ) {
      return 'close-circle-outline' as const
    }

    return 'information-circle-outline' as const
  }

  function getStatusColor(
    status: string,
  ) {
    const normalized =
      status.toLowerCase()

    if (
      normalized.includes('complete') ||
      normalized.includes('resolved')
    ) {
      return colors.success
    }

    if (
      normalized.includes('progress') ||
      normalized.includes('ongoing')
    ) {
      return colors.accent
    }

    if (
      normalized.includes('cancel')
    ) {
      return colors.danger
    }

    return colors.warning
  }

  function formatDate(
    value: string,
  ) {
    if (!value) {
      return 'Date not available'
    }

    const date = new Date(
      `${value}T00:00:00`,
    )

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return value
    }

    return date.toLocaleDateString(
      'en-US',
      {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      },
    )
  }

  if (loading) {
    return <SkeletonScreen variant="list" />
  }

  /*
   * This screen is intentionally technician-only.
   */
  if (!authorized) {
    return (
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={
            styles.restrictedContent
          }
          showsVerticalScrollIndicator={
            false
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshJobs}
              tintColor={colors.accent}
            />
          }
        >
          <View
            style={styles.restrictedIcon}
          >
            <Ionicons
              name="lock-closed-outline"
              size={32}
              color={colors.accent}
            />
          </View>

          <Text
            style={styles.restrictedTitle}
          >
            Technician Jobs
          </Text>

          <Text
            style={styles.restrictedText}
          >
            This screen is available only
            to authenticated technician
            accounts.
          </Text>

          {errorMessage ? (
            <GlassCard
              style={
                styles.errorCard
              }
            >
              <Ionicons
                name="alert-circle-outline"
                size={24}
                color={colors.danger}
              />

              <Text
                style={
                  styles.errorTitle
                }
              >
                Unable to verify account
              </Text>

              <Text
                style={
                  styles.errorText
                }
              >
                {errorMessage}
              </Text>
            </GlassCard>
          ) : null}

        </ScrollView>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRefWithTour}
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshJobs}
            tintColor={colors.accent}
          />
        }
      >
        {/* HEADER */}

        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text
              style={styles.eyebrow}
            >
              FIELD OPERATIONS
            </Text>

            <Text
              style={styles.title}
            >
              Jobs
            </Text>

            <Text
              style={styles.muted}
            >
              Open jobs near you, and your own.
            </Text>
          </View>

          <View
            style={styles.headerIcon}
          >
            <Ionicons
              name="construct-outline"
              size={23}
              color={colors.accent}
            />
          </View>
        </View>

        {/* ERROR */}

        {errorMessage ? (
          <GlassCard
            style={styles.errorCard}
          >
            <Ionicons
              name="alert-circle-outline"
              size={24}
              color={colors.danger}
            />

            <Text
              style={styles.errorTitle}
            >
              Unable to load jobs
            </Text>

            <Text
              style={styles.errorText}
            >
              {errorMessage}
            </Text>

            <Pressable
              onPress={loadJobs}
              style={({ pressed }) => [
                styles.retryButton,
                pressed &&
                  styles.buttonPressed,
              ]}
            >
              <Ionicons
                name="refresh-outline"
                size={15}
                color={colors.accent}
              />

              <Text
                style={styles.retryText}
              >
                TRY AGAIN
              </Text>
            </Pressable>
          </GlassCard>
        ) : null}

        {/* JOB COUNT: the same three groups as the lists below; tap one to jump to it. */}

        {!errorMessage ? (
          <View style={styles.summaryRow}>
            {GROUPS.map(([title, test, short], index) => (
              <View key={title} style={styles.summaryCell}>
                {index > 0 ? <View style={styles.summaryDivider} /> : null}
                <Pressable
                  onPress={() => scrollToGroup(title)}
                  accessibilityRole="button"
                  accessibilityLabel={`${short}: ${jobs.filter(test).length}`}
                  style={({ pressed }) => [styles.summaryItem, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.summaryNumber}>{jobs.filter(test).length}</Text>
                  <Text style={styles.summaryLabel} numberOfLines={1}>
                    {title === COMPLETED ? `DONE · ${historyDays === RECENT_DAYS ? '30 DAYS' : '1 YEAR'}` : short}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {/* EMPTY STATE */}

        {!errorMessage &&
        jobs.length === 0 ? (
          <GlassCard
            style={styles.emptyCard}
          >
            <View
              style={styles.emptyIcon}
            >
              <Ionicons
                name="construct-outline"
                size={31}
                color={colors.accent}
              />
            </View>

            <Text
              style={styles.cardTitle}
            >
              No jobs yet
            </Text>

            <Text
              style={styles.cardText}
            >
              New and assigned jobs will show up here.
            </Text>

          </GlassCard>
        ) : null}

        {/* JOB LIST */}

        {locationOff && jobs.some(job => !job.technician_user_id) ? (
          <GlassCard style={styles.errorCard}>
            <Ionicons
              name="location-outline"
              size={22}
              color={colors.warning}
            />
            <Text style={styles.errorText}>
              Turn on location for PKC BIZOFT to see the nearest jobs first.
            </Text>
          </GlassCard>
        ) : null}

        {queued > 0 ? (
          <GlassCard style={{ padding: 14, marginBottom: 12, borderColor: colors.medium }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="cloud-upload-outline" size={22} color={colors.medium} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>
                  {queued} finished job{queued === 1 ? '' : 's'} waiting to send
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                  Saved on your phone. They send by themselves when you have signal.
                </Text>
              </View>
              <Pressable onPress={() => void runFlush()} accessibilityRole="button" style={styles.quickButton}>
                <Text style={styles.quickText}>Send now</Text>
              </Pressable>
            </View>
          </GlassCard>
        ) : null}

        {GROUPS.map(([title, test]) => {
          const group = jobs.filter(test)
          if (group.length === 0) return null

          return (
            <View key={title} onLayout={event => { groupY.current[title] = event.nativeEvent.layout.y }}>
              <Text style={styles.groupTitle}>
                {title} ({group.length})
              </Text>

              {title === 'MY ACTIVE JOBS' && group.filter(job => job.spot).length >= 2 ? (
                <Pressable
                  onPress={planRoute}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.routeButton, pressed && { opacity: 0.75 }]}
                >
                  <Ionicons name="navigate" size={17} color={colors.bg} />
                  <Text style={styles.routeButtonText}>
                    Plan my route ({group.filter(job => job.spot).length} stops)
                  </Text>
                </Pressable>
              ) : null}

              {group.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  isMine={job.technician_user_id === myId}
                  getStatusIcon={getStatusIcon}
                  getStatusColor={getStatusColor}
                  formatDate={formatDate}
                  accepting={acceptingId === job.id}
                  working={workingId === job.id}
                  crew={crewByJob[job.id] ?? []}
                  requests={requestsByJob[job.id] ?? []}
                  canChooseCrew={
                    job.technician_user_id === myId &&
                    !isFinished(job.status)
                  }
                  onChooseCrew={() => void openCrewPicker(job)}
                  onAccept={() => void acceptJob(job)}
                  onStart={() => void startJob(job)}
                  onComplete={() => {
                    setResolutionText('')
                    setCompleteError('')
                    setBeforePhoto(null)
                    setAfterPhoto(null)
                    setTicks([])
                    setTruckUsed({})
                    void fetchTruckStock().then(setTruckItems)
                    setJobLines([])
                    setJobUsed({})
                    void fetchJobMaterialLines({ kind: 'client', id: job.id })
                      .then(setJobLines)
                      .catch(() => {})
                    setSerialSaved(!!job.client?.modem_serial)
                    setSignature([])
                    setRemoteSign(false)
                    setCompleting(job)
                  }}
                  onTakeBack={() => void takeBackSignature(job)}
                  onRelease={
                    job.technician_user_id === myId &&
                    /^(assigned|pending)$/i.test(job.status) &&
                    !job.arrived_at
                      ? () => confirmRelease(job)
                      : undefined
                  }
                  onChat={job.service_request_id ? () => setChatJob(job) : undefined}
                  unreadChat={!!job.service_request_id && unreadChat.has(job.service_request_id)}
                  onArrive={() => void arrive(job)}
                  onHistory={job.technician_user_id && !isFinished(job.status) ? () => setHistoryJob(job) : undefined}
                  onDirections={() => openDirections(job)}
                  onCall={() => callCustomer(job)}
                />
              ))}
            </View>
          )
        })}

        {!errorMessage && jobs.length > 0 ? (
          <Pressable
            onPress={() => {
              setRefreshing(true)
              setHistoryDays(days => (days === RECENT_DAYS ? OLDER_DAYS : RECENT_DAYS))
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.olderButton, pressed && styles.buttonPressed]}
          >
            <Ionicons name={historyDays === RECENT_DAYS ? 'time-outline' : 'chevron-up'} size={16} color={colors.muted} />
            <Text style={styles.olderText}>
              {historyDays === RECENT_DAYS
                ? 'Show finished jobs from the past year'
                : 'Show only the last 30 days'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <JobHistorySheet
        visible={!!historyJob}
        clientId={historyJob?.client_id ?? null}
        customerName={historyJob?.client?.customer_name || 'Customer'}
        currentJobId={historyJob?.id ?? null}
        onClose={() => setHistoryJob(null)}
      />

      <TicketChat
        visible={!!chatJob}
        requestId={chatJob?.service_request_id ?? null}
        title={chatJob?.client?.customer_name || 'Customer'}
        subtitle={chatJob?.problem_description || 'Issue chat'}
        onClose={() => setChatJob(null)}
      />

      <RoutePreview
        visible={!!routePlan}
        fromHere={!!myCoords}
        truncated={(routePlan?.ordered.length ?? 0) > 10}
        stops={(routePlan?.ordered ?? []).map((job, index) => ({
          id: job.id,
          name: job.client?.customer_name || 'Customer',
          place: job.client?.area || '',
          problem: job.problem_description || '',
          legKm: routePlan?.legs[index] ?? null,
        }))}
        onStart={startRoute}
        onClose={() => setRoutePlan(null)}
      />

      <Modal
        visible={!!modeFor}
        transparent
        animationType="fade"
        onRequestClose={() => setModeFor(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {(() => {
              const active = jobs.filter(item => !!item.technician_user_id && item.technician_user_id === myId && !isFinished(item.status)).length
              const left = Math.max(0, MAX_ACTIVE_JOBS - active)
              const goTo = (title: string) => {
                setModeFor(null)
                setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (groupY.current[title] ?? 0) - 8), animated: true }), 250)
              }
              return (
                <>
                  <Text style={styles.modalTitle}>Job accepted</Text>
                  <Text style={styles.modalHint}>
                    You now have {active} of {MAX_ACTIVE_JOBS} active jobs.{' '}
                    {left > 0
                      ? `You can take ${left} more.`
                      : 'You have reached the limit. Finish one to accept another.'}
                  </Text>

                  <View style={{ gap: 10 }}>
                    <Pressable
                      onPress={() => modeFor && void openCrewPicker(modeFor)}
                      style={[styles.modalButton, { flex: 0 }]}
                    >
                      <Text style={styles.modalButtonText}>Team up on this job</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => goTo('OPEN JOBS - NEAREST FIRST')}
                      disabled={left === 0}
                      style={[styles.modalButton, styles.modalGhost, { flex: 0 }, left === 0 && { opacity: 0.4 }]}
                    >
                      <Text style={styles.modalGhostText}>
                        {left > 0 ? `Accept more jobs (${left} left)` : 'Accept more jobs (limit reached)'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => goTo('MY ACTIVE JOBS')}
                      style={[styles.modalButton, styles.modalGhost, { flex: 0 }]}
                    >
                      <Text style={styles.modalGhostText}>See my jobs ({active})</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setModeFor(null)}
                      style={[styles.modalButton, styles.modalGhost, { flex: 0 }]}
                    >
                      <Text style={styles.modalGhostText}>
                        That&apos;s enough, keep {active === 1 ? 'my 1 job' : `my ${active} jobs`}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )
            })()}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!crewFor}
        transparent
        animationType="fade"
        onRequestClose={() => setCrewFor(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Team up</Text>
            <Text style={styles.modalHint}>
              Choose who joins you (up to 9). They get a request and can accept or decline. Busy
              technicians can&apos;t be added.
            </Text>

            {loadingDirectory ? (
              <ActivityIndicator style={{ margin: 24 }} color={colors.accent} />
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {directory.map(tech => {
                  const onThisJob = (requestsByJob[crewFor?.id ?? ''] ?? []).some(
                    row =>
                      row.user_id === tech.user_id &&
                      (row.status === 'pending' || row.status === 'accepted'),
                  )
                  const unavailable = tech.status === 'busy' && !onThisJob
                  const selected = crewPick.includes(tech.user_id)

                  return (
                    <Pressable
                      key={tech.user_id}
                      disabled={unavailable}
                      onPress={() =>
                        setCrewPick(list =>
                          list.includes(tech.user_id)
                            ? list.filter(id => id !== tech.user_id)
                            : list.length >= 9
                              ? list
                              : [...list, tech.user_id],
                        )
                      }
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 10,
                        opacity: unavailable ? 0.45 : 1,
                      }}
                    >
                      <Ionicons
                        name={selected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={selected ? colors.accent : colors.muted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>
                          {tech.full_name}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                          {tech.employee_number || 'No staff ID yet'}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: unavailable ? colors.medium : colors.success,
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '800',
                            color: unavailable ? colors.medium : colors.success,
                          }}
                        >
                          {unavailable
                            ? tech.job_type === 'installation'
                              ? 'Busy · installation'
                              : 'Busy · repair'
                            : 'Available'}
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
                {directory.length === 0 ? (
                  <Text style={styles.modalHint}>There are no other technicians yet.</Text>
                ) : null}
              </ScrollView>
            )}

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setCrewFor(null)}
                style={[styles.modalButton, styles.modalGhost]}
              >
                <Text style={styles.modalGhostText}>Cancel</Text>
              </Pressable>

              <Pressable
                disabled={savingCrew}
                onPress={() => {
                  if (!crewFor) return
                  void (async () => {
                    setSavingCrew(true)
                    const { error } = await supabase.rpc('request_job_crew', {
                      p_repair: crewFor.id,
                      p_users: crewPick,
                    })
                    setSavingCrew(false)
                    if (error) {
                      Alert.alert('Crew', friendlyError(error, 'Please try again.'))
                      return
                    }
                    setCrewFor(null)
                    await loadJobs()
                  })()
                }}
                style={[styles.modalButton, savingCrew && { opacity: 0.6 }]}
              >
                <Text style={styles.modalButtonText}>
                  {savingCrew ? 'Sending...' : crewPick.length > 0 ? 'Send requests' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!completing}
        transparent
        animationType="fade"
        onRequestClose={() => setCompleting(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={[styles.modalCard, { maxHeight: '92%', flexGrow: 0 }]}
            contentContainerStyle={{ paddingBottom: 28 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalTitle}>
              {completing?.job_type === 'installation'
                ? 'Finish installation'
                : 'Finish this job'}
            </Text>

            <Text style={styles.modalHint}>
              {completing?.job_type === 'installation'
                ? 'Marking this done activates the customer\'s account. Add a note if needed.'
                : 'Tell the customer what was done.'}
            </Text>

            <TextInput
              value={resolutionText}
              onChangeText={setResolutionText}
              placeholder={
                completing?.job_type === 'installation'
                  ? 'Optional note (router model, cable length...)'
                  : 'What was fixed?'
              }
              placeholderTextColor={colors.muted}
              multiline
              style={styles.modalInput}
            />

            {completing ? (
              <>
                <Text style={styles.evidenceLabel}>CHECKLIST</Text>
                {ruleFor(completing.job_type).items.map((item, index) => {
                  const checked = !!ticks[index]
                  return (
                    <Pressable
                      key={item}
                      onPress={() =>
                        setTicks(prev => {
                          const next = [...prev]
                          next[index] = !next[index]
                          return next
                        })
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      style={styles.checkRow}
                    >
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={checked ? colors.success : colors.muted}
                      />
                      <Text style={[styles.checkText, checked && { color: colors.text }]}>{item}</Text>
                    </Pressable>
                  )
                })}

                {ruleFor(completing.job_type).needsSerial ? (
                  <ModemSerialCard
                    clientId={completing.client_id}
                    current={completing.client?.modem_serial ?? null}
                    onSaved={() => {
                      setSerialSaved(true)
                      void loadJobs()
                    }}
                  />
                ) : null}
              </>
            ) : null}

            {jobLines.some((line) => !line.return_done) ? (
              <>
                <Text style={styles.evidenceLabel}>MATERIALS YOU TOOK FOR THIS JOB — HOW MUCH DID YOU USE?</Text>
                <UsedMaterialsEditor
                  lines={jobLines.filter((line) => !line.return_done)}
                  used={jobUsed}
                  onChange={setJobUsed}
                />
              </>
            ) : null}

            {truckItems.length > 0 ? (
              <>
                <Text style={styles.evidenceLabel}>MATERIALS USED FROM YOUR TRUCK</Text>
                {truckItems.map(item => {
                  const used = truckUsed[item.item_id] ?? 0
                  return (
                    <View key={item.item_id} style={styles.checkRow}>
                      <Text style={[styles.checkText, { color: colors.text }]} numberOfLines={1}>
                        {item.name} <Text style={{ color: colors.muted }}>({item.quantity} on truck)</Text>
                      </Text>
                      <Pressable
                        onPress={() => setTruckUsed(prev => ({ ...prev, [item.item_id]: Math.max(0, (prev[item.item_id] ?? 0) - 1) }))}
                        accessibilityRole="button"
                        accessibilityLabel={`Use one less ${item.name}`}
                        style={styles.stepBtn}
                      >
                        <Ionicons name="remove" size={18} color={colors.accent} />
                      </Pressable>
                      <Text style={styles.stepValue}>{used}</Text>
                      <Pressable
                        onPress={() => setTruckUsed(prev => ({ ...prev, [item.item_id]: Math.min(item.quantity, (prev[item.item_id] ?? 0) + 1) }))}
                        accessibilityRole="button"
                        accessibilityLabel={`Use one more ${item.name}`}
                        style={styles.stepBtn}
                      >
                        <Ionicons name="add" size={18} color={colors.accent} />
                      </Pressable>
                    </View>
                  )
                })}
              </>
            ) : null}

            <Text style={styles.evidenceLabel}>
              {completing && (ruleFor(completing.job_type).needsBeforePhoto || ruleFor(completing.job_type).needsAfterPhoto)
                ? `PHOTOS (REQUIRED: ${[
                    ruleFor(completing.job_type).needsBeforePhoto ? 'BEFORE' : null,
                    ruleFor(completing.job_type).needsAfterPhoto ? 'AFTER' : null,
                  ]
                    .filter(Boolean)
                    .join(' AND ')})`
                : 'PHOTOS (OPTIONAL)'}
            </Text>
            <View style={styles.evidenceRow}>
              {([
                ['Before', beforePhoto, setBeforePhoto],
                ['After', afterPhoto, setAfterPhoto],
              ] as const).map(([label, uri, setter]) => (
                <Pressable key={label} onPress={() => void pick(setter)} style={styles.photoBox}>
                  {uri ? (
                    <Image source={{ uri }} style={styles.photoImage} />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={22} color={colors.accent} />
                      <Text style={styles.photoLabel}>{label} photo</Text>
                    </>
                  )}
                </Pressable>
              ))}
            </View>

            <Text style={styles.evidenceLabel}>CUSTOMER SIGNATURE (REQUIRED)</Text>
            {remoteSign ? (
              <Text style={styles.assignedText}>
                The customer will get a notice in their app, see your before and after photos and sign there. The job
                finishes when they sign.
              </Text>
            ) : (
              <SignaturePad strokes={signature} onChange={setSignature} />
            )}
            <Pressable
              onPress={() => setRemoteSign(value => !value)}
              accessibilityRole="switch"
              accessibilityState={{ checked: remoteSign }}
              style={({ pressed }) => [styles.quickButton, { marginTop: 8 }, pressed && styles.buttonPressed]}
            >
              <Ionicons name={remoteSign ? 'create-outline' : 'phone-portrait-outline'} size={16} color={colors.accent} />
              <Text style={styles.quickText}>
                {remoteSign ? 'The customer is here, sign now' : 'Customer not here: ask them to sign in the app'}
              </Text>
            </Pressable>

            {completeError ? (
              <Text style={styles.modalError}>{completeError}</Text>
            ) : null}

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setCompleting(null)}
                style={[styles.modalButton, styles.modalGhost]}
              >
                <Text style={styles.modalGhostText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => void finishJob()}
                disabled={workingId === completing?.id}
                style={[
                  styles.modalButton,
                  workingId === completing?.id && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.modalButtonText}>
                  {workingId === completing?.id ? 'Saving...' : remoteSign ? 'Send for signature' : 'Mark completed'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

function JobCard({
  job,
  isMine,
  getStatusIcon,
  getStatusColor,
  formatDate,
  accepting,
  working,
  crew,
  requests,
  canChooseCrew,
  onChooseCrew,
  onAccept,
  onStart,
  onComplete,
  onDirections,
  onCall,
  onChat,
  onArrive,
  onHistory,
  onRelease,
  onTakeBack,
  unreadChat,
}: {
  onTakeBack: () => void
  /** The customer (or support) wrote something I have not read. */
  unreadChat: boolean
  onRelease?: () => void
  onChat?: () => void
  onArrive: () => void
  onHistory?: () => void
  accepting: boolean
  working: boolean
  isMine: boolean
  crew: CrewPerson[]
  requests: CrewRequestRow[]
  canChooseCrew: boolean
  onChooseCrew: () => void
  onAccept: () => void
  onStart: () => void
  onComplete: () => void
  onDirections: () => void
  onCall: () => void
  job: Job
  getStatusIcon: (
    status: string,
  ) => keyof typeof Ionicons.glyphMap
  getStatusColor: (
    status: string,
  ) => string
  formatDate: (
    value: string,
  ) => string
}) {
  const statusColor =
    getStatusColor(job.status)
  const finished = isFinished(job.status)

  return (
    <GlassCard
      style={styles.jobCard}
    >
      {/* JOB HEADER */}

      <View
        style={styles.jobTopRow}
      >
        <View
          style={styles.jobIcon}
        >
          <Ionicons
            name="construct-outline"
            size={21}
            color={colors.accent}
          />
        </View>

        <View
          style={styles.jobHeaderInfo}
        >
          <Text
            style={styles.customerName}
            numberOfLines={2}
          >
            {job.client
              ?.customer_name ||
              'Customer not configured'}
          </Text>

          <Text
            style={styles.repairDate}
          >
            {formatDate(
              job.repair_date,
            )}
          </Text>

          <View style={styles.chipRow}>
            {job.job_type === 'installation' ? (
              <View style={styles.chip}>
                <Ionicons name="wifi-outline" size={11} color={colors.accent} />
                <Text style={styles.chipText}>NEW INSTALLATION</Text>
              </View>
            ) : null}

            {!job.technician_user_id && waitingDays(job.created_at) >= 1 ? (
              <View style={[styles.chip, { borderColor: colors.warning }]}>
                <Ionicons name="time-outline" size={11} color={colors.warning} />
                <Text style={[styles.chipText, { color: colors.warning }]}>
                  WAITING {waitingDays(job.created_at)} DAY{waitingDays(job.created_at) === 1 ? '' : 'S'}
                </Text>
              </View>
            ) : null}

            {job.distance !== null ? (
              <View style={styles.chip}>
                <Ionicons name="navigate-outline" size={11} color={colors.accent} />
                <Text style={styles.chipText}>
                  {formatDistance(job.distance)} away
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View
          style={[
            styles.statusBadge,
            {
              borderColor:
                `${statusColor}55`,
              backgroundColor:
                `${statusColor}12`,
            },
          ]}
        >
          <Ionicons
            name={getStatusIcon(
              job.status,
            )}
            size={13}
            color={statusColor}
          />

          <Text
            numberOfLines={2}
            style={[
              styles.statusText,
              {
                color:
                  statusColor,
              },
            ]}
          >
            {job.status.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* DETAILS */}

      <View style={styles.detailRow}>
        <Ionicons name="alert-circle-outline" size={17} color={colors.muted} />
        <View style={styles.detailContent}>
          <Text style={styles.detailLabel}>{job.job_type === 'installation' ? 'JOB' : 'PROBLEM'}</Text>
          <Text style={styles.detailValue}>{job.problem_description}</Text>
        </View>
      </View>

      {job.client?.account_id || job.client?.plan_name ? (
        <View style={styles.detailRow}>
          <Ionicons name="card-outline" size={17} color={colors.muted} />
          <View style={styles.detailContent}>
            <Text style={styles.detailLabel}>ACCOUNT</Text>
            <Text style={styles.detailValue}>
              {[job.client?.account_id, job.client?.plan_name ? planLabel(job.client.plan_name) : null]
                .filter(Boolean)
                .join('  ·  ')}
            </Text>
          </View>
        </View>
      ) : null}

      {job.client?.area ? (
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={17} color={colors.muted} />
          <View style={styles.detailContent}>
            <Text style={styles.detailLabel}>SERVICE AREA</Text>
            <Text style={styles.detailValue}>{job.client.area}</Text>
          </View>
        </View>
      ) : null}

      {job.resolution ? (
        <View style={styles.resolutionBox}>
          <View style={styles.resolutionHeader}>
            <Ionicons name="checkmark-done-outline" size={17} color={colors.success} />
            <Text style={styles.resolutionLabel}>RESOLUTION</Text>
          </View>
          <Text style={styles.resolutionText}>{job.resolution}</Text>
        </View>
      ) : null}

      {/* QUICK ACTIONS */}

      <View style={styles.quickGrid}>
        {job.spot && !finished ? (
          <Pressable
            onPress={onDirections}
            accessibilityRole="button"
            style={({ pressed }) => [styles.quickButton, styles.quickCell, pressed && styles.buttonPressed]}
          >
            <Ionicons name="map-outline" size={16} color={colors.accent} />
            <Text style={styles.quickText}>Directions</Text>
          </Pressable>
        ) : null}

        {job.client?.mobile_number && !finished ? (
          <Pressable
            onPress={onCall}
            accessibilityRole="button"
            accessibilityLabel={`Call ${job.client.mobile_number}`}
            style={({ pressed }) => [styles.quickButton, styles.quickCell, pressed && styles.buttonPressed]}
          >
            <Ionicons name="call-outline" size={16} color={colors.accent} />
            <Text style={styles.quickText} numberOfLines={1}>
              Call {job.client.mobile_number}
            </Text>
          </Pressable>
        ) : null}

        {onChat && job.technician_user_id ? (
          <Pressable
            onPress={onChat}
            accessibilityRole="button"
            accessibilityLabel={unreadChat ? 'Open the chat for this job, new message' : 'Open the chat for this job'}
            style={({ pressed }) => [
              styles.quickButton,
              styles.quickCell,
              unreadChat && styles.quickButtonAlert,
              pressed && styles.buttonPressed,
            ]}
          >
            <Ionicons name={unreadChat ? 'chatbubbles' : 'chatbubbles-outline'} size={16} color={colors.accent} />
            <Text style={styles.quickText}>{unreadChat ? 'New message' : 'Message'}</Text>
            {unreadChat ? <View style={styles.unreadDot} /> : null}
          </Pressable>
        ) : null}

        {onHistory ? (
          <Pressable
            onPress={onHistory}
            accessibilityRole="button"
            style={({ pressed }) => [styles.quickButton, styles.quickCell, pressed && styles.buttonPressed]}
          >
            <Ionicons name="time-outline" size={16} color={colors.accent} />
            <Text style={styles.quickText}>Past jobs here</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ASSIGNMENT */}

      {!job.technician_user_id ? (
        <Pressable
          ref={tourRef('job-accept')}
          onPress={onAccept}
          disabled={accepting}
          accessibilityRole="button"
          style={({ pressed }) => [styles.acceptButton, (pressed || accepting) && styles.buttonPressed]}
        >
          <Ionicons name="hand-right-outline" size={18} color={colors.bg} />
          <Text style={styles.acceptButtonText}>{accepting ? 'Accepting...' : 'Accept this job'}</Text>
        </Pressable>
      ) : (
        <>
          <View style={styles.assignedRow}>
            <Ionicons name="person-circle-outline" size={16} color={colors.accent} />
            <Text style={styles.assignedText}>
              Assigned to: {isMine ? 'You' : job.technician || 'Current technician'}
            </Text>
          </View>

          {crew.length > 1 ? (
            <Text style={styles.noteText}>
              Crew:{' '}
              {crew
                .map(
                  person =>
                    `${person.name}${person.employee_number ? ` (${person.employee_number})` : ''}${
                      person.role === 'lead' ? ' · lead' : ''
                    }`,
                )
                .join(', ')}
            </Text>
          ) : null}

          {requests
            .filter(row => row.status !== 'accepted')
            .map(row => (
              <Text
                key={row.user_id}
                style={[styles.noteText, { color: row.status === 'declined' ? colors.danger : colors.medium }]}
              >
                {row.name}
                {row.employee_number ? ` (${row.employee_number})` : ''}:{' '}
                {row.status === 'declined' ? `declined, "${row.reason}"` : 'waiting for a reply'}
              </Text>
            ))}

          {isMine && /awaiting signature/i.test(job.status) ? (
            <>
              <View style={styles.noteRow}>
                <Ionicons name="create-outline" size={16} color={colors.medium} />
                <Text style={[styles.noteRowText, { color: colors.medium }]}>
                  Waiting for the customer to sign in their app
                </Text>
              </View>
              <Pressable
                onPress={onTakeBack}
                disabled={working}
                accessibilityRole="button"
                style={({ pressed }) => [styles.quickButton, styles.quickWide, (pressed || working) && styles.buttonPressed]}
              >
                <Ionicons name="return-up-back-outline" size={16} color={colors.accent} />
                <Text style={styles.quickText}>Take it back (customer is here)</Text>
              </Pressable>
            </>
          ) : isMine && !finished ? (
            job.arrived_at ? (
              <>
                <View style={styles.noteRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={[styles.noteRowText, { color: colors.success }]}>
                    Arrived at{' '}
                    {new Date(job.arrived_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
                <Pressable
                  onPress={onComplete}
                  disabled={working}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.acceptButton, (pressed || working) && styles.buttonPressed]}
                >
                  <Ionicons name="checkmark-done-outline" size={18} color={colors.bg} />
                  <Text style={styles.acceptButtonText}>Mark completed</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.noteText, { color: colors.medium }]}>
                  {/progress|ongoing/i.test(job.status)
                    ? 'Your location is shared with this customer while you are on the way. Tap "I have arrived" when you get there, then you can mark the job completed.'
                    : 'Tap "I have arrived" when you reach the customer. The job starts by itself, then you can mark it completed.'}
                </Text>
                <Pressable
                  ref={tourRef('job-arrived')}
                  onPress={onArrive}
                  disabled={working}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.acceptButton, (pressed || working) && styles.buttonPressed]}
                >
                  <Ionicons name="location" size={18} color={colors.bg} />
                  <Text style={styles.acceptButtonText}>{working ? 'Checking in...' : 'I have arrived'}</Text>
                </Pressable>
              </>
            )
          ) : null}

          {canChooseCrew || onRelease ? (
            <View style={styles.quickGrid}>
              {canChooseCrew ? (
                <Pressable
                  onPress={onChooseCrew}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.quickButton, styles.quickCell, pressed && styles.buttonPressed]}
                >
                  <Ionicons name="people-outline" size={16} color={colors.accent} />
                  <Text style={styles.quickText}>
                    {crew.length > 1 || requests.length > 0 ? 'Manage crew' : 'Team up'}
                  </Text>
                </Pressable>
              ) : null}

              {onRelease ? (
                <Pressable
                  onPress={onRelease}
                  disabled={working}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.quickButton,
                    styles.quickCell,
                    styles.quickButtonDanger,
                    (pressed || working) && styles.buttonPressed,
                  ]}
                >
                  <Ionicons name="return-up-back-outline" size={16} color={colors.danger} />
                  <Text style={[styles.quickText, { color: colors.danger }]}>Hand job back</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stepValue: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900',
    minWidth: 22,
    textAlign: 'center',
  },

  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },

  checkText: {
    flex: 1,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },

  groupTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginTop: 8,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.cardLight,
  },
  chipText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  quickButton: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.cardLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  quickText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
  },

  // Quick actions sit two to a row and wrap; a lone one fills the row.
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },

  quickCell: {
    flexBasis: '45%',
    flexGrow: 1,
    paddingHorizontal: 10,
  },

  quickWide: {
    flex: 0,
    marginTop: 10,
  },

  quickButtonAlert: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },

  quickButtonDanger: {
    borderColor: 'rgba(251,113,133,0.35)',
  },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },

  noteText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 8,
  },

  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
  },

  noteRowText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(2, 8, 14, 0.9)',
  },
  modalCard: {
    padding: 22,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.panel,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  modalInput: {
    minHeight: 90,
    textAlignVertical: 'top',
    color: colors.text,
    fontSize: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.cardLight,
  },
  modalError: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 10,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  modalGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalButtonText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '900',
  },
  modalGhostText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },
  acceptButton: {
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  acceptButtonText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '900',
  },
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  loadingRoot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  loadingIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor:
      'rgba(34,211,238,0.18)',
    marginBottom: 18,
  },

  loadingText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
  },

  content: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 110,
  },

  restrictedContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  restrictedIcon: {
    width: 70,
    height: 70,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor:
      'rgba(34,211,238,0.18)',
  },

  restrictedTitle: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '900',
    marginTop: 18,
  },

  restrictedText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 330,
    marginTop: 7,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 22,
  },

  headerText: {
    flex: 1,
    paddingRight: 14,
  },

  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
  },

  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    marginTop: 5,
  },

  muted: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
  },

  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor:
      'rgba(34,211,238,0.18)',
  },

  summaryRow: {
    minHeight: 78,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingVertical: 12,
  },

  summaryCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  summaryItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },

  olderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    marginTop: 4,
  },

  olderText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },

  summaryNumber: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },

  summaryLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginTop: 3,
  },

  summaryDivider: {
    width: 1,
    height: 34,
    backgroundColor: colors.line,
  },

  errorCard: {
    padding: 20,
    marginBottom: 18,
    borderColor:
      'rgba(251,113,133,0.25)',
  },

  errorTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 10,
  },

  errorText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  retryButton: {
    marginTop: 15,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor:
      'rgba(34,211,238,0.10)',
    borderWidth: 1,
    borderColor:
      'rgba(34,211,238,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  retryText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },

  emptyCard: {
    padding: 22,
    marginTop: 4,
    alignItems: 'flex-start',
  },

  emptyIcon: {
    width: 55,
    height: 55,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(34,211,238,0.08)',
  },

  cardTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 14,
  },

  cardText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  emptyRefreshButton: {
    marginTop: 17,
    borderRadius: 10,
    borderWidth: 1,
    borderColor:
      'rgba(34,211,238,0.22)',
    backgroundColor:
      'rgba(34,211,238,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  emptyRefreshText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  jobCard: {
    padding: 16,
    marginBottom: 14,
  },

  jobTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  jobIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(34,211,238,0.08)',
    marginRight: 11,
  },

  jobHeaderInfo: {
    flex: 1,
    paddingRight: 8,
  },

  customerName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },

  repairDate: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 130,
  },

  statusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor:
      'rgba(255,255,255,0.08)',
    marginVertical: 14,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 11,
  },

  detailContent: {
    flex: 1,
    marginLeft: 10,
  },

  detailLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 3,
  },

  detailValue: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },

  resolutionBox: {
    marginTop: 15,
    padding: 12,
    borderRadius: 12,
    backgroundColor:
      'rgba(54,224,161,0.06)',
    borderWidth: 1,
    borderColor:
      'rgba(54,224,161,0.16)',
  },

  resolutionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  resolutionLabel: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  routeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: colors.accent,
  },
  routeButtonText: { color: colors.bg, fontSize: 14, fontWeight: '900' },
  evidenceLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginTop: 14, marginBottom: 8 },
  evidenceRow: { flexDirection: 'row', gap: 10 },
  photoBox: {
    flex: 1,
    height: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%' },
  photoLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 4 },
  resolutionText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 7,
  },

  assignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    paddingTop: 12,
    borderTopWidth:
      StyleSheet.hairlineWidth,
    borderTopColor:
      'rgba(255,255,255,0.08)',
  },

  assignedText: {
    flex: 1,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 7,
  },

  buttonPressed: {
    opacity: 0.65,
    transform: [
      {
        scale: 0.98,
      },
    ],
  },
})