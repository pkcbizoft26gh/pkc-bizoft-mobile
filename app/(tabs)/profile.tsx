import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'

import { supabase } from '@/lib/supabase'
import { colors, radii } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'
import { BiometricToggle } from '@/components/BiometricToggle'
import { PasswordCard } from '@/components/ChangePasswordModal'

type UserProfile = {
  full_name: string | null
  purok: string | null
  barangay_code: string | null
  city_municipality_code: string | null
  province_code: string | null
  region_code: string | null
  approval_status: string | null
  birthday: string | null
  gender: string | null
}

type Client = {
  id: string
  customer_name: string | null
  email: string | null
  birth_date: string | null
  gender: string | null
  address: string | null
  mobile_number: string | null
  pppoe_name: string | null
  map_location: string | null
  latitude: number | null
  longitude: number | null
  technicians: string | null
  plan_name: string | null
  area: string | null
  installation_status: string | null
  account_status: string | null
  account_id: string | null
  referral_code: string | null
  user_id: string | null
}

type LocationRow = {
  code: string
  name: string
  location_type: string
}

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true)
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [userId, setUserId] = useState('')

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [client, setClient] = useState<Client | null>(null)

  const [regionName, setRegionName] = useState('')
  const [provinceName, setProvinceName] = useState('')
  const [cityName, setCityName] = useState('')
  const [barangayName, setBarangayName] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      setLoading(true)

      try {
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser()

        if (userError) {
          console.error('Auth error:', userError)
          return
        }

        if (!user) {
          router.replace('/login')
          return
        }

        if (!mounted) return

        setUserId(user.id)
        setLoginEmail(user.email ?? '')

        /*
         * CUSTOMER PROFILE
         *
         * This screen is intentionally the customer profile.
         *
         * Customer/service tracking information comes from clients.
         * Personal registration information comes from user_profiles.
         *
         * The two records are connected only through:
         *
         * clients.user_id = authenticated user's UUID
         *
         * No customer-name matching is performed.
         */
        const { data: roleData, error: roleError } =
          await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()

        if (roleError) {
          console.error('Role error:', roleError)
        }

        if (
          roleData?.role &&
          roleData.role !== 'customer'
        ) {
          console.warn(
            'Customer profile opened by role:',
            roleData.role
          )
        }

        const {
          data: userProfile,
          error: userProfileError
        } = await supabase
          .from('user_profiles')
          .select(
            'full_name, purok, barangay_code, city_municipality_code, province_code, region_code, approval_status, birthday, gender'
          )
          .eq('user_id', user.id)
          .maybeSingle()

        if (userProfileError) {
          console.error(
            'User profile error:',
            userProfileError
          )
        }

        if (userProfile) {
          setProfile(userProfile as UserProfile)

          const locationCodes = [
            userProfile.region_code,
            userProfile.province_code,
            userProfile.city_municipality_code,
            userProfile.barangay_code
          ].filter(Boolean)

          if (locationCodes.length > 0) {
            const {
              data: locations,
              error: locationError
            } = await supabase
              .from('ph_locations')
              .select(
                'code, name, location_type'
              )
              .in('code', locationCodes)

            if (locationError) {
              console.error(
                'Location error:',
                locationError
              )
            }

            if (locations) {
              const rows =
                locations as LocationRow[]

              const getLocationName = (
                code: string | null,
                type: string
              ) => {
                if (!code) return ''

                return (
                  rows.find(
                    row =>
                      row.code === code &&
                      row.location_type === type
                  )?.name ?? ''
                )
              }

              setRegionName(
                getLocationName(
                  userProfile.region_code,
                  'region'
                )
              )

              setProvinceName(
                getLocationName(
                  userProfile.province_code,
                  'province'
                )
              )

              setCityName(
                getLocationName(
                  userProfile.city_municipality_code,
                  'city_municipality'
                )
              )

              setBarangayName(
                getLocationName(
                  userProfile.barangay_code,
                  'barangay'
                )
              )
            }
          }
        }

        /*
         * CUSTOMER RECORD
         *
         * This loads the complete customer/service record
         * belonging to the authenticated customer.
         */
        const {
          data: clientData,
          error: clientError
        } = await supabase
          .from('clients')
          .select(
            'id, customer_name, email, birth_date, gender, address, mobile_number, pppoe_name, map_location, latitude, longitude, technicians, plan_name, area, installation_status, account_status, account_id, referral_code, user_id'
          )
          .eq('user_id', user.id)
          .maybeSingle()

        if (clientError) {
          console.error(
            'Customer record error:',
            clientError
          )
        }

        if (clientData) {
          setClient(clientData as Client)
        } else {
          setClient(null)
        }
      } catch (error) {
        console.error(
          'Profile loading error:',
          error
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      mounted = false
    }
  }, [])

  async function savePhone() {
    const clean = phoneInput.replace(/[\s-]/g, '')

    if (!/^(\+63|0)9\d{9}$/.test(clean)) {
      setPhoneError('Enter a valid mobile number, like 09123456789.')
      return
    }

    setSavingPhone(true)
    setPhoneError('')

    const { data, error } = await supabase.rpc('update_my_mobile', {
      p_mobile: clean
    })

    setSavingPhone(false)

    if (error) {
      setPhoneError(error.message)
      return
    }

    setClient(current =>
      current
        ? { ...current, mobile_number: String(data) }
        : current
    )
    setEditingPhone(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  function formatBirthday(value: string | null) {
    if (!value) {
      return 'Not configured'
    }

    const date = new Date(`${value}T00:00:00`)

    if (Number.isNaN(date.getTime())) {
      return 'Not configured'
    }

    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  function calculateAge(value: string | null) {
    if (!value) {
      return 'Not configured'
    }

    const birthday = new Date(
      `${value}T00:00:00`
    )

    if (Number.isNaN(birthday.getTime())) {
      return 'Not configured'
    }

    const today = new Date()

    let age =
      today.getFullYear() -
      birthday.getFullYear()

    const monthDifference =
      today.getMonth() -
      birthday.getMonth()

    if (
      monthDifference < 0 ||
      (
        monthDifference === 0 &&
        today.getDate() < birthday.getDate()
      )
    ) {
      age--
    }

    return age >= 0
      ? String(age)
      : 'Not configured'
  }

  function getStatusLabel() {
    return (
      client?.account_status?.trim().toUpperCase() ||
      profile?.approval_status?.trim().toUpperCase() ||
      'PENDING'
    )
  }

  function getInitial() {
    const name =
      client?.customer_name?.trim() ||
      profile?.full_name?.trim()

    if (!name) {
      return 'C'
    }

    return name.charAt(0).toUpperCase()
  }

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator
          size="large"
          color={colors.accent}
        />

        <Text style={styles.loadingText}>
          Loading profile...
        </Text>
      </View>
    )
  }

  const displayName =
    client?.customer_name?.trim() ||
    profile?.full_name?.trim() ||
    'Name not configured'

  const customerEmail =
    client?.email?.trim() ||
    loginEmail ||
    'Email not configured'

  const birthday =
    client?.birth_date ||
    profile?.birthday ||
    null

  const gender =
    client?.gender?.trim() ||
    profile?.gender?.trim() ||
    'Not configured'

  const phoneNumber =
    client?.mobile_number?.trim() ||
    'Not configured'

  const statusLabel = getStatusLabel()

  const address =
    client?.address?.trim() ||
    'Not configured'

  const mapLocation =
    client?.map_location?.trim() ||
    'Not configured'

  const technicians =
    client?.technicians?.trim() ||
    'Not assigned'

  const planName =
    client?.plan_name?.trim() ||
    'Not configured'

  const area =
    client?.area?.trim() ||
    'Not configured'

  const installationStatus =
    client?.installation_status?.trim() ||
    'Not configured'

  const accountId =
    client?.account_id?.trim() ||
    'Not assigned'

  const pppoeName =
    client?.pppoe_name?.trim() ||
    'Not configured'

  const referralCode =
    client?.referral_code?.trim() ||
    'Not configured'

  const coordinates =
    client?.latitude != null &&
    client?.longitude != null
      ? `${client.latitude}, ${client.longitude}`
      : 'Not configured'

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>
              PKC BIZOFT
            </Text>

            <Text style={styles.title}>
              Profile
            </Text>

            <Text style={styles.subtitle}>
              Your customer account information
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <Ionicons
              name="person-outline"
              size={22}
              color={colors.accent}
            />
          </View>
        </View>

        <GlassCard style={styles.identityCard}>
          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {getInitial()}
              </Text>
            </View>

            <View style={styles.identityDetails}>
              <View style={styles.nameRow}>
                <Text
                  style={styles.fullName}
                  numberOfLines={2}
                >
                  {displayName}
                </Text>

                <View style={styles.customerBadge}>
                  <Text style={styles.roleText}>
                    CUSTOMER
                  </Text>
                </View>
              </View>

              <Text
                style={styles.email}
                numberOfLines={2}
              >
                {customerEmail}
              </Text>
            </View>
          </View>
        </GlassCard>

        <Text style={styles.sectionTitle}>
          PERSONAL INFORMATION
        </Text>

        <GlassCard style={styles.card}>
          {loginEmail &&
          loginEmail.toLowerCase() !==
            customerEmail.toLowerCase() ? (
            <InfoRow
              icon="mail-open-outline"
              label="Login Email"
              value={loginEmail}
            />
          ) : null}

          <InfoRow
            icon="call-outline"
            label="Phone Number (GCash)"
            value={phoneNumber}
            last
            actionLabel={
              client?.mobile_number
                ? 'Edit'
                : 'Add'
            }
            onAction={() => {
              setPhoneInput(
                client?.mobile_number ?? ''
              )
              setPhoneError('')
              setEditingPhone(true)
            }}
          />
        </GlassCard>

        <Text style={styles.sectionTitle}>
          CUSTOMER INFORMATION
        </Text>

        <GlassCard style={styles.card}>
          <InfoRow
            icon="card-outline"
            label="Account ID"
            value={accountId}
          />

          <InfoRow
            icon="gift-outline"
            label="Referral Code"
            value={referralCode}
          />

          <InfoRow
            icon="people-outline"
            label="Assigned Technicians"
            value={technicians}
            small
            last
          />
        </GlassCard>

        <Text style={styles.sectionTitle}>
          SERVICE INFORMATION
        </Text>

        <GlassCard style={styles.card}>
          <InfoRow
            icon="wifi-outline"
            label="Plan"
            value={planName}
          />

          <InfoRow
            icon="build-outline"
            label="Installation Status"
            value={installationStatus}
            last
          />
        </GlassCard>

        <Text style={styles.sectionTitle}>
          HOUSE LOCATION
        </Text>

        <GlassCard style={styles.card}>
          <InfoRow
            icon="home-outline"
            label="Purok"
            value={
              profile?.purok?.trim() ||
              'Not configured'
            }
          />

          <InfoRow
            icon="location-outline"
            label="Barangay"
            value={
              barangayName ||
              'Not configured'
            }
          />

          <InfoRow
            icon="business-outline"
            label="City / Municipality"
            value={
              cityName ||
              'Not configured'
            }
          />

          <InfoRow
            icon="map-outline"
            label="Province"
            value={
              provinceName ||
              'Not configured'
            }
          />

          <InfoRow
            icon="globe-outline"
            label="Region"
            value={
              regionName ||
              'Not configured'
            }
            last
          />
        </GlassCard>

        <Text style={styles.sectionTitle}>
          ACCOUNT STATUS
        </Text>

        <GlassCard style={styles.statusCard}>
          <View
            style={[
              styles.statusIndicator,
              statusLabel === 'PAID' ||
              statusLabel === 'ACTIVE' ||
              statusLabel === 'COMPLETED'
                ? styles.statusActive
                : styles.statusPending
            ]}
          />

          <View style={styles.statusContent}>
            <Text
              style={[
                styles.statusTitle,
                statusLabel === 'PAID' ||
                statusLabel === 'ACTIVE' ||
                statusLabel === 'COMPLETED'
                  ? styles.statusTitleActive
                  : styles.statusTitlePending
              ]}
            >
              {statusLabel}
            </Text>

            <Text style={styles.statusDescription}>
              {statusLabel === 'PAID' ||
              statusLabel === 'ACTIVE' ||
              statusLabel === 'COMPLETED'
                ? 'Your customer account is active.'
                : 'Your customer account is currently awaiting attention.'}
            </Text>
          </View>

          <Ionicons
            name={
              statusLabel === 'PAID' ||
              statusLabel === 'ACTIVE' ||
              statusLabel === 'COMPLETED'
                ? 'checkmark-circle-outline'
                : 'time-outline'
            }
            size={24}
            color={
              statusLabel === 'PAID' ||
              statusLabel === 'ACTIVE' ||
              statusLabel === 'COMPLETED'
                ? colors.success
                : colors.accent
            }
          />
        </GlassCard>

        <PasswordCard />
        <BiometricToggle />

        <GlassCard style={styles.appCard}>
          <View style={styles.appIcon}>
            <Ionicons
              name="shield-checkmark-outline"
              size={21}
              color={colors.accent}
            />
          </View>

          <View style={styles.appInfo}>
            <Text style={styles.appTitle}>
              PKC BIZOFT
            </Text>

            <Text style={styles.appSubtitle}>
              CUSTOMER account
            </Text>
          </View>
        </GlassCard>

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            styles.signOutButton,
            pressed &&
              styles.signOutPressed
          ]}
        >
          <Ionicons
            name="log-out-outline"
            size={20}
            color="#FB7185"
          />

          <Text style={styles.signOutText}>
            SIGN OUT
          </Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={editingPhone}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingPhone(false)}
      >
        <KeyboardAvoidingView
          style={styles.phoneBackdrop}
          behavior={
            Platform.OS === 'ios' ? 'padding' : undefined
          }
        >
          <View style={styles.phoneCard}>
            <Text style={styles.phoneTitle}>
              Your GCash number
            </Text>

            <Text style={styles.phoneHint}>
              This is the mobile number used for GCash and
              other online payments.
            </Text>

            <TextInput
              value={phoneInput}
              onChangeText={text =>
                setPhoneInput(
                  text.replace(/[^0-9+]/g, '').slice(0, 13)
                )
              }
              placeholder="09123456789"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              style={styles.phoneInput}
              autoFocus
            />

            {phoneError ? (
              <Text style={styles.phoneError}>
                {phoneError}
              </Text>
            ) : null}

            <View style={styles.phoneButtons}>
              <Pressable
                onPress={() => setEditingPhone(false)}
                style={[
                  styles.phoneButton,
                  styles.phoneButtonGhost
                ]}
              >
                <Text
                  style={[
                    styles.phoneButtonText,
                    styles.phoneButtonGhostText
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={savePhone}
                disabled={savingPhone}
                style={[
                  styles.phoneButton,
                  savingPhone && { opacity: 0.6 }
                ]}
              >
                {savingPhone ? (
                  <ActivityIndicator
                    size="small"
                    color="#00141B"
                  />
                ) : (
                  <Text style={styles.phoneButtonText}>
                    Save
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

function InfoRow({
  icon,
  label,
  value,
  small = false,
  last = false,
  actionLabel,
  onAction
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
  small?: boolean
  last?: boolean
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <View
      style={[
        styles.infoRow,
        last &&
          styles.infoRowLast
      ]}
    >
      <View style={styles.infoIcon}>
        <Ionicons
          name={icon}
          size={18}
          color={colors.accent}
        />
      </View>

      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>
          {label}
        </Text>

        <Text
          style={[
            styles.infoValue,
            small &&
              styles.infoValueSmall
          ]}
        >
          {value}
        </Text>
      </View>

      {onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            styles.editChip,
            pressed && { opacity: 0.7 }
          ]}
          hitSlop={8}
        >
          <Text style={styles.editChipText}>
            {actionLabel || 'Edit'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  editChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.cardLight
  },

  editChipText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800'
  },

  phoneBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(2, 8, 14, 0.88)'
  },

  phoneCard: {
    padding: 22,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.panel
  },

  phoneTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6
  },

  phoneHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14
  },

  phoneInput: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.cardLight
  },

  phoneError: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 10
  },

  phoneButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16
  },

  phoneButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentDark
  },

  phoneButtonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.line
  },

  phoneButtonText: {
    color: '#00141B',
    fontSize: 14,
    fontWeight: '900'
  },

  phoneButtonGhostText: {
    color: colors.muted
  },

  root: {
    flex: 1,
    backgroundColor: 'transparent'
  },

  loadingRoot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center'
  },

  loadingText: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 12
  },

  content: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 110
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20
  },

  headerText: {
    flex: 1
  },

  eyebrow: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8
  },

  title: {
    color: colors.text,
    fontSize: 29,
    fontWeight: '900',
    marginTop: 4
  },

  subtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4
  },

  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor:
      'rgba(34,211,238,0.18)'
  },

  identityCard: {
    padding: 17,
    marginBottom: 25
  },

  identityRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },

  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      colors.accent,
    marginRight: 14
  },

  avatarText: {
    color: '#001018',
    fontSize: 24,
    fontWeight: '900'
  },

  identityDetails: {
    flex: 1
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8
  },

  fullName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    flexShrink: 1
  },

  customerBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 99,
    borderWidth: 1,
    backgroundColor:
      'rgba(52,211,153,0.12)',
    borderColor:
      'rgba(52,211,153,0.28)'
  },

  roleText: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7
  },

  email: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6
  },

  sectionTitle: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginBottom: 9,
    marginLeft: 2
  },

  card: {
    paddingHorizontal: 15,
    marginBottom: 24
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth:
      StyleSheet.hairlineWidth,
    borderBottomColor:
      'rgba(255,255,255,0.07)'
  },

  infoRowLast: {
    borderBottomWidth: 0
  },

  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(34,211,238,0.07)',
    marginRight: 12
  },

  infoText: {
    flex: 1
  },

  infoLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4
  },

  infoValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },

  infoValueSmall: {
    fontSize: 11,
    lineHeight: 16
  },

  statusCard: {
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24
  },

  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12
  },

  statusActive: {
    backgroundColor:
      colors.success
  },

  statusPending: {
    backgroundColor:
      colors.accent
  },

  statusContent: {
    flex: 1
  },

  statusTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1
  },

  statusTitleActive: {
    color: colors.success
  },

  statusTitlePending: {
    color: colors.accent
  },

  statusDescription: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4
  },

  appCard: {
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18
  },

  appIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(34,211,238,0.08)',
    marginRight: 12
  },

  appInfo: {
    flex: 1
  },

  appTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800'
  },

  appSubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3
  },

  signOutButton: {
    height: 52,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor:
      'rgba(251,113,133,0.08)',
    borderWidth: 1,
    borderColor:
      'rgba(251,113,133,0.22)'
  },

  signOutPressed: {
    opacity: 0.65
  },

  signOutText: {
    color: '#FB7185',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1
  },

  footer: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 1.5,
    marginTop: 18,
    opacity: 0.55
  }
})
