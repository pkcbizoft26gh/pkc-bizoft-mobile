import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { colors } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'

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
}

type Job = RepairRecord & {
  client: Client | null
}

export default function JobsScreen() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

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

      /*
       * Only retrieve repair records assigned to
       * the currently authenticated technician.
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
            created_at
          `,
        )
        .eq('technician_user_id', user.id)
        .order('repair_date', {
          ascending: false,
        })

      if (repairError) {
        throw repairError
      }

      const repairs =
        (assignedRepairs ?? []) as RepairRecord[]

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
            plan_name
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
        repairs.map(repair => ({
          ...repair,
          client:
            clientMap.get(
              repair.client_id,
            ) ?? null,
        }))

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

          <Pressable
            onPress={refreshJobs}
            style={({ pressed }) => [
              styles.retryButton,
              pressed &&
                styles.buttonPressed,
            ]}
          >
            <Ionicons
              name="refresh-outline"
              size={17}
              color={colors.accent}
            />

            <Text
              style={styles.retryText}
            >
              CHECK AGAIN
            </Text>
          </Pressable>
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
              Repair jobs assigned to you.
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
              No assigned jobs
            </Text>

            <Text
              style={styles.cardText}
            >
              Repair jobs assigned to this
              technician will appear here
              with the customer, location,
              problem, status, and repair
              date.
            </Text>

            <Pressable
              onPress={refreshJobs}
              style={({ pressed }) => [
                styles.emptyRefreshButton,
                pressed &&
                  styles.buttonPressed,
              ]}
            >
              <Ionicons
                name="refresh-outline"
                size={16}
                color={colors.accent}
              />

              <Text
                style={
                  styles.emptyRefreshText
                }
              >
                REFRESH JOBS
              </Text>
            </Pressable>
          </GlassCard>
        ) : null}

        {/* JOB LIST */}

        {jobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            getStatusIcon={
              getStatusIcon
            }
            getStatusColor={
              getStatusColor
            }
            formatDate={formatDate}
          />
        ))}
      </ScrollView>
    </View>
  )
}

function JobCard({
  job,
  getStatusIcon,
  getStatusColor,
  formatDate,
}: {
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

      {/* ASSIGNMENT */}

      <View
        style={styles.assignedRow}
      >
        <Ionicons
          name="person-circle-outline"
          size={16}
          color={colors.accent}
        />

        <Text
          style={styles.assignedText}
        >
          Assigned to:{' '}
          {job.technician ||
            'Current technician'}
        </Text>
      </View>
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
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
    paddingTop: 62,
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