import React, { useCallback, useEffect, useMemo, useState } from 'react'

import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

import { colors, radii } from '../../constants/theme'
import { GlassCard } from '../../components/GlassCard'
import { supabase } from '@/lib/supabase'

type JobType = 'new_installation' | 'repair' | 'replacement' | 'upgrade' | 'other'

type CatalogItem = {
  id: string
  tenant_id: string
  sku: string | null
  name: string
  category: string
  unit: string
  quantity_on_hand: number
  reorder_level: number
  location: string | null
}

type ClientRow = { id: string; customer_name: string | null; area: string | null }

type Kit = {
  id: string
  name: string
  job_type: JobType
  description: string | null
  inventory_kit_items: { item_id: string; quantity: number; is_optional: boolean }[]
}

type Move = {
  id: string
  item_id: string
  movement_type: 'installation_use' | 'return'
  quantity_change: number
  client_id: string | null
  job_type: JobType | null
  install_location: string | null
  replaced_item_id: string | null
  notes: string | null
  checkout_id: string | null
  created_at: string
}

type CartLine = {
  key: string
  itemId: string
  qty: number
  location: string
  replacesId: string | null
}

const JOB_TYPES: { value: JobType; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'new_installation', label: 'New install', icon: 'hammer-outline' },
  { value: 'repair', label: 'Repair', icon: 'build-outline' },
  { value: 'replacement', label: 'Replacement', icon: 'swap-horizontal-outline' },
  { value: 'upgrade', label: 'Upgrade', icon: 'arrow-up-circle-outline' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
]

const jobLabel = (v: JobType | null) => JOB_TYPES.find((j) => j.value === v)?.label ?? 'Job'

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function when(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function MaterialsScreen() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [blocked, setBlocked] = useState(false)

  const [tab, setTab] = useState<'take' | 'history'>('take')

  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [kits, setKits] = useState<Kit[]>([])
  const [moves, setMoves] = useState<Move[]>([])

  const [clientId, setClientId] = useState<string | null>(null)
  const [jobType, setJobType] = useState<JobType>('new_installation')
  const [cart, setCart] = useState<CartLine[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [picker, setPicker] = useState<
    | null
    | { kind: 'client' }
    | { kind: 'item'; mode: 'add' }
    | { kind: 'item'; mode: 'swap'; lineKey: string }
    | { kind: 'item'; mode: 'replaces'; lineKey: string }
  >(null)
  const [returning, setReturning] = useState<null | { itemId: string; clientId: string; max: number }>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      setError('')
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/login')
          return
        }

        const [catRes, clientRes, kitRes, moveRes] = await Promise.all([
          supabase.from('inventory_catalog').select('*').order('name'),
          supabase.from('clients').select('id, customer_name, area').order('customer_name'),
          supabase
            .from('inventory_kits')
            .select('id, name, job_type, description, inventory_kit_items(item_id, quantity, is_optional)')
            .eq('is_active', true)
            .order('name'),
          supabase
            .from('inventory_movements')
            .select(
              'id, item_id, movement_type, quantity_change, client_id, job_type, install_location, replaced_item_id, notes, checkout_id, created_at',
            )
            .order('created_at', { ascending: false })
            .limit(100),
        ])

        if (catRes.error) throw catRes.error
        if (clientRes.error) throw clientRes.error
        if (kitRes.error) throw kitRes.error
        if (moveRes.error) throw moveRes.error

        setCatalog((catRes.data ?? []) as CatalogItem[])
        setClients((clientRes.data ?? []) as ClientRow[])
        setKits((kitRes.data ?? []) as Kit[])
        setMoves((moveRes.data ?? []) as Move[])
        // An account without inventory access just gets an empty catalog.
        setBlocked((catRes.data ?? []).length === 0 && (kitRes.data ?? []).length === 0)
      } catch (e: any) {
        setError(e?.message ?? 'Could not load materials.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [router],
  )

  useEffect(() => {
    load()
  }, [load])

  const itemById = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog])
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const clientName = (id: string | null) => (id ? clientById.get(id)?.customer_name ?? 'Client' : '—')

  const suggestedKits = useMemo(() => kits.filter((k) => k.job_type === jobType), [kits, jobType])

  // Net amount this technician still holds per client + item (taken minus returned).
  const outstanding = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of moves) {
      if (!m.client_id) continue
      const key = `${m.client_id}|${m.item_id}`
      map.set(key, (map.get(key) ?? 0) - Number(m.quantity_change))
    }
    return map
  }, [moves])

  const addToCart = (itemId: string, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.itemId === itemId)
      if (existing) return prev.map((l) => (l === existing ? { ...l, qty: l.qty + qty } : l))
      return [...prev, { key: uuid(), itemId, qty, location: '', replacesId: null }]
    })
  }

  const applyKit = (kit: Kit) => {
    const usable = kit.inventory_kit_items.filter((k) => itemById.has(k.item_id) && !k.is_optional)
    const skipped = kit.inventory_kit_items.length - usable.length
    setCart(
      usable.map((k) => ({
        key: uuid(),
        itemId: k.item_id,
        qty: Number(k.quantity),
        location: '',
        replacesId: null,
      })),
    )
    if (skipped > 0) {
      Alert.alert('Kit loaded', `${skipped} optional or unavailable item(s) were left out. You can add them manually.`)
    }
  }

  const setLine = (key: string, patch: Partial<CartLine>) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key))

  const shortages = cart.filter((l) => (itemById.get(l.itemId)?.quantity_on_hand ?? 0) < l.qty)

  const submit = async () => {
    if (!clientId) return Alert.alert('Pick a client', 'Choose the customer this job is for.')
    if (cart.length === 0) return Alert.alert('Nothing to take', 'Add at least one material.')
    if (shortages.length > 0) {
      return Alert.alert('Not enough stock', 'Lower the quantity of the items marked in red.')
    }

    setSaving(true)
    try {
      const checkoutId = uuid()
      const rows = cart.map((l) => ({
        tenant_id: itemById.get(l.itemId)!.tenant_id,
        item_id: l.itemId,
        movement_type: 'installation_use',
        quantity_change: -l.qty,
        client_id: clientId,
        checkout_id: checkoutId,
        job_type: jobType,
        install_location: l.location.trim() || null,
        replaced_item_id: l.replacesId,
        notes: notes.trim() || null,
      }))
      // One insert = one transaction, so a job is taken completely or not at all.
      const { error: insertError } = await supabase.from('inventory_movements').insert(rows)
      if (insertError) throw insertError

      setCart([])
      setNotes('')
      Alert.alert('Materials recorded', 'Your check-out was saved to the inventory history.')
      setTab('history')
      await load(true)
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const submitReturn = async (qty: number) => {
    if (!returning) return
    try {
      const { error: insertError } = await supabase.from('inventory_movements').insert({
        tenant_id: itemById.get(returning.itemId)?.tenant_id,
        item_id: returning.itemId,
        movement_type: 'return',
        quantity_change: qty,
        client_id: returning.clientId,
        notes: 'Returned unused',
      })
      if (insertError) throw insertError
      setReturning(null)
      await load(true)
    } catch (e: any) {
      Alert.alert('Could not return', e?.message ?? 'Please try again.')
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.muted}>Loading materials…</Text>
      </View>
    )
  }

  if (blocked && !error) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={34} color={colors.muted} />
        <Text style={styles.emptyTitle}>No materials available</Text>
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 6 }]}>
          Either there is no stock yet, or this account is not set up as a technician for inventory. Ask an admin.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              load(true)
            }}
            tintColor={colors.accent}
          />
        }
      >
        <Text style={styles.eyebrow}>TECHNICIAN</Text>
        <Text style={styles.title}>Materials</Text>

        <View style={styles.segment}>
          {(['take', 'history'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.segBtn, tab === t && styles.segBtnOn]}>
              <Text style={[styles.segText, tab === t && styles.segTextOn]}>
                {t === 'take' ? 'Take materials' : `My history (${moves.length})`}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {tab === 'take' ? (
          <>
            <Text style={styles.label}>1 · Customer</Text>
            <GlassCard onPress={() => setPicker({ kind: 'client' })} style={styles.pickRow}>
              <Ionicons name="person-outline" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pickMain}>{clientId ? clientName(clientId) : 'Choose the customer to service'}</Text>
                {clientId && clientById.get(clientId)?.area ? (
                  <Text style={styles.muted}>{clientById.get(clientId)?.area}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </GlassCard>

            <Text style={styles.label}>2 · Type of job</Text>
            <View style={styles.chips}>
              {JOB_TYPES.map((j) => (
                <Pressable
                  key={j.value}
                  onPress={() => setJobType(j.value)}
                  style={[styles.chip, jobType === j.value && styles.chipOn]}
                >
                  <Ionicons name={j.icon} size={14} color={jobType === j.value ? colors.bg : colors.accent} />
                  <Text style={[styles.chipText, jobType === j.value && { color: colors.bg }]}>{j.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>3 · Recommended set-up</Text>
            {suggestedKits.length === 0 ? (
              <Text style={styles.muted}>No recommended kit for this job type yet. Add materials manually below.</Text>
            ) : (
              suggestedKits.map((kit) => (
                <GlassCard key={kit.id} onPress={() => applyKit(kit)} style={styles.kit}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickMain}>{kit.name}</Text>
                    <Text style={styles.muted} numberOfLines={2}>
                      {kit.inventory_kit_items
                        .map((k) => `${fmt(Number(k.quantity))}× ${itemById.get(k.item_id)?.name ?? 'item'}`)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.kitUse}>Use</Text>
                </GlassCard>
              ))
            )}

            <Text style={styles.label}>4 · Materials to take</Text>
            {cart.length === 0 ? <Text style={styles.muted}>Nothing added yet.</Text> : null}
            {cart.map((line) => {
              const item = itemById.get(line.itemId)
              const short = (item?.quantity_on_hand ?? 0) < line.qty
              const replaced = line.replacesId ? itemById.get(line.replacesId) : null
              return (
                <GlassCard key={line.key} style={[styles.line, short && { borderColor: colors.danger }]}>
                  <View style={styles.lineTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickMain}>{item?.name ?? 'Item'}</Text>
                      <Text style={[styles.muted, short && { color: colors.danger }]}>
                        {fmt(Number(item?.quantity_on_hand ?? 0))} {item?.unit} in stock
                        {short ? ' — not enough' : ''}
                      </Text>
                    </View>
                    <View style={styles.stepper}>
                      <Pressable onPress={() => setLine(line.key, { qty: Math.max(1, line.qty - 1) })} hitSlop={8}>
                        <Ionicons name="remove-circle-outline" size={26} color={colors.accent} />
                      </Pressable>
                      <Text style={styles.qty}>{fmt(line.qty)}</Text>
                      <Pressable onPress={() => setLine(line.key, { qty: line.qty + 1 })} hitSlop={8}>
                        <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
                      </Pressable>
                    </View>
                  </View>

                  <TextInput
                    value={line.location}
                    onChangeText={(v) => setLine(line.key, { location: v })}
                    placeholder="Where installed (e.g. living room, pole 12)"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />

                  <View style={styles.lineActions}>
                    <Pressable onPress={() => setPicker({ kind: 'item', mode: 'swap', lineKey: line.key })}>
                      <Text style={styles.link}>Swap item</Text>
                    </Pressable>
                    {jobType === 'replacement' || jobType === 'repair' || jobType === 'upgrade' ? (
                      <Pressable onPress={() => setPicker({ kind: 'item', mode: 'replaces', lineKey: line.key })}>
                        <Text style={styles.link}>{replaced ? `Replaces: ${replaced.name}` : 'Replaces which item?'}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => removeLine(line.key)}>
                      <Text style={[styles.link, { color: colors.danger }]}>Remove</Text>
                    </Pressable>
                  </View>
                </GlassCard>
              )
            })}

            <Pressable onPress={() => setPicker({ kind: 'item', mode: 'add' })} style={styles.addBtn}>
              <Ionicons name="add" size={18} color={colors.accent} />
              <Text style={styles.addText}>Add material</Text>
            </Pressable>

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes for this job (optional)"
              placeholderTextColor={colors.muted}
              style={[styles.input, { marginTop: 14 }]}
              multiline
            />

            <Pressable onPress={submit} disabled={saving} style={[styles.submit, saving && { opacity: 0.6 }]}>
              {saving ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.submitText}>Confirm — take {cart.length} item{cart.length === 1 ? '' : 's'}</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            {moves.length === 0 ? <Text style={styles.muted}>You have not taken any materials yet.</Text> : null}
            {moves.map((m) => {
              const item = itemById.get(m.item_id)
              const took = m.movement_type === 'installation_use'
              const left = m.client_id ? outstanding.get(`${m.client_id}|${m.item_id}`) ?? 0 : 0
              return (
                <GlassCard key={m.id} style={styles.hist}>
                  <View style={styles.lineTop}>
                    <Ionicons
                      name={took ? 'arrow-down-circle-outline' : 'arrow-undo-circle-outline'}
                      size={22}
                      color={took ? colors.warning : colors.success}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickMain}>
                        {took ? 'Took' : 'Returned'} {fmt(Math.abs(Number(m.quantity_change)))} {item?.unit ?? ''}{' '}
                        {item?.name ?? 'item'}
                      </Text>
                      <Text style={styles.muted}>
                        {clientName(m.client_id)}
                        {m.job_type ? ` · ${jobLabel(m.job_type)}` : ''}
                      </Text>
                      {m.install_location ? <Text style={styles.muted}>Where: {m.install_location}</Text> : null}
                      {m.replaced_item_id ? (
                        <Text style={styles.muted}>Replaces: {itemById.get(m.replaced_item_id)?.name ?? 'item'}</Text>
                      ) : null}
                      <Text style={styles.when}>{when(m.created_at)}</Text>
                    </View>
                  </View>
                  {took && m.client_id && left > 0 ? (
                    <Pressable
                      onPress={() => setReturning({ itemId: m.item_id, clientId: m.client_id!, max: left })}
                      style={styles.returnBtn}
                    >
                      <Text style={styles.link}>Return unused ({fmt(left)} left out)</Text>
                    </Pressable>
                  ) : null}
                </GlassCard>
              )
            })}
          </>
        )}
      </ScrollView>

      <PickerModal
        picker={picker}
        clients={clients}
        catalog={catalog}
        onClose={() => setPicker(null)}
        onPick={(value) => {
          if (!picker) return
          if (picker.kind === 'client') setClientId(value)
          else if (picker.mode === 'add') addToCart(value)
          else if (picker.mode === 'swap') setLine(picker.lineKey, { itemId: value })
          else setLine(picker.lineKey, { replacesId: value })
          setPicker(null)
        }}
      />

      <ReturnModal
        data={returning}
        itemName={returning ? itemById.get(returning.itemId)?.name ?? 'item' : ''}
        onClose={() => setReturning(null)}
        onSubmit={submitReturn}
      />
    </View>
  )
}

function PickerModal({
  picker,
  clients,
  catalog,
  onClose,
  onPick,
}: {
  picker: null | { kind: 'client' } | { kind: 'item'; mode: string }
  clients: ClientRow[]
  catalog: CatalogItem[]
  onClose: () => void
  onPick: (id: string) => void
}) {
  const [q, setQ] = useState('')
  useEffect(() => setQ(''), [picker])
  if (!picker) return null

  const term = q.trim().toLowerCase()
  const isClient = picker.kind === 'client'
  const rows = isClient
    ? clients
        .filter((c) => !term || (c.customer_name ?? '').toLowerCase().includes(term))
        .map((c) => ({ id: c.id, title: c.customer_name ?? 'Unnamed client', sub: c.area ?? '' }))
    : catalog
        .filter((i) => !term || i.name.toLowerCase().includes(term) || (i.sku ?? '').toLowerCase().includes(term))
        .map((i) => ({ id: i.id, title: i.name, sub: `${fmt(Number(i.quantity_on_hand))} ${i.unit} in stock` }))

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: 56, paddingHorizontal: 20 }]}>
        <View style={styles.modalHead}>
          <Text style={styles.title}>{isClient ? 'Choose customer' : 'Choose material'}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search…"
          placeholderTextColor={colors.muted}
          style={[styles.input, { marginBottom: 10 }]}
          autoFocus
        />
        <ScrollView keyboardShouldPersistTaps="handled">
          {rows.length === 0 ? <Text style={styles.muted}>Nothing found.</Text> : null}
          {rows.map((r) => (
            <GlassCard key={r.id} onPress={() => onPick(r.id)} style={[styles.pickRow, { marginBottom: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickMain}>{r.title}</Text>
                {r.sub ? <Text style={styles.muted}>{r.sub}</Text> : null}
              </View>
            </GlassCard>
          ))}
        </ScrollView>
      </View>
    </Modal>
  )
}

function ReturnModal({
  data,
  itemName,
  onClose,
  onSubmit,
}: {
  data: null | { itemId: string; clientId: string; max: number }
  itemName: string
  onClose: () => void
  onSubmit: (qty: number) => void
}) {
  const [value, setValue] = useState('')
  useEffect(() => setValue(data ? String(data.max) : ''), [data])
  if (!data) return null

  const qty = Number(value)
  const valid = Number.isFinite(qty) && qty > 0 && qty <= data.max

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>Return {itemName}</Text>
          <Text style={styles.muted}>You can return up to {fmt(data.max)}.</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            style={[styles.input, { marginVertical: 12 }]}
            placeholderTextColor={colors.muted}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={onClose} style={[styles.submit, styles.ghost, { flex: 1 }]}>
              <Text style={[styles.submitText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!valid}
              onPress={() => onSubmit(qty)}
              style={[styles.submit, { flex: 1 }, !valid && { opacity: 0.4 }]}
            >
              <Text style={styles.submitText}>Return</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 28 },
  content: { padding: 20, paddingTop: 62, paddingBottom: 120 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 14 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  label: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 20, marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 12 },
  error: { color: colors.danger, fontSize: 12, marginBottom: 8 },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 4,
  },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: radii.sm, alignItems: 'center' },
  segBtnOn: { backgroundColor: colors.accentSoft },
  segText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  segTextOn: { color: colors.accent },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  pickMain: { color: colors.text, fontSize: 14, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  kit: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 8 },
  kitUse: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  line: { padding: 14, marginBottom: 10 },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qty: { color: colors.text, fontSize: 16, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  lineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 },
  link: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  input: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginTop: 10,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  addText: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  submit: {
    marginTop: 18,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ghost: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  submitText: { color: colors.bg, fontWeight: '900', fontSize: 14 },
  hist: { padding: 14, marginTop: 10 },
  when: { color: colors.muted, fontSize: 11, marginTop: 4 },
  returnBtn: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.panel, borderRadius: radii.lg, padding: 20, borderWidth: 1, borderColor: colors.border },
})
