import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import {
  useLocalSearchParams,
  useRouter,
} from 'expo-router'

import { Ionicons } from '@expo/vector-icons'

import { WebView } from 'react-native-webview'
import * as Location from 'expo-location'

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

export default function ClientDetailsScreen() {
  const router = useRouter()

  const params = useLocalSearchParams<{
    id?: string
  }>()

  const clientId = Array.isArray(params.id)
    ? params.id[0]
    : params.id

  const [client, setClient] =
    useState<Client | null>(null)

  const [repairs, setRepairs] =
    useState<Repair[]>([])

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [selectedLatitude, setSelectedLatitude] =
    useState<number | null>(null)

  const [selectedLongitude, setSelectedLongitude] =
    useState<number | null>(null)

  const [originalLatitude, setOriginalLatitude] =
    useState<number | null>(null)

  const [originalLongitude, setOriginalLongitude] =
    useState<number | null>(null)

  const [savingLocation, setSavingLocation] =
    useState(false)

  const [locationLoading, setLocationLoading] =
    useState(false)

  const [myLatitude, setMyLatitude] =
    useState<number | null>(null)

  const [myLongitude, setMyLongitude] =
    useState<number | null>(null)

  const mapWebViewRef =
    useRef<WebView>(null)

  const loadClient = useCallback(
    async () => {
      if (!clientId) {
        setError(
          'No client was selected.'
        )

        setLoading(false)
        setRefreshing(false)

        return
      }

      try {
        setError(null)

        const {
          data: { user },
        } =
          await supabase.auth.getUser()

        if (!user) {
          setError(
            'Your session has expired. Please log in again.'
          )

          setLoading(false)
          setRefreshing(false)

          return
        }

        const {
          data: clientData,
          error: clientError,
        } =
          await supabase
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
            .eq(
              'id',
              clientId
            )
            .maybeSingle()

        if (clientError) {
          throw clientError
        }

        if (!clientData) {
          setClient(null)
          setRepairs([])

          setError(
            'Client information could not be found.'
          )

          setLoading(false)
          setRefreshing(false)

          return
        }

        setClient(clientData)

        setSelectedLatitude(clientData.latitude)
        setSelectedLongitude(clientData.longitude)
        setOriginalLatitude(clientData.latitude)
        setOriginalLongitude(clientData.longitude)

        const {
          data: repairData,
          error: repairError,
        } =
          await supabase
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
              'client_id',
              clientId
            )
            .order(
              'created_at',
              {
                ascending: false,
              }
            )

        if (repairError) {
          console.warn(
            'Unable to load repair history:',
            repairError.message
          )

          setRepairs([])
        } else {
          setRepairs(
            repairData ?? []
          )
        }
      } catch (err: any) {
        console.error(
          'Client details error:',
          err
        )

        setError(
          err?.message ??
            'Unable to load client details.'
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [clientId]
  )

  useEffect(() => {
    loadClient()
  }, [loadClient])

  const onRefresh = async () => {
    setRefreshing(true)

    await loadClient()
  }

  const formatDate = (
    value: string | null
  ) => {
    if (!value) {
      return 'Not provided'
    }

    const date =
      new Date(value)

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return value
    }

    return date.toLocaleDateString(
      'en-US',
      {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }
    )
  }

  const formatShortDate = (
    value: string | null
  ) => {
    if (!value) {
      return 'Unknown date'
    }

    const date =
      new Date(value)

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return value
    }

    return date.toLocaleDateString(
      'en-US',
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }
    )
  }

  const getStatusColor = (
    status: string | null
  ) => {
    const normalized =
      status
        ?.toLowerCase()
        .trim()

    if (
      normalized === 'paid' ||
      normalized === 'completed' ||
      normalized === 'active' ||
      normalized === 'resolved'
    ) {
      return colors.success
    }

    if (
      normalized === 'due' ||
      normalized === 'pending' ||
      normalized === 'open'
    ) {
      return colors.medium
    }

    if (
      normalized === 'cancelled' ||
      normalized === 'failed' ||
      normalized === 'inactive'
    ) {
      return colors.danger
    }

    return colors.muted
  }

  const hasSelectedCoordinates =
    typeof selectedLatitude === 'number' &&
    typeof selectedLongitude === 'number'

  const locationHasChanged =
    hasSelectedCoordinates &&
    (
      selectedLatitude !== originalLatitude ||
      selectedLongitude !== originalLongitude
    )

  const locateMe = async () => {
    try {
      setLocationLoading(true)

      const {
        status,
      } = await Location.requestForegroundPermissionsAsync()

      if (status !== Location.PermissionStatus.GRANTED) {
        Alert.alert(
          'Location permission needed',
          'Allow PKC BIZOFT to access your phone location so the map can show where you are and help you navigate to the client.'
        )
        return
      }

      const position =
        await Location.getCurrentPositionAsync({
          accuracy:
            Location.Accuracy.High,
          mayShowUserSettingsDialog: true,
        })

      setMyLatitude(
        position.coords.latitude
      )

      setMyLongitude(
        position.coords.longitude
      )
    } catch (err: any) {
      console.error(
        'Locate me error:',
        err
      )

      Alert.alert(
        'Unable to locate you',
        err?.message ??
          'Your current phone location could not be determined. Make sure Location is enabled on your phone.'
      )
    } finally {
      setLocationLoading(false)
    }
  }

  const saveClientLocation = async (
    latitudeToSave?: number,
    longitudeToSave?: number
  ) => {
    if (!client) {
      return false
    }

    const nextLatitude =
      typeof latitudeToSave === 'number'
        ? latitudeToSave
        : selectedLatitude

    const nextLongitude =
      typeof longitudeToSave === 'number'
        ? longitudeToSave
        : selectedLongitude

    if (
      typeof nextLatitude !== 'number' ||
      typeof nextLongitude !== 'number'
    ) {
      return false
    }

    try {
      setSavingLocation(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        Alert.alert(
          'Session expired',
          'Please log in again before changing the client location.'
        )
        return false
      }

      const {
        error: updateError,
      } = await supabase
        .from('clients')
        .update({
          latitude: nextLatitude,
          longitude: nextLongitude,
        })
        .eq('id', client.id)

      if (updateError) {
        throw updateError
      }

      setSelectedLatitude(nextLatitude)
      setSelectedLongitude(nextLongitude)

      setClient((current) =>
        current
          ? {
              ...current,
              latitude: nextLatitude,
              longitude: nextLongitude,
            }
          : current
      )

      setOriginalLatitude(nextLatitude)
      setOriginalLongitude(nextLongitude)

      Alert.alert(
        'Location successfully saved',
        'The client location has been updated successfully in Supabase.'
      )

      return true
    } catch (err: any) {
      console.error(
        'Save client location error:',
        err
      )

      Alert.alert(
        'Unable to save location',
        err?.message ??
          'The new client coordinates could not be saved.'
      )

      return false
    } finally {
      setSavingLocation(false)
    }
  }

  const confirmClientLocationChange = (
    nextLatitude: number,
    nextLongitude: number,
    previousLatitude: number,
    previousLongitude: number
  ) => {
    Alert.alert(
      'Change Client Location?',
      'Are you sure you want to change the location here?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            mapWebViewRef.current?.injectJavaScript(`
              if (typeof window.resetClientMarker === 'function') {
                window.resetClientMarker(${previousLatitude}, ${previousLongitude});
              }
              true;
            `)
          },
        },
        {
          text: 'Yes, Change Location',
          onPress: async () => {
            const saved =
              await saveClientLocation(
                nextLatitude,
                nextLongitude
              )

            if (!saved) {
              mapWebViewRef.current?.injectJavaScript(`
                if (typeof window.resetClientMarker === 'function') {
                  window.resetClientMarker(${previousLatitude}, ${previousLongitude});
                }
                true;
              `)
            }
          },
        },
      ]
    )
  }

  const openMaps = async () => {
    if (!client) {
      return
    }

    const navigationLatitude =
      hasSelectedCoordinates
        ? selectedLatitude
        : client.latitude

    const navigationLongitude =
      hasSelectedCoordinates
        ? selectedLongitude
        : client.longitude

    let url = ''

    if (
      typeof navigationLatitude ===
        'number' &&
      typeof navigationLongitude ===
        'number'
    ) {
      url =
        `https://www.google.com/maps/dir/?api=1` +
        `&destination=${navigationLatitude},${navigationLongitude}`
    } else if (
      client.map_location
    ) {
      url =
        `https://www.google.com/maps/search/?api=1&query=` +
        encodeURIComponent(
          client.map_location
        )
    } else {
      Alert.alert(
        'Location unavailable',
        'This client does not have a map location yet.'
      )

      return
    }

    try {
      const supported =
        await Linking.canOpenURL(
          url
        )

      if (!supported) {
        Alert.alert(
          'Unable to open Maps',
          'No supported map application is available.'
        )

        return
      }

      await Linking.openURL(url)
    } catch (err) {
      console.error(
        'Open maps error:',
        err
      )

      Alert.alert(
        'Unable to open Maps',
        'The navigation application could not be opened.'
      )
    }
  }

  const mapHtml = useMemo(() => {
    if (
      typeof selectedLatitude !==
        'number' ||
      typeof selectedLongitude !==
        'number'
    ) {
      return null
    }

    return createLeafletMapHtml(
      selectedLatitude,
      selectedLongitude,
      client?.customer_name ??
        'Client',
      client?.map_location ??
        'Client Location',
      myLatitude,
      myLongitude
    )
  }, [
    selectedLatitude,
    selectedLongitude,
    client?.customer_name,
    client?.map_location,
    myLatitude,
    myLongitude,
  ])


  if (loading) {
    return (
      <View
        style={styles.loadingScreen}
      >
        <ActivityIndicator
          size="large"
          color={colors.accent}
        />

        <Text
          style={styles.loadingText}
        >
          Loading client details...
        </Text>
      </View>
    )
  }

  if (!client) {
    return (
      <View
        style={styles.errorScreen}
      >
        <View
          style={styles.errorIcon}
        >
          <Ionicons
            name="person-remove-outline"
            size={30}
            color={colors.danger}
          />
        </View>

        <Text
          style={styles.errorTitle}
        >
          Client Not Found
        </Text>

        <Text
          style={styles.errorText}
        >
          {error ??
            'The selected client could not be loaded.'}
        </Text>

        <Pressable
          onPress={() =>
            router.back()
          }
          style={({ pressed }) => [
            styles.backButtonLarge,
            pressed &&
              styles.buttonPressed,
          ]}
        >
          <Ionicons
            name="arrow-back"
            size={18}
            color={colors.accent}
          />

          <Text
            style={styles.backButtonText}
          >
            Go Back
          </Text>
        </Pressable>
      </View>
    )
  }

  const latitude =
    selectedLatitude

  const longitude =
    selectedLongitude

  const hasCoordinates =
    typeof latitude === 'number' &&
    typeof longitude === 'number'

  return (
    <View
      style={styles.container}
    >
      <ScrollView
        nestedScrollEnabled={true}
        directionalLockEnabled={true}
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={
          false
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={
              colors.accent
            }
          />
        }
      >
        {/* HEADER */}

        <View
          style={styles.header}
        >
          <Pressable
            onPress={() =>
              router.back()
            }
            style={({ pressed }) => [
              styles.backButton,
              pressed &&
                styles.buttonPressed,
            ]}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={colors.text}
            />
          </Pressable>

          <View
            style={
              styles.headerTextContainer
            }
          >
            <Text
              style={styles.headerTitle}
            >
              Client Details
            </Text>

            <Text
              style={styles.headerSubtitle}
            >
              Complete customer information
            </Text>
          </View>
        </View>

        {/* ERROR */}

        {error && (
          <View
            style={styles.warningCard}
          >
            <Ionicons
              name="warning-outline"
              size={20}
              color={colors.medium}
            />

            <Text
              style={styles.warningText}
            >
              {error}
            </Text>
          </View>
        )}

        {/* CLIENT HERO */}

        <GlassCard
          style={styles.heroCard}
        >
          <View
            style={styles.heroTop}
          >
            <View
              style={styles.avatar}
            >
              <Ionicons
                name="person"
                size={27}
                color={colors.accent}
              />
            </View>

            <View
              style={styles.heroIdentity}
            >
              <Text
                style={styles.clientName}
                numberOfLines={2}
              >
                {client.customer_name ??
                  'Unnamed Client'}
              </Text>

              <Text
                style={styles.accountNumber}
              >
                {client.account_id ??
                  'No account ID'}
              </Text>
            </View>
          </View>

          <View
            style={styles.statusRow}
          >
            <View
              style={[
                styles.statusBadge,
                {
                  borderColor:
                    getStatusColor(
                      client.account_status
                    ) + '45',
                  backgroundColor:
                    getStatusColor(
                      client.account_status
                    ) + '12',
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      getStatusColor(
                        client.account_status
                      ),
                  },
                ]}
              />

              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      getStatusColor(
                        client.account_status
                      ),
                  },
                ]}
              >
                {client.account_status ??
                  'Unknown'}
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                {
                  borderColor:
                    getStatusColor(
                      client.installation_status
                    ) + '45',
                  backgroundColor:
                    getStatusColor(
                      client.installation_status
                    ) + '12',
                },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={14}
                color={getStatusColor(
                  client.installation_status
                )}
              />

              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      getStatusColor(
                        client.installation_status
                      ),
                  },
                ]}
              >
                {client.installation_status ??
                  'Installation status unknown'}
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* SERVICE INFORMATION */}

        <Text
          style={styles.sectionTitle}
        >
          SERVICE INFORMATION
        </Text>

        <GlassCard
          style={styles.infoCard}
        >
          <InfoRow
            icon="wifi-outline"
            label="Internet Plan"
            value={
              client.plan_name ??
              'Not provided'
            }
          />

          <InfoDivider />

          <InfoRow
            icon="card-outline"
            label="Account ID"
            value={
              client.account_id ??
              'Not provided'
            }
          />

          <InfoDivider />

          <InfoRow
            icon="calendar-outline"
            label="Installation Date"
            value={formatDate(
              client.install_date
            )}
          />

          <InfoDivider />

          <InfoRow
            icon="location-outline"
            label="Service Area"
            value={
              client.area ??
              'Not provided'
            }
          />

          <InfoDivider />

          <InfoRow
            icon="checkmark-circle-outline"
            label="Installation Status"
            value={
              client.installation_status ??
              'Not provided'
            }
          />

          <InfoDivider />

          <InfoRow
            icon="wallet-outline"
            label="Account Status"
            value={
              client.account_status ??
              'Not provided'
            }
          />
        </GlassCard>

        {/* CONTACT & CONNECTION */}

        <Text
          style={styles.sectionTitle}
        >
          CONTACT & CONNECTION
        </Text>

        <GlassCard
          style={styles.infoCard}
        >
          <InfoRow
            icon="call-outline"
            label="Mobile Number"
            value={
              client.mobile_number ??
              'Not provided'
            }
          />

          <InfoDivider />

          <InfoRow
            icon="person-circle-outline"
            label="PPPoE Username"
            value={
              client.pppoe_name ??
              'Not provided'
            }
          />

          <InfoDivider />

          <InfoRow
            icon="construct-outline"
            label="Assigned Technicians"
            value={
              client.technicians ??
              'Not assigned'
            }
          />
        </GlassCard>

        {/* CLIENT LOCATION */}

        <Text
          style={styles.sectionTitle}
        >
          CLIENT LOCATION
        </Text>

        <GlassCard
          style={styles.locationCard}
        >
          <View
            style={styles.locationHeader}
          >
            <View
              style={styles.locationIcon}
            >
              <Ionicons
                name="location"
                size={22}
                color={colors.accent}
              />
            </View>

            <View
              style={
                styles.locationTextContainer
              }
            >
              <Text
                style={
                  styles.locationLabel
                }
              >
                Client Location
              </Text>

              <Text
                style={
                  styles.locationValue
                }
              >
                {client.map_location ??
                  'Location not provided'}
              </Text>
            </View>
          </View>

          {hasCoordinates ? (
            <>
              <View
                style={styles.mapWrapper}
              >
                <WebView
                  ref={mapWebViewRef}
                  originWhitelist={[
                    '*',
                  ]}
                  javaScriptEnabled={
                    true
                  }
                  domStorageEnabled={
                    true
                  }
                  scrollEnabled={
                    false
                  }
                  nestedScrollEnabled={
                    true
                  }
                  bounces={false}
                  overScrollMode="never"
                  showsVerticalScrollIndicator={
                    false
                  }
                  showsHorizontalScrollIndicator={
                    false
                  }
                  source={{
                    html:
                      mapHtml ??
                      '<html><body></body></html>',
                  }}
                  onMessage={(event) => {
                    try {
                      const message =
                        JSON.parse(
                          event.nativeEvent
                            .data
                        )

                      if (
                        message?.type ===
                          'markerMoveAttempt' &&
                        typeof message.latitude ===
                          'number' &&
                        typeof message.longitude ===
                          'number' &&
                        typeof message.previousLatitude ===
                          'number' &&
                        typeof message.previousLongitude ===
                          'number'
                      ) {
                        confirmClientLocationChange(
                          message.latitude,
                          message.longitude,
                          message.previousLatitude,
                          message.previousLongitude
                        )
                      }
                    } catch (messageError) {
                      console.warn(
                        'Map message error:',
                        messageError
                      )
                    }
                  }}
                  style={styles.map}
                  startInLoadingState={
                    true
                  }
                  renderLoading={() => (
                    <View
                      style={
                        styles.mapLoading
                      }
                    >
                      <ActivityIndicator
                        size="small"
                        color={
                          colors.accent
                        }
                      />

                      <Text
                        style={
                          styles.mapLoadingText
                        }
                      >
                        Loading map...
                      </Text>
                    </View>
                  )}
                />
              </View>

              <View
                style={
                  styles.mapLocationInfo
                }
              >
                <View
                  style={
                    styles.mapLocationInfoIcon
                  }
                >
                  <Ionicons
                    name="location"
                    size={16}
                    color={
                      colors.accent
                    }
                  />
                </View>

                <View
                  style={
                    styles.mapLocationInfoContent
                  }
                >
                  <Text
                    style={
                      styles.mapLocationInfoTitle
                    }
                  >
                    Client Pin Location
                  </Text>

                  <Text
                    style={
                      styles.mapLocationInfoAddress
                    }
                  >
                    {client.map_location ??
                      'Location not provided'}
                  </Text>
                </View>
              </View>

              <Text
                style={
                  styles.coordinateText
                }
              >
                {latitude.toFixed(6)}
                {'  •  '}
                {longitude.toFixed(6)}
              </Text>

              <View
                style={styles.mapHint}
              >
                <Ionicons
                  name="hand-left-outline"
                  size={15}
                  color={colors.accent}
                />

                <Text
                  style={styles.mapHintText}
                >
                  Drag the client pin to the exact house location.
                </Text>
              </View>

              <View
                style={styles.mapActions}
              >
                <Pressable
                  onPress={locateMe}
                  disabled={locationLoading}
                  style={({ pressed }) => [
                    styles.mapActionButton,
                    pressed &&
                      styles.mapActionButtonPressed,
                    locationLoading &&
                      styles.mapActionButtonDisabled,
                  ]}
                >
                  <View
                    style={
                      styles.mapActionIcon
                    }
                  >
                    {locationLoading ? (
                      <ActivityIndicator
                        size="small"
                        color={
                          colors.accent
                        }
                      />
                    ) : (
                      <Ionicons
                        name="locate-outline"
                        size={18}
                        color={
                          colors.accent
                        }
                      />
                    )}
                  </View>

                  <View
                    style={
                      styles.mapActionTextContainer
                    }
                  >
                    <Text
                      style={
                        styles.mapActionTitle
                      }
                    >
                      {locationLoading
                        ? 'Locating...'
                        : myLatitude !== null
                          ? 'Refresh My Location'
                          : 'Locate Me'}
                    </Text>

                    <Text
                      style={
                        styles.mapActionSubtitle
                      }
                    >
                      {myLatitude !== null
                        ? 'Your phone location is shown on the map'
                        : 'Show your phone position on the map'}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={17}
                    color={colors.muted}
                  />
                </Pressable>

                <View
                  style={styles.locationSaveStatus}
                >
                  <View
                    style={styles.locationSaveStatusIcon}
                  >
                    <Ionicons
                      name={
                        savingLocation
                          ? 'cloud-upload-outline'
                          : 'checkmark-circle-outline'
                      }
                      size={18}
                      color={colors.accent}
                    />
                  </View>

                  <View
                    style={
                      styles.mapActionTextContainer
                    }
                  >
                    <Text
                      style={styles.mapActionTitle}
                    >
                      {savingLocation
                        ? 'Saving New Location...'
                        : 'Location Changes Save Immediately'}
                    </Text>

                    <Text
                      style={styles.mapActionSubtitle}
                    >
                      Drag the client pin, then confirm the new location.
                    </Text>
                  </View>
                </View>
              </View>

              {myLatitude !== null &&
                myLongitude !== null && (
                  <View
                    style={
                      styles.navigationInfo
                    }
                  >
                    <View
                      style={
                        styles.navigationInfoIcon
                      }
                    >
                      <Ionicons
                        name="navigate-outline"
                        size={16}
                        color={
                          colors.accent
                        }
                      />
                    </View>

                    <View
                      style={
                        styles.navigationInfoContent
                      }
                    >
                      <Text
                        style={
                          styles.navigationInfoTitle
                        }
                      >
                        YOUR LOCATION IS SHOWN
                      </Text>

                      <Text
                        style={
                          styles.navigationInfoText
                        }
                      >
                        The blue marker is your phone. The client pin is the destination. Use Open Navigation below for turn-by-turn road directions.
                      </Text>
                    </View>
                  </View>
                )}
            </>
          ) : (
            <View
              style={
                styles.noCoordinates
              }
            >
              <View
                style={
                  styles.noCoordinatesIcon
                }
              >
                <Ionicons
                  name="map-outline"
                  size={25}
                  color={colors.muted}
                />
              </View>

              <Text
                style={
                  styles.noCoordinatesTitle
                }
              >
                Map coordinates unavailable
              </Text>

              <Text
                style={
                  styles.noCoordinatesText
                }
              >
                The client's address is available,
                but exact latitude and longitude
                have not been entered yet.
              </Text>
            </View>
          )}

          {!hasCoordinates && (
            <Pressable
              onPress={locateMe}
              disabled={locationLoading}
              style={({ pressed }) => [
                styles.mapsButton,
                pressed &&
                  styles.mapsButtonPressed,
              ]}
            >
              <View
                style={
                  styles.mapsButtonIcon
                }
              >
                {locationLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.accent}
                  />
                ) : (
                  <Ionicons
                    name="locate-outline"
                    size={18}
                    color={colors.accent}
                  />
                )}
              </View>

              <Text
                style={
                  styles.mapsButtonText
                }
              >
                {locationLoading
                  ? 'Locating You...'
                  : 'Locate Me'}
              </Text>

              <Ionicons
                name="chevron-forward"
                size={17}
                color={colors.muted}
              />
            </Pressable>
          )}

          <Pressable
            onPress={openMaps}
            style={({ pressed }) => [
              styles.mapsButton,
              pressed &&
                styles.mapsButtonPressed,
            ]}
          >
            <View
              style={
                styles.mapsButtonIcon
              }
            >
              <Ionicons
                name="navigate-outline"
                size={18}
                color={
                  colors.accent
                }
              />
            </View>

            <Text
              style={
                styles.mapsButtonText
              }
            >
              Open Navigation
            </Text>

            <Ionicons
              name="chevron-forward"
              size={17}
              color={colors.muted}
            />
          </Pressable>
        </GlassCard>

        {/* REPAIR HISTORY */}

        <View
          style={
            styles.sectionHeaderRow
          }
        >
          <Text
            style={
              styles.sectionTitleNoMargin
            }
          >
            REPAIR HISTORY
          </Text>

          <View
            style={styles.countBadge}
          >
            <Text
              style={
                styles.countBadgeText
              }
            >
              {repairs.length}
            </Text>
          </View>
        </View>

        {repairs.length === 0 ? (
          <GlassCard
            style={
              styles.emptyRepairCard
            }
          >
            <View
              style={styles.emptyIcon}
            >
              <Ionicons
                name="construct-outline"
                size={26}
                color={colors.muted}
              />
            </View>

            <Text
              style={styles.emptyTitle}
            >
              No Repair History
            </Text>

            <Text
              style={styles.emptyText}
            >
              No repair records have been
              recorded for this client yet.
            </Text>
          </GlassCard>
        ) : (
          repairs.map(
            (
              repair,
              index
            ) => (
              <GlassCard
                key={repair.id}
                style={[
                  styles.repairCard,
                  index ===
                    repairs.length - 1 &&
                    styles.lastRepairCard,
                ]}
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
                      name="construct"
                      size={18}
                      color={
                        colors.accent
                      }
                    />
                  </View>

                  <View
                    style={
                      styles.repairHeaderText
                    }
                  >
                    <Text
                      style={
                        styles.repairDate
                      }
                    >
                      {formatShortDate(
                        repair.repair_date
                      )}
                    </Text>

                    <Text
                      style={
                        styles.repairTechnician
                      }
                    >
                      {repair.technician ??
                        'Technician not specified'}
                    </Text>
                  </View>

                  {repair.status && (
                    <View
                      style={[
                        styles.repairStatus,
                        {
                          borderColor:
                            getStatusColor(
                              repair.status
                            ) + '45',
                          backgroundColor:
                            getStatusColor(
                              repair.status
                            ) + '12',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.repairStatusText,
                          {
                            color:
                              getStatusColor(
                                repair.status
                              ),
                          },
                        ]}
                      >
                        {
                          repair.status
                        }
                      </Text>
                    </View>
                  )}
                </View>

                {repair.problem_description && (
                  <View
                    style={
                      styles.repairDetail
                    }
                  >
                    <Text
                      style={
                        styles.repairDetailLabel
                      }
                    >
                      PROBLEM
                    </Text>

                    <Text
                      style={
                        styles.repairDetailText
                      }
                    >
                      {
                        repair.problem_description
                      }
                    </Text>
                  </View>
                )}

                {repair.resolution && (
                  <View
                    style={
                      styles.repairDetail
                    }
                  >
                    <Text
                      style={
                        styles.repairDetailLabel
                      }
                    >
                      RESOLUTION
                    </Text>

                    <Text
                      style={
                        styles.repairDetailText
                      }
                    >
                      {
                        repair.resolution
                      }
                    </Text>
                  </View>
                )}
              </GlassCard>
            )
          )
        )}

        {/* FOOTER */}

        <View
          style={styles.footer}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={15}
            color={colors.muted}
          />

          <Text
            style={styles.footerText}
          >
            PKC BIZOFT • Technician Client View
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

function createLeafletMapHtml(
  latitude: number,
  longitude: number,
  customerName: string,
  location: string,
  myLatitude: number | null,
  myLongitude: number | null
) {
  const safeCustomerName =
    customerName
      .replace(
        /&/g,
        '&amp;'
      )
      .replace(
        /</g,
        '&lt;'
      )
      .replace(
        />/g,
        '&gt;'
      )
      .replace(
        /"/g,
        '&quot;'
      )
      .replace(
        /'/g,
        '&#039;'
      )

  const safeLocation =
    location
      .replace(
        /&/g,
        '&amp;'
      )
      .replace(
        /</g,
        '&lt;'
      )
      .replace(
        />/g,
        '&gt;'
      )
      .replace(
        /"/g,
        '&quot;'
      )
      .replace(
        /'/g,
        '&#039;'
      )

  return `
<!DOCTYPE html>
<html>
<head>

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
  />

  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    crossorigin=""
  />

  <style>

    html,
    body,
    #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #101418;
    }

    .leaflet-container {
      touch-action: none;
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    .client-popup {
      min-width: 190px;
    }

    .client-popup-title {
      font-size: 14px;
      font-weight: 800;
      margin-bottom: 6px;
    }

    .client-popup-label {
      font-size: 10px;
      font-weight: 700;
      color: #777;
      text-transform: uppercase;
      margin-bottom: 3px;
    }

    .client-popup-location {
      font-size: 12px;
      line-height: 17px;
    }

  </style>

</head>

<body>

  <div id="map"></div>

  <script
    src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    crossorigin=""
  ></script>

  <script>

    const latitude =
      ${latitude};

    const longitude =
      ${longitude};

    const myLatitude =
      ${typeof myLatitude === 'number' ? myLatitude : 'null'};

    const myLongitude =
      ${typeof myLongitude === 'number' ? myLongitude : 'null'};

    /*
     * The map is centered directly on the
     * client's exact latitude/longitude.
     */
    const map =
      L.map(
        'map',
        {
          zoomControl: true,
          attributionControl: true,
          dragging: true,
          scrollWheelZoom: false,
          doubleClickZoom: true,
          touchZoom: true,
          boxZoom: false,
          keyboard: false
        }
      ).setView(
        [
          latitude,
          longitude
        ],
        17
      );

    /*
     * OpenStreetMap tiles.
     * No Google Maps API key is required.
     */
    /*
     * Esri World Imagery satellite tiles.
     * Satellite is the default map layer.
     */
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 20,
        attribution:
          'Tiles &copy; Esri'
      }
    ).addTo(map);

    /*
     * This marker represents the CLIENT'S
     * EXACT LOCATION.
     */
    const clientMarker =
      L.marker(
        [
          latitude,
          longitude
        ],
        {
          title:
            '${safeCustomerName}',
          draggable: true,
        }
      ).addTo(map);

    let previousClientLatitude =
      latitude;

    let previousClientLongitude =
      longitude;

    window.resetClientMarker =
      function(nextLatitude, nextLongitude) {
        previousClientLatitude =
          nextLatitude;

        previousClientLongitude =
          nextLongitude;

        clientMarker.setLatLng([
          nextLatitude,
          nextLongitude
        ]);

        if (routeLine) {
          const routeStart =
            routeLine.getLatLngs()[0];

          if (routeStart) {
            routeLine.setLatLngs([
              routeStart,
              [
                nextLatitude,
                nextLongitude
              ]
            ]);
          }
        }

        if (
          typeof myLatitude === 'number' &&
          typeof myLongitude === 'number'
        ) {
          loadRoadRoute(
            myLatitude,
            myLongitude,
            nextLatitude,
            nextLongitude
          );
        }
      };

    clientMarker.on(
      'dragend',
      function() {
        const position =
          clientMarker.getLatLng();

        const oldLatitude =
          previousClientLatitude;

        const oldLongitude =
          previousClientLongitude;

        window.ReactNativeWebView?.postMessage(
          JSON.stringify({
            type: 'markerMoveAttempt',
            latitude: position.lat,
            longitude: position.lng,
            previousLatitude: oldLatitude,
            previousLongitude: oldLongitude,
          })
        );

        previousClientLatitude =
          position.lat;

        previousClientLongitude =
          position.lng;
      }
    );

    let myMarker = null;
    let routeLine = null;

    if (
      typeof myLatitude === 'number' &&
      typeof myLongitude === 'number'
    ) {
      myMarker = L.circleMarker(
        [
          myLatitude,
          myLongitude
        ],
        {
          radius: 8,
          color: '#1d8cff',
          fillColor: '#1d8cff',
          fillOpacity: 0.95,
          weight: 3,
        }
      ).addTo(map);

      myMarker.bindPopup(
        '<div class="client-popup">' +
          '<div class="client-popup-title">' +
          'Your Phone' +
          '</div>' +
          '<div class="client-popup-location">' +
          'Current phone location' +
          '</div>' +
        '</div>'
      );

      routeLine =
        L.polyline(
          [
            [
              myLatitude,
              myLongitude
            ],
            [
              latitude,
              longitude
            ]
          ],
          {
            color: '#1d8cff',
            weight: 4,
            opacity: 0.55,
            dashArray: '8 8',
          }
        ).addTo(map);
    }

    async function loadRoadRoute(
      startLat,
      startLng,
      endLat,
      endLng
    ) {
      if (!routeLine) {
        return;
      }

      try {
        const response =
          await fetch(
            'https://router.project-osrm.org/route/v1/driving/' +
            startLng +
            ',' +
            startLat +
            ';' +
            endLng +
            ',' +
            endLat +
            '?overview=full&geometries=geojson'
          );

        if (!response.ok) {
          return;
        }

        const routeData =
          await response.json();

        const geometry =
          routeData?.routes?.[0]?.geometry?.coordinates;

        if (
          !Array.isArray(geometry) ||
          geometry.length < 2
        ) {
          return;
        }

        const routeCoordinates =
          geometry.map(
            function(point) {
              return [
                point[1],
                point[0]
              ];
            }
          );

        routeLine.setLatLngs(
          routeCoordinates
        );

        routeLine.setStyle({
          dashArray: null,
          opacity: 0.8,
        });
      } catch (routeError) {
        console.warn(
          'Unable to load road route:',
          routeError
        );
      }
    }

    if (
      typeof myLatitude === 'number' &&
      typeof myLongitude === 'number'
    ) {
      loadRoadRoute(
        myLatitude,
        myLongitude,
        latitude,
        longitude
      );
    }

    /*
     * Popup displayed when the client pin
     * is tapped.
     */
    clientMarker.bindPopup(
      '<div class="client-popup">' +
        '<div class="client-popup-title">' +
          '${safeCustomerName}' +
        '</div>' +

        '<div class="client-popup-label">' +
          'Client Location' +
        '</div>' +

        '<div class="client-popup-location">' +
          '${safeLocation}' +
        '</div>' +
      '</div>'
    );

    /*
     * When the client pin is clicked:
     *
     * 1. Center the map on the client.
     * 2. Zoom in closer.
     * 3. Open the client location popup.
     */
    clientMarker.on(
      'click',
      function() {
        map.setView(
          [
            latitude,
            longitude
          ],
          18,
          {
            animate: true
          }
        );

        clientMarker.openPopup();
      }
    );

    /*
     * Make sure Leaflet recalculates the
     * map dimensions after WebView loads.
     */
    setTimeout(
      function() {
        map.invalidateSize();

        map.setView(
          [
            latitude,
            longitude
          ],
          17
        );
      },
      300
    );

    setTimeout(
      function() {
        map.invalidateSize();
      },
      1000
    );

  </script>

</body>
</html>
`
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
}) {
  return (
    <View
      style={styles.infoRow}
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

function InfoDivider() {
  return (
    <View
      style={styles.infoDivider}
    />
  )
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        colors.bg,
    },

    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 40,
    },

    loadingScreen: {
      flex: 1,
      backgroundColor:
        colors.bg,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    loadingText: {
      marginTop: 12,
      color: colors.muted,
      fontSize: 13,
      fontWeight: '700',
    },

    errorScreen: {
      flex: 1,
      backgroundColor:
        colors.bg,
      alignItems: 'center',
      justifyContent:
        'center',
      paddingHorizontal: 30,
    },

    errorIcon: {
      width: 68,
      height: 68,
      borderRadius: 22,
      backgroundColor:
        colors.danger + '12',
      borderWidth: 1,
      borderColor:
        colors.danger + '30',
      alignItems: 'center',
      justifyContent:
        'center',
      marginBottom: 18,
    },

    errorTitle: {
      color: colors.text,
      fontSize: 21,
      fontWeight: '900',
      marginBottom: 8,
    },

    errorText: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      marginBottom: 22,
    },

    backButtonLarge: {
      minHeight: 46,
      paddingHorizontal: 18,
      borderRadius: 14,
      backgroundColor:
        colors.panel,
      borderWidth: 1,
      borderColor:
        colors.accent + '45',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    backButtonText: {
      color: colors.accent,
      fontSize: 13,
      fontWeight: '900',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 18,
    },

    backButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor:
        colors.panel,
      borderWidth: 1,
      borderColor:
        colors.line,
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 12,
    },

    buttonPressed: {
      opacity: 0.65,
      transform: [
        {
          scale: 0.98,
        },
      ],
    },

    headerTextContainer: {
      flex: 1,
    },

    headerTitle: {
      color: colors.text,
      fontSize: 21,
      fontWeight: '900',
    },

    headerSubtitle: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 3,
      fontWeight: '600',
    },

    warningCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor:
        colors.medium + '10',
      borderWidth: 1,
      borderColor:
        colors.medium + '30',
      borderRadius: 14,
      padding: 13,
      marginBottom: 14,
      gap: 9,
    },

    warningText: {
      flex: 1,
      color: colors.text,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
    },

    heroCard: {
      padding: 18,
      marginBottom: 20,
    },

    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    avatar: {
      width: 60,
      height: 60,
      borderRadius: 19,
      backgroundColor:
        colors.accent + '12',
      borderWidth: 1,
      borderColor:
        colors.accent + '30',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 13,
    },

    heroIdentity: {
      flex: 1,
    },

    clientName: {
      color: colors.text,
      fontSize: 19,
      fontWeight: '900',
      lineHeight: 24,
    },

    accountNumber: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: '800',
      marginTop: 4,
    },

    statusRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 17,
    },

    statusBadge: {
      minHeight: 30,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },

    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },

    statusText: {
      fontSize: 10,
      fontWeight: '900',
      textTransform:
        'uppercase',
    },

    sectionTitle: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.2,
      marginBottom: 9,
      marginLeft: 3,
    },

    sectionTitleNoMargin: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.2,
    },

    infoCard: {
      padding: 16,
      marginBottom: 20,
    },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 49,
    },

    infoIcon: {
      width: 36,
      height: 36,
      borderRadius: 11,
      backgroundColor:
        colors.accent + '10',
      borderWidth: 1,
      borderColor:
        colors.accent + '22',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 11,
    },

    infoContent: {
      flex: 1,
    },

    infoLabel: {
      color: colors.muted,
      fontSize: 9,
      fontWeight: '800',
      textTransform:
        'uppercase',
      letterSpacing: 0.5,
      marginBottom: 3,
    },

    infoValue: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '800',
      lineHeight: 18,
    },

    infoDivider: {
      height: 1,
      backgroundColor:
        colors.line,
      marginVertical: 5,
      marginLeft: 47,
    },

    locationCard: {
      padding: 16,
      marginBottom: 20,
    },

    locationHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 14,
    },

    locationIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor:
        colors.accent + '12',
      borderWidth: 1,
      borderColor:
        colors.accent + '28',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 11,
    },

    locationTextContainer: {
      flex: 1,
    },

    locationLabel: {
      color: colors.accent,
      fontSize: 9,
      fontWeight: '900',
      textTransform:
        'uppercase',
      letterSpacing: 0.6,
      marginBottom: 4,
    },

    locationValue: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '800',
      lineHeight: 19,
    },

    mapWrapper: {
      width: '100%',
      height: 300,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor:
        colors.line,
      position: 'relative',
      backgroundColor:
        colors.panel,
    },

    map: {
      width: '100%',
      height: '100%',
      backgroundColor:
        colors.panel,
    },

    mapLoading: {
      flex: 1,
      backgroundColor:
        colors.panel,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    mapLoadingText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 8,
    },

    mapHint: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      paddingHorizontal: 11,
      paddingVertical: 9,
      borderRadius: 12,
      backgroundColor:
        colors.accent + '08',
      borderWidth: 1,
      borderColor:
        colors.accent + '18',
      gap: 8,
    },

    mapHintText: {
      flex: 1,
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: '700',
    },

    mapActions: {
      marginTop: 10,
      gap: 8,
    },

    mapActionButton: {
      minHeight: 58,
      borderRadius: 14,
      backgroundColor:
        colors.panel,
      borderWidth: 1,
      borderColor:
        colors.accent + '35',
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
    },

    mapActionButtonPressed: {
      opacity: 0.65,
      backgroundColor:
        colors.accent + '08',
      transform: [
        {
          scale: 0.99,
        },
      ],
    },

    mapActionButtonDisabled: {
      opacity: 0.48,
    },

    mapActionIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor:
        colors.accent + '12',
      borderWidth: 1,
      borderColor:
        colors.accent + '25',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },

    saveLocationButton: {
      borderColor:
        colors.accent + '45',
    },

    locationSaveStatus: {
      minHeight: 70,
      borderRadius: 14,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.accent + '25',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      marginTop: 12,
    },

    locationSaveStatusIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: colors.accent + '12',
      borderWidth: 1,
      borderColor: colors.accent + '22',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },

    saveLocationIcon: {
      backgroundColor:
        colors.accent + '16',
    },

    mapActionTextContainer: {
      flex: 1,
    },

    mapActionTitle: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: '900',
    },

    mapActionSubtitle: {
      color: colors.muted,
      fontSize: 9,
      lineHeight: 14,
      fontWeight: '700',
      marginTop: 2,
    },

    navigationInfo: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: 9,
      padding: 10,
      borderRadius: 13,
      backgroundColor:
        colors.panel,
      borderWidth: 1,
      borderColor:
        colors.line,
    },

    navigationInfoIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor:
        colors.accent + '12',
      borderWidth: 1,
      borderColor:
        colors.accent + '25',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 9,
    },

    navigationInfoContent: {
      flex: 1,
    },

    navigationInfoTitle: {
      color: colors.accent,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.5,
      marginBottom: 3,
    },

    navigationInfoText: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: '600',
    },

    mapLocationInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 10,
      padding: 10,
      borderRadius: 13,
      backgroundColor:
        colors.panel,
      borderWidth: 1,
      borderColor:
        colors.line,
    },

    mapLocationInfoIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor:
        colors.accent + '12',
      borderWidth: 1,
      borderColor:
        colors.accent + '25',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 9,
    },

    mapLocationInfoContent: {
      flex: 1,
    },

    mapLocationInfoTitle: {
      color: colors.accent,
      fontSize: 9,
      fontWeight: '900',
      textTransform:
        'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },

    mapLocationInfoAddress: {
      color: colors.text,
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 16,
    },

    coordinateText: {
      color: colors.muted,
      fontSize: 9,
      fontWeight: '700',
      textAlign: 'right',
      marginTop: 6,
    },

    noCoordinates: {
      minHeight: 190,
      borderRadius: 18,
      backgroundColor:
        colors.panel,
      borderWidth: 1,
      borderColor:
        colors.line,
      alignItems: 'center',
      justifyContent:
        'center',
      paddingHorizontal: 25,
    },

    noCoordinatesIcon: {
      width: 54,
      height: 54,
      borderRadius: 17,
      backgroundColor:
        colors.line,
      alignItems: 'center',
      justifyContent:
        'center',
      marginBottom: 11,
    },

    noCoordinatesTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '900',
      textAlign: 'center',
    },

    noCoordinatesText: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
      marginTop: 6,
    },

    mapsButton: {
      minHeight: 48,
      borderRadius: 14,
      backgroundColor:
        colors.panel,
      borderWidth: 1,
      borderColor:
        colors.accent + '40',
      marginTop: 12,
      paddingHorizontal: 11,
      flexDirection: 'row',
      alignItems: 'center',
    },

    mapsButtonPressed: {
      opacity: 0.65,
      backgroundColor:
        colors.accent + '08',
      transform: [
        {
          scale: 0.99,
        },
      ],
    },

    mapsButtonIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor:
        colors.accent + '12',
      borderWidth: 1,
      borderColor:
        colors.accent + '25',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 9,
    },

    mapsButtonText: {
      flex: 1,
      color: colors.accent,
      fontSize: 12,
      fontWeight: '900',
    },

    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 9,
      marginLeft: 3,
    },

    countBadge: {
      minWidth: 24,
      height: 22,
      paddingHorizontal: 7,
      borderRadius: 8,
      backgroundColor:
        colors.accent + '12',
      borderWidth: 1,
      borderColor:
        colors.accent + '25',
      alignItems: 'center',
      justifyContent:
        'center',
      marginLeft: 8,
    },

    countBadgeText: {
      color: colors.accent,
      fontSize: 10,
      fontWeight: '900',
    },

    repairCard: {
      padding: 15,
      marginBottom: 10,
    },

    lastRepairCard: {
      marginBottom: 20,
    },

    repairHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    repairIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor:
        colors.accent + '10',
      borderWidth: 1,
      borderColor:
        colors.accent + '25',
      alignItems: 'center',
      justifyContent:
        'center',
      marginRight: 10,
    },

    repairHeaderText: {
      flex: 1,
    },

    repairDate: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '900',
    },

    repairTechnician: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '700',
      marginTop: 3,
    },

    repairStatus: {
      minHeight: 27,
      paddingHorizontal: 8,
      borderRadius: 9,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    repairStatusText: {
      fontSize: 9,
      fontWeight: '900',
      textTransform:
        'uppercase',
    },

    repairDetail: {
      marginTop: 13,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor:
        colors.line,
    },

    repairDetailLabel: {
      color: colors.muted,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.8,
      marginBottom: 4,
    },

    repairDetailText: {
      color: colors.text,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
    },

    emptyRepairCard: {
      padding: 22,
      alignItems: 'center',
      marginBottom: 20,
    },

    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor:
        colors.line,
      alignItems: 'center',
      justifyContent:
        'center',
      marginBottom: 12,
    },

    emptyTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '900',
    },

    emptyText: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
      marginTop: 5,
    },

    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'center',
      marginTop: 3,
      gap: 6,
    },

    footerText: {
      color: colors.muted,
      fontSize: 9,
      fontWeight: '700',
    },
  })