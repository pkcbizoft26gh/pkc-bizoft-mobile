import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

import { supabase } from '../lib/supabase'
import { colors, radii } from '../constants/theme'

type LocationOption = {
  code: string
  name: string
  location_type: string
  parent_code: string | null
}

type PickerType =
  | 'region'
  | 'province'
  | 'city'
  | 'barangay'
  | null

const LOGO = require('../assets/images/pkc-transparent.png')

function LocationPicker({
  visible,
  title,
  options,
  selectedCode,
  loading,
  onClose,
  onSelect,
}: {
  visible: boolean
  title: string
  options: LocationOption[]
  selectedCode: string
  loading: boolean
  onClose: () => void
  onSelect: (option: LocationOption) => void
}) {
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!visible) {
      setSearch('')
    }
  }, [visible])

  const filteredOptions = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase()

    if (!cleanSearch) {
      return options
    }

    return options.filter((option) =>
      option.name.toLowerCase().includes(cleanSearch)
    )
  }, [options, search])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>{title}</Text>

              <Text style={styles.modalCount}>
                {options.length.toLocaleString()} available
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.modalClose,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="close"
                size={22}
                color={colors.text}
              />
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Ionicons
              name="search"
              size={18}
              color={colors.muted}
            />

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={`Search ${title.toLowerCase()}...`}
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch('')}
                style={styles.clearSearch}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
            )}
          </View>

          {loading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator
                size="large"
                color={colors.accent}
              />

              <Text style={styles.modalLoadingText}>
                Loading locations...
              </Text>
            </View>
          ) : filteredOptions.length === 0 ? (
            <View style={styles.emptyLocations}>
              <Ionicons
                name="location-outline"
                size={42}
                color={colors.muted}
              />

              <Text style={styles.emptyLocationTitle}>
                No locations found
              </Text>

              <Text style={styles.emptyLocationText}>
                Try another search.
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.locationList}
              renderItem={({ item }) => {
                const selected = item.code === selectedCode

                return (
                  <Pressable
                    onPress={() => onSelect(item)}
                    style={({ pressed }) => [
                      styles.locationOption,
                      selected && styles.locationOptionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.locationIcon}>
                      <Ionicons
                        name={
                          selected
                            ? 'checkmark-circle'
                            : 'location-outline'
                        }
                        size={20}
                        color={
                          selected
                            ? colors.accent
                            : colors.muted
                        }
                      />
                    </View>

                    <View style={styles.locationOptionText}>
                      <Text
                        style={[
                          styles.locationName,
                          selected &&
                            styles.locationNameSelected,
                        ]}
                      >
                        {item.name}
                      </Text>

                      <Text style={styles.locationCode}>
                        {item.code}
                      </Text>
                    </View>
                  </Pressable>
                )
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  )
}

function LocationField({
  label,
  value,
  placeholder,
  disabled,
  onPress,
}: {
  label: string
  value: string
  placeholder: string
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.locationField,
          disabled && styles.locationFieldDisabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <View style={styles.locationFieldLeft}>
          <Ionicons
            name="location-outline"
            size={19}
            color={
              disabled
                ? colors.muted
                : colors.accent
            }
          />

          <Text
            numberOfLines={1}
            style={[
              styles.locationFieldText,
              !value && styles.locationPlaceholder,
            ]}
          >
            {value || placeholder}
          </Text>
        </View>

        <Ionicons
          name="chevron-down"
          size={18}
          color={colors.muted}
        />
      </Pressable>
    </View>
  )
}

export default function SignupScreen() {
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [purok, setPurok] = useState('')

  const [regions, setRegions] = useState<LocationOption[]>([])
  const [provinces, setProvinces] = useState<LocationOption[]>([])
  const [cities, setCities] = useState<LocationOption[]>([])
  const [barangays, setBarangays] = useState<LocationOption[]>([])

  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedProvince, setSelectedProvince] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedBarangay, setSelectedBarangay] = useState('')

  const [picker, setPicker] = useState<PickerType>(null)

  const [loadingRegions, setLoadingRegions] = useState(false)
  const [loadingChildren, setLoadingChildren] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const selectedRegionObject = useMemo(
    () =>
      regions.find(
        (item) => item.code === selectedRegion
      ),
    [regions, selectedRegion]
  )

  const selectedProvinceObject = useMemo(
    () =>
      provinces.find(
        (item) => item.code === selectedProvince
      ),
    [provinces, selectedProvince]
  )

  const selectedCityObject = useMemo(
    () =>
      cities.find(
        (item) => item.code === selectedCity
      ),
    [cities, selectedCity]
  )

  const selectedBarangayObject = useMemo(
    () =>
      barangays.find(
        (item) => item.code === selectedBarangay
      ),
    [barangays, selectedBarangay]
  )

  /*
   * NCR and any other region without provinces
   * can go directly:
   *
   * Region -> City/Municipality -> Barangay
   */
  const regionHasProvince = provinces.length > 0

  useEffect(() => {
    loadRegions()
  }, [])

  async function loadRegions() {
    setLoadingRegions(true)
    setErrorMessage('')

    const { data, error } = await supabase
      .from('ph_locations')
      .select(
        'code,name,location_type,parent_code'
      )
      .eq('location_type', 'region')
      .eq('is_active', true)
      .is('parent_code', null)
      .order('name')

    if (error) {
      console.error('Region loading error:', error)

      setErrorMessage(
        'Unable to load Philippine regions. Please check your internet connection.'
      )

      setLoadingRegions(false)
      return
    }

    setRegions(data ?? [])
    setLoadingRegions(false)
  }

  async function loadLocations(
    locationType:
      | 'province'
      | 'city_municipality'
      | 'barangay',
    parentCode: string
  ) {
    const { data, error } = await supabase
      .from('ph_locations')
      .select(
        'code,name,location_type,parent_code'
      )
      .eq('location_type', locationType)
      .eq('parent_code', parentCode)
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error(
        `Loading ${locationType} error:`,
        error
      )

      throw error
    }

    return data ?? []
  }

  async function handleRegionSelect(
    option: LocationOption
  ) {
    setPicker(null)
    setErrorMessage('')

    setSelectedRegion(option.code)
    setSelectedProvince('')
    setSelectedCity('')
    setSelectedBarangay('')

    setProvinces([])
    setCities([])
    setBarangays([])

    setLoadingChildren(true)

    try {
      const provinceRows = await loadLocations(
        'province',
        option.code
      )

      setProvinces(provinceRows)

      /*
       * If this region has no provinces,
       * load cities directly under the region.
       *
       * This handles NCR.
       */
      if (provinceRows.length === 0) {
        const cityRows = await loadLocations(
          'city_municipality',
          option.code
        )

        setCities(cityRows)
      }
    } catch {
      setErrorMessage(
        'Unable to load the locations for this region.'
      )
    } finally {
      setLoadingChildren(false)
    }
  }

  async function handleProvinceSelect(
    option: LocationOption
  ) {
    setPicker(null)
    setErrorMessage('')

    setSelectedProvince(option.code)
    setSelectedCity('')
    setSelectedBarangay('')

    setCities([])
    setBarangays([])

    setLoadingChildren(true)

    try {
      const cityRows = await loadLocations(
        'city_municipality',
        option.code
      )

      setCities(cityRows)
    } catch {
      setErrorMessage(
        'Unable to load the cities and municipalities for this province.'
      )
    } finally {
      setLoadingChildren(false)
    }
  }

  async function handleCitySelect(
    option: LocationOption
  ) {
    setPicker(null)
    setErrorMessage('')

    setSelectedCity(option.code)
    setSelectedBarangay('')

    setBarangays([])

    setLoadingChildren(true)

    try {
      const barangayRows = await loadLocations(
        'barangay',
        option.code
      )

      setBarangays(barangayRows)
    } catch {
      setErrorMessage(
        'Unable to load the barangays for this city or municipality.'
      )
    } finally {
      setLoadingChildren(false)
    }
  }

  function handleBarangaySelect(
    option: LocationOption
  ) {
    setPicker(null)
    setSelectedBarangay(option.code)
    setErrorMessage('')
  }

  function getPickerOptions() {
    switch (picker) {
      case 'region':
        return regions

      case 'province':
        return provinces

      case 'city':
        return cities

      case 'barangay':
        return barangays

      default:
        return []
    }
  }

  function getPickerTitle() {
    switch (picker) {
      case 'region':
        return 'Select Region'

      case 'province':
        return 'Select Province'

      case 'city':
        return 'Select City / Municipality'

      case 'barangay':
        return 'Select Barangay'

      default:
        return ''
    }
  }

  function getPickerSelectedCode() {
    switch (picker) {
      case 'region':
        return selectedRegion

      case 'province':
        return selectedProvince

      case 'city':
        return selectedCity

      case 'barangay':
        return selectedBarangay

      default:
        return ''
    }
  }

  function handlePickerSelect(
    option: LocationOption
  ) {
    switch (picker) {
      case 'region':
        handleRegionSelect(option)
        break

      case 'province':
        handleProvinceSelect(option)
        break

      case 'city':
        handleCitySelect(option)
        break

      case 'barangay':
        handleBarangaySelect(option)
        break
    }
  }

  function buildReadableArea() {
    const parts = [
      selectedBarangayObject?.name,
      selectedCityObject?.name,
      selectedProvinceObject?.name,
      selectedRegionObject?.name,
      purok.trim()
        ? `Purok ${purok.trim().replace(/^purok\s*/i, '')}`
        : null,
    ].filter(Boolean)

    return parts.join(', ')
  }

  async function handleSignup() {
    setErrorMessage('')
    setSuccessMessage('')

    const cleanName = fullName.trim()
    const cleanEmail = email.trim().toLowerCase()
    const cleanPurok = purok.trim()

    if (!cleanName) {
      setErrorMessage('Please enter your full name.')
      return
    }

    if (!cleanEmail) {
      setErrorMessage('Please enter your email address.')
      return
    }

    if (!password) {
      setErrorMessage('Please enter a password.')
      return
    }

    if (password.length < 6) {
      setErrorMessage(
        'Your password must be at least 6 characters.'
      )
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.')
      return
    }

    if (!selectedRegion) {
      setErrorMessage('Please select your region.')
      return
    }

    if (regionHasProvince && !selectedProvince) {
      setErrorMessage('Please select your province.')
      return
    }

    if (!selectedCity) {
      setErrorMessage(
        'Please select your city or municipality.'
      )
      return
    }

    if (!selectedBarangay) {
      setErrorMessage('Please select your barangay.')
      return
    }

    setSubmitting(true)

    const readableArea = buildReadableArea()

    try {
      const { data, error } =
        await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: cleanName,

              purok: cleanPurok || null,

              region_code: selectedRegion,

              province_code:
                selectedProvince || null,

              city_municipality_code:
                selectedCity,

              barangay_code:
                selectedBarangay,

              area: readableArea,
            },
          },
        })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      if (!data.user) {
        setErrorMessage(
          'The account could not be created. Please try again.'
        )
        return
      }

      /*
       * If email confirmation is enabled,
       * Supabase normally returns no session here.
       *
       * The database trigger has already saved
       * user_profiles using the metadata above.
       */

      if (data.session) {
        setSuccessMessage(
          'Account created successfully.'
        )

        setTimeout(() => {
          router.replace('/customer')
        }, 700)

        return
      }

      setSuccessMessage(
        'Account created successfully. Please check your email to verify your account, then log in.'
      )

      setTimeout(() => {
        router.replace('/login')
      }, 2500)
    } catch (error) {
      console.error('Signup error:', error)

      setErrorMessage(
        'Something went wrong while creating your account.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const cityDisabled =
    !selectedRegion ||
    loadingChildren ||
    (regionHasProvince && !selectedProvince)

  const barangayDisabled =
    !selectedCity ||
    loadingChildren

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.bg}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoSection}>
          <View style={styles.logoGlow}>
            <Image
              source={LOGO}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.title}>
            Create Account
          </Text>

          <Text style={styles.subtitle}>
            Join PKC BIZOFT
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons
                name="person-outline"
                size={19}
                color={colors.accent}
              />
            </View>

            <View>
              <Text style={styles.sectionTitle}>
                Account Information
              </Text>

              <Text style={styles.sectionSubtitle}>
                Enter your account details
              </Text>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Full Name
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons
                name="person-outline"
                size={19}
                color={colors.muted}
              />

              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Email Address
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons
                name="mail-outline"
                size={19}
                color={colors.muted}
              />

              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor={colors.muted}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Password
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons
                name="lock-closed-outline"
                size={19}
                color={colors.muted}
              />

              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Create a password"
                placeholderTextColor={colors.muted}
                style={styles.input}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Confirm Password
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons
                name="shield-checkmark-outline"
                size={19}
                color={colors.muted}
              />

              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm your password"
                placeholderTextColor={colors.muted}
                style={styles.input}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons
                name="map-outline"
                size={19}
                color={colors.accent}
              />
            </View>

            <View>
              <Text style={styles.sectionTitle}>
                Service Location
              </Text>

              <Text style={styles.sectionSubtitle}>
                Select your location in the Philippines
              </Text>
            </View>
          </View>

          <LocationField
            label="Region"
            value={
              selectedRegionObject?.name ?? ''
            }
            placeholder="Select region"
            disabled={
              loadingRegions ||
              regions.length === 0
            }
            onPress={() => setPicker('region')}
          />

          <LocationField
            label="Province"
            value={
              selectedProvinceObject?.name ?? ''
            }
            placeholder={
              regionHasProvince
                ? 'Select province'
                : 'No province — select city/municipality'
            }
            disabled={
              !selectedRegion ||
              !regionHasProvince ||
              loadingChildren
            }
            onPress={() =>
              setPicker('province')
            }
          />

          <LocationField
            label="City / Municipality"
            value={
              selectedCityObject?.name ?? ''
            }
            placeholder="Select city or municipality"
            disabled={
              cityDisabled ||
              cities.length === 0
            }
            onPress={() => setPicker('city')}
          />

          <LocationField
            label="Barangay"
            value={
              selectedBarangayObject?.name ?? ''
            }
            placeholder="Select barangay"
            disabled={
              barangayDisabled ||
              barangays.length === 0
            }
            onPress={() =>
              setPicker('barangay')
            }
          />

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Purok
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons
                name="home-outline"
                size={19}
                color={colors.muted}
              />

              <TextInput
                value={purok}
                onChangeText={setPurok}
                placeholder="Enter your Purok"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
          </View>

          {!!selectedBarangay && (
            <View style={styles.areaPreview}>
              <View style={styles.areaPreviewIcon}>
                <Ionicons
                  name="checkmark-circle"
                  size={19}
                  color={colors.success}
                />
              </View>

              <View style={styles.areaPreviewContent}>
                <Text style={styles.areaPreviewLabel}>
                  Service Area
                </Text>

                <Text style={styles.areaPreviewText}>
                  {buildReadableArea()}
                </Text>
              </View>
            </View>
          )}

          {!!errorMessage && (
            <View style={styles.messageBoxError}>
              <Ionicons
                name="alert-circle-outline"
                size={20}
                color="#ff6b6b"
              />

              <Text style={styles.errorText}>
                {errorMessage}
              </Text>
            </View>
          )}

          {!!successMessage && (
            <View style={styles.messageBoxSuccess}>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color={colors.success}
              />

              <Text style={styles.successText}>
                {successMessage}
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleSignup}
            disabled={submitting}
            style={({ pressed }) => [
              styles.signupButton,
              submitting &&
                styles.signupButtonDisabled,
              pressed &&
                !submitting &&
                styles.pressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator
                color="#ffffff"
                size="small"
              />
            ) : (
              <>
                <Text style={styles.signupButtonText}>
                  Create Account
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={19}
                  color="#ffffff"
                />
              </>
            )}
          </Pressable>

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>
              Already have an account?
            </Text>

            <Pressable
              onPress={() =>
                router.replace('/login')
              }
            >
              <Text style={styles.loginLink}>
                Log in
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.footer}>
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={colors.muted}
          />

          <Text style={styles.footerText}>
            Your account information is securely stored.
          </Text>
        </View>
      </ScrollView>

      <LocationPicker
        visible={picker !== null}
        title={getPickerTitle()}
        options={getPickerOptions()}
        selectedCode={getPickerSelectedCode()}
        loading={
          picker === 'region'
            ? loadingRegions
            : loadingChildren
        }
        onClose={() => setPicker(null)}
        onSelect={handlePickerSelect}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 42,
    paddingBottom: 40,
  },

  logoSection: {
    alignItems: 'center',
    marginBottom: 26,
  },

  logoGlow: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  logo: {
    width: 100,
    height: 100,
  },

  title: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 5,
  },

  card: {
    backgroundColor: colors.panel,
    borderRadius: radii.sm + 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },

  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },

  fieldGroup: {
    marginBottom: 16,
  },

  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },

  inputWrapper: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.035)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },

  input: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    marginLeft: 10,
    minHeight: 50,
  },

  locationField: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.035)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 16,
  },

  locationFieldDisabled: {
    opacity: 0.45,
  },

  locationFieldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },

  locationFieldText: {
    color: colors.text,
    fontSize: 14,
    marginLeft: 10,
    flex: 1,
  },

  locationPlaceholder: {
    color: colors.muted,
  },

  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 8,
    marginBottom: 24,
  },

  areaPreview: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.035)',
    padding: 13,
    marginBottom: 16,
  },

  areaPreviewIcon: {
    marginRight: 10,
    paddingTop: 1,
  },

  areaPreviewContent: {
    flex: 1,
  },

  areaPreviewLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  areaPreviewText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },

  messageBoxError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.25)',
    backgroundColor: 'rgba(255,107,107,0.08)',
    padding: 12,
    marginBottom: 14,
  },

  errorText: {
    color: '#ff8a8a',
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
    marginLeft: 9,
  },

  messageBoxSuccess: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(80,200,120,0.25)',
    backgroundColor: 'rgba(80,200,120,0.08)',
    padding: 12,
    marginBottom: 14,
  },

  successText: {
    color: colors.success,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
    marginLeft: 9,
  },

  signupButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 18,
    marginTop: 4,
  },

  signupButtonDisabled: {
    opacity: 0.65,
  },

  signupButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    marginRight: 8,
  },

  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 21,
  },

  loginText: {
    color: colors.muted,
    fontSize: 13,
  },

  loginLink: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 5,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 12,
  },

  footerText: {
    color: colors.muted,
    fontSize: 11,
    marginLeft: 6,
    textAlign: 'center',
  },

  pressed: {
    opacity: 0.75,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },

  modalContainer: {
    height: '88%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },

  modalTitleWrap: {
    flex: 1,
  },

  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },

  modalCount: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },

  modalClose: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  searchBox: {
    marginHorizontal: 18,
    marginBottom: 10,
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.035)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
  },

  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    marginLeft: 9,
    minHeight: 46,
  },

  clearSearch: {
    padding: 5,
  },

  locationList: {
    paddingHorizontal: 18,
    paddingBottom: 30,
  },

  locationOption: {
    minHeight: 61,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.025)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    marginBottom: 8,
  },

  locationOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  locationIcon: {
    width: 30,
    alignItems: 'center',
    marginRight: 8,
  },

  locationOptionText: {
    flex: 1,
  },

  locationName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },

  locationNameSelected: {
    fontWeight: '800',
  },

  locationCode: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },

  modalLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalLoadingText: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 10,
  },

  emptyLocations: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },

  emptyLocationTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },

  emptyLocationText: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
})