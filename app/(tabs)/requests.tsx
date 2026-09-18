import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { supabase } from '@/lib/supabase'
import { colors } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'

type IssueType =
  | 'No Internet Connection'
  | 'Slow Internet'
  | 'Intermittent Connection'
  | 'Wi-Fi Problem'
  | 'Router / ONU Problem'
  | 'Installation Problem'
  | 'Billing / Account Concern'
  | 'Other'

type Client = {
  id: string
  customer_name: string | null
  account_id: string | null
  mobile_number: string | null
  area: string | null
  plan_name: string | null
  technicians: string | null
}

type ServiceRequest = {
  id: string
  request_type: string
  issue_type: string | null
  description: string | null
  status: string
  created_at: string
  updated_at: string | null
  client_id: string | null
}

type Technician = {
  user_id: string
  email: string | null
  full_name: string | null
  mobile_number: string | null
}

const ISSUE_TYPES: {
  label: IssueType
  icon: keyof typeof Ionicons.glyphMap
}[] = [
  {
    label: 'No Internet Connection',
    icon: 'cloud-offline-outline',
  },
  {
    label: 'Slow Internet',
    icon: 'speedometer-outline',
  },
  {
    label: 'Intermittent Connection',
    icon: 'pulse-outline',
  },
  {
    label: 'Wi-Fi Problem',
    icon: 'wifi-outline',
  },
  {
    label: 'Router / ONU Problem',
    icon: 'hardware-chip-outline',
  },
  {
    label: 'Installation Problem',
    icon: 'construct-outline',
  },
  {
    label: 'Billing / Account Concern',
    icon: 'card-outline',
  },
  {
    label: 'Other',
    icon: 'help-circle-outline',
  },
]

export default function RequestsScreen() {
  const [client, setClient] = useState<Client | null>(null)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [selectedIssue, setSelectedIssue] =
    useState<IssueType>('No Internet Connection')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const loadRequests = useCallback(async () => {
    try {
      setErrorMessage('')

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError

      if (!user) {
        setClient(null)
        setTechnicians([])
        setRequests([])
        return
      }

      const { data: clientRow, error: clientError } =
        await supabase
          .from('clients')
          .select(`
            id,
            customer_name,
            account_id,
            mobile_number,
            area,
            plan_name,
            technicians
          `)
          .eq('user_id', user.id)
          .maybeSingle()

      if (clientError) throw clientError

      setClient((clientRow ?? null) as Client | null)

      if (!clientRow) {
        setTechnicians([])
        setRequests([])
        return
      }

      /*
       * IMPORTANT:
       *
       * Do NOT use clients.technicians as the technician source.
       *
       * The technicians field is only free-form text and can contain
       * outdated or incorrect names.
       *
       * The actual technician identity comes from:
       *
       * profiles.role = 'technician'
       *
       * Contact information comes from:
       * profiles.email
       * user_profiles.full_name
       * user_profiles.mobile_number
       */
      const { data: technicianRows, error: technicianError } =
        await supabase
          .from('profiles')
          .select(`
            id,
            email,
            role
          `)
          .eq('role', 'technician')

      if (technicianError) throw technicianError

      const technicianUserIds = (technicianRows ?? [])
        .map(row => row.id)
        .filter(Boolean)

      let technicianProfiles: Technician[] = []

      if (technicianUserIds.length > 0) {
        const { data: userProfileRows, error: userProfileError } =
          await supabase
            .from('user_profiles')
            .select(`
              user_id,
              full_name,
              mobile_number
            `)
            .in('user_id', technicianUserIds)

        if (userProfileError) throw userProfileError

        const userProfileMap = new Map<
          string,
          {
            full_name: string | null
            mobile_number: string | null
          }
        >()

        ;(userProfileRows ?? []).forEach(row => {
          userProfileMap.set(row.user_id, {
            full_name: row.full_name ?? null,
            mobile_number: row.mobile_number ?? null,
          })
        })

        technicianProfiles = (technicianRows ?? [])
          .map(row => {
            const userProfile = userProfileMap.get(row.id)

            return {
              user_id: row.id,
              email: row.email ?? null,
              full_name: userProfile?.full_name ?? null,
              mobile_number: userProfile?.mobile_number ?? null,
            }
          })
          .filter(technician => {
            return Boolean(
              technician.full_name ||
                technician.email ||
                technician.mobile_number,
            )
          })
          .sort((a, b) => {
            const nameA =
              a.full_name ||
              a.email ||
              'Technician'

            const nameB =
              b.full_name ||
              b.email ||
              'Technician'

            return nameA.localeCompare(nameB)
          })
      }

      setTechnicians(technicianProfiles)

      const { data: requestRows, error: requestError } =
        await supabase
          .from('service_requests')
          .select(`
            id,
            request_type,
            issue_type,
            description,
            status,
            created_at,
            updated_at,
            client_id
          `)
          .eq('client_id', clientRow.id)
          .order('created_at', { ascending: false })

      if (requestError) throw requestError

      setRequests((requestRows ?? []) as ServiceRequest[])
    } catch (error) {
      console.error('Customer requests loading error:', error)

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to load your requests.'

      setErrorMessage(message)
      setRequests([])
      setTechnicians([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  async function refreshRequests() {
    setRefreshing(true)
    await loadRequests()
  }

  async function submitIssue() {
    try {
      setErrorMessage('')
      setSuccessMessage('')

      if (!client) {
        setErrorMessage(
          'Your customer account could not be found.',
        )
        return
      }

      const trimmedDescription = description.trim()

      if (!trimmedDescription) {
        setErrorMessage(
          'Please describe the problem you are currently experiencing.',
        )
        return
      }

      if (trimmedDescription.length < 10) {
        setErrorMessage(
          'Please provide a little more detail about the problem.',
        )
        return
      }

      setSubmitting(true)

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError

      if (!user) {
        throw new Error(
          'Your session has expired. Please log in again.',
        )
      }

      const { error: insertError } = await supabase
        .from('service_requests')
        .insert({
          user_id: user.id,
          client_id: client.id,
          request_type: 'repair',
          issue_type: selectedIssue,
          description: trimmedDescription,
          status: 'Pending',
        })

      if (insertError) throw insertError

      setDescription('')
      setSelectedIssue('No Internet Connection')
      setSuccessMessage(
        'Your issue has been submitted successfully. A technician will review your request.',
      )

      await loadRequests()
    } catch (error) {
      console.error('Issue submission error:', error)

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to submit your issue.'

      setErrorMessage(message)
    } finally {
      setSubmitting(false)
    }
  }

  function getStatusIcon(status: string) {
    const normalized = status.toLowerCase()

    if (
      normalized.includes('complete') ||
      normalized.includes('resolved') ||
      normalized.includes('closed')
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

    if (normalized.includes('cancel')) {
      return 'close-circle-outline' as const
    }

    return 'information-circle-outline' as const
  }

  function getStatusColor(status: string) {
    const normalized = status.toLowerCase()

    if (
      normalized.includes('complete') ||
      normalized.includes('resolved') ||
      normalized.includes('closed')
    ) {
      return colors.success
    }

    if (
      normalized.includes('progress') ||
      normalized.includes('ongoing')
    ) {
      return colors.accent
    }

    if (normalized.includes('cancel')) {
      return colors.danger
    }

    return colors.warning
  }

  function formatDate(value: string) {
    if (!value) return 'Date not available'

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return value

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <View style={styles.loadingIcon}>
          <Ionicons
            name="headset-outline"
            size={30}
            color={colors.accent}
          />
        </View>

        <ActivityIndicator
          size="large"
          color={colors.accent}
        />

        <Text style={styles.loadingText}>
          Loading your requests...
        </Text>
      </View>
    )
  }

  if (!client) {
    return (
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.emptyAccountContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshRequests}
              tintColor={colors.accent}
            />
          }
        >
          <View style={styles.restrictedIcon}>
            <Ionicons
              name="person-outline"
              size={31}
              color={colors.accent}
            />
          </View>

          <Text style={styles.restrictedTitle}>
            Customer Account Not Found
          </Text>

          <Text style={styles.restrictedText}>
            The customer profile connected to this account could not
            be found. Please refresh or contact the service team.
          </Text>

          {errorMessage ? (
            <GlassCard style={styles.errorCard}>
              <Ionicons
                name="alert-circle-outline"
                size={24}
                color={colors.danger}
              />

              <Text style={styles.errorTitle}>
                Unable to load account
              </Text>

              <Text style={styles.errorText}>
                {errorMessage}
              </Text>
            </GlassCard>
          ) : null}

          <Pressable
            onPress={refreshRequests}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Ionicons
              name="refresh-outline"
              size={17}
              color={colors.accent}
            />

            <Text style={styles.retryText}>
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
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshRequests}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>
              CUSTOMER SUPPORT
            </Text>

            <Text style={styles.title}>
              Report an Issue
            </Text>

            <Text style={styles.muted}>
              Tell us what is happening with your internet or service.
              Your report will be sent to the service team.
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <Ionicons
              name="headset-outline"
              size={23}
              color={colors.accent}
            />
          </View>
        </View>

        <GlassCard style={styles.customerCard}>
          <View style={styles.customerIcon}>
            <Ionicons
              name="person-outline"
              size={20}
              color={colors.accent}
            />
          </View>

          <View style={styles.customerInfo}>
            <Text style={styles.customerLabel}>
              CUSTOMER
            </Text>

            <Text style={styles.customerName}>
              {client.customer_name || 'Customer'}
            </Text>

            {client.account_id ? (
              <Text style={styles.customerAccount}>
                Account: {client.account_id}
              </Text>
            ) : null}
          </View>
        </GlassCard>

        {successMessage ? (
          <View style={styles.successBanner}>
            <View style={styles.successIcon}>
              <Ionicons
                name="checkmark-circle-outline"
                size={23}
                color={colors.success}
              />
            </View>

            <View style={styles.successContent}>
              <Text style={styles.successTitle}>
                Issue Submitted
              </Text>

              <Text style={styles.successText}>
                {successMessage}
              </Text>
            </View>

            <Pressable
              onPress={() => setSuccessMessage('')}
              hitSlop={10}
            >
              <Ionicons
                name="close-outline"
                size={20}
                color={colors.muted}
              />
            </Pressable>
          </View>
        ) : null}

        {errorMessage ? (
          <GlassCard style={styles.errorCard}>
            <View style={styles.errorHeader}>
              <Ionicons
                name="alert-circle-outline"
                size={22}
                color={colors.danger}
              />

              <Text style={styles.errorTitle}>
                Something went wrong
              </Text>
            </View>

            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </GlassCard>
        ) : null}

        <GlassCard style={styles.formCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>
                STEP 01
              </Text>

              <Text style={styles.sectionTitle}>
                What seems to be the problem?
              </Text>
            </View>

            <View style={styles.sectionNumber}>
              <Text style={styles.sectionNumberText}>
                01
              </Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>
            ISSUE TYPE
          </Text>

          <View style={styles.issueGrid}>
            {ISSUE_TYPES.map(issue => {
              const selected =
                selectedIssue === issue.label

              return (
                <Pressable
                  key={issue.label}
                  onPress={() =>
                    setSelectedIssue(issue.label)
                  }
                  style={({ pressed }) => [
                    styles.issueOption,
                    selected && styles.issueOptionSelected,
                    pressed && styles.issueOptionPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.issueIcon,
                      selected &&
                        styles.issueIconSelected,
                    ]}
                  >
                    <Ionicons
                      name={issue.icon}
                      size={18}
                      color={
                        selected
                          ? colors.accent
                          : colors.muted
                      }
                    />
                  </View>

                  <Text
                    style={[
                      styles.issueText,
                      selected && styles.issueTextSelected,
                    ]}
                  >
                    {issue.label}
                  </Text>

                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={17}
                      color={colors.accent}
                      style={styles.issueCheck}
                    />
                  ) : null}
                </Pressable>
              )
            })}
          </View>

          <View style={styles.formDivider} />

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>
                STEP 02
              </Text>

              <Text style={styles.sectionTitle}>
                Describe the problem
              </Text>
            </View>

            <View style={styles.sectionNumber}>
              <Text style={styles.sectionNumberText}>
                02
              </Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>
            DESCRIPTION
          </Text>

          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Tell us what you are currently experiencing..."
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
            maxLength={1000}
            editable={!submitting}
            style={styles.descriptionInput}
          />

          <View style={styles.characterRow}>
            <Text style={styles.helperText}>
              Please include useful details such as when the problem
              started, modem lights, or what you have already tried.
            </Text>

            <Text style={styles.characterCount}>
              {description.length}/1000
            </Text>
          </View>

          <Pressable
            onPress={submitIssue}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submitButton,
              submitting && styles.submitButtonDisabled,
              pressed &&
                !submitting &&
                styles.buttonPressed,
            ]}
          >
            {submitting ? (
              <>
                <ActivityIndicator
                  size="small"
                  color={colors.bg}
                />

                <Text style={styles.submitText}>
                  SUBMITTING...
                </Text>
              </>
            ) : (
              <>
                <Ionicons
                  name="paper-plane-outline"
                  size={18}
                  color={colors.bg}
                />

                <Text style={styles.submitText}>
                  SUBMIT ISSUE
                </Text>
              </>
            )}
          </Pressable>
        </GlassCard>

        <TechnicianCard
          client={client}
          technicians={technicians}
        />

        <View style={styles.historyHeader}>
          <View>
            <Text style={styles.eyebrow}>
              REQUEST HISTORY
            </Text>

            <Text style={styles.historyTitle}>
              My Requests
            </Text>
          </View>

          <View style={styles.historyCount}>
            <Text style={styles.historyCountText}>
              {requests.length}
            </Text>
          </View>
        </View>

        {requests.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="document-text-outline"
                size={30}
                color={colors.accent}
              />
            </View>

            <Text style={styles.cardTitle}>
              No requests yet
            </Text>

            <Text style={styles.cardText}>
              Issues you submit will appear here so you can keep track
              of their status.
            </Text>
          </GlassCard>
        ) : (
          requests.map(request => (
            <RequestCard
              key={request.id}
              request={request}
              getStatusIcon={getStatusIcon}
              getStatusColor={getStatusColor}
              formatDate={formatDate}
            />
          ))
        )}
      </ScrollView>
    </View>
  )
}

function TechnicianCard({
  client,
  technicians,
}: {
  client: Client
  technicians: Technician[]
}) {
  async function callTechnician(
    technician: Technician,
  ) {
    if (!technician.mobile_number) {
      Alert.alert(
        'Phone Number Not Available',
        'This technician does not have a phone number stored in their profile yet.',
      )
      return
    }

    const phoneNumber =
      technician.mobile_number.replace(/[^\d+]/g, '')

    const url = `tel:${phoneNumber}`

    try {
      const supported = await Linking.canOpenURL(url)

      if (!supported) {
        Alert.alert(
          'Unable to Call',
          'This device cannot open the phone dialer.',
        )
        return
      }

      await Linking.openURL(url)
    } catch (error) {
      console.error('Technician call error:', error)

      Alert.alert(
        'Unable to Call',
        'The phone dialer could not be opened.',
      )
    }
  }

  async function emailTechnician(
    technician: Technician,
  ) {
    if (!technician.email) {
      Alert.alert(
        'Email Address Not Available',
        'This technician does not have an email address stored in their profile yet.',
      )
      return
    }

    const technicianName =
      technician.full_name ||
      'Service Technician'

    const customerName =
      client.customer_name ||
      'Customer'

    const accountId =
      client.account_id ||
      'Not provided'

    const serviceArea =
      client.area ||
      'Not provided'

    const plan =
      client.plan_name ||
      'Not provided'

    const subject =
      `PKC BIZOFT Customer Support - ${accountId}`

    const body = [
      `Hello ${technicianName},`,
      '',
      'I am contacting you regarding my PKC BIZOFT service account.',
      '',
      'CUSTOMER INFORMATION',
      `Customer Name: ${customerName}`,
      `Account ID: ${accountId}`,
      `Service Area: ${serviceArea}`,
      `Plan: ${plan}`,
      '',
      'REASON FOR CONTACT',
      '[Please describe the reason for contacting the technician here.]',
      '',
      'ADDITIONAL DETAILS',
      '[Please add any additional information that may help resolve the issue.]',
      '',
      'Thank you.',
      customerName,
    ].join('\n')

    const gmailUrl =
      `https://mail.google.com/mail/?view=cm&fs=1` +
      `&to=${encodeURIComponent(technician.email)}` +
      `&su=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`

    try {
      await Linking.openURL(gmailUrl)
    } catch (error) {
      console.error('Gmail compose error:', error)

      const mailtoUrl =
        `mailto:${encodeURIComponent(technician.email)}` +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`

      try {
        await Linking.openURL(mailtoUrl)
      } catch {
        Alert.alert(
          'Unable to Open Email',
          'No email application could be opened on this device.',
        )
      }
    }
  }

  return (
    <GlassCard style={styles.technicianCard}>
      <View style={styles.technicianHeader}>
        <View style={styles.technicianHeaderIcon}>
          <Ionicons
            name="construct-outline"
            size={20}
            color={colors.accent}
          />
        </View>

        <View style={styles.technicianHeaderText}>
          <Text style={styles.sectionEyebrow}>
            SERVICE TEAM
          </Text>

          <Text style={styles.technicianTitle}>
            Your Technicians
          </Text>
        </View>
      </View>

      <Text style={styles.technicianDescription}>
        These are the technician accounts currently registered in the
        service system.
      </Text>

      {technicians.length > 0 ? (
        <View style={styles.technicianList}>
          {technicians.map((technician, index) => {
            const displayName =
              technician.full_name ||
              technician.email ||
              `Technician ${index + 1}`

            return (
              <View
                key={technician.user_id}
                style={styles.technicianRow}
              >
                <View style={styles.technicianAvatar}>
                  <Ionicons
                    name="person-outline"
                    size={17}
                    color={colors.accent}
                  />
                </View>

                <View style={styles.technicianInfo}>
                  <Text style={styles.technicianName}>
                    {displayName}
                  </Text>

                  <Text style={styles.technicianRole}>
                    SERVICE TECHNICIAN
                  </Text>

                  {technician.mobile_number ? (
                    <View style={styles.technicianContactLine}>
                      <Ionicons
                        name="call-outline"
                        size={12}
                        color={colors.muted}
                      />

                      <Text style={styles.technicianContactText}>
                        {technician.mobile_number}
                      </Text>
                    </View>
                  ) : null}

                  {technician.email ? (
                    <View style={styles.technicianContactLine}>
                      <Ionicons
                        name="mail-outline"
                        size={12}
                        color={colors.muted}
                      />

                      <Text
                        style={styles.technicianContactText}
                        numberOfLines={1}
                      >
                        {technician.email}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.contactActions}>
                  <Pressable
                    onPress={() =>
                      callTechnician(technician)
                    }
                    style={({ pressed }) => [
                      styles.contactButton,
                      pressed && styles.contactButtonPressed,
                    ]}
                    hitSlop={5}
                  >
                    <Ionicons
                      name="call-outline"
                      size={17}
                      color={colors.accent}
                    />
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      emailTechnician(technician)
                    }
                    style={({ pressed }) => [
                      styles.contactButton,
                      pressed && styles.contactButtonPressed,
                    ]}
                    hitSlop={5}
                  >
                    <Ionicons
                      name="mail-outline"
                      size={17}
                      color={colors.accent}
                    />
                  </Pressable>
                </View>
              </View>
            )
          })}
        </View>
      ) : (
        <View style={styles.noTechnicianBox}>
          <Ionicons
            name="information-circle-outline"
            size={19}
            color={colors.muted}
          />

          <Text style={styles.noTechnicianText}>
            No technician accounts are currently available in the
            system.
          </Text>
        </View>
      )}

      <View style={styles.contactNotice}>
        <Ionicons
          name="information-circle-outline"
          size={16}
          color={colors.accent}
        />

        <Text style={styles.contactNoticeText}>
          Call opens the phone dialer. Email opens a Gmail compose
          window with the technician's address and customer information
          already prepared. The message is not sent automatically.
        </Text>
      </View>
    </GlassCard>
  )
}

function RequestCard({
  request,
  getStatusIcon,
  getStatusColor,
  formatDate,
}: {
  request: ServiceRequest
  getStatusIcon: (
    status: string,
  ) => keyof typeof Ionicons.glyphMap
  getStatusColor: (status: string) => string
  formatDate: (value: string) => string
}) {
  const statusColor = getStatusColor(request.status)

  return (
    <GlassCard style={styles.requestCard}>
      <View style={styles.requestTopRow}>
        <View style={styles.requestIcon}>
          <Ionicons
            name="document-text-outline"
            size={20}
            color={colors.accent}
          />
        </View>

        <View style={styles.requestHeaderInfo}>
          <Text
            style={styles.requestIssue}
            numberOfLines={2}
          >
            {request.issue_type ||
              request.request_type ||
              'Service Request'}
          </Text>

          <Text style={styles.requestDate}>
            {formatDate(request.created_at)}
          </Text>
        </View>

        <View
          style={[
            styles.statusBadge,
            {
              borderColor: `${statusColor}55`,
              backgroundColor: `${statusColor}12`,
            },
          ]}
        >
          <Ionicons
            name={getStatusIcon(request.status)}
            size={13}
            color={statusColor}
          />

          <Text
            style={[
              styles.statusText,
              {
                color: statusColor,
              },
            ]}
          >
            {request.status.toUpperCase()}
          </Text>
        </View>
      </View>

      {request.description ? (
        <>
          <View style={styles.requestDivider} />

          <Text style={styles.requestDescriptionLabel}>
            DESCRIPTION
          </Text>

          <Text style={styles.requestDescription}>
            {request.description}
          </Text>
        </>
      ) : null}

      <View style={styles.requestFooter}>
        <Ionicons
          name="time-outline"
          size={14}
          color={colors.muted}
        />

        <Text style={styles.requestFooterText}>
          Submitted {formatDate(request.created_at)}
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
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.18)',
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
    paddingBottom: 120,
  },

  emptyAccountContent: {
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
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.18)',
  },

  restrictedTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 18,
  },

  restrictedText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 340,
    marginTop: 8,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
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
    fontSize: 29,
    fontWeight: '900',
    marginTop: 5,
  },

  muted: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },

  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.18)',
  },

  customerCard: {
    padding: 15,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },

  customerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.08)',
    marginRight: 12,
  },

  customerInfo: {
    flex: 1,
  },

  customerLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  customerName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 3,
  },

  customerAccount: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 3,
  },

  successBanner: {
    borderWidth: 1,
    borderColor: 'rgba(54,224,161,0.22)',
    backgroundColor: 'rgba(54,224,161,0.07)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  successIcon: {
    marginRight: 10,
  },

  successContent: {
    flex: 1,
    paddingRight: 8,
  },

  successTitle: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '900',
  },

  successText: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  errorCard: {
    padding: 18,
    marginBottom: 15,
    borderColor: 'rgba(255,92,122,0.24)',
  },

  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  errorTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },

  errorText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 7,
  },

  retryButton: {
    marginTop: 16,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(34,211,238,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.22)',
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

  formCard: {
    padding: 18,
    marginBottom: 18,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  sectionEyebrow: {
    color: colors.accent,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.3,
  },

  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 4,
  },

  sectionNumber: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.16)',
  },

  sectionNumberText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900',
  },

  fieldLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 9,
  },

  issueGrid: {
    gap: 8,
  },

  issueOption: {
    minHeight: 53,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.input,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },

  issueOptionSelected: {
    borderColor: 'rgba(34,211,238,0.42)',
    backgroundColor: 'rgba(34,211,238,0.08)',
  },

  issueOptionPressed: {
    opacity: 0.7,
  },

  issueIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(129,149,168,0.07)',
    marginRight: 10,
  },

  issueIconSelected: {
    backgroundColor: 'rgba(34,211,238,0.10)',
  },

  issueText: {
    flex: 1,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },

  issueTextSelected: {
    color: colors.text,
  },

  issueCheck: {
    marginLeft: 7,
  },

  formDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 20,
  },

  descriptionInput: {
    minHeight: 145,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 13,
    paddingVertical: 13,
    fontSize: 12,
    lineHeight: 19,
  },

  characterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 7,
  },

  helperText: {
    flex: 1,
    color: colors.muted,
    fontSize: 9,
    lineHeight: 14,
    paddingRight: 10,
  },

  characterCount: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
  },

  submitButton: {
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 17,
  },

  submitButtonDisabled: {
    opacity: 0.55,
  },

  submitText: {
    color: colors.bg,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  technicianCard: {
    padding: 17,
    marginBottom: 24,
  },

  technicianHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  technicianHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.08)',
    marginRight: 11,
  },

  technicianHeaderText: {
    flex: 1,
  },

  technicianTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 3,
  },

  technicianDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 11,
  },

  technicianList: {
    marginTop: 13,
    gap: 8,
  },

  technicianRow: {
    minHeight: 82,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.input,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },

  technicianAvatar: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.08)',
    marginRight: 10,
  },

  technicianInfo: {
    flex: 1,
    minWidth: 0,
  },

  technicianName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },

  technicianRole: {
    color: colors.muted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginTop: 3,
  },

  technicianContactLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 5,
  },

  technicianContactText: {
    flex: 1,
    color: colors.muted,
    fontSize: 9,
  },

  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginLeft: 8,
  },

  contactButton: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.18)',
  },

  contactButtonPressed: {
    opacity: 0.55,
    transform: [{ scale: 0.94 }],
  },

  noTechnicianBox: {
    marginTop: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(129,149,168,0.05)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },

  noTechnicianText: {
    flex: 1,
    color: colors.muted,
    fontSize: 10,
    lineHeight: 16,
  },

  contactNotice: {
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },

  contactNoticeText: {
    flex: 1,
    color: colors.muted,
    fontSize: 9,
    lineHeight: 14,
  },

  historyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  historyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },

  historyCount: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.16)',
  },

  historyCountText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
  },

  emptyCard: {
    padding: 21,
    marginBottom: 14,
  },

  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.08)',
  },

  cardTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 13,
  },

  cardText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
  },

  requestCard: {
    padding: 15,
    marginBottom: 12,
  },

  requestTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  requestIcon: {
    width: 41,
    height: 41,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.08)',
    marginRight: 10,
  },

  requestHeaderInfo: {
    flex: 1,
    paddingRight: 7,
  },

  requestIssue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },

  requestDate: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 4,
  },

  statusBadge: {
    maxWidth: 105,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  statusText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  requestDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 13,
  },

  requestDescriptionLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 5,
  },

  requestDescription: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 17,
  },

  requestFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 13,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },

  requestFooterText: {
    color: colors.muted,
    fontSize: 9,
    marginLeft: 6,
  },

  buttonPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.98 }],
  },
})