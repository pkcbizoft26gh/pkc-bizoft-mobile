import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { supabase } from '@/lib/supabase'
import { colors } from '@/constants/theme'

type Option = { code: string; name: string }
type Level = 'region' | 'province' | 'city' | 'barangay'

export type SelectedLocation = {
  regionCode: string
  provinceCode: string
  cityCode: string
  barangayCode: string
  purok: string
  /** "Barangay, City, Province, Region, Purok X" */
  area: string
  /** Everything required is filled in. */
  complete: boolean
}

const TITLES: Record<Level, string> = {
  region: 'Region',
  province: 'Province',
  city: 'City / Municipality',
  barangay: 'Barangay',
}

/**
 * Region -> Province -> City -> Barangay dropdowns plus a free-text Purok,
 * the same fields the sign-up screen uses. Regions without provinces (NCR)
 * go straight from region to city.
 */
export function LocationSelector({
  onChange,
}: {
  onChange: (value: SelectedLocation) => void
}) {
  const [regions, setRegions] = useState<Option[]>([])
  const [provinces, setProvinces] = useState<Option[]>([])
  const [cities, setCities] = useState<Option[]>([])
  const [barangays, setBarangays] = useState<Option[]>([])

  const [region, setRegion] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [barangay, setBarangay] = useState('')
  const [purok, setPurok] = useState('')

  const [picker, setPicker] = useState<Level | null>(null)
  const [search, setSearch] = useState('')
  const [loadingRegions, setLoadingRegions] = useState(true)
  const [loadingChildren, setLoadingChildren] = useState(false)
  const [error, setError] = useState('')

  async function load(type: string, parent: string | null) {
    let query = supabase
      .from('ph_locations')
      .select('code,name')
      .eq('location_type', type)
      .eq('is_active', true)
      .order('name')

    query = parent ? query.eq('parent_code', parent) : query.is('parent_code', null)

    const { data, error: err } = await query
    if (err) throw err
    return (data ?? []) as Option[]
  }

  useEffect(() => {
    load('region', null)
      .then(setRegions)
      .catch(() => setError('Unable to load regions. Check your internet connection.'))
      .finally(() => setLoadingRegions(false))
  }, [])

  const regionHasProvince = provinces.length > 0
  const nameOf = (list: Option[], code: string) => list.find((o) => o.code === code)?.name

  const area = useMemo(() => {
    const cleanPurok = purok.trim().replace(/^purok\s*/i, '')
    return [
      nameOf(barangays, barangay),
      nameOf(cities, city),
      nameOf(provinces, province),
      nameOf(regions, region),
      cleanPurok ? `Purok ${cleanPurok}` : null,
    ]
      .filter(Boolean)
      .join(', ')
  }, [barangays, cities, provinces, regions, barangay, city, province, region, purok])

  useEffect(() => {
    onChange({
      regionCode: region,
      provinceCode: province,
      cityCode: city,
      barangayCode: barangay,
      purok: purok.trim(),
      area,
      complete: !!region && (!regionHasProvince || !!province) && !!city && !!barangay,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, province, city, barangay, purok, area, regionHasProvince])

  async function pick(level: Level, option: Option) {
    setPicker(null)
    setError('')

    try {
      if (level === 'region') {
        setRegion(option.code)
        setProvince('')
        setCity('')
        setBarangay('')
        setProvinces([])
        setCities([])
        setBarangays([])
        setLoadingChildren(true)
        const provinceRows = await load('province', option.code)
        setProvinces(provinceRows)
        if (provinceRows.length === 0) setCities(await load('city_municipality', option.code))
      } else if (level === 'province') {
        setProvince(option.code)
        setCity('')
        setBarangay('')
        setCities([])
        setBarangays([])
        setLoadingChildren(true)
        setCities(await load('city_municipality', option.code))
      } else if (level === 'city') {
        setCity(option.code)
        setBarangay('')
        setBarangays([])
        setLoadingChildren(true)
        setBarangays(await load('barangay', option.code))
      } else {
        setBarangay(option.code)
      }
    } catch {
      setError('Unable to load the locations. Please try again.')
    } finally {
      setLoadingChildren(false)
    }
  }

  const options: Record<Level, Option[]> = {
    region: regions,
    province: provinces,
    city: cities,
    barangay: barangays,
  }
  const selected: Record<Level, string> = { region, province, city, barangay }

  const shown = useMemo(() => {
    if (!picker) return []
    const q = search.trim().toLowerCase()
    return q ? options[picker].filter((o) => o.name.toLowerCase().includes(q)) : options[picker]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, search, regions, provinces, cities, barangays])

  function field(level: Level, placeholder: string, disabled: boolean) {
    const value = nameOf(options[level], selected[level])
    return (
      <View style={styles.group}>
        <Text style={styles.label}>{TITLES[level].toUpperCase()}</Text>
        <Pressable
          disabled={disabled}
          onPress={() => {
            setSearch('')
            setPicker(level)
          }}
          style={({ pressed }) => [styles.field, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
        >
          <Ionicons name="location-outline" size={18} color={disabled ? colors.muted : colors.accent} />
          <Text numberOfLines={1} style={[styles.fieldText, !value && { color: colors.muted }]}>
            {value || placeholder}
          </Text>
          <Ionicons name="chevron-down" size={17} color={colors.muted} />
        </Pressable>
      </View>
    )
  }

  return (
    <View>
      {field('region', 'Select region', loadingRegions || regions.length === 0)}
      {field(
        'province',
        !region || regionHasProvince ? 'Select province' : 'No province — select city/municipality',
        !region || !regionHasProvince || loadingChildren,
      )}
      {field('city', 'Select city or municipality', !region || loadingChildren || (regionHasProvince && !province) || cities.length === 0)}
      {field('barangay', 'Select barangay', !city || loadingChildren || barangays.length === 0)}

      <View style={styles.group}>
        <Text style={styles.label}>PUROK</Text>
        <View style={styles.field}>
          <Ionicons name="home-outline" size={18} color={colors.muted} />
          <TextInput
            value={purok}
            onChangeText={setPurok}
            placeholder="Enter the Purok"
            placeholderTextColor={colors.muted}
            style={styles.purokInput}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select {picker ? TITLES[picker] : ''}</Text>
              <Pressable onPress={() => setPicker(null)} style={styles.close} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.search}>
              <Ionicons name="search" size={17} color={colors.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search..."
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {loadingChildren ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
            ) : (
              <FlatList
                data={shown}
                keyExtractor={(o) => o.code}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
                ListEmptyComponent={<Text style={styles.empty}>No locations found.</Text>}
                renderItem={({ item }) => {
                  const on = picker ? item.code === selected[picker] : false
                  return (
                    <Pressable
                      onPress={() => picker && void pick(picker, item)}
                      style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && styles.pressed]}
                    >
                      <Ionicons
                        name={on ? 'checkmark-circle' : 'location-outline'}
                        size={19}
                        color={on ? colors.accent : colors.muted}
                      />
                      <Text style={[styles.optionText, on && { fontWeight: '800' }]}>{item.name}</Text>
                    </Pressable>
                  )
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  group: { marginBottom: 12 },
  label: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  field: {
    height: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.035)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  fieldText: { flex: 1, color: colors.text, fontSize: 14 },
  purokInput: { flex: 1, color: colors.text, fontSize: 14, height: '100%' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  error: { color: colors.danger, fontSize: 12, marginBottom: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet: {
    height: '85%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
  },
  sheetTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  close: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    marginHorizontal: 16,
    marginBottom: 10,
    height: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  option: {
    minHeight: 54,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    marginBottom: 8,
    gap: 10,
  },
  optionOn: { borderColor: colors.accent },
  optionText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 40 },
})
