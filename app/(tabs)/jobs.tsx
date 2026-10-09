import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
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
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { distanceKm, formatDistance, getCurrentCoords, type Coords } from '@/lib/location'
import { colors } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'
import { Alert } from '@/components/AppAlert'

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

type TeamMember = {
  user_id: string
  name: string
  employee_number: string | null
  role: 'leader' | 'member'
  status: 'available' | 'busy'
}

const MAX_ACTIVE_JOBS = 3

function isFinished(status: string) {
  return /(complete|resolved|done|fixed|cancel)/i.test(status)
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
  const [locationOff, setLocationOff] = useState(false)
  const [completing, setCompleting] = useState<Job | null>(null)
  const [resolutionText, setResolutionText] = useState('')
  const [completeError, setCompleteError] = useState('')
  const [isLeader, setIsLeader] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [crewByJob, setCrewByJob] = useState<Record<string, CrewPerson[]>>({})
  const [crewFor, setCrewFor] = useState<Job | null>(null)
  const [crewPick, setCrewPick] = useState<string[]>([])
  const [savingCrew, setSavingCrew] = useState(false)
  const hasActiveRef = useRef(false)

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

      // My team (if any): a leader chooses the crew for team jobs.
      const { data: teamData } = await supabase.rpc('my_team')
      const team = teamData as { is_leader: boolean; members: TeamMember[] } | null
      setIsLeader(Boolean(team?.is_leader))
      setTeamMembers(team?.members ?? [])

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
      const {
        data: assignedRepairs,
        error: repairError,
      } = await supabase
        .from('repair_records')
        .select(
          `
            id,
            client_id,
            technician,
            technician_user_id,
            repair_date,
            problem_description,
            resolution,
            status,
            created_at,
            job_type,
            latitude,
            longitude,
            accepted_at
          `,
        )
        .or(`technician_user_id.eq.${user.id},technician_user_id.is.null`)
        .order('repair_date', {
          ascending: false,
        })

      if (repairError) {
        throw repairError
      }

      // Jobs assigned to someone else that I may still see: ones where I am on
      // the crew, or (for a team leader) ones my team members took.
      const { data: sharedRepairs } = await supabase
        .from('repair_records')
        .select(
          `
            id,
            client_id,
            technician,
            technician_user_id,
            repair_date,
            problem_description,
            resolution,
            status,
            created_at,
            job_type,
            latitude,
            longitude,
            accepted_at
          `,
        )
        .not('technician_user_id', 'is', null)
        .neq('technician_user_id', user.id)

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
    } catch (error) {
      console.error(
        'Technician jobs loading error:',
        error,
      )

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to load technician jobs.'

      setErrorMessage(message)
      setJobs([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

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

      if (data && data.length > 0 && isLeader) {
        setCrewPick([])
        setCrewFor({ ...job, technician_user_id: user.id })
      }
    } catch (error: any) {
      Alert.alert('Unable to accept job', error?.message || 'Please try again.')
    } finally {
      setAcceptingId(null)
    }
  }, [loadJobs, isLeader])


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
      Alert.alert('Unable to start job', error?.message || 'Please try again.')
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

    try {
      setWorkingId(completing.id)
      setCompleteError('')
      const { error } = await supabase
        .from('repair_records')
        .update({
          status: 'Completed',
          resolution: note || (isInstall ? 'Installation completed' : null),
        })
        .eq('id', completing.id)
      if (error) throw error
      setCompleting(null)
      setResolutionText('')
      await loadJobs()
    } catch (error: any) {
      setCompleteError(error?.message || 'Unable to complete this job.')
    } finally {
      setWorkingId(null)
    }
  }, [completing, resolutionText, loadJobs])

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
    return (
      <View style={styles.loadingRoot}>
        <View style={styles.loadingIcon}>
          <Ionicons
            name="construct-outline"
            size={30}
            color={colors.accent}
          />
        </View>

        <ActivityIndicator
          size="large"
          color={colors.accent}
        />

        <Text
          style={styles.loadingText}
        >
          Loading technician jobs...
        </Text>
      </View>
    )
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
              Open jobs near you and the jobs you accepted.
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

        {/* JOB COUNT */}

        {!errorMessage ? (
          <View
            style={styles.summaryRow}
          >
            <View
              style={styles.summaryItem}
            >
              <Text
                style={
                  styles.summaryNumber
                }
              >
                {jobs.length}
              </Text>

              <Text
                style={
                  styles.summaryLabel
                }
              >
                ASSIGNED JOBS
              </Text>
            </View>

            <View
              style={styles.summaryDivider}
            />

            <View
              style={styles.summaryItem}
            >
              <Text
                style={
                  styles.summaryNumber
                }
              >
                {
                  jobs.filter(
                    job => {
                      const status =
                        job.status.toLowerCase()

                      return (
                        status.includes(
                          'pending',
                        ) ||
                        status.includes(
                          'open',
                        )
                      )
                    },
                  ).length
                }
              </Text>

              <Text
                style={
                  styles.summaryLabel
                }
              >
                PENDING
              </Text>
            </View>

            <View
              style={styles.summaryDivider}
            />

            <View
              style={styles.summaryItem}
            >
              <Text
                style={
                  styles.summaryNumber
                }
              >
                {
                  jobs.filter(
                    job => {
                      const status =
                        job.status.toLowerCase()

                      return (
                        status.includes(
                          'complete',
                        ) ||
                        status.includes(
                          'resolved',
                        )
                      )
                    },
                  ).length
                }
              </Text>

              <Text
                style={
                  styles.summaryLabel
                }
              >
                COMPLETED
              </Text>
            </View>
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
              Customer issues and jobs assigned
              to you will appear here
              with the customer, location,
              problem, status, and repair
              date.
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

        {([
          ['OPEN JOBS - NEAREST FIRST', (job: Job) => !job.technician_user_id],
          ['MY ACTIVE JOBS', (job: Job) => !!job.technician_user_id && !isFinished(job.status)],
          ['COMPLETED', (job: Job) => !!job.technician_user_id && isFinished(job.status)],
        ] as [string, (job: Job) => boolean][]).map(([title, test]) => {
          const group = jobs.filter(test)
          if (group.length === 0) return null

          return (
            <View key={title}>
              <Text style={styles.groupTitle}>
                {title} ({group.length})
              </Text>

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
                  canChooseCrew={
                    isLeader &&
                    !!job.technician_user_id &&
                    !isFinished(job.status)
                  }
                  onChooseCrew={() => {
                    setCrewPick(
                      (crewByJob[job.id] ?? [])
                        .filter(person => person.role === 'helper')
                        .map(person => person.user_id),
                    )
                    setCrewFor(job)
                  }}
                  onAccept={() => void acceptJob(job)}
                  onStart={() => void startJob(job)}
                  onComplete={() => {
                    setResolutionText('')
                    setCompleteError('')
                    setCompleting(job)
                  }}
                  onDirections={() => openDirections(job)}
                  onCall={() => callCustomer(job)}
                />
              ))}
            </View>
          )
        })}
      </ScrollView>

      <Modal
        visible={!!crewFor}
        transparent
        animationType="fade"
        onRequestClose={() => setCrewFor(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose your crew</Text>
            <Text style={styles.modalHint}>
              Pick who goes with you. Busy teammates are greyed out. Everyone you choose is shown to the
              customer.
            </Text>

            <ScrollView style={{ maxHeight: 280 }}>
              {teamMembers
                .filter(member => member.user_id !== crewFor?.technician_user_id)
                .map(member => {
                  const onThisJob = (crewByJob[crewFor?.id ?? ''] ?? []).some(
                    person => person.user_id === member.user_id,
                  )
                  const unavailable = member.status === 'busy' && !onThisJob
                  const selected = crewPick.includes(member.user_id)

                  return (
                    <Pressable
                      key={member.user_id}
                      disabled={unavailable}
                      onPress={() =>
                        setCrewPick(list =>
                          list.includes(member.user_id)
                            ? list.filter(id => id !== member.user_id)
                            : [...list, member.user_id],
                        )
                      }
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 10,
                        opacity: unavailable ? 0.4 : 1,
                      }}
                    >
                      <Ionicons
                        name={selected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={selected ? colors.accent : colors.muted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>
                          {member.name}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                          {member.employee_number || 'No staff ID yet'} ·{' '}
                          {unavailable ? 'Busy' : 'Available'}
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
              {teamMembers.filter(member => member.user_id !== crewFor?.technician_user_id).length === 0 ? (
                <Text style={styles.modalHint}>No one else is in your team yet.</Text>
              ) : null}
            </ScrollView>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setCrewFor(null)}
                style={[styles.modalButton, styles.modalGhost]}
              >
                <Text style={styles.modalGhostText}>Skip</Text>
              </Pressable>

              <Pressable
                disabled={savingCrew}
                onPress={() => {
                  if (!crewFor) return
                  void (async () => {
                    setSavingCrew(true)
                    const { error } = await supabase.rpc('assign_job_crew', {
                      p_repair: crewFor.id,
                      p_users: crewPick,
                    })
                    setSavingCrew(false)
                    if (error) {
                      Alert.alert('Crew', error.message)
                      return
                    }
                    setCrewFor(null)
                    await loadJobs()
                  })()
                }}
                style={[styles.modalButton, savingCrew && { opacity: 0.6 }]}
              >
                <Text style={styles.modalButtonText}>{savingCrew ? 'Saving...' : 'Save crew'}</Text>
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
          <View style={styles.modalCard}>
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
                  {workingId === completing?.id ? 'Saving...' : 'Mark completed'}
                </Text>
              </Pressable>
            </View>
          </View>
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
  canChooseCrew,
  onChooseCrew,
  onAccept,
  onStart,
  onComplete,
  onDirections,
  onCall,
}: {
  accepting: boolean
  working: boolean
  isMine: boolean
  crew: CrewPerson[]
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

      {/* DIVIDER */}

      <View
        style={styles.divider}
      />

      {/* CUSTOMER */}

      <View
        style={styles.detailRow}
      >
        <Ionicons
          name="person-outline"
          size={17}
          color={colors.muted}
        />

        <View
          style={styles.detailContent}
        >
          <Text
            style={styles.detailLabel}
          >
            CUSTOMER
          </Text>

          <Text
            style={styles.detailValue}
          >
            {job.client
              ?.customer_name ||
              'Customer not configured'}
          </Text>
        </View>
      </View>

      {/* ACCOUNT */}

      {job.client?.account_id ? (
        <View
          style={styles.detailRow}
        >
          <Ionicons
            name="card-outline"
            size={17}
            color={colors.muted}
          />

          <View
            style={styles.detailContent}
          >
            <Text
              style={styles.detailLabel}
            >
              ACCOUNT ID
            </Text>

            <Text
              style={styles.detailValue}
            >
              {job.client.account_id}
            </Text>
          </View>
        </View>
      ) : null}

      {/* PLAN */}

      {job.client?.plan_name ? (
        <View
          style={styles.detailRow}
        >
          <Ionicons
            name="wifi-outline"
            size={17}
            color={colors.muted}
          />

          <View
            style={styles.detailContent}
          >
            <Text
              style={styles.detailLabel}
            >
              PLAN
            </Text>

            <Text
              style={styles.detailValue}
            >
              {job.client.plan_name}
            </Text>
          </View>
        </View>
      ) : null}

      {/* PROBLEM */}

      <View
        style={styles.detailRow}
      >
        <Ionicons
          name="alert-circle-outline"
          size={17}
          color={colors.muted}
        />

        <View
          style={styles.detailContent}
        >
          <Text
            style={styles.detailLabel}
          >
            PROBLEM
          </Text>

          <Text
            style={styles.detailValue}
          >
            {job.problem_description}
          </Text>
        </View>
      </View>

      {/* LOCATION */}

      {job.client?.area ? (
        <View
          style={styles.detailRow}
        >
          <Ionicons
            name="location-outline"
            size={17}
            color={colors.muted}
          />

          <View
            style={styles.detailContent}
          >
            <Text
              style={styles.detailLabel}
            >
              SERVICE AREA
            </Text>

            <Text
              style={styles.detailValue}
            >
              {job.client.area}
            </Text>
          </View>
        </View>
      ) : null}

      {/* MOBILE */}

      {job.client
        ?.mobile_number ? (
        <View
          style={styles.detailRow}
        >
          <Ionicons
            name="call-outline"
            size={17}
            color={colors.muted}
          />

          <View
            style={styles.detailContent}
          >
            <Text
              style={styles.detailLabel}
            >
              CUSTOMER CONTACT
            </Text>

            <Text
              style={styles.detailValue}
            >
              {job.client.mobile_number}
            </Text>
          </View>
        </View>
      ) : null}

      {/* RESOLUTION */}

      {job.resolution ? (
        <View
          style={styles.resolutionBox}
        >
          <View
            style={
              styles.resolutionHeader
            }
          >
            <Ionicons
              name="checkmark-done-outline"
              size={17}
              color={colors.success}
            />

            <Text
              style={
                styles.resolutionLabel
              }
            >
              RESOLUTION
            </Text>
          </View>

          <Text
            style={
              styles.resolutionText
            }
          >
            {job.resolution}
          </Text>
        </View>
      ) : null}

      {/* QUICK ACTIONS */}

      <View style={styles.quickRow}>
        {job.spot ? (
          <Pressable
            onPress={onDirections}
            style={({ pressed }) => [styles.quickButton, pressed && styles.buttonPressed]}
          >
            <Ionicons name="map-outline" size={16} color={colors.accent} />
            <Text style={styles.quickText}>Directions</Text>
          </Pressable>
        ) : null}

        {job.client?.mobile_number ? (
          <Pressable
            onPress={onCall}
            style={({ pressed }) => [styles.quickButton, pressed && styles.buttonPressed]}
          >
            <Ionicons name="call-outline" size={16} color={colors.accent} />
            <Text style={styles.quickText}>Call customer</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ASSIGNMENT */}

      {!job.technician_user_id ? (
        <Pressable
          onPress={onAccept}
          disabled={accepting}
          style={({ pressed }) => [
            styles.acceptButton,
            (pressed || accepting) && styles.buttonPressed,
          ]}
        >
          <Ionicons name="hand-right-outline" size={18} color={colors.bg} />
          <Text style={styles.acceptButtonText}>
            {accepting ? 'Accepting...' : 'Accept this job'}
          </Text>
        </Pressable>
      ) : (
        <>
          <View style={styles.assignedRow}>
            <Ionicons
              name="person-circle-outline"
              size={16}
              color={colors.accent}
            />

            <Text style={styles.assignedText}>
              Assigned to: {isMine ? 'You' : job.technician || 'Current technician'}
            </Text>
          </View>

          {crew.length > 1 ? (
            <Text style={[styles.assignedText, { marginTop: 6 }]}>
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

          {canChooseCrew ? (
            <Pressable
              onPress={onChooseCrew}
              style={({ pressed }) => [styles.quickButton, { marginTop: 8 }, pressed && styles.buttonPressed]}
            >
              <Ionicons name="people-outline" size={16} color={colors.accent} />
              <Text style={styles.quickText}>
                {crew.length > 1 ? 'Change crew' : 'Choose crew'}
              </Text>
            </Pressable>
          ) : null}

          {isMine && !isFinished(job.status) ? (
            /progress|ongoing/i.test(job.status) ? (
              <Pressable
                onPress={onComplete}
                disabled={working}
                style={({ pressed }) => [
                  styles.acceptButton,
                  (pressed || working) && styles.buttonPressed,
                ]}
              >
                <Ionicons name="checkmark-done-outline" size={18} color={colors.bg} />
                <Text style={styles.acceptButtonText}>Mark completed</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={onStart}
                disabled={working}
                style={({ pressed }) => [
                  styles.acceptButton,
                  (pressed || working) && styles.buttonPressed,
                ]}
              >
                <Ionicons name="play-outline" size={18} color={colors.bg} />
                <Text style={styles.acceptButtonText}>
                  {working ? 'Starting...' : 'Start job'}
                </Text>
              </Pressable>
            )
          ) : null}
        </>
      )}
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  groupTitle: {
    color: colors.muted,
    fontSize: 11,
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
    fontSize: 10,
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
    fontSize: 9,
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

  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },

  summaryNumber: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },

  summaryLabel: {
    color: colors.muted,
    fontSize: 7,
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
    fontSize: 10,
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
    fontSize: 9,
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
    fontSize: 11,
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
    maxWidth: 105,
  },

  statusText: {
    fontSize: 8,
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
    fontSize: 9,
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
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  resolutionText: {
    color: colors.text,
    fontSize: 11,
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
    color: colors.accent,
    fontSize: 10,
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