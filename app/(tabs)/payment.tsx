import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
  customer_name: string | null
  plan_name: string | null
  area: string | null
  map_location: string | null
  account_status: string | null
  account_id: string | null
  installation_status: string | null
  install_date: string | null
}

type Bill = {
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

type ServiceRequest = {
  id: string
  request_type: string
  requested_plan: string | null
  description: string | null
  status: string | null
  created_at: string
}

type Plan = {
  name: string
  price: number
  description: string
}

/*
 * These plans match the service_requests database constraint.
 *
 * G1_P2000 is included.
 */
const AVAILABLE_PLANS: Plan[] = [
  {
    name: 'G1_P500',
    price: 500,
    description: 'Reliable internet service for basic everyday use.',
  },
  {
    name: 'G1_P750',
    price: 750,
    description: 'Balanced internet service for regular household use.',
  },
  {
    name: 'G1_P1000',
    price: 1000,
    description: 'Higher-speed service for streaming and multiple devices.',
  },
  {
    name: 'G1_P1250',
    price: 1250,
    description: 'Enhanced service for heavier household usage.',
  },
  {
    name: 'G1_P1500',
    price: 1500,
    description: 'High-performance internet for demanding users.',
  },
  {
    name: 'G1_P2000',
    price: 2000,
    description: 'Premium internet service for demanding usage.',
  },
]

const SUPPORTED_PLAN_NAMES = AVAILABLE_PLANS.map(
  (plan) => plan.name,
)

function formatMoney(value: number | null | undefined) {
  const amount = Number(value || 0)

  return `\u20B1${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '—'
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

function normalizeStatus(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function getStatusColor(status: string | null | undefined) {
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
    normalized.includes('review')
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

function getRequestLabel(requestType: string | null | undefined) {
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

function EmptyRow({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  description: string
}) {
  return (
    <View style={styles.emptyRow}>
      <View style={styles.emptyIcon}>
        <Ionicons
          name={icon}
          size={22}
          color={colors.muted}
        />
      </View>

      <View style={styles.emptyContent}>
        <Text style={styles.emptyTitle}>
          {title}
        </Text>

        <Text style={styles.emptyDescription}>
          {description}
        </Text>
      </View>
    </View>
  )
}

export default function PaymentScreen() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submittingRequest, setSubmittingRequest] =
    useState(false)

  const [client, setClient] = useState<Client | null>(null)
  const [billing, setBilling] = useState<Bill[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [requests, setRequests] = useState<ServiceRequest[]>(
    [],
  )

  const [selectedPlan, setSelectedPlan] =
    useState<string | null>(null)

  const [errorMessage, setErrorMessage] = useState('')

  const loadPaymentData = useCallback(async () => {
    try {
      setErrorMessage('')

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) {
        throw authError
      }

      if (!user) {
        router.replace('/login')
        return
      }

      const { data: clientData, error: clientError } =
        await supabase
          .from('clients')
          .select(`
            id,
            customer_name,
            plan_name,
            area,
            map_location,
            account_status,
            account_id,
            installation_status,
            install_date
          `)
          .eq('user_id', user.id)
          .maybeSingle()

      if (clientError) {
        throw clientError
      }

      setClient(clientData as Client | null)

      if (!clientData) {
        setBilling([])
        setPayments([])
        setRequests([])
        return
      }

      const [
        billingResult,
        paymentsResult,
        requestsResult,
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
          .eq('client_id', clientData.id)
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
          .eq('client_id', clientData.id)
          .order('payment_date', {
            ascending: false,
          }),

        supabase
          .from('service_requests')
          .select(`
            id,
            request_type,
            requested_plan,
            description,
            status,
            created_at
          `)
          .eq('client_id', clientData.id)
          .eq('request_type', 'plan_change')
          .order('created_at', {
            ascending: false,
          }),
      ])

      if (billingResult.error) {
        throw billingResult.error
      }

      if (paymentsResult.error) {
        throw paymentsResult.error
      }

      if (requestsResult.error) {
        throw requestsResult.error
      }

      setBilling(
        (billingResult.data || []) as Bill[],
      )

      setPayments(
        (paymentsResult.data || []) as Payment[],
      )

      setRequests(
        (requestsResult.data || []) as ServiceRequest[],
      )
    } catch (error: any) {
      console.error(
        'Payment data error:',
        error,
      )

      setErrorMessage(
        error?.message ||
          'Unable to load your payment information.',
      )
    }
  }, [router])

  useEffect(() => {
    let mounted = true

    async function initialize() {
      if (!mounted) {
        return
      }

      setLoading(true)

      await loadPaymentData()

      if (mounted) {
        setLoading(false)
      }
    }

    initialize()

    return () => {
      mounted = false
    }
  }, [loadPaymentData])

  async function handleRefresh() {
    setRefreshing(true)

    await loadPaymentData()

    setRefreshing(false)
  }

  const currentBalance = useMemo(() => {
    return billing.reduce((total, bill) => {
      const status = normalizeStatus(
        bill.status,
      )

      if (
        status === 'paid' ||
        status === 'cancelled' ||
        status === 'void'
      ) {
        return total
      }

      return total + Number(
        bill.amount_due || 0,
      )
    }, 0)
  }, [billing])

  const latestBill = billing[0] || null

  const pendingPlanRequest = useMemo(() => {
    return requests.find((request) => {
      const status = normalizeStatus(
        request.status,
      )

      return (
        status === 'pending' ||
        status === 'processing' ||
        status === 'for approval' ||
        status === 'under review'
      )
    })
  }, [requests])

  const serviceLocation =
    client?.area?.trim() ||
    client?.map_location?.trim() ||
    'Tagnanan, Mabini, Davao de Oro'

  function requestPlanChange() {
    if (!selectedPlan) {
      Alert.alert(
        'Select a plan',
        'Please select a plan first.',
      )
      return
    }

    if (!client) {
      Alert.alert(
        'Account unavailable',
        'Your customer account could not be loaded.',
      )
      return
    }

    if (pendingPlanRequest) {
      Alert.alert(
        'Request already pending',
        'You already have a pending plan-change request. Please wait for accounting to review it before submitting another request.',
      )
      return
    }

    const plan = AVAILABLE_PLANS.find(
      (item) => item.name === selectedPlan,
    )

    if (!plan) {
      Alert.alert(
        'Invalid plan',
        'The selected plan is not available.',
      )
      return
    }

    if (
      client.plan_name?.trim() &&
      client.plan_name.trim() === plan.name
    ) {
      Alert.alert(
        'Same plan',
        'This is already your current plan.',
      )
      return
    }

    Alert.alert(
      'Submit plan change',
      `Request ${plan.name} at ${formatMoney(
        plan.price,
      )}/month?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Submit',
          onPress: () => {
            void createPlanRequest(plan)
          },
        },
      ],
    )
  }

  async function createPlanRequest(plan: Plan) {
    setSubmittingRequest(true)

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) {
        throw authError
      }

      if (!user) {
        router.replace('/login')
        return
      }

      if (
        !SUPPORTED_PLAN_NAMES.includes(
          plan.name,
        )
      ) {
        throw new Error(
          'The selected plan is not supported by the service request database.',
        )
      }

      const { data: insertedRequest, error: requestError } =
        await supabase
          .from('service_requests')
          .insert({
            user_id: user.id,
            client_id: client?.id ?? null,
            request_type: 'plan_change',
            requested_plan: plan.name,
            description: `Customer requested a plan change from ${
              client?.plan_name ||
              'No current plan'
            } to ${plan.name}.`,
            status: 'Pending',
          })
          .select(`
            id,
            request_type,
            requested_plan,
            description,
            status,
            created_at
          `)
          .single()

      if (requestError) {
        throw requestError
      }

      if (insertedRequest) {
        setRequests((current) => [
          insertedRequest as ServiceRequest,
          ...current,
        ])
      }

      setSelectedPlan(null)

      Alert.alert(
        'Request submitted',
        `Your ${plan.name} plan-change request has been submitted successfully. Accounting will review the request before your plan is changed.`,
      )
    } catch (error: any) {
      console.error(
        'Plan request error:',
        error,
      )

      Alert.alert(
        'Request failed',
        error?.message ||
          'Unable to submit your plan-change request.',
      )
    } finally {
      setSubmittingRequest(false)
    }
  }

  async function handleSignOut() {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
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
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator
          size="large"
          color={colors.accent}
        />

        <Text style={styles.loadingText}>
          Loading payment information...
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>
              CUSTOMER ACCOUNT
            </Text>

            <Text style={styles.title}>
              Payment
            </Text>

            <Text style={styles.subtitle}>
              Billing, payments, and plan changes
            </Text>
          </View>

          <Pressable
            onPress={handleRefresh}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="refresh"
              size={20}
              color={colors.accent}
            />
          </Pressable>
        </View>

        {errorMessage ? (
          <GlassCard style={styles.errorCard}>
            <View style={styles.errorRow}>
              <Ionicons
                name="alert-circle-outline"
                size={23}
                color={colors.danger}
              />

              <View style={styles.errorContent}>
                <Text style={styles.errorTitle}>
                  Unable to load some data
                </Text>

                <Text style={styles.errorText}>
                  {errorMessage}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={loadPaymentData}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.retryButtonText}>
                Retry
              </Text>
            </Pressable>
          </GlassCard>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Account
            </Text>

            <Text style={styles.sectionSubtitle}>
              Your service account information
            </Text>
          </View>
        </View>

        <GlassCard style={styles.accountCard}>
          <View style={styles.accountTop}>
            <View style={styles.accountIcon}>
              <Ionicons
                name="wifi-outline"
                size={27}
                color={colors.accent}
              />
            </View>

            <View style={styles.accountMain}>
              <Text style={styles.customerName}>
                {client?.customer_name ||
                  'Customer'}
              </Text>

              <Text style={styles.accountIdLabel}>
                ACCOUNT ID
              </Text>

              <Text style={styles.accountId}>
                {client?.account_id ||
                  'Not assigned'}
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                {
                  borderColor:
                    getStatusColor(
                      client?.account_status,
                    ),
                },
              ]}
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
                style={[
                  styles.statusBadgeText,
                  {
                    color:
                      getStatusColor(
                        client?.account_status,
                      ),
                  },
                ]}
              >
                {client?.account_status ||
                  'Account'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons
                name="location-outline"
                size={19}
                color={colors.accent}
              />
            </View>

            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>
                SERVICE LOCATION
              </Text>

              <Text style={styles.infoValue}>
                {serviceLocation}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons
                name="construct-outline"
                size={19}
                color={colors.success}
              />
            </View>

            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>
                INSTALLATION
              </Text>

              <Text style={styles.infoValue}>
                {client?.installation_status ||
                  'Not configured'}
              </Text>

              {client?.install_date ? (
                <Text style={styles.infoSubvalue}>
                  Installed{' '}
                  {formatDate(
                    client.install_date,
                  )}
                </Text>
              ) : null}
            </View>
          </View>
        </GlassCard>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Current Service
            </Text>

            <Text style={styles.sectionSubtitle}>
              Your current internet plan
            </Text>
          </View>
        </View>

        <GlassCard style={styles.currentPlanCard}>
          <View style={styles.currentPlanIcon}>
            <Ionicons
              name="speedometer-outline"
              size={28}
              color={colors.accent}
            />
          </View>

          <View style={styles.currentPlanContent}>
            <Text style={styles.currentPlanLabel}>
              CURRENT PLAN
            </Text>

            <Text style={styles.currentPlanName}>
              {client?.plan_name ||
                'No plan selected'}
            </Text>

            {!client?.plan_name ? (
              <Text
                style={
                  styles.currentPlanDescription
                }
              >
                Select an available plan below to
                request your internet service plan.
              </Text>
            ) : (
              <Text
                style={
                  styles.currentPlanDescription
                }
              >
                Your current plan remains active
                until an approved plan-change
                request is processed.
              </Text>
            )}
          </View>
        </GlassCard>

        {pendingPlanRequest ? (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  Pending Request
                </Text>

                <Text
                  style={styles.sectionSubtitle}
                >
                  Your plan-change request is being
                  reviewed
                </Text>
              </View>
            </View>

            <GlassCard style={styles.pendingCard}>
              <View style={styles.pendingIcon}>
                <Ionicons
                  name="time-outline"
                  size={25}
                  color={colors.medium}
                />
              </View>

              <View style={styles.pendingContent}>
                <Text style={styles.pendingTitle}>
                  {pendingPlanRequest.requested_plan ||
                    'Plan Change'}
                </Text>

                <Text style={styles.pendingText}>
                  Status:{' '}
                  {pendingPlanRequest.status ||
                    'Pending'}
                </Text>

                <Text style={styles.pendingDate}>
                  Submitted{' '}
                  {formatDate(
                    pendingPlanRequest.created_at,
                  )}
                </Text>
              </View>
            </GlassCard>
          </>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Change Plan
            </Text>

            <Text style={styles.sectionSubtitle}>
              Select the plan you want to request
            </Text>
          </View>
        </View>

        <GlassCard style={styles.planCard}>
          <View style={styles.planHeader}>
            <View>
              <Text style={styles.planHeaderTitle}>
                Available Plans
              </Text>

              <Text style={styles.planHeaderText}>
                Your request will be reviewed by
                accounting before the plan changes.
              </Text>
            </View>

            <Ionicons
              name="swap-horizontal-outline"
              size={26}
              color={colors.accent}
            />
          </View>

          <View style={styles.planList}>
            {AVAILABLE_PLANS.map((plan) => {
              const selected =
                selectedPlan === plan.name

              const isCurrent =
                client?.plan_name?.trim() ===
                plan.name

              return (
                <Pressable
                  key={plan.name}
                  onPress={() =>
                    setSelectedPlan(plan.name)
                  }
                  disabled={
                    submittingRequest ||
                    Boolean(pendingPlanRequest)
                  }
                  style={({ pressed }) => [
                    styles.planOption,
                    selected &&
                      styles.planOptionSelected,
                    isCurrent &&
                      styles.planOptionCurrent,
                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.planRadio,
                      selected &&
                        styles.planRadioSelected,
                    ]}
                  >
                    {selected ? (
                      <View
                        style={
                          styles.planRadioInner
                        }
                      />
                    ) : null}
                  </View>

                  <View
                    style={
                      styles.planOptionContent
                    }
                  >
                    <View
                      style={
                        styles.planOptionTop
                      }
                    >
                      <Text
                        style={[
                          styles.planName,
                          selected &&
                            styles.planNameSelected,
                        ]}
                      >
                        {plan.name}
                      </Text>

                      {isCurrent ? (
                        <View
                          style={
                            styles.currentBadge
                          }
                        >
                          <Text
                            style={
                              styles.currentBadgeText
                            }
                          >
                            CURRENT
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <Text
                      style={styles.planDescription}
                    >
                      {plan.description}
                    </Text>

                    <Text
                      style={[
                        styles.planPrice,
                        selected &&
                          styles.planPriceSelected,
                      ]}
                    >
                      {formatMoney(plan.price)}
                      <Text
                        style={
                          styles.planPriceSuffix
                        }
                      >
                        {' '}
                        / month
                      </Text>
                    </Text>
                  </View>

                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={colors.accent}
                    />
                  ) : null}
                </Pressable>
              )
            })}
          </View>

          <View style={styles.planNotice}>
            <Ionicons
              name="information-circle-outline"
              size={19}
              color={colors.info}
            />

            <Text style={styles.planNoticeText}>
              Plan changes are requests only. Your
              current plan will not change until the
              request is approved and processed.
            </Text>
          </View>

          <Pressable
            onPress={requestPlanChange}
            disabled={
              submittingRequest ||
              Boolean(pendingPlanRequest)
            }
            style={({ pressed }) => [
              styles.primaryButton,
              (submittingRequest ||
                pendingPlanRequest) &&
                styles.disabledButton,
              pressed && styles.pressed,
            ]}
          >
            {submittingRequest ? (
              <ActivityIndicator
                size="small"
                color={colors.bg}
              />
            ) : (
              <Ionicons
                name="send-outline"
                size={19}
                color={colors.bg}
              />
            )}

            <Text style={styles.primaryButtonText}>
              {submittingRequest
                ? 'Submitting...'
                : pendingPlanRequest
                  ? 'Plan Request Pending'
                  : 'Submit Plan Request'}
            </Text>
          </Pressable>
        </GlassCard>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Balance
            </Text>

            <Text style={styles.sectionSubtitle}>
              Your current outstanding balance
            </Text>
          </View>
        </View>

        <GlassCard style={styles.balanceCard}>
          <View style={styles.balanceIcon}>
            <Ionicons
              name="wallet-outline"
              size={27}
              color={
                currentBalance > 0
                  ? colors.medium
                  : colors.success
              }
            />
          </View>

          <View style={styles.balanceContent}>
            <Text style={styles.balanceLabel}>
              OUTSTANDING
            </Text>

            <Text style={styles.balanceAmount}>
              {formatMoney(currentBalance)}
            </Text>

            <Text style={styles.balanceHint}>
              {latestBill
                ? `Latest bill due ${formatDate(
                    latestBill.due_date,
                  )}`
                : 'No active billing record'}
            </Text>
          </View>
        </GlassCard>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Bills
            </Text>

            <Text style={styles.sectionSubtitle}>
              Your recent billing activity
            </Text>
          </View>
        </View>

        <GlassCard style={styles.listCard}>
          {billing.length === 0 ? (
            <EmptyRow
              icon="receipt-outline"
              title="No billing records"
              description="Your billing records will appear here after accounting creates them."
            />
          ) : (
            billing
              .slice(0, 5)
              .map((bill, index) => (
                <View
                  key={bill.id}
                  style={[
                    styles.listRow,
                    index ===
                      Math.min(
                        billing.length,
                        5,
                      ) -
                        1 &&
                      styles.lastListRow,
                  ]}
                >
                  <View style={styles.listIcon}>
                    <Ionicons
                      name="receipt-outline"
                      size={20}
                      color={colors.accent}
                    />
                  </View>

                  <View style={styles.listMain}>
                    <Text style={styles.listTitle}>
                      {bill.bill_type ||
                        'Monthly Bill'}
                    </Text>

                    <Text
                      style={styles.listSubtitle}
                    >
                      {bill.bill_id ||
                        'Billing record'}
                      {' • '}
                      Due{' '}
                      {formatDate(
                        bill.due_date,
                      )}
                    </Text>
                  </View>

                  <View style={styles.listRight}>
                    <Text style={styles.amountText}>
                      {formatMoney(
                        bill.amount_due,
                      )}
                    </Text>

                    <Text
                      style={[
                        styles.listStatus,
                        {
                          color:
                            getStatusColor(
                              bill.status,
                            ),
                        },
                      ]}
                    >
                      {bill.status ||
                        'Pending'}
                    </Text>
                  </View>
                </View>
              ))
          )}
        </GlassCard>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Payment History
            </Text>

            <Text style={styles.sectionSubtitle}>
              Recently recorded payments
            </Text>
          </View>
        </View>

        <GlassCard style={styles.listCard}>
          {payments.length === 0 ? (
            <EmptyRow
              icon="card-outline"
              title="No payments recorded"
              description="Payment records will appear here after accounting records a payment."
            />
          ) : (
            payments
              .slice(0, 5)
              .map((payment, index) => (
                <View
                  key={payment.id}
                  style={[
                    styles.listRow,
                    index ===
                      Math.min(
                        payments.length,
                        5,
                      ) -
                        1 &&
                      styles.lastListRow,
                  ]}
                >
                  <View style={styles.listIcon}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={20}
                      color={colors.success}
                    />
                  </View>

                  <View style={styles.listMain}>
                    <Text style={styles.listTitle}>
                      {payment.payment_method ||
                        'Payment'}
                    </Text>

                    <Text
                      style={styles.listSubtitle}
                    >
                      {payment.receipt_number ||
                        payment.payment_id ||
                        'Payment record'}
                      {' • '}
                      {formatDate(
                        payment.payment_date,
                      )}
                    </Text>
                  </View>

                  <Text style={styles.amountText}>
                    {formatMoney(
                      payment.amount_paid,
                    )}
                  </Text>
                </View>
              ))
          )}
        </GlassCard>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Plan Requests
            </Text>

            <Text style={styles.sectionSubtitle}>
              Previous plan-change requests
            </Text>
          </View>
        </View>

        <GlassCard style={styles.listCard}>
          {requests.length === 0 ? (
            <EmptyRow
              icon="document-text-outline"
              title="No plan requests"
              description="Your plan-change requests will appear here."
            />
          ) : (
            requests
              .slice(0, 5)
              .map((request, index) => (
                <View
                  key={request.id}
                  style={[
                    styles.requestRow,
                    index ===
                      Math.min(
                        requests.length,
                        5,
                      ) -
                        1 &&
                      styles.lastListRow,
                  ]}
                >
                  <View style={styles.requestIcon}>
                    <Ionicons
                      name="swap-horizontal-outline"
                      size={20}
                      color={colors.accent}
                    />
                  </View>

                  <View
                    style={styles.requestMain}
                  >
                    <Text
                      style={styles.requestTitle}
                    >
                      {getRequestLabel(
                        request.request_type,
                      )}
                    </Text>

                    <Text
                      style={styles.requestSubtitle}
                    >
                      {request.requested_plan ||
                        'Plan not specified'}
                    </Text>

                    <Text
                      style={styles.requestDate}
                    >
                      {formatDate(
                        request.created_at,
                      )}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.requestStatus,
                      {
                        color:
                          getStatusColor(
                            request.status,
                          ),
                      },
                    ]}
                  >
                    {request.status ||
                      'Pending'}
                  </Text>
                </View>
              ))
          )}
        </GlassCard>

        <Pressable
          onPress={() =>
            router.push('/requests')
          }
          style={({ pressed }) => [
            styles.supportCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.supportIcon}>
            <Ionicons
              name="help-buoy-outline"
              size={25}
              color={colors.accent}
            />
          </View>

          <View style={styles.supportContent}>
            <Text style={styles.supportTitle}>
              Need help?
            </Text>

            <Text style={styles.supportText}>
              Open Requests & Help to report an
              issue, request a repair, or ask for
              assistance.
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.accent}
          />
        </Pressable>

        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name="log-out-outline"
            size={19}
            color={colors.danger}
          />

          <Text style={styles.signOutText}>
            Sign Out
          </Text>
        </Pressable>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  scroll: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 30,
  },

  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: 30,
  },

  loadingText: {
    marginTop: 14,
    color: colors.muted,
    fontSize: 14,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },

  headerText: {
    flex: 1,
  },

  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 5,
  },

  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },

  subtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },

  headerButton: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  errorCard: {
    padding: 16,
    marginBottom: 20,
    borderColor:
      'rgba(255, 92, 122, 0.35)',
  },

  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  errorContent: {
    flex: 1,
    marginLeft: 12,
  },

  errorTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },

  errorText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },

  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.sm,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.border,
  },

  retryButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },

  sectionHeader: {
    marginTop: 8,
    marginBottom: 10,
  },

  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },

  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },

  accountCard: {
    padding: 17,
    marginBottom: 18,
  },

  accountTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  accountIcon: {
    width: 50,
    height: 50,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
  },

  accountMain: {
    flex: 1,
    marginLeft: 13,
  },

  customerName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },

  accountIdLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 5,
  },

  accountId: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: radii.round,
    borderWidth: 1,
    backgroundColor: colors.input,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },

  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 15,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 11,
  },

  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },

  infoContent: {
    flex: 1,
    marginLeft: 10,
  },

  infoLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 3,
  },

  infoValue: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },

  infoSubvalue: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },

  currentPlanCard: {
    padding: 17,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },

  currentPlanIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
  },

  currentPlanContent: {
    flex: 1,
    marginLeft: 13,
  },

  currentPlanLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
  },

  currentPlanName: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },

  currentPlanDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  pendingCard: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    borderColor:
      'rgba(255, 200, 87, 0.3)',
  },

  pendingIcon: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(255, 200, 87, 0.08)',
  },

  pendingContent: {
    flex: 1,
    marginLeft: 12,
  },

  pendingTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },

  pendingText: {
    color: colors.medium,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },

  pendingDate: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },

  planCard: {
    padding: 17,
    marginBottom: 18,
  },

  planHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 15,
  },

  planHeaderTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },

  planHeaderText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
    maxWidth: 285,
  },

  planList: {
    gap: 9,
  },

  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: radii.md,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.line,
  },

  planOptionSelected: {
    borderColor: colors.accent,
    backgroundColor:
      'rgba(0, 229, 255, 0.08)',
  },

  planOptionCurrent: {
    borderColor: colors.border,
  },

  planRadio: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  planRadioSelected: {
    borderColor: colors.accent,
  },

  planRadioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },

  planOptionContent: {
    flex: 1,
    marginLeft: 11,
  },

  planOptionTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  planName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },

  planNameSelected: {
    color: colors.accent,
  },

  currentBadge: {
    marginLeft: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radii.round,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
  },

  currentBadgeText: {
    color: colors.muted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  planDescription: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },

  planPrice: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 5,
  },

  planPriceSelected: {
    color: colors.accent,
  },

  planPriceSuffix: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '500',
  },

  planNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 14,
    padding: 11,
    borderRadius: radii.sm,
    backgroundColor:
      'rgba(88, 166, 255, 0.07)',
    borderWidth: 1,
    borderColor:
      'rgba(88, 166, 255, 0.15)',
  },

  planNoticeText: {
    flex: 1,
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginLeft: 8,
  },

  primaryButton: {
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 14,
  },

  primaryButtonText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 8,
  },

  disabledButton: {
    opacity: 0.5,
  },

  balanceCard: {
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  balanceIcon: {
    width: 51,
    height: 51,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },

  balanceContent: {
    flex: 1,
    marginLeft: 13,
  },

  balanceLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  balanceAmount: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '900',
    marginTop: 2,
  },

  balanceHint: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },

  listCard: {
    paddingHorizontal: 15,
    marginBottom: 18,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },

  lastListRow: {
    borderBottomWidth: 0,
  },

  listIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },

  listMain: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },

  listTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },

  listSubtitle: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 3,
    lineHeight: 15,
  },

  listRight: {
    alignItems: 'flex-end',
  },

  amountText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },

  listStatus: {
    fontSize: 9,
    fontWeight: '800',
    marginTop: 3,
  },

  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },

  requestIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },

  requestMain: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },

  requestTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },

  requestSubtitle: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },

  requestDate: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 3,
  },

  requestStatus: {
    fontSize: 10,
    fontWeight: '900',
  },

  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
  },

  emptyIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.input,
  },

  emptyContent: {
    flex: 1,
    marginLeft: 11,
  },

  emptyTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },

  emptyDescription: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },

  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginTop: 2,
  },

  supportIcon: {
    width: 45,
    height: 45,
    borderRadius: radii.md,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },

  supportContent: {
    flex: 1,
    marginHorizontal: 12,
  },

  supportTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },

  supportText: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },

  signOutButton: {
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor:
      'rgba(255, 92, 122, 0.3)',
    backgroundColor:
      'rgba(255, 92, 122, 0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },

  signOutText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 7,
  },

  pressed: {
    opacity: 0.72,
  },

  bottomSpace: {
    height: 20,
  },
})