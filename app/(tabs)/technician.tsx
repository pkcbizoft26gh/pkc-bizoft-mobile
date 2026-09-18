import React, {
  useCallback,
  useEffect,
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

import { colors } from '../../constants/theme'
import { GlassCard } from '../../components/GlassCard'
import { supabase } from '@/lib/supabase'

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
  mobile_number: string | null
  pppoe_name: string | null
  map_location: string | null
  technicians: string | null
  latitude: number | null
  longitude: number | null
}

type Repair = {
  id: string
  client_id: string | null
  technician: string | null
  repair_date: string | null
  problem_description: string | null
  resolution: string | null
  status: string | null
  created_at: string | null
}

export default function TechnicianDashboard() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [userEmail, setUserEmail] = useState('')
  const [fullName, setFullName] = useState('Technician')

  const [clients, setClients] = useState<Client[]>([])
  const [repairs, setRepairs] = useState<Repair[]>([])

  const [errorMessage, setErrorMessage] = useState('')

  const loadDashboard = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) {
          setLoading(true)
        }

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

        setUserEmail(user.email ?? '')

        const {
          data: userProfile,
          error: userProfileError,
        } = await supabase
          .from('user_profiles')
          .select('full_name')
          .eq('user_id', user.id)
          .maybeSingle()

        if (userProfileError) {
          console.warn(
            'Unable to load user profile:',
            userProfileError.message
          )
        }

        if (userProfile?.full_name) {
          setFullName(userProfile.full_name)
        } else if (user.email) {
          setFullName(user.email.split('@')[0])
        }

        const {
          data: clientData,
          error: clientsError,
        } = await supabase
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
            mobile_number,
            pppoe_name,
            map_location,
            technicians,
            latitude,
            longitude
          `)
          .order('customer_name', {
            ascending: true,
          })

        if (clientsError) {
          throw clientsError
        }

        setClients(
          (clientData ?? []) as Client[]
        )

        const {
          data: repairData,
          error: repairsError,
        } = await supabase
          .from('repair_records')
          .select(`
            id,
            client_id,
            technician,
            repair_date,
            problem_description,
            resolution,
            status,
            created_at
          `)
          .eq(
            'technician_user_id',
            user.id
          )
          .order('created_at', {
            ascending: false,
          })

        if (repairsError) {
          console.warn(
            'Unable to load repair records:',
            repairsError.message
          )

          setRepairs([])
        } else {
          setRepairs(
            (repairData ?? []) as Repair[]
          )
        }
      } catch (error: any) {
        console.error(
          'Technician dashboard error:',
          error
        )

        setErrorMessage(
          error?.message ??
            'Unable to load technician dashboard.'
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [router]
  )

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const handleRefresh = () => {
    setRefreshing(true)
    loadDashboard(false)
  }

  const handleSignOut = async () => {
    const { error } =
      await supabase.auth.signOut()

    if (error) {
      Alert.alert(
        'Sign out failed',
        error.message
      )
      return
    }

    router.replace('/login')
  }

  const firstName =
    fullName.trim().split(' ')[0] ||
    'Technician'

  const pendingRepairs = repairs.filter(
    (repair) =>
      repair.status?.toLowerCase() ===
        'pending' ||
      repair.status?.toLowerCase() ===
        'in progress'
  ).length

  const activeClients = clients.filter(
    (client) =>
      client.account_status?.toLowerCase() ===
      'active'
  ).length

  const installedClients = clients.filter(
    (client) =>
      client.installation_status
        ?.toLowerCase() === 'installed'
  ).length

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Image
          source={require('../../assets/images/pkc-transparent.png')}
          style={styles.loadingLogo}
          resizeMode="contain"
        />

        <ActivityIndicator
          size="large"
          color={colors.accent}
        />

        <Text style={styles.loadingText}>
          Loading technician dashboard...
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* HEADER */}

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image
              source={require('../../assets/images/pkc-transparent.png')}
              style={styles.logo}
              resizeMode="contain"
            />

            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>
                PKC BIZOFT • FIELD OPERATIONS
              </Text>

              <Text style={styles.title}>
                Hello, {firstName} 👋
              </Text>

              <Text
                style={styles.email}
                numberOfLines={1}
              >
                {userEmail}
              </Text>
            </View>
          </View>

          <View style={styles.onlineBadge}>
            <View
              style={styles.onlineDot}
            />

            <Text
              style={styles.onlineText}
            >
              ONLINE
            </Text>
          </View>
        </View>

        {/* ERROR */}

        {errorMessage ? (
          <GlassCard style={styles.errorCard}>
            <View style={styles.errorRow}>
              <Ionicons
                name="alert-circle-outline"
                size={24}
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
                  Dashboard error
                </Text>

                <Text
                  style={
                    styles.errorMessage
                  }
                >
                  {errorMessage}
                </Text>
              </View>
            </View>
          </GlassCard>
        ) : null}

        {/* OVERVIEW */}

        <Text style={styles.sectionTitle}>
          Operations Overview
        </Text>

        <View style={styles.statsGrid}>
          <GlassCard style={styles.statCard}>
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor:
                    colors.accent + '18',
                },
              ]}
            >
              <Ionicons
                name="people-outline"
                size={21}
                color={colors.accent}
              />
            </View>

            <Text style={styles.statNumber}>
              {clients.length}
            </Text>

            <Text style={styles.statLabel}>
              Customers
            </Text>
          </GlassCard>

          <GlassCard style={styles.statCard}>
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor:
                    colors.success + '18',
                },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={21}
                color={colors.success}
              />
            </View>

            <Text style={styles.statNumber}>
              {activeClients}
            </Text>

            <Text style={styles.statLabel}>
              Active
            </Text>
          </GlassCard>

          <GlassCard style={styles.statCard}>
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor:
                    colors.accent + '18',
                },
              ]}
            >
              <Ionicons
                name="wifi-outline"
                size={21}
                color={colors.accent}
              />
            </View>

            <Text style={styles.statNumber}>
              {installedClients}
            </Text>

            <Text style={styles.statLabel}>
              Installed
            </Text>
          </GlassCard>

          <GlassCard style={styles.statCard}>
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor:
                    colors.medium + '18',
                },
              ]}
            >
              <Ionicons
                name="construct-outline"
                size={21}
                color={colors.medium}
              />
            </View>

            <Text style={styles.statNumber}>
              {pendingRepairs}
            </Text>

            <Text style={styles.statLabel}>
              Repairs
            </Text>
          </GlassCard>
        </View>

        {/* CUSTOMERS */}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              All Customers
            </Text>

            <Text style={styles.sectionSubtitle}>
              Tap View to open the complete customer
              record.
            </Text>
          </View>

          <View
            style={styles.countBadge}
          >
            <Text
              style={styles.countBadgeText}
            >
              {clients.length}
            </Text>
          </View>
        </View>

        {clients.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Ionicons
              name="people-outline"
              size={38}
              color={colors.muted}
            />

            <Text
              style={styles.emptyTitle}
            >
              No customers found
            </Text>

            <Text
              style={styles.emptyText}
            >
              There are currently no customers
              available for this technician.
            </Text>
          </GlassCard>
        ) : (
          clients.map((client) => (
            <GlassCard
              key={client.id}
              style={styles.clientCard}
            >
              <View
                style={styles.clientTop}
              >
                <View
                  style={
                    styles.clientIcon
                  }
                >
                  <Ionicons
                    name="person-outline"
                    size={22}
                    color={colors.accent}
                  />
                </View>

                <View
                  style={
                    styles.clientMain
                  }
                >
                  <Text
                    style={
                      styles.clientName
                    }
                    numberOfLines={2}
                  >
                    {client.customer_name ||
                      'Unnamed Customer'}
                  </Text>

                  <Text
                    style={
                      styles.clientAccount
                    }
                  >
                    {client.account_id ||
                      'No account ID'}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        client.account_status
                          ?.toLowerCase() ===
                        'active'
                          ? colors.success +
                            '18'
                          : colors.muted +
                            '18',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          client.account_status
                            ?.toLowerCase() ===
                          'active'
                            ? colors.success
                            : colors.muted,
                      },
                    ]}
                  />

                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          client.account_status
                            ?.toLowerCase() ===
                          'active'
                            ? colors.success
                            : colors.muted,
                      },
                    ]}
                  >
                    {client.account_status ||
                      'Unknown'}
                  </Text>
                </View>
              </View>

              <View
                style={styles.clientInfoRow}
              >
                <View
                  style={
                    styles.clientInfoItem
                  }
                >
                  <Text
                    style={
                      styles.clientInfoLabel
                    }
                  >
                    PLAN
                  </Text>

                  <Text
                    style={
                      styles.clientInfoValue
                    }
                    numberOfLines={1}
                  >
                    {client.plan_name ||
                      'Not specified'}
                  </Text>
                </View>

                <View
                  style={
                    styles.clientInfoItem
                  }
                >
                  <Text
                    style={
                      styles.clientInfoLabel
                    }
                  >
                    AREA
                  </Text>

                  <Text
                    style={
                      styles.clientInfoValue
                    }
                    numberOfLines={1}
                  >
                    {client.area ||
                      'Not specified'}
                  </Text>
                </View>
              </View>

              <View
                style={styles.locationRow}
              >
                <Ionicons
                  name="location-outline"
                  size={17}
                  color={colors.muted}
                />

                <Text
                  style={styles.locationText}
                  numberOfLines={2}
                >
                  {client.map_location ||
                    'Location not specified'}
                </Text>
              </View>

              {/* VIEW BUTTON */}

              <Pressable
                style={({ pressed }) => [
                  styles.viewButton,
                  pressed &&
                    styles.viewButtonPressed,
                ]}
                onPress={() =>
                  router.push({
                    pathname:
                      '/client-details',
                    params: {
                      id: client.id,
                    },
                  })
                }
              >
                <View
                  style={
                    styles.viewButtonIcon
                  }
                >
                  <Ionicons
                    name="eye-outline"
                    size={18}
                    color={colors.accent}
                  />
                </View>

                <Text
                  style={styles.viewButtonText}
                >
                  View Complete Details
                </Text>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.accent}
                />
              </Pressable>
            </GlassCard>
          ))
        )}

        {/* RECENT REPAIRS */}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Recent Repair Activity
            </Text>

            <Text style={styles.sectionSubtitle}>
              Your latest assigned repair records.
            </Text>
          </View>
        </View>

        {repairs.length === 0 ? (
          <GlassCard
            style={styles.emptyRepairCard}
          >
            <Ionicons
              name="construct-outline"
              size={32}
              color={colors.muted}
            />

            <Text
              style={
                styles.emptyRepairTitle
              }
            >
              No repair activity
            </Text>

            <Text
              style={styles.emptyRepairText}
            >
              No repair records are currently
              assigned to you.
            </Text>
          </GlassCard>
        ) : (
          repairs.slice(0, 5).map((repair) => {
            const client =
              clients.find(
                (item) =>
                  item.id ===
                  repair.client_id
              )

            return (
              <GlassCard
                key={repair.id}
                style={
                  styles.repairCard
                }
              >
                <View
                  style={
                    styles.repairHeader
                  }
                >
                  <View
                    style={
                      styles.repairIcon
                    }
                  >
                    <Ionicons
                      name="construct-outline"
                      size={19}
                      color={
                        colors.accent
                      }
                    />
                  </View>

                  <View
                    style={
                      styles.repairMain
                    }
                  >
                    <Text
                      style={
                        styles.repairClient
                      }
                      numberOfLines={1}
                    >
                      {client
                        ?.customer_name ||
                        'Customer'}
                    </Text>

                    <Text
                      style={
                        styles.repairDate
                      }
                    >
                      {repair.repair_date ||
                        'No date'}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.repairStatus,
                      {
                        backgroundColor:
                          repair.status
                            ?.toLowerCase() ===
                          'completed'
                            ? colors.success +
                              '18'
                            : colors.medium +
                              '18',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.repairStatusText,
                        {
                          color:
                            repair.status
                              ?.toLowerCase() ===
                            'completed'
                              ? colors.success
                              : colors.medium,
                        },
                      ]}
                    >
                      {repair.status ||
                        'Pending'}
                    </Text>
                  </View>
                </View>

                <Text
                  style={
                    styles.repairProblem
                  }
                  numberOfLines={2}
                >
                  {repair.problem_description ||
                    'No problem description'}
                </Text>
              </GlassCard>
            )
          })
        )}

        {/* SIGN OUT */}

        <Pressable
          style={({ pressed }) => [
            styles.signOutButton,
            pressed &&
              styles.signOutButtonPressed,
          ]}
          onPress={handleSignOut}
        >
          <Ionicons
            name="log-out-outline"
            size={19}
            color={colors.danger}
          />

          <Text
            style={styles.signOutText}
          >
            Sign Out
          </Text>
        </Pressable>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  scrollContent: {
    padding: 18,
    paddingTop: 24,
    paddingBottom: 40,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  loadingLogo: {
    width: 150,
    height: 80,
    marginBottom: 24,
  },

  loadingText: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 14,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
  },

  headerLeft: {
    flexDirection: 'row',
    flex: 1,
    minWidth: 0,
  },

  logo: {
    width: 52,
    height: 52,
    marginRight: 12,
  },

  headerText: {
    flex: 1,
    minWidth: 0,
  },

  eyebrow: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 5,
  },

  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },

  email: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },

  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor:
      colors.success + '18',
    marginLeft: 8,
  },

  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: 5,
  },

  onlineText: {
    color: colors.success,
    fontSize: 9,
    fontWeight: '900',
  },

  errorCard: {
    marginBottom: 20,
    borderColor: colors.danger + '55',
  },

  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  errorContent: {
    flex: 1,
    marginLeft: 10,
  },

  errorTitle: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
  },

  errorMessage: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 26,
    marginBottom: 12,
  },

  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 5,
  },

  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },

  countBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor:
      colors.accent + '18',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },

  countBadgeText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '900',
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  statCard: {
    width: '48.2%',
    marginBottom: 10,
    padding: 15,
  },

  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
  },

  statNumber: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
  },

  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },

  clientCard: {
    marginBottom: 12,
    padding: 15,
  },

  clientTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  clientIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor:
      colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  clientMain: {
    flex: 1,
    minWidth: 0,
    paddingRight: 7,
  },

  clientName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },

  clientAccount: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },

  statusText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  clientInfoRow: {
    flexDirection: 'row',
    marginTop: 17,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 13,
  },

  clientInfoItem: {
    flex: 1,
  },

  clientInfoLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  clientInfoValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 13,
  },

  locationText: {
    flex: 1,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginLeft: 7,
  },

  /*
   * ------------------------------------------------------------
   * VIEW CUSTOMER BUTTON
   * ------------------------------------------------------------
   *
   * Dark glass-style button instead of a bright blue block.
   */

  viewButton: {
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.accent + '45',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    marginTop: 15,
  },

  viewButtonPressed: {
    opacity: 0.65,
    transform: [
      {
        scale: 0.99,
      },
    ],
    backgroundColor:
      colors.accent + '10',
  },

  viewButtonIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor:
      colors.accent + '14',
    borderWidth: 1,
    borderColor:
      colors.accent + '25',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  viewButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
    flex: 1,
  },

  emptyCard: {
    alignItems: 'center',
    padding: 28,
    marginBottom: 8,
  },

  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 12,
  },

  emptyText: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 5,
  },

  repairCard: {
    marginBottom: 10,
    padding: 14,
  },

  repairHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  repairIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor:
      colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  repairMain: {
    flex: 1,
  },

  repairClient: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },

  repairDate: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },

  repairStatus: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  repairStatusText: {
    fontSize: 9,
    fontWeight: '900',
  },

  repairProblem: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
  },

  emptyRepairCard: {
    alignItems: 'center',
    padding: 25,
  },

  emptyRepairTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 10,
  },

  emptyRepairText: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },

  signOutButton: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.danger + '55',
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 25,
  },

  signOutButtonPressed: {
    opacity: 0.65,
  },

  signOutText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 8,
  },

  bottomSpace: {
    height: 25,
  },
})