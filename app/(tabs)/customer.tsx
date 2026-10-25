import { SkeletonScreen } from '@/components/Skeleton'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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

import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useRouter } from 'expo-router'

import { supabase } from '@/lib/supabase'
import { ReferralPopups } from '@/components/ReferralPopups'
import { TechOnTheWay } from '@/components/TechOnTheWay'
import { tourRef, tourScroll } from '@/lib/tour'
import { friendlyError } from '@/lib/errors'
import { reportError } from '@/lib/errorReporter'
import { useConnection } from '@/lib/connection'
import {
  BillRow,
  canPay,
  fetchBills,
  openBills,
  payableAmount,
  totalBalance,
} from '@/lib/billing'
import { loadJobPhotos, type JobPhoto } from '@/lib/jobEvidence'
import { distanceKm, formatDistance } from '@/lib/location'
import { colors, motion, radii } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'
import { InstallProgress } from '@/components/InstallProgress'
import { OutageBanner } from '@/components/OutageBanner'
import { RatingPrompt } from '@/components/RatingPrompt'
import { PinConfirmModal } from '@/components/PinConfirmModal'
import { ReminderBanner } from '@/components/ReminderBanner'
import { InboxBell, QuickActions } from '@/components/QuickActions'
import { firstBillDate, firstBillDue, isNewCustomer, planLabel } from '../../lib/plans'
import { InstallRequestCard, installStep } from '@/components/InstallRequestCard'
import { SignOffSheet } from '@/components/SignOffSheet'
import { RequestTimeline } from '@/components/RequestTimeline'
import { PhotoViewer } from '@/components/PhotoViewer'
import { PAY_ALL } from '@/components/PayBillSheet'
import { TicketChat } from '@/components/TicketChat'


// Lets the app tour scroll this screen to the element it points at.
const tourScrollRef = tourScroll('/customer')
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
  disconnection_flag?: boolean | null
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
  service_request_id?: string | null
  accepted_at?: string | null
  arrived_at?: string | null
  started_at?: string | null
  completed_at?: string | null
  signature_requested_at?: string | null
  customer_signed_at?: string | null
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

  // Order matters: "unpaid" and "partially paid" both contain "paid".
  // "inactive" contains "active", so it has to be caught here first.
  if (
    normalized.includes('inactive') ||
    normalized.includes('overdue') ||
    normalized.includes('failed') ||
    normalized.includes('reject') ||
    normalized.includes('cancel')
  ) {
    return colors.danger
  }

  if (
    normalized.includes('unpaid') ||
    normalized.includes('partial') ||
    normalized.includes('pending') ||
    normalized.includes('process') ||
    normalized.includes('review') ||
    normalized.includes('due')
  ) {
    return colors.medium
  }

  if (
    normalized.includes('paid') ||
    normalized.includes('complete') ||
    normalized.includes('success') ||
    normalized.includes('active') ||
    normalized.includes('approved')
  ) {
    return colors.success
  }

  return colors.info
}

// A plan application Accounting has not finished with yet (not cancelled,
// rejected or completed). While one is open the customer waits instead of
// applying again.
function isOpenPlanApplication(
  request: ServiceRequest,
) {
  if (request.request_type !== 'plan_change') {
    return false
  }

  return !/(cancel|reject|declin|complete)/.test(
    normalizeStatus(request.status),
  )
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
    useState<BillRow[]>([])

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
              billing_day,
              plan_name,
              area,
              installation_status,
              account_status,
              account_id,
              map_location,
              latitude,
              longitude,
              user_id,
              referral_code,
              disconnection_flag
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
          billList,
          paymentsResult,
          repairsResult,
          requestsResult,
          referralsResult,
          submissionsResult,
        ] = await Promise.all([
          // Amounts come from the shared bill model so Home and Plan & Bills agree.
          fetchBills(customerClient.id).catch(error => {
            console.warn(
              'Billing warning:',
              error?.message,
            )
            return [] as BillRow[]
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
              longitude,
              service_request_id,
              accepted_at,
              arrived_at,
              started_at,
              completed_at,
              signature_requested_at,
              customer_signed_at
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

        setBilling(billList)

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

        reportError(error, 'Customer home')

        setErrorMessage(
          friendlyError(
            error,
            'Unable to load your customer dashboard.',
          ),
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
        setFresh(true)
      }
    }, [router])

  // Show the last saved Home straight away while the fresh data loads, so the
  // app opens instantly even on slow mobile data.
  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const id = data.session?.user.id
        if (!id) return
        const raw = await AsyncStorage.getItem(`home-cache:${id}`)
        if (!raw || !active) return
        const saved = JSON.parse(raw)
        if (!saved?.client) return
        setClient(saved.client)
        setName(saved.name || 'Customer')
        setBilling(saved.billing || [])
        setPayments(saved.payments || [])
        setRepairs(saved.repairs || [])
        setRequests(saved.requests || [])
        setReferrals(saved.referrals || [])
        setLoading(false)
      } catch {
        // No cache is fine; the normal load follows.
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!fresh || !client?.user_id) return
    void AsyncStorage.setItem(
      `home-cache:${client.user_id}`,
      JSON.stringify({ client, name, billing, payments, repairs, requests, referrals }),
    ).catch(() => {})
  }, [fresh, client, name, billing, payments, repairs, requests, referrals])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  // Reload by itself when the connection comes back, so a stale
  // "no internet" banner doesn't wait for a manual pull-to-refresh.
  const { isOnline } = useConnection()
  const wasOnline = useRef(true)
  useEffect(() => {
    if (isOnline && !wasOnline.current) void loadDashboard()
    wasOnline.current = isOnline
  }, [isOnline, loadDashboard])

  // No location pin yet: offer to set it from the phone's GPS (once per
  // session). The point is saved automatically after the customer confirms they
  // are at home, and only if it falls inside their registered barangay.
  const pinOffered = React.useRef(false)
  const [pinOpen, setPinOpen] = useState(false)
  useEffect(() => {
    // Only judge the pin from fresh data, never from the saved copy.
    if (!client || !fresh || pinOffered.current) return
    if (client.latitude != null && client.longitude != null) return
    pinOffered.current = true

    Alert.alert(
      'Set your location pin',
      'Technicians need your exact location to find your house. If you are at home (where the internet is or will be installed), tap Track my address. You will see the pin on a map and confirm it.',
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Track my address',
          onPress: () => setPinOpen(true),
        },
      ],
    )
  }, [client, fresh])

  const onRefresh =
    useCallback(async () => {
      setRefreshing(true)
      await loadDashboard()
    }, [loadDashboard])

  // What is still owed, after partial payments (same numbers as Plan & Bills).
  const currentBalance =
    useMemo(
      () => totalBalance(billing),
      [billing],
    )

  const unpaidBills =
    useMemo(
      () => openBills(billing),
      [billing],
    )

  // The bill to pay next; once everything is paid, the most recent bill.
  const latestBill =
    unpaidBills[0] ??
    (billing.length > 0
      ? billing[0]
      : null)

  const overdueBill =
    unpaidBills.find(
      bill => bill.days_overdue > 0,
    ) ?? null

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

  // A new customer sees no bills until the installation is signed off.
  const billingLocked = !!client && isNewCustomer(client)
  const installFlow = useMemo(
    () => (billingLocked ? installStep(requests, repairs) : null),
    [billingLocked, requests, repairs],
  )

  // The technician asked for a signature (the customer was not home).
  const [signRepairId, setSignRepairId] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const signOffered = React.useRef<string | null>(null)
  useEffect(() => {
    if (!fresh || installFlow?.step !== 3 || !installFlow.job) return
    if (signOffered.current === installFlow.job.id) return
    signOffered.current = installFlow.job.id
    setSignRepairId(installFlow.job.id)
  }, [fresh, installFlow])

  // While the request moves along, check for news every 20 seconds.
  useEffect(() => {
    if (!billingLocked || !installFlow) return undefined
    const timer = setInterval(() => void loadDashboard(), 20000)
    return () => clearInterval(timer)
  }, [billingLocked, installFlow, loadDashboard])

  const [techAway, setTechAway] =
    useState<string>('')

  // Everyone on the current job (the lead plus the crew their team leader chose).
  const [crew, setCrew] = useState<
    {
      user_id: string
      name: string
      employee_number: string | null
      phone: string | null
      role: 'lead' | 'helper'
    }[]
  >([])

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

  // Load who is on the current job so the customer sees the whole crew.
  useEffect(() => {
    if (!latestRepair || !repairActive) {
      setCrew([])
      return undefined
    }

    let active = true
    void (async () => {
      const { data } = await supabase.rpc('job_crew', { p_repair: latestRepair.id })
      if (active) setCrew(Array.isArray(data) ? data : [])
    })()

    return () => {
      active = false
    }
  }, [latestRepair, repairActive])

  // Before/after photos the technician took on this job, and whether it was signed.
  const [jobPhotos, setJobPhotos] = useState<JobPhoto[]>([])
  const [viewPhoto, setViewPhoto] = useState<number | null>(null)
  const [jobSigned, setJobSigned] = useState(false)

  // Home stays short: details fold away. Repairs open by themselves while a job is happening.
  const [billsOpen, setBillsOpen] = useState(false)
  const [repairsOpen, setRepairsOpen] = useState<boolean | null>(null)
  useEffect(() => {
    if (!latestRepair) {
      setJobPhotos([])
      setJobSigned(false)
      return undefined
    }

    let active = true
    void loadJobPhotos(latestRepair.id)
      .then(result => {
        if (!active) return
        setJobPhotos(result.photos)
        setJobSigned(result.signed)
      })
      .catch(() => {})

    return () => {
      active = false
    }
    // Reload when the job moves on too: the signature is saved as the job finishes, often while this screen is open.
  }, [latestRepair?.id, latestRepair?.status, latestRepair?.completed_at, latestRepair?.signature_requested_at, latestRepair?.customer_signed_at])

  const latestRequest =
    requests.length > 0
      ? requests[0]
      : null

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

  // Earliest due date among bills that still owe money.
  const nextDueDate =
    unpaidBills[0]?.due_date ?? null

  // The install month is billed too; its bill is due on the month's last day.
  const firstBill = firstBillDate(client)
  const firstDue = firstBillDue(firstBill)

  const serviceLocation =
    client?.area?.trim() ||
    client?.map_location?.trim() ||
    'Not set'

  const hasPlan = Boolean(
    client?.plan_name?.trim(),
  )

  const openPlanApplication =
    useMemo(
      () =>
        requests.find(isOpenPlanApplication) ??
        null,
      [requests],
    )

  // Opens Plan & Bills already scrolled to the plan list. A fresh timestamp
  // makes it scroll again on every tap.
  const goToApplyForPlan = () => {
    router.push({
      pathname: '/payment',
      params: {
        section: 'plan',
        t: String(Date.now()),
      },
    })
  }

  const goToPayment = () => {
    router.push('/payment')
  }

  // Opens Plan & Bills with the payment sheet already open for this bill.
  const goToPayBill = (billId: string) => {
    router.push({
      pathname: '/payment',
      params: {
        pay: billId,
        t: String(Date.now()),
      },
    })
  }

  const goToRequests = () => {
    router.push('/requests')
  }

  if (loading) {
    return <SkeletonScreen variant="home" />
  }

  const heroAlert = !billingLocked && Boolean(overdueBill || client?.disconnection_flag)
  const payTarget = billingLocked
    ? null
    : overdueBill && canPay(overdueBill)
      ? overdueBill
      : latestBill && canPay(latestBill)
        ? latestBill
        : null
  // Several open bills: the hero button pays the total with one receipt.
  const payableBills = billingLocked ? [] : unpaidBills.filter(canPay)
  const payAll = payableBills.length > 1
  const heroPayAmount = payAll
    ? payableBills.reduce((sum, bill) => sum + payableAmount(bill), 0)
    : payTarget
      ? payableAmount(payTarget)
      : 0
  const repairsShown =
    repairsOpen ??
    (repairActive ||
      Boolean(
        client?.installation_status &&
          !installFlow &&
          !/(complete|done|finished)/i.test(client.installation_status),
      ))

  const isAccountInactive = !client?.account_status || normalizeStatus(client.account_status).includes('inactive')

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={tourScrollRef}
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
              source={require('../../assets/images/pkc-logo-480.png')}
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

        {/* TECHNICIAN ON THE WAY (only while they are travelling to me) */}
        <TechOnTheWay />

        {/* STATUS: one card that answers "is my account OK, do I owe anything, what do I do next" */}

        <GlassCard
          style={[
            styles.heroCard,
            heroAlert && styles.heroCardAlert,
          ]}
          enterDelay={motion.stagger}
        >
          <View style={styles.welcomeTop}>
            <View style={styles.welcomeText}>
              <Text style={styles.smallLabel}>
                WELCOME BACK
              </Text>

              <Text
                style={styles.welcomeName}
                numberOfLines={1}
              >
                {name ||
                  client?.customer_name ||
                  'Customer'}
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                isAccountInactive && styles.statusBadgeInactive,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      getStatusColor(
                        client?.account_status || 'Inactive',
                      ),
                  },
                ]}
              />

              <Text
                style={[
                  styles.statusBadgeText,
                  isAccountInactive && { color: colors.danger },
                ]}
              >
                {client?.account_status ||
                  'Inactive'}
              </Text>
            </View>
          </View>

          {billingLocked ? (
            <Text style={styles.heroNote}>
              {hasPlan
                ? 'We are setting up your service. Your bills start once the installation is signed.'
                : 'Choose a plan to get connected.'}
            </Text>
          ) : (
            <>
              <Text style={styles.heroLabel}>
                {currentBalance > 0 ? 'AMOUNT TO PAY' : 'YOUR BALANCE'}
              </Text>

              <Text
                style={[
                  styles.heroAmount,
                  currentBalance <= 0 && { color: colors.success },
                ]}
                accessibilityLabel={
                  currentBalance > 0
                    ? `Amount to pay: ${formatMoney(currentBalance)} pesos`
                    : 'All paid'
                }
              >
                {currentBalance > 0
                  ? `₱${formatMoney(currentBalance)}`
                  : 'All paid'}
              </Text>

              <Text style={styles.heroNote}>
                {nextDueDate
                  ? `Next due ${formatDate(nextDueDate)}`
                  : firstBill && billing.length === 0
                    ? currentBalance <= 0
                      ? `Installation fee paid. Your first bill is due ${formatDate(firstDue)}.`
                      : `First bill due ${formatDate(firstDue)}`
                    : 'Nothing due right now'}
              </Text>
            </>
          )}

          {heroAlert ? (
            <View style={styles.heroAlertRow}>
              <Ionicons
                name="warning-outline"
                size={16}
                color={colors.danger}
              />

              <Text style={styles.heroAlertText}>
                {client?.disconnection_flag
                  ? 'Your service may be disconnected. Pay now to keep it on.'
                  : overdueBill
                    ? `${overdueBill.bill_id || 'A bill'} is ${overdueBill.days_overdue} day${overdueBill.days_overdue === 1 ? '' : 's'} late.`
                    : ''}
              </Text>
            </View>
          ) : null}

          <View style={styles.heroFooter}>
            <View style={styles.planChip}>
              <Ionicons
                name="wifi"
                size={13}
                color={colors.accent}
              />

              <Text
                style={styles.planChipText}
                numberOfLines={1}
              >
                {planLabel(client?.plan_name) ||
                  'No plan yet'}
              </Text>
            </View>

            {!hasPlan ? (
              openPlanApplication ? (
                <View
                  style={styles.planReview}
                  accessibilityLabel={`Your application${
                    openPlanApplication.requested_plan
                      ? ` for ${openPlanApplication.requested_plan}`
                      : ''
                  } is under review`}
                >
                  <Ionicons
                    name="hourglass-outline"
                    size={14}
                    color={colors.medium}
                  />

                  <Text style={styles.planReviewText}>
                    Under review
                  </Text>
                </View>
              ) : (
                <Pressable
                  ref={tourRef('apply-plan')}
                  onPress={goToApplyForPlan}
                  accessibilityRole="button"
                  accessibilityLabel="Apply for a plan"
                  style={({ pressed }) => [
                    styles.applyPlanButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="add-circle"
                    size={16}
                    color={colors.bg}
                  />

                  <Text style={styles.applyPlanText}>
                    Apply for plan
                  </Text>
                </Pressable>
              )
            ) : null}
          </View>

          {payTarget ? (
            <Pressable
              onPress={() => goToPayBill(payAll ? PAY_ALL : payTarget.id)}
              accessibilityRole="button"
              accessibilityLabel={payAll ? 'Pay all your bills' : `Pay bill ${payTarget.bill_id || ''}`}
              style={({ pressed }) => [
                styles.payNowButton,
                heroAlert && styles.payNowDanger,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="card"
                size={17}
                color={colors.bg}
              />

              <Text style={styles.payNowText}>
                {`Pay ₱${formatMoney(heroPayAmount)}`}
              </Text>
            </Pressable>
          ) : heroAlert ? (
            <Pressable
              onPress={goToPayment}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.payNowButton,
                styles.payNowDanger,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.payNowText}>
                Open Plan & Bills
              </Text>
            </Pressable>
          ) : null}

          {!billingLocked && (issuesToResolve > 0 || pendingPayments > 0) ? (
            <Text style={styles.heroMeta}>
              {[
                issuesToResolve > 0
                  ? `${issuesToResolve} issue${issuesToResolve === 1 ? '' : 's'} being fixed`
                  : '',
                pendingPayments > 0
                  ? `${pendingPayments} payment${pendingPayments === 1 ? '' : 's'} being checked`
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </GlassCard>

        {/* KNOWN OUTAGES IN MY AREA */}
        <OutageBanner />

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

        {/* SHORTCUTS */}
        <QuickActions />

        {/* NEW CUSTOMER: WHERE THE REQUEST STANDS (billing is hidden until it is signed) */}
        {billingLocked ? (
          <>
            <InstallRequestCard
              requests={requests}
              repairs={repairs}
              onSign={setSignRepairId}
            />

            {!installFlow ? (
              <GlassCard style={styles.latestCard}>
                <Text style={styles.sectionTitle}>BILLS COME AFTER INSTALLATION</Text>
                <Text style={styles.emptyDescription}>
                  Choose a plan and pay the installation fee in Plan & Bills. Your bills and payments
                  show here once the technician finishes and the installation is signed.
                </Text>
              </GlassCard>
            ) : null}
          </>
        ) : null}

        {!billingLocked ? (
        <>
        {/* BILLS & PAYMENTS, folded by default */}

        <Disclosure
          title="BILLS & PAYMENTS"
          summary={
            latestPayment
              ? `Last paid \u20B1${formatMoney(latestPayment.amount_paid)} on ${formatDate(latestPayment.payment_date)}`
              : 'No payments yet'
          }
          open={billsOpen}
          onToggle={() => setBillsOpen(open => !open)}
        />

        {billsOpen ? (
        <>
        <Text style={styles.subTitle}>
          {unpaidBills.length > 0
            ? 'NEXT BILL TO PAY'
            : 'LATEST BILL'}
        </Text>

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
                  latestBill.balance > 0
                    ? latestBill.balance
                    : latestBill.amount,
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
              {latestBill.status === 'Overdue' &&
              latestBill.days_overdue > 0
                ? `Overdue \u00B7 ${latestBill.days_overdue} day${latestBill.days_overdue === 1 ? '' : 's'}`
                : latestBill.status ||
                  'Pending'}
            </Text>

            {latestBill.paid > 0 &&
            latestBill.balance > 0 ? (
              <Text
                style={styles.latestNote}
              >
                {`\u20B1${formatMoney(latestBill.paid)} paid of \u20B1${formatMoney(latestBill.amount)}`}
              </Text>
            ) : null}

            {latestBill.pending_review > 0 ? (
              <Text
                style={styles.latestWaiting}
              >
                {`\u20B1${formatMoney(latestBill.pending_review)} sent \u00B7 waiting for Accounting`}
              </Text>
            ) : null}

            {canPay(latestBill) ? (
              <Pressable
                onPress={() =>
                  goToPayBill(latestBill.id)
                }
                accessibilityRole="button"
                accessibilityLabel={`Pay bill ${latestBill.bill_id || ''}`}
                style={({ pressed }) => [
                  styles.payNowButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="card"
                  size={17}
                  color={colors.bg}
                />

                <Text
                  style={
                    styles.payNowText
                  }
                >
                  {`Pay \u20B1${formatMoney(payableAmount(latestBill))}`}
                </Text>
              </Pressable>
            ) : null}
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
                {!client?.plan_name?.trim()
                  ? 'No plan yet'
                  : firstBill
                  ? 'First bill on its way'
                    : 'No bills'}
              </Text>

              <Text
                style={
                  styles.emptyDescription
                }
              >
                {!client?.plan_name?.trim()
                  ? 'Choose a plan in Plan & Bills to start your service and your bills.'
                  : firstBill
                    ? `Your first bill comes on ${formatDate(firstBill)} and is due ${formatDate(firstDue)}, the last day of the month.`
                    : 'Your billing information will appear here when a bill is generated.'}
              </Text>
            </View>
          </GlassCard>
        )}

        <Text style={styles.subTitle}>
          LATEST PAYMENT
        </Text>

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

        </>
        ) : null}
        </>
        ) : null}

        {/* REPAIR */}

        <Disclosure
          title="INSTALLATION & REPAIRS"
          summary={
            latestRepair
              ? `${latestRepair.status || 'Pending'} \u00B7 ${latestRepair.problem_description || 'Service repair'}`
              : 'No repair records'
          }
          open={repairsShown}
          onToggle={() => setRepairsOpen(!repairsShown)}
        />

        {repairsShown ? (
        <>

        {client?.installation_status && !installFlow ? (
          <InstallProgress status={client.installation_status} />
        ) : null}

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

                {/* Same thread the technician sees on the job, so the customer can reply. */}
                {latestRepair.service_request_id ? (
                  <Pressable
                    onPress={() => setChatOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Message your technician"
                    style={({ pressed }) => [
                      styles.techMessage,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name="chatbubbles"
                      size={15}
                      color={colors.accent}
                    />
                    <Text style={styles.techMessageText}>
                      Message
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <RequestTimeline
              events={(() => {
                const install = latestRepair.job_type === 'installation'
                const request = install
                  ? requests.find(row => row.id === latestRepair.service_request_id) ??
                    requests.find(row => row.request_type === 'plan_change')
                  : null
                return [
                  { label: install ? 'Payment sent' : 'Reported', at: install ? request?.created_at ?? latestRepair.created_at : latestRepair.created_at },
                  ...(install ? [{ label: 'Payment confirmed, sent to technicians', at: latestRepair.created_at }] : []),
                  { label: 'Technician accepted', at: latestRepair.accepted_at },
                  {
                    label: 'Technician arrived',
                    at: latestRepair.arrived_at,
                    // Jobs finished before arrival check-in existed have no time, but the technician did come.
                    doneNote:
                      !latestRepair.arrived_at && (latestRepair.completed_at || latestRepair.signature_requested_at)
                        ? 'Time not recorded'
                        : undefined,
                  },
                  { label: 'Started working', at: latestRepair.started_at },
                  { label: 'Work finished', at: latestRepair.signature_requested_at ?? latestRepair.completed_at },
                  { label: 'You signed', at: latestRepair.customer_signed_at ?? (jobSigned ? latestRepair.completed_at : null) },
                ]
              })()}
            />

            {jobPhotos.length > 0 || jobSigned ? (
              <View style={styles.crewBox}>
                <Text style={styles.crewTitle}>
                  JOB PHOTOS{jobSigned ? ' · SIGNED BY YOU' : ''}
                </Text>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {jobPhotos.map((photo, index) => (
                    <Pressable
                      key={photo.id}
                      style={{ flex: 1 }}
                      onPress={() => setViewPhoto(index)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open the ${photo.photo_type} photo`}
                    >
                      <Image
                        source={{ uri: photo.url }}
                        style={styles.jobPhoto}
                        resizeMode="cover"
                      />
                      <Text style={styles.crewId}>
                        {photo.photo_type === 'before' ? 'Before' : 'After'} · tap to enlarge
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {crew.length > 1 ? (
              <View style={styles.crewBox}>
                <Text style={styles.crewTitle}>
                  YOUR CREW ({crew.length})
                </Text>

                {crew.map(person => (
                  <View key={person.user_id} style={styles.crewRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.crewName}>
                        {person.name}
                        {person.role === 'lead' ? ' · lead' : ''}
                      </Text>
                      <Text style={styles.crewId}>
                        {person.employee_number || 'Technician'}
                      </Text>
                    </View>

                    {person.phone ? (
                      <Pressable
                        onPress={() =>
                          void Linking.openURL(`tel:${person.phone}`)
                        }
                        hitSlop={8}
                        style={({ pressed }) => [
                          styles.techCall,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons name="call" size={14} color={colors.bg} />
                        <Text style={styles.techCallText}>Call</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
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
        </>
        ) : null}

        <RatingPrompt />

        <PhotoViewer
          photos={jobPhotos.map(photo => ({
            id: photo.id,
            url: photo.url,
            label: photo.photo_type === 'before' ? 'Before' : 'After',
          }))}
          startIndex={viewPhoto}
          onClose={() => setViewPhoto(null)}
        />

        <TicketChat
          visible={chatOpen}
          requestId={latestRepair?.service_request_id ?? null}
          title={latestRepair?.technician || 'Your technician'}
          subtitle={
            latestRepair?.job_type === 'installation'
              ? 'Chat about your installation'
              : 'Chat with your technician and support'
          }
          onClose={() => setChatOpen(false)}
        />

        <SignOffSheet
          repairId={signRepairId}
          clientId={client?.id ?? ''}
          customerName={client?.customer_name ?? ''}
          onClose={() => setSignRepairId(null)}
          onSigned={() => {
            setSignRepairId(null)
            void loadDashboard()
          }}
        />

        <PinConfirmModal visible={pinOpen} onClose={() => setPinOpen(false)} onSaved={() => void loadDashboard()} />





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

      <ReferralPopups client={client} />
    </View>
  )
}

// A tappable section header that folds its content away, with a one-line summary when closed.
function Disclosure({
  title,
  summary,
  open,
  onToggle,
}: {
  title: string
  summary: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${title}, ${open ? 'tap to hide' : 'tap to show'}`}
      style={({ pressed }) => [
        styles.disclosure,
        pressed && styles.pressed,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.disclosureTitle}>
          {title}
        </Text>

        {!open ? (
          <Text
            style={styles.disclosureSummary}
            numberOfLines={1}
          >
            {summary}
          </Text>
        ) : null}
      </View>

      <Ionicons
        name={open ? 'chevron-up' : 'chevron-down'}
        size={18}
        color={colors.muted}
      />
    </Pressable>
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
  crewBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 10,
  },

  crewTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  jobPhoto: {
    width: '100%',
    height: 110,
    borderRadius: radii.sm,
    backgroundColor: colors.input,
  },

  crewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  crewName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },

  crewId: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },

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

  techMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
  },

  techMessageText: {
    color: colors.accent,
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
    fontSize: 12,
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
    padding: 12,
    marginBottom: 14,
    alignItems: 'center',
    borderColor: colors.danger,
  },

  errorContent: {
    flex: 1,
    marginLeft: 11,
  },

  errorTitle: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },

  errorText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },

  heroCard: {
    padding: 18,
    marginBottom: 16,
  },

  heroCardAlert: {
    borderColor: 'rgba(255, 92, 122, 0.55)',
  },

  heroLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 16,
  },

  heroAmount: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 2,
  },

  heroNote: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  heroAlertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255, 92, 122, 0.1)',
  },

  heroAlertText: {
    flex: 1,
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },

  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 14,
  },

  planChip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radii.round,
    backgroundColor: colors.accentSoft,
  },

  planChipText: {
    flexShrink: 1,
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },

  payNowDanger: {
    backgroundColor: colors.danger,
  },

  heroMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 12,
  },

  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },

  disclosureTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  disclosureSummary: {
    color: colors.text,
    fontSize: 13,
    marginTop: 4,
  },

  subTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 2,
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
    fontSize: 11,
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
    fontSize: 12,
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

  statusBadgeInactive: {
    borderColor: colors.danger,
    backgroundColor: 'rgba(255, 92, 122, 0.12)',
  },

  statusBadgeText: {
    color: colors.text,
    fontSize: 11,
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

  latestNote: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 52,
  },

  latestWaiting: {
    color: colors.medium,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    marginLeft: 52,
  },

  payNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    marginTop: 12,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },

  payNowText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '900',
  },

  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 92, 122, 0.45)',
    backgroundColor: 'rgba(255, 92, 122, 0.08)',
  },

  overdueBannerTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },

  overdueBannerText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },

  applyPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: radii.round,
    backgroundColor: colors.accent,
  },

  applyPlanText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '900',
  },

  planReview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.medium,
    backgroundColor: 'rgba(255, 200, 87, 0.10)',
  },

  planReviewText: {
    color: colors.medium,
    fontSize: 12,
    fontWeight: '800',
  },

  statLabel: {
    color: colors.muted,
    fontSize: 11,
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
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 4,
    marginBottom: 8,
    marginLeft: 2,
  },

  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 10,
    marginLeft: 2,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  viewAll: {
    color: colors.accent,
    fontSize: 11,
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
    fontSize: 11,
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
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  statCard: {
    width: '48.5%',
    padding: 14,
    marginBottom: 10,
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

  cardStatNote: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
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
    fontSize: 12,
    marginTop: 3,
  },

  latestAmount: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '900',
  },

  latestStatus: {
    fontSize: 11,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 11,
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
    fontSize: 11,
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
