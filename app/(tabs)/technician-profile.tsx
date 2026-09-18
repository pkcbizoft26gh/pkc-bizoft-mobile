import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'

import { supabase } from '@/lib/supabase'
import { colors, radii } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'

type TechnicianProfile = {
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

type LocationRow = {
  code: string
  name: string
  location_type: string
}

export default function TechnicianProfileScreen() {
  const [loading, setLoading] = useState(true)

  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')

  const [profile, setProfile] =
    useState<TechnicianProfile | null>(null)

  const [phoneNumber, setPhoneNumber] = useState('')

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
        setEmail(user.email ?? '')

        /*
         * Confirm the authenticated user's role.
         *
         * This screen is specifically for technicians.
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

        if (roleData?.role === 'customer') {
          router.replace('/profile')
          return
        }

        const {
          data: technicianProfile,
          error: technicianProfileError
        } = await supabase
          .from('user_profiles')
          .select(
            'full_name, purok, barangay_code, city_municipality_code, province_code, region_code, approval_status, birthday, gender'
          )
          .eq('user_id', user.id)
          .maybeSingle()

        if (technicianProfileError) {
          console.error(
            'Technician profile error:',
            technicianProfileError
          )
        }

        if (technicianProfile) {
          setProfile(
            technicianProfile as TechnicianProfile
          )

          const locationCodes = [
            technicianProfile.region_code,
            technicianProfile.province_code,
            technicianProfile.city_municipality_code,
            technicianProfile.barangay_code
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
                  technicianProfile.region_code,
                  'region'
                )
              )

              setProvinceName(
                getLocationName(
                  technicianProfile.province_code,
                  'province'
                )
              )

              setCityName(
                getLocationName(
                  technicianProfile.city_municipality_code,
                  'city_municipality'
                )
              )

              setBarangayName(
                getLocationName(
                  technicianProfile.barangay_code,
                  'barangay'
                )
              )
            }
          }
        }

        /*
         * Technician phone number.
         *
         * This is read using clients.user_id only.
         *
         * It does NOT load customer account information,
         * plans, service areas, or customer-specific data.
         *
         * If a technician does not have a clients row,
         * the phone simply remains "Not configured".
         */
        const {
          data: linkedClient,
          error: linkedClientError
        } = await supabase
          .from('clients')
          .select('mobile_number')
          .eq('user_id', user.id)
          .maybeSingle()

        if (linkedClientError) {
          console.error(
            'Technician phone error:',
            linkedClientError
          )
        }

        if (linkedClient?.mobile_number) {
          setPhoneNumber(
            linkedClient.mobile_number
          )
        } else {
          setPhoneNumber('')
        }
      } catch (error) {
        console.error(
          'Technician profile loading error:',
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
      profile?.approval_status?.toUpperCase() ??
      'PENDING'
    )
  }

  function getInitial() {
    const name =
      profile?.full_name?.trim()

    if (!name) {
      return 'T'
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
          Loading technician profile...
        </Text>
      </View>
    )
  }

  const displayName =
    profile?.full_name?.trim() ||
    'Name not configured'

  const statusLabel = getStatusLabel()

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
              Technician Profile
            </Text>

            <Text style={styles.subtitle}>
              Your technician account information
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <Ionicons
              name="construct-outline"
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

                <View style={styles.technicianBadge}>
                  <Text style={styles.roleText}>
                    TECHNICIAN
                  </Text>
                </View>
              </View>

              <Text
                style={styles.email}
                numberOfLines={1}
              >
                {email ||
                  'Email not configured'}
              </Text>
            </View>
          </View>
        </GlassCard>

        <Text style={styles.sectionTitle}>
          TECHNICIAN INFORMATION
        </Text>

        <GlassCard style={styles.card}>
          <InfoRow
            icon="person-outline"
            label="Full Name"
            value={displayName}
          />

          <InfoRow
            icon="mail-outline"
            label="Email"
            value={
              email ||
              'Not configured'
            }
          />

          <InfoRow
            icon="finger-print-outline"
            label="User ID"
            value={
              userId ||
              'Not available'
            }
            small
          />

          <InfoRow
            icon="calendar-outline"
            label="Birthday"
            value={formatBirthday(
              profile?.birthday ?? null
            )}
          />

          <InfoRow
            icon="hourglass-outline"
            label="Age"
            value={calculateAge(
              profile?.birthday ?? null
            )}
          />

          <InfoRow
            icon="male-female-outline"
            label="Gender"
            value={
              profile?.gender?.trim() ||
              'Not configured'
            }
          />

          <InfoRow
            icon="call-outline"
            label="Phone Number"
            value={
              phoneNumber ||
              'Not configured'
            }
            last
          />
        </GlassCard>

        <Text style={styles.sectionTitle}>
          TECHNICIAN LOCATION
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
          TECHNICIAN STATUS
        </Text>

        <GlassCard style={styles.statusCard}>
          <View
            style={[
              styles.statusIndicator,
              statusLabel === 'ACTIVE'
                ? styles.statusActive
                : styles.statusPending
            ]}
          />

          <View style={styles.statusContent}>
            <Text
              style={[
                styles.statusTitle,
                statusLabel === 'ACTIVE'
                  ? styles.statusTitleActive
                  : styles.statusTitlePending
              ]}
            >
              {statusLabel}
            </Text>

            <Text style={styles.statusDescription}>
              {statusLabel === 'ACTIVE'
                ? 'Your technician account is active and ready for work.'
                : 'Your technician account is currently awaiting approval.'}
            </Text>
          </View>

          <Ionicons
            name={
              statusLabel === 'ACTIVE'
                ? 'checkmark-circle-outline'
                : 'time-outline'
            }
            size={24}
            color={
              statusLabel === 'ACTIVE'
                ? colors.success
                : colors.accent
            }
          />
        </GlassCard>

        <GlassCard style={styles.appCard}>
          <View style={styles.appIcon}>
            <Ionicons
              name="construct-outline"
              size={21}
              color={colors.accent}
            />
          </View>

          <View style={styles.appInfo}>
            <Text style={styles.appTitle}>
              PKC BIZOFT
            </Text>

            <Text style={styles.appSubtitle}>
              TECHNICIAN account
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

        <Text style={styles.footer}>
          PKC BIZOFT MOBILE
        </Text>
      </ScrollView>
    </View>
  )
}

function InfoRow({
  icon,
  label,
  value,
  small = false,
  last = false
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
  small?: boolean
  last?: boolean
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
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg
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
    paddingTop: 58,
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

  technicianBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 99,
    borderWidth: 1,
    backgroundColor:
      'rgba(34,211,238,0.12)',
    borderColor:
      'rgba(34,211,238,0.28)'
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