import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

import { supabase } from '@/lib/supabase'
import { colors, radii } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'

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
          return
        }

        const [
          billingResult,
          paymentsResult,
          repairsResult,
          requestsResult,
          referralsResult,
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
              created_at
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
        ])

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

  const pendingRequestsCount =
    requests.filter(request => {
      const status =
        normalizeStatus(
          request.status,
        )

      return (
        status.includes('pending') ||
        status.includes('process') ||
        status.includes('review')
      )
    }).length

  const serviceLocation =
    client?.area?.trim() ||
    client?.map_location?.trim() ||
    'Tagnanan, Mabini, Davao de Oro'

  const goToPayment = () => {
    router.push('/payment')
  }

  const goToRequests = () => {
    router.push('/requests')
  }

  const goToReferrals = () => {
    router.push('/referrals')
  }

  const goToProfile = () => {
    router.push('/profile')
  }

  const signOut = async () => {
    const { error } =
      await supabase.auth.signOut()

    if (error) {
      Alert.alert(
        'Sign out failed',
        error.message,
      )
      return
    }

    router.replace('/login')
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

          <Pressable
            onPress={goToProfile}
            style={({ pressed }) => [
              styles.profileButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Ionicons
              name="person-outline"
              size={21}
              color={colors.accent}
            />
          </Pressable>
        </View>

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

        {/* WELCOME */}

        <GlassCard
          style={styles.welcomeCard}
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

            <View
              style={styles.statDivider}
            />

            <View
              style={styles.welcomeStat}
            >
              <Text
                style={styles.statLabel}
              >
                BALANCE
              </Text>

              <Text
                style={styles.statValue}
              >
                {`\u20B1${formatMoney(
                  currentBalance,
                )}`}
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* SERVICE */}

        <Text
          style={styles.sectionTitle}
        >
          MY SERVICE
        </Text>

        <GlassCard
          style={styles.serviceCard}
        >
          <InfoRow
            icon="wifi-outline"
            label="PLAN"
            value={
              client?.plan_name ||
              'No active plan'
            }
          />

          <InfoRow
            icon="location-outline"
            label="SERVICE LOCATION"
            value={serviceLocation}
          />

          <InfoRow
            icon="checkmark-circle-outline"
            label="INSTALLATION"
            value={
              client?.installation_status ||
              'Not available'
            }
          />

          <InfoRow
            icon="calendar-outline"
            label="INSTALLATION DATE"
            value={formatDate(
              client?.install_date,
            )}
            last
          />
        </GlassCard>

        {/* PLAN ACTION */}

        {!client?.plan_name ? (
          <Pressable
            onPress={goToPayment}
            style={({ pressed }) => [
              styles.planActionCard,
              pressed &&
                styles.pressed,
            ]}
          >
            <View
              style={
                styles.planActionIcon
              }
            >
              <Ionicons
                name="speedometer-outline"
                size={25}
                color={colors.accent}
              />
            </View>

            <View
              style={
                styles.planActionContent
              }
            >
              <Text
                style={
                  styles.planActionTitle
                }
              >
                Choose an Internet Plan
              </Text>

              <Text
                style={
                  styles.planActionText
                }
              >
                Open Payment to choose a plan
                and submit a service request.
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={19}
              color={colors.muted}
            />
          </Pressable>
        ) : (
          <Pressable
            onPress={goToPayment}
            style={({ pressed }) => [
              styles.planActionCard,
              pressed &&
                styles.pressed,
            ]}
          >
            <View
              style={
                styles.planActionIcon
              }
            >
              <Ionicons
                name="card-outline"
                size={25}
                color={colors.accent}
              />
            </View>

            <View
              style={
                styles.planActionContent
              }
            >
              <Text
                style={
                  styles.planActionTitle
                }
              >
                Manage Plan & Payments
              </Text>

              <Text
                style={
                  styles.planActionText
                }
              >
                View your plan, bills, payments,
                and request a plan change.
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={19}
              color={colors.muted}
            />
          </Pressable>
        )}

        {/* QUICK STATS */}

        <Text
          style={styles.sectionTitle}
        >
          ACCOUNT OVERVIEW
        </Text>

        <View
          style={styles.statsGrid}
        >
          <GlassCard
            style={styles.statCard}
          >
            <View
              style={styles.statIcon}
            >
              <Ionicons
                name="wallet-outline"
                size={20}
                color={colors.accent}
              />
            </View>

            <Text
              style={styles.cardStatLabel}
            >
              BALANCE
            </Text>

            <Text
              style={styles.cardStatValue}
              numberOfLines={1}
            >
              {`\u20B1${formatMoney(
                currentBalance,
              )}`}
            </Text>
          </GlassCard>

          <GlassCard
            style={styles.statCard}
          >
            <View
              style={styles.statIcon}
            >
              <Ionicons
                name="people-outline"
                size={20}
                color={colors.accent}
              />
            </View>

            <Text
              style={styles.cardStatLabel}
            >
              REFERRALS
            </Text>

            <Text
              style={styles.cardStatValue}
            >
              {successfulReferrals}
            </Text>
          </GlassCard>

          <GlassCard
            style={styles.statCard}
          >
            <View
              style={styles.statIcon}
            >
              <Ionicons
                name="time-outline"
                size={20}
                color={colors.accent}
              />
            </View>

            <Text
              style={styles.cardStatLabel}
            >
              PENDING
            </Text>

            <Text
              style={styles.cardStatValue}
            >
              {pendingRequestsCount}
            </Text>
          </GlassCard>

          <GlassCard
            style={styles.statCard}
          >
            <View
              style={styles.statIcon}
            >
              <Ionicons
                name="cash-outline"
                size={20}
                color={colors.accent}
              />
            </View>

            <Text
              style={styles.cardStatLabel}
            >
              REFERRAL BONUS
            </Text>

            <Text
              style={styles.cardStatValue}
              numberOfLines={1}
            >
              {`\u20B1${formatMoney(
                referralBonusEarned,
              )}`}
            </Text>
          </GlassCard>
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

          <Pressable
            onPress={goToPayment}
          >
            <Text
              style={styles.viewAll}
            >
              PAYMENT
            </Text>
          </Pressable>
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

          <Pressable
            onPress={goToPayment}
          >
            <Text
              style={styles.viewAll}
            >
              PAYMENT
            </Text>
          </Pressable>
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

        {/* LATEST REQUEST */}

        <View
          style={styles.sectionHeader}
        >
          <Text
            style={styles.sectionTitle}
          >
            LATEST REQUEST
          </Text>

          <Pressable
            onPress={goToRequests}
          >
            <Text
              style={styles.viewAll}
            >
              REQUESTS
            </Text>
          </Pressable>
        </View>

        {latestRequest ? (
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
                  {latestRequest.requested_plan ||
                    getRequestLabel(
                      latestRequest.request_type,
                    )}
                </Text>

                <Text
                  style={
                    styles.latestSubtext
                  }
                >
                  {getRequestLabel(
                    latestRequest.request_type,
                  )}{' '}
                  •{' '}
                  {formatDate(
                    latestRequest.created_at,
                  )}
                </Text>
              </View>

              <Text
                style={[
                  styles.latestStatus,
                  {
                    color:
                      getStatusColor(
                        latestRequest.status,
                      ),
                  },
                ]}
              >
                {latestRequest.status ||
                  'Pending'}
              </Text>
            </View>
          </GlassCard>
        ) : (
          <GlassCard
            style={styles.emptyCard}
          >
            <Ionicons
              name="documents-outline"
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
                No requests
              </Text>

              <Text
                style={
                  styles.emptyDescription
                }
              >
                Your service requests will appear
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

          <Pressable
            onPress={goToRequests}
          >
            <Text
              style={styles.viewAll}
            >
              REQUEST REPAIR
            </Text>
          </Pressable>
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

        {/* REFERRALS */}

        <Pressable
          onPress={goToReferrals}
          style={({ pressed }) => [
            styles.referralCard,
            pressed &&
              styles.pressed,
          ]}
        >
          <View
            style={
              styles.referralIcon
            }
          >
            <Ionicons
              name="people-outline"
              size={25}
              color={colors.accent}
            />
          </View>

          <View
            style={
              styles.referralContent
            }
          >
            <Text
              style={
                styles.referralTitle
              }
            >
              Referral Program
            </Text>

            <Text
              style={
                styles.referralText
              }
            >
              {pendingReferrals > 0
                ? `${pendingReferrals} referral${pendingReferrals === 1 ? '' : 's'} pending`
                : `${successfulReferrals} successful referral${successfulReferrals === 1 ? '' : 's'}`}
            </Text>
          </View>

          <View
            style={
              styles.referralAmount
            }
          >
            <Text
              style={
                styles.referralAmountLabel
              }
            >
              EARNED
            </Text>

            <Text
              style={
                styles.referralAmountValue
              }
            >
              {`\u20B1${formatMoney(
                referralBonusEarned,
              )}`}
            </Text>
          </View>
        </Pressable>

        {/* HELP */}

        <Pressable
          onPress={goToRequests}
          style={({ pressed }) => [
            styles.supportCard,
            pressed &&
              styles.pressed,
          ]}
        >
          <View
            style={
              styles.supportIcon
            }
          >
            <Ionicons
              name="headset-outline"
              size={25}
              color={colors.accent}
            />
          </View>

          <View
            style={
              styles.supportContent
            }
          >
            <Text
              style={
                styles.supportTitle
              }
            >
              Need assistance?
            </Text>

            <Text
              style={
                styles.supportDescription
              }
            >
              Report an internet problem, router
              issue, installation concern, billing
              concern, or other service issue.
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={19}
            color={colors.muted}
          />
        </Pressable>

        {/* REFRESH */}

        <Pressable
          onPress={onRefresh}
          style={({ pressed }) => [
            styles.refreshButton,
            pressed &&
              styles.pressed,
          ]}
        >
          <Ionicons
            name="refresh-outline"
            size={17}
            color={colors.accent}
          />

          <Text
            style={styles.refreshText}
          >
            REFRESH ACCOUNT
          </Text>
        </Pressable>

        {/* SIGN OUT */}

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            styles.signOutButton,
            pressed &&
              styles.pressed,
          ]}
        >
          <Ionicons
            name="log-out-outline"
            size={18}
            color={colors.danger}
          />

          <Text
            style={styles.signOutText}
          >
            SIGN OUT
          </Text>
        </Pressable>

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
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
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
    marginBottom: 19,
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