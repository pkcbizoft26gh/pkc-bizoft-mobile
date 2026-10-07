import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Alert } from '@/components/AppAlert'

import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'

import { supabase } from '@/lib/supabase'
import { distanceKm, formatDistance } from '@/lib/location'
import { colors, motion, radii } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'
import { ReminderBanner } from '@/components/ReminderBanner'
import { InboxBell, QuickActions } from '@/components/QuickActions'

type Client = {
  id: string
  tenant_id: string | null
  customer_name: string | null
  install_date: string | null
  plan_name: string | null
  area: string | null
  installation_status: string | null
  account_status: string | null
  account_id: string | null
  map_location: string | null
  latitude: number | null
  longitude: number | null
  user_id: string | null
  referral_code?: string | null
}

type Billing = {
  id: string
  bill_id: string | null
  client_id: string | null
  status: string | null
  bill_type: string | null
  bill_date: string | null
  due_date: string | null
  amount_due: number | null
}

type Payment = {
  id: string
  payment_id: string | null
  client_id: string | null
  receipt_number: string | null
  amount_paid: number | null
  payment_date: string | null
  payment_method: string | null
}

type Repair = {
  id: string
  repair_date: string | null
  problem_description: string | null
  resolution: string | null
  status: string | null
  created_at: string | null
  technician: string | null
  technician_phone: string | null
  technician_user_id: string | null
  job_type: string | null
  latitude: number | null
  longitude: number | null
}

type ServiceRequest = {
  id: string
  request_type: string | null
  requested_plan: string | null
  status: string | null
  referral_code: string | null
  referred_by_client_id: string | null
  referred_by_client_name: string | null
  created_at: string | null
}

type Referral = {
  id: string
  referral_code: string | null
  installation_discount: number | null
  installation_discount_status: string | null
  status: string | null
  referred_client_id: string | null
  created_at: string | null
}

type Profile = {
  id: string
  email: string | null
  role: string | null
}

function normalizeStatus(
  value: string | null | undefined,
) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function formatMoney(
  value: number | null | undefined,
) {
  return Number(value || 0).toLocaleString(
    'en-PH',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )
}

function formatDate(
  value: string | null | undefined,
) {
  if (!value) {
    return 'Not available'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getStatusColor(
  status: string | null | undefined,
) {
  const normalized = normalizeStatus(status)

  if (
    normalized.includes('paid') ||
    normalized.includes('complete') ||
    normalized.includes('success') ||
    normalized.includes('active') ||
    normalized.includes('approved')
  ) {
    return colors.success
  }

  if (
    normalized.includes('pending') ||
    normalized.includes('process') ||
    normalized.includes('review') ||
    normalized.includes('due')
  ) {
    return colors.medium
  }

  if (
    normalized.includes('overdue') ||
    normalized.includes('failed') ||
    normalized.includes('reject') ||
    normalized.includes('cancel')
  ) {
    return colors.danger
  }

  return colors.info
}

function getRequestLabel(
  requestType: string | null | undefined,
) {
  switch (requestType) {
    case 'plan_change':
      return 'Plan Change'

    case 'new_service':
      return 'New Service'

    case 'repair':
      return 'Repair / Issue'

    case 'help':
      return 'Help'

    default:
      return requestType || 'Request'
  }
}

export default function CustomerDashboard() {
  const router = useRouter()

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [name, setName] =
    useState('Customer')

  const [email, setEmail] =
    useState('')

  const [profile, setProfile] =
    useState<Profile | null>(null)

  const [client, setClient] =
    useState<Client | null>(null)

  const [billing, setBilling] =
    useState<Billing[]>([])

  const [payments, setPayments] =
    useState<Payment[]>([])

  const [repairs, setRepairs] =
    useState<Repair[]>([])

  const [requests, setRequests] =
    useState<ServiceRequest[]>([])

  const [referrals, setReferrals] =
    useState<Referral[]>([])

  const [pendingPayments, setPendingPayments] =
    useState(0)

  const [errorMessage, setErrorMessage] =
    useState('')

  const loadDashboard =
    useCallback(async () => {
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
          router.replace('/login')
          return
        }

        setEmail(user.email || '')

        const [
          profileResult,
          userProfileResult,
          clientResult,
        ] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, email, role')
            .eq('id', user.id)
            .maybeSingle(),

          supabase
            .from('user_profiles')
            .select(
              'user_id, full_name',
            )
            .eq('user_id', user.id)
            .maybeSingle(),

          supabase
            .from('clients')
            .select(`
              id,
              tenant_id,
              customer_name,
              install_date,
              plan_name,
              area,
              installation_status,
              account_status,
              account_id,
              map_location,
              latitude,
              longitude,
              user_id,
              referral_code
            `)
            .eq('user_id', user.id)
            .maybeSingle(),
        ])

        if (profileResult.data) {
          setProfile(
            profileResult.data as Profile,
          )
        }

        if (
          userProfileResult.data?.full_name
        ) {
          setName(
            userProfileResult.data.full_name,
          )
        }

        if (clientResult.error) {
          throw clientResult.error
        }

        const customerClient =
          clientResult.data as
            | Client
            | null

        setClient(customerClient)

        if (
          customerClient?.customer_name
        ) {
          setName(
            customerClient.customer_name,
          )
        }

        if (!customerClient) {
          setBilling([])
          setPayments([])
          setRepairs([])
          setRequests([])
          setReferrals([])
          setPendingPayments(0)
          return
        }

        const [
          billingResult,
          paymentsResult,
          repairsResult,
          requestsResult,
          referralsResult,
          submissionsResult,
        ] = await Promise.all([
          supabase
            .from('billing')
            .select(`
              id,
              bill_id,
              client_id,
              status,
              bill_type,
              bill_date,
              due_date,
              amount_due
            `)
            .eq(
              'client_id',
              customerClient.id,
            )
            .order('due_date', {
              ascending: false,
            }),

          supabase
            .from('payments')
            .select(`
              id,
              payment_id,
              client_id,
              receipt_number,
              amount_paid,
              payment_date,
              payment_method
            `)
            .eq(
              'client_id',
              customerClient.id,
            )
            .order('payment_date', {
              ascending: false,
            }),

          supabase
            .from('repair_records')
            .select(`
              id,
              repair_date,
              problem_description,
              resolution,
              status,
              created_at,
              technician,
              technician_phone,
              technician_user_id,
              job_type,
              latitude,
              longitude
            `)
            .eq(
              'client_id',
              customerClient.id,
            )
            .order('created_at', {
              ascending: false,
            }),

          supabase
            .from('service_requests')
            .select(`
              id,
              request_type,
              requested_plan,
              status,
              referral_code,
              referred_by_client_id,
              referred_by_client_name,
              created_at
            `)
            .eq(
              'user_id',
              user.id,
            )
            .order('created_at', {
              ascending: false,
            }),

          supabase
            .from('referrals')
            .select(`
              id,
              referral_code,
              installation_discount,
              installation_discount_status,
              status,
              referred_client_id,
              created_at
            `)
            .eq(
              'referrer_client_id',
              customerClient.id,
            )
            .order('created_at', {
              ascending: false,
            }),

          supabase
            .from('payment_submissions')
            .select('id, status')
            .eq(
              'client_id',
              customerClient.id,
            ),
        ])

        setPendingPayments(
          submissionsResult.error
            ? 0
            : (
                submissionsResult.data || []
              ).filter(row =>
                normalizeStatus(
                  row.status,
                ).includes('pending'),
              ).length,
        )

        if (billingResult.error) {
          console.warn(
            'Billing warning:',
            billingResult.error.message,
          )
          setBilling([])
        } else {
          setBilling(
            (billingResult.data ||
              []) as Billing[],
          )
        }

        if (paymentsResult.error) {
          console.warn(
            'Payments warning:',
            paymentsResult.error.message,
          )
          setPayments([])
        } else {
          setPayments(
            (paymentsResult.data ||
              []) as Payment[],
          )
        }

        if (repairsResult.error) {
          console.warn(
            'Repairs warning:',
            repairsResult.error.message,
          )
          setRepairs([])
        } else {
          setRepairs(
            (repairsResult.data ||
              []) as Repair[],
          )
        }

        if (requestsResult.error) {
          console.warn(
            'Requests warning:',
            requestsResult.error.message,
          )
          setRequests([])
        } else {
          setRequests(
            (requestsResult.data ||
              []) as ServiceRequest[],
          )
        }

        if (referralsResult.error) {
          console.warn(
            'Referrals warning:',
            referralsResult.error.message,
          )
          setReferrals([])
        } else {
          setReferrals(
            (referralsResult.data ||
              []) as Referral[],
          )
        }
      } catch (error: any) {
        console.error(
          'Customer dashboard error:',
          error,
        )

        setErrorMessage(
          error?.message ||
            'Unable to load your customer dashboard.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }, [router])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const onRefresh =
    useCallback(async () => {
      setRefreshing(true)
      await loadDashboard()
    }, [loadDashboard])

  const currentBalance =
    useMemo(() => {
      return billing.reduce(
        (total, bill) => {
          const status =
            normalizeStatus(
              bill.status,
            )

          if (
            status.includes('paid') ||
            status.includes('cancel') ||
            status.includes('void')
          ) {
            return total
          }

          return (
            total +
            Number(
              bill.amount_due || 0,
            )
          )
        },
        0,
      )
    }, [billing])

  const latestBill =
    billing.length > 0
      ? billing[0]
      : null

  const latestPayment =
    payments.length > 0
      ? payments[0]
      : null

  const latestRepair =
    repairs.length > 0
      ? repairs[0]
      : null

  const repairActive =
    !!latestRepair &&
    !!latestRepair.technician_user_id &&
    !/(complete|resolved|done|fixed|cancel)/i.test(
      latestRepair.status || '',
    )

  const [techAway, setTechAway] =
    useState<string>('')

  // While a technician is on the job, show how far away they are. Their phone
  // shares its position while their Jobs tab is open (foreground only).
  useFocusEffect(
    useCallback(() => {
      if (!repairActive || !latestRepair) {
        setTechAway('')
        return undefined
      }

      let stopped = false

      const spotLat =
        latestRepair.latitude ?? client?.latitude ?? null
      const spotLon =
        latestRepair.longitude ?? client?.longitude ?? null

      const check = async () => {
        const { data } = await supabase
          .from('technician_locations')
          .select('latitude, longitude, updated_at')
          .eq('user_id', latestRepair.technician_user_id as string)
          .maybeSingle()

        if (stopped) return

        if (
          !data ||
          spotLat === null ||
          spotLon === null ||
          Date.now() - new Date(data.updated_at).getTime() >
            10 * 60_000
        ) {
          setTechAway('')
          return
        }

        setTechAway(
          formatDistance(
            distanceKm(
              {
                latitude: data.latitude,
                longitude: data.longitude,
              },
              {
                latitude: spotLat,
                longitude: spotLon,
              },
            ),
          ),
        )
      }

      void check()
      const timer = setInterval(
        () => void check(),
        30000,
      )

      return () => {
        stopped = true
        clearInterval(timer)
      }
    }, [
      repairActive,
      latestRepair,
      client?.latitude,
      client?.longitude,
    ]),
  )

  const latestRequest =
    requests.length > 0
      ? requests[0]
      : null

  const successfulReferrals =
    referrals.filter(referral => {
      const status =
        normalizeStatus(
          referral.status,
        )

      return (
        status.includes('success') ||
        status.includes('complete') ||
        status.includes('approved')
      )
    }).length

  const pendingReferrals =
    referrals.filter(referral => {
      const status =
        normalizeStatus(
          referral.status,
        )

      return (
        status.includes('pending') ||
        status.includes('process') ||
        status.includes('review')
      )
    }).length

  const referralBonusEarned =
    successfulReferrals * 250

  // Repairs the customer reported that nobody has finished yet.
  const issuesToResolve =
    repairs.filter(repair => {
      const status =
        normalizeStatus(
          repair.status,
        )

      return !(
        status.includes('complete') ||
        status.includes('resolved') ||
        status.includes('done') ||
        status.includes('fixed') ||
        status.includes('closed') ||
        status.includes('cancel')
      )
    }).length

  // Earliest due date among bills that are still unpaid.
  const nextDueDate =
    useMemo(() => {
      const dates = billing
        .filter(bill => {
          const status =
            normalizeStatus(bill.status)

          return !(
            status.includes('paid') ||
            status.includes('cancel') ||
            status.includes('void')
          )
        })
        .map(bill => bill.due_date)
        .filter(
          (date): date is string =>
            Boolean(date),
        )
        .sort()

      return dates[0] ?? null
    }, [billing])

  const serviceLocation =
    client?.area?.trim() ||
    client?.map_location?.trim() ||
    'Not set'

  const goToPayment = () => {
    router.push('/payment')
  }

  const goToRequests = () => {
    router.push('/requests')
  }

  if (loading) {
    return (
      <View
        style={styles.loadingScreen}
      >
        <Image
          source={require('../../assets/images/pkc-transparent.png')}
          style={styles.loadingLogo}
          resizeMode="contain"
        />

        <ActivityIndicator
          size="large"
          color={colors.accent}
        />

        <Text
          style={styles.loadingText}
        >
          Loading customer portal...
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image
              source={require('../../assets/images/pkc-transparent.png')}
              style={styles.logo}
              resizeMode="contain"
            />

            <View
              style={styles.headerText}
            >
              <Text
                style={styles.eyebrow}
              >
                PKC BIZOFT
              </Text>

              <Text
                style={styles.title}
              >
                Customer Portal
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <InboxBell />

          </View>
        </View>

        {/* WELCOME */}

        <GlassCard
          style={styles.welcomeCard}
          enterDelay={motion.stagger}
        >
          <View
            style={styles.welcomeTop}
          >
            <View
              style={
                styles.welcomeText
              }
            >
              <Text
                style={styles.smallLabel}
              >
                WELCOME BACK
              </Text>

              <Text
                style={styles.welcomeName}
              >
                {name ||
                  client?.customer_name ||
                  'Customer'}
              </Text>

              <Text
                style={styles.email}
              >
                {email ||
                  profile?.email ||
                  'Customer account'}
              </Text>
            </View>

            <View
              style={styles.statusBadge}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      getStatusColor(
                        client?.account_status,
                      ),
                  },
                ]}
              />

              <Text
                style={styles.statusBadgeText}
              >
                {client?.account_status ||
                  'Inactive'}
              </Text>
            </View>
          </View>

          <View
            style={styles.divider}
          />

          <View
            style={styles.welcomeStats}
          >
            <View
              style={styles.welcomeStat}
            >
              <Text
                style={styles.statLabel}
              >
                PLAN
              </Text>

              <Text
                style={styles.statValue}
                numberOfLines={1}
              >
                {client?.plan_name ||
                  'None'}
              </Text>
            </View>

          </View>
        </GlassCard>

        {/* SHORTCUTS */}
        <QuickActions />

        {/* BILL / PLAN REMINDERS (5 days before) */}
        <ReminderBanner />

        {/* ERROR */}

        {errorMessage ? (
          <GlassCard
            style={styles.errorCard}
          >
            <Ionicons
              name="alert-circle-outline"
              size={23}
              color={colors.danger}
            />

            <View
              style={
                styles.errorContent
              }
            >
              <Text
                style={styles.errorTitle}
              >
                Unable to load some data
              </Text>

              <Text
                style={styles.errorText}
              >
                {errorMessage}
              </Text>
            </View>
          </GlassCard>
        ) : null}

        {/* QUICK STATS */}

        <Text
          style={styles.sectionTitle}
        >
          MY ACCOUNT AT A GLANCE
        </Text>

        <Text style={styles.groupLabel}>
          BILLING
        </Text>

        <View
          style={styles.statsGrid}
        >
          <StatCard
            icon="wallet-outline"
            label="AMOUNT TO PAY"
            value={`₱${formatMoney(currentBalance)}`}
          />

          <StatCard
            icon="calendar-outline"
            label="NEXT DUE DATE"
            value={
              nextDueDate
                ? formatDate(nextDueDate)
                : 'Nothing due'
            }
          />
        </View>

        <Text style={styles.groupLabel}>
          REFERRALS
        </Text>

        <View
          style={styles.statsGrid}
        >
          <StatCard
            icon="people-outline"
            label="FRIENDS REFERRED"
            value={String(successfulReferrals)}
          />

          <StatCard
            icon="cash-outline"
            label="BONUS EARNED"
            value={`₱${formatMoney(referralBonusEarned)}`}
          />
        </View>

        <Text style={styles.groupLabel}>
          PENDING
        </Text>

        <View
          style={styles.statsGrid}
        >
          <StatCard
            icon="construct-outline"
            label="ISSUES TO BE RESOLVED"
            value={String(issuesToResolve)}
          />

          <StatCard
            icon="hourglass-outline"
            label="PAYMENTS TO BE CHECKED"
            value={String(pendingPayments)}
          />
        </View>

        {/* LATEST BILL */}

        <View
          style={styles.sectionHeader}
        >
          <Text
            style={styles.sectionTitle}
          >
            LATEST BILL
          </Text>
        </View>

        {latestBill ? (
          <GlassCard
            style={styles.latestCard}
          >
            <View
              style={styles.latestRow}
            >
              <View
                style={styles.latestIcon}
              >
                <Ionicons
                  name="document-text-outline"
                  size={21}
                  color={colors.accent}
                />
              </View>

              <View
                style={
                  styles.latestContent
                }
              >
                <Text
                  style={
                    styles.latestTitle
                  }
                >
                  {latestBill.bill_id ||
                    'Billing Record'}
                </Text>

                <Text
                  style={
                    styles.latestSubtext
                  }
                >
                  Due{' '}
                  {formatDate(
                    latestBill.due_date,
                  )}
                </Text>
              </View>

              <Text
                style={
                  styles.latestAmount
                }
              >
                {`\u20B1${formatMoney(
                  latestBill.amount_due,
                )}`}
              </Text>
            </View>

            <Text
              style={[
                styles.latestStatus,
                {
                  color:
                    getStatusColor(
                      latestBill.status,
                    ),
                },
              ]}
            >
              {latestBill.status ||
                'Pending'}
            </Text>
          </GlassCard>
        ) : (
          <GlassCard
            style={styles.emptyCard}
          >
            <Ionicons
              name="document-outline"
              size={23}
              color={colors.muted}
            />

            <View
              style={
                styles.emptyContent
              }
            >
              <Text
                style={styles.emptyTitle}
              >
                No bills
              </Text>

              <Text
                style={
                  styles.emptyDescription
                }
              >
                Your billing information will
                appear here when a bill is
                generated.
              </Text>
            </View>
          </GlassCard>
        )}

        {/* LATEST PAYMENT */}

        <View
          style={styles.sectionHeader}
        >
          <Text
            style={styles.sectionTitle}
          >
            LATEST PAYMENT
          </Text>
        </View>

        {latestPayment ? (
          <GlassCard
            style={styles.latestCard}
          >
            <View
              style={styles.latestRow}
            >
              <View
                style={styles.latestIcon}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={21}
                  color={colors.success}
                />
              </View>

              <View
                style={
                  styles.latestContent
                }
              >
                <Text
                  style={
                    styles.latestTitle
                  }
                >
                  {latestPayment.receipt_number ||
                    latestPayment.payment_id ||
                    'Payment'}
                </Text>

                <Text
                  style={
                    styles.latestSubtext
                  }
                >
                  {formatDate(
                    latestPayment.payment_date,
                  )}

                  {latestPayment.payment_method
                    ? ` • ${latestPayment.payment_method}`
                    : ''}
                </Text>
              </View>

              <Text
                style={
                  styles.latestAmount
                }
              >
                {`\u20B1${formatMoney(
                  latestPayment.amount_paid,
                )}`}
              </Text>
            </View>
          </GlassCard>
        ) : (
          <GlassCard
            style={styles.emptyCard}
          >
            <Ionicons
              name="wallet-outline"
              size={23}
              color={colors.muted}
            />

            <View
              style={
                styles.emptyContent
              }
            >
              <Text
                style={styles.emptyTitle}
              >
                No payments
              </Text>

              <Text
                style={
                  styles.emptyDescription
                }
              >
                Confirmed payments will appear
                here.
              </Text>
            </View>
          </GlassCard>
        )}

        {/* REPAIR */}

        <View
          style={styles.sectionHeader}
        >
          <Text
            style={styles.sectionTitle}
          >
            REPAIR STATUS
          </Text>
        </View>

        {latestRepair ? (
          <GlassCard
            style={styles.latestCard}
          >
            <View
              style={styles.latestRow}
            >
              <View
                style={styles.latestIcon}
              >
                <Ionicons
                  name="construct-outline"
                  size={21}
                  color={colors.accent}
                />
              </View>

              <View
                style={
                  styles.latestContent
                }
              >
                <Text
                  style={
                    styles.latestTitle
                  }
                >
                  {latestRepair.problem_description ||
                    'Service repair'}
                </Text>

                <Text
                  style={
                    styles.latestSubtext
                  }
                >
                  {formatDate(
                    latestRepair.repair_date,
                  )}
                </Text>
              </View>

              <Text
                style={[
                  styles.latestStatus,
                  {
                    color:
                      getStatusColor(
                        latestRepair.status,
                      ),
                  },
                ]}
              >
                {latestRepair.status ||
                  'Pending'}
              </Text>
            </View>

            {latestRepair.technician ? (
              <View style={styles.techBox}>
                <Ionicons
                  name="person-circle-outline"
                  size={22}
                  color={colors.accent}
                />

                <View style={styles.techInfo}>
                  <Text style={styles.techName}>
                    {latestRepair.technician}
                    {repairActive
                      ? ' is on this job'
                      : ''}
                  </Text>

                  {techAway ? (
                    <Text style={styles.techAway}>
                      About {techAway} away
                    </Text>
                  ) : null}
                </View>

                {latestRepair.technician_phone &&
                repairActive ? (
                  <Pressable
                    onPress={() =>
                      void Linking.openURL(
                        `tel:${latestRepair.technician_phone}`,
                      )
                    }
                    style={({ pressed }) => [
                      styles.techCall,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name="call"
                      size={15}
                      color={colors.bg}
                    />
                    <Text style={styles.techCallText}>
                      Call
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </GlassCard>
        ) : (
          <GlassCard
            style={styles.emptyCard}
          >
            <Ionicons
              name="construct-outline"
              size={23}
              color={colors.muted}
            />

            <View
              style={
                styles.emptyContent
              }
            >
              <Text
                style={styles.emptyTitle}
              >
                No repair records
              </Text>

              <Text
                style={
                  styles.emptyDescription
                }
              >
                Your repair history will appear
                here.
              </Text>
            </View>
          </GlassCard>
        )}





        <View
          style={styles.footer}
        >
          <Text
            style={styles.footerText}
          >
            PKC BIZOFT
          </Text>

          <View
            style={styles.footerDot}
          />

          <Text
            style={styles.footerText}
          >
            CUSTOMER PORTAL
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
}) {
  // Information only: these cards are not buttons.
  return (
    <GlassCard
      style={styles.statCard}
    >
      <View style={styles.statIcon}>
        <Ionicons
          name={icon}
          size={20}
          color={colors.accent}
        />
      </View>

      <Text style={styles.cardStatLabel}>
        {label}
      </Text>

      <Text
        style={styles.cardStatValue}
        numberOfLines={1}
      >
        {value}
      </Text>
    </GlassCard>
  )
}

function InfoRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
  last?: boolean
}) {
  return (
    <View
      style={[
        styles.infoRow,
        last && styles.infoRowLast,
      ]}
    >
      <View
        style={styles.infoIcon}
      >
        <Ionicons
          name={icon}
          size={18}
          color={colors.accent}
        />
      </View>

      <View
        style={styles.infoContent}
      >
        <Text
          style={styles.infoLabel}
        >
          {label}
        </Text>

        <Text
          style={styles.infoValue}
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  techBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },

  techInfo: {
    flex: 1,
  },

  techName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },

  techAway: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },

  techCall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },

  techCallText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '900',
  },

  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 55,
  },

  loadingScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingLogo: {
    width: 150,
    height: 90,
    marginBottom: 15,
  },

  loadingText: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 13,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  logo: {
    width: 58,
    height: 48,
    marginRight: 10,
  },

  headerText: {
    flex: 1,
  },

  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  title: {
    color: colors.white,
    fontSize: 23,
    fontWeight: '800',
    marginTop: 2,
  },

  profileButton: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorCard: {
    flexDirection: 'row',
    padding: 15,
    marginBottom: 16,
    borderColor: colors.danger,
  },

  errorContent: {
    flex: 1,
    marginLeft: 11,
  },

  errorTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },

  errorText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },

  welcomeCard: {
    padding: 18,
    marginBottom: 19,
  },

  welcomeTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  welcomeText: {
    flex: 1,
    paddingRight: 10,
  },

  smallLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  welcomeName: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    marginTop: 5,
  },

  email: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    borderRadius: radii.round,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radii.round,
    marginRight: 6,
  },

  statusBadgeText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 15,
  },

  welcomeStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  welcomeStat: {
    flex: 1,
  },

  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: colors.line,
    marginHorizontal: 15,
  },

  statLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  statValue: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
  },

  groupLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 4,
    marginBottom: 8,
    marginLeft: 2,
  },

  sectionTitle: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 9,
    marginLeft: 2,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  viewAll: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 9,
  },

  serviceCard: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 16,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },

  infoRowLast: {
    borderBottomWidth: 0,
  },

  infoIcon: {
    width: 35,
    height: 35,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  infoContent: {
    flex: 1,
  },

  infoLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  infoValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },

  planActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 15,
    marginBottom: 19,
  },

  planActionIcon: {
    width: 47,
    height: 47,
    borderRadius: radii.md,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },

  planActionContent: {
    flex: 1,
    marginLeft: 11,
    marginRight: 8,
  },

  planActionTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },

  planActionText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  statCard: {
    width: '48.5%',
    padding: 14,
    marginBottom: 9,
  },

  statIcon: {
    width: 35,
    height: 35,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  cardStatLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  cardStatValue: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 3,
  },

  latestCard: {
    padding: 15,
    marginBottom: 13,
  },

  latestRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  latestIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },

  latestContent: {
    flex: 1,
    marginLeft: 10,
    marginRight: 7,
  },

  latestTitle: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },

  latestSubtext: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 3,
  },

  latestAmount: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '900',
  },

  latestStatus: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 9,
    marginLeft: 52,
  },

  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginBottom: 13,
  },

  emptyContent: {
    flex: 1,
    marginLeft: 11,
  },

  emptyTitle: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },

  emptyDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  referralCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 15,
    marginBottom: 13,
  },

  referralIcon: {
    width: 45,
    height: 45,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },

  referralContent: {
    flex: 1,
    marginLeft: 11,
  },

  referralTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },

  referralText: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 3,
  },

  referralAmount: {
    alignItems: 'flex-end',
  },

  referralAmountLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '800',
  },

  referralAmountValue: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },

  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 15,
    marginBottom: 13,
  },

  supportIcon: {
    width: 45,
    height: 45,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },

  supportContent: {
    flex: 1,
    marginLeft: 11,
    marginRight: 8,
  },

  supportTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },

  supportDescription: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },

  refreshButton: {
    height: 43,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 10,
  },

  refreshText: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    marginLeft: 7,
  },

  signOutButton: {
    height: 43,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },

  signOutText: {
    color: colors.danger,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    marginLeft: 7,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },

  footerText: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  footerDot: {
    width: 3,
    height: 3,
    borderRadius: radii.round,
    backgroundColor: colors.muted,
    marginHorizontal: 8,
  },

  pressed: {
    opacity: 0.72,
  },
})