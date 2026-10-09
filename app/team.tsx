import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Alert } from '@/components/AppAlert'
import { supabase } from '@/lib/supabase'
import { colors, radii } from '@/constants/theme'

const MAX_MEMBERS = 10
const REFRESH_MS = 20000

type Member = {
  user_id: string
  name: string
  employee_number: string | null
  phone: string | null
  role: 'leader' | 'member'
  status: 'available' | 'busy'
  job_type: string | null
}

type SentInvite = {
  id: string
  name: string
  employee_number: string | null
  status: 'pending' | 'declined'
  reason: string | null
  responded_at: string | null
}

type Team = {
  id: string
  name: string
  max_members: number
  is_leader: boolean
  members: Member[]
  invites: SentInvite[]
}

type MyInvite = {
  id: string
  team_name: string
  invited_by_name: string
  invited_by_id: string | null
  member_count: number
  created_at: string
}

type Candidate = { user_id: string; full_name: string; employee_number: string | null }

export default function TeamScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [loading, setLoading] = useState(true)
  const [team, setTeam] = useState<Team | null>(null)
  const [myId, setMyId] = useState('')
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const [invites, setInvites] = useState<MyInvite[]>([])
  const [declining, setDeclining] = useState<MyInvite | null>(null)
  const [reason, setReason] = useState('')

  const [adding, setAdding] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)

  const alive = useRef(true)

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (auth.user && alive.current) setMyId(auth.user.id)

    const { data, error: rpcError } = await supabase.rpc('my_team')
    if (!alive.current) return
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setError('')
      const current = (data as Team | null) ?? null
      setTeam(current)
      if (!current) {
        const { data: mine } = await supabase.rpc('my_invites')
        if (alive.current) setInvites((mine as MyInvite[]) || [])
      } else {
        setInvites([])
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    alive.current = true
    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => {
      alive.current = false
      clearInterval(timer)
    }
  }, [load])

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    const { error: rpcError } = await action()
    setBusy(false)
    if (rpcError) {
      Alert.alert('Team', rpcError.message)
      return false
    }
    await load()
    return true
  }

  async function createTeam() {
    if (name.trim().length < 2) {
      Alert.alert('Team name', 'Give your team a name (at least 2 letters).')
      return
    }
    if (await run(() => supabase.rpc('create_team', { p_name: name.trim() }))) setName('')
  }

  async function openAdd() {
    setAdding(true)
    setLoadingCandidates(true)
    const { data, error: rpcError } = await supabase.rpc('team_candidates')
    setLoadingCandidates(false)
    if (rpcError) {
      setAdding(false)
      Alert.alert('Team', rpcError.message)
      return
    }
    setCandidates((data as Candidate[]) || [])
  }

  async function inviteMember(candidate: Candidate) {
    if (await run(() => supabase.rpc('team_invite', { p_user: candidate.user_id }))) {
      setCandidates((list) => list.filter((c) => c.user_id !== candidate.user_id))
    }
  }

  function cancelInvite(invite: SentInvite) {
    Alert.alert('Cancel invitation', `Cancel the invitation to ${invite.name}?`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel invitation',
        style: 'destructive',
        onPress: () => void run(() => supabase.rpc('team_cancel_invite', { p_invite: invite.id })),
      },
    ])
  }

  async function acceptInvite(invite: MyInvite) {
    await run(() => supabase.rpc('team_respond', { p_invite: invite.id, p_accept: true, p_reason: null }))
  }

  async function sendDecline() {
    if (!declining) return
    if (reason.trim().length < 3) {
      Alert.alert('Reason needed', 'Please tell the leader why you are declining.')
      return
    }
    const invite = declining
    if (await run(() => supabase.rpc('team_respond', { p_invite: invite.id, p_accept: false, p_reason: reason.trim() }))) {
      setDeclining(null)
      setReason('')
    }
  }

  function removeMember(member: Member) {
    Alert.alert('Remove member', `Remove ${member.name} from the team?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void run(() => supabase.rpc('team_remove_member', { p_user: member.user_id })),
      },
    ])
  }

  function leaveTeam() {
    Alert.alert(
      'Leave team',
      team?.is_leader && (team?.members.length ?? 0) > 1
        ? 'You are the leader. The longest-standing member becomes the new leader.'
        : 'Leave this team?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => void run(() => supabase.rpc('team_leave')) },
      ],
    )
  }

  const count = team?.members.length ?? 0
  const available = team?.members.filter((m) => m.status === 'available').length ?? 0

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>FIELD OPERATIONS</Text>
            <Text style={styles.title}>{team ? team.name : 'My Team'}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} size="large" color={colors.accent} />
        ) : error ? (
          <View style={styles.card}>
            <Ionicons name="alert-circle-outline" size={24} color={colors.danger} />
            <Text style={styles.body}>{error}</Text>
          </View>
        ) : !team ? (
          <>
            {invites.map((invite) => (
              <View key={invite.id} style={[styles.card, styles.inviteCard]}>
                <View style={styles.bigIcon}>
                  <Ionicons name="mail-unread-outline" size={26} color={colors.accent} />
                </View>
                <Text style={styles.cardTitle}>Invitation to join {invite.team_name}</Text>
                <Text style={styles.body}>
                  {invite.invited_by_name}
                  {invite.invited_by_id ? ` (${invite.invited_by_id})` : ''} invited you. The team has{' '}
                  {invite.member_count} member{invite.member_count === 1 ? '' : 's'} now.
                </Text>
                <View style={styles.inviteButtons}>
                  <Pressable
                    onPress={() => void acceptInvite(invite)}
                    disabled={busy}
                    style={({ pressed }) => [styles.acceptButton, (pressed || busy) && styles.pressed]}
                  >
                    <Text style={styles.primaryText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setReason('')
                      setDeclining(invite)
                    }}
                    disabled={busy}
                    style={({ pressed }) => [styles.declineButton, (pressed || busy) && styles.pressed]}
                  >
                    <Text style={styles.declineText}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          <View style={styles.card}>
            <View style={styles.bigIcon}>
              <Ionicons name="people-outline" size={28} color={colors.accent} />
            </View>
            <Text style={styles.cardTitle}>Create a group</Text>
            <Text style={styles.body}>
              Team up with up to {MAX_MEMBERS} technicians. Invited technicians accept or decline (with a
              reason). You will see who is available or busy, along with their staff IDs.
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Team name, e.g. Mabini Crew"
              placeholderTextColor={colors.muted}
              maxLength={40}
              style={styles.input}
            />
            <Pressable
              onPress={createTeam}
              disabled={busy}
              style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={18} color={colors.bg} />
                  <Text style={styles.primaryText}>Create group</Text>
                </>
              )}
            </Pressable>
          </View>
          </>
        ) : (
          <>
            <View style={styles.summary}>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryValue}>
                  {count}/{MAX_MEMBERS}
                </Text>
                <Text style={styles.summaryLabel}>MEMBERS</Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={[styles.summaryValue, { color: colors.success }]}>{available}</Text>
                <Text style={styles.summaryLabel}>AVAILABLE</Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={[styles.summaryValue, { color: colors.medium }]}>{count - available}</Text>
                <Text style={styles.summaryLabel}>BUSY</Text>
              </View>
            </View>

            {team.members.map((member) => {
              const isMe = member.user_id === myId
              const free = member.status === 'available'
              return (
                <View key={member.user_id} style={styles.memberCard}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{member.name.trim().charAt(0).toUpperCase() || '?'}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {member.name}
                        {isMe ? ' (you)' : ''}
                      </Text>
                      {member.role === 'leader' ? (
                        <View style={styles.leaderTag}>
                          <Text style={styles.leaderTagText}>LEADER</Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={styles.memberId}>{member.employee_number || 'No staff ID yet'}</Text>

                    <View style={styles.statusRow}>
                      <View style={[styles.dot, { backgroundColor: free ? colors.success : colors.medium }]} />
                      <Text style={[styles.statusText, { color: free ? colors.success : colors.medium }]}>
                        {free
                          ? 'Available'
                          : member.job_type === 'installation'
                            ? 'Busy · installation'
                            : 'Busy · repair'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.memberActions}>
                    {member.phone && !isMe ? (
                      <Pressable
                        onPress={() => void Linking.openURL(`tel:${member.phone}`)}
                        hitSlop={8}
                        accessibilityLabel={`Call ${member.name}`}
                        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                      >
                        <Ionicons name="call" size={16} color={colors.accent} />
                      </Pressable>
                    ) : null}
                    {team.is_leader && !isMe ? (
                      <Pressable
                        onPress={() => removeMember(member)}
                        hitSlop={8}
                        accessibilityLabel={`Remove ${member.name}`}
                        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                      >
                        <Ionicons name="person-remove-outline" size={16} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              )
            })}

            {team.is_leader && count < MAX_MEMBERS ? (
              <Pressable
                onPress={openAdd}
                style={({ pressed }) => [styles.primary, { marginTop: 4 }, pressed && styles.pressed]}
              >
                <Ionicons name="person-add-outline" size={18} color={colors.bg} />
                <Text style={styles.primaryText}>Invite technician</Text>
              </Pressable>
            ) : null}
            {team.is_leader && count >= MAX_MEMBERS ? (
              <Text style={styles.footnote}>Your team is full (10 technicians).</Text>
            ) : null}

            {team.is_leader && team.invites.length > 0 ? (
              <View style={{ marginTop: 18 }}>
                <Text style={styles.sectionLabel}>INVITATIONS</Text>
                {team.invites.map((invite) => (
                  <View key={invite.id} style={styles.sentCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{invite.name}</Text>
                      <Text style={styles.memberId}>{invite.employee_number || 'No staff ID yet'}</Text>
                      {invite.status === 'declined' ? (
                        <Text style={styles.reasonText}>Declined: {invite.reason}</Text>
                      ) : (
                        <Text style={[styles.statusText, { color: colors.medium, marginTop: 4 }]}>
                          Waiting for a reply
                        </Text>
                      )}
                    </View>
                    {invite.status === 'pending' ? (
                      <Pressable
                        onPress={() => cancelInvite(invite)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                        accessibilityLabel={`Cancel invitation to ${invite.name}`}
                      >
                        <Ionicons name="close" size={16} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable
              onPress={leaveTeam}
              style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
            >
              <Ionicons name="exit-outline" size={17} color={colors.danger} />
              <Text style={styles.leaveText}>Leave team</Text>
            </Pressable>
          </>
        )}

        <Text style={styles.footnote}>
          Available means no open installation or repair. This refreshes every 20 seconds.
        </Text>
      </ScrollView>

      <Modal visible={declining !== null} transparent animationType="fade" onRequestClose={() => setDeclining(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.sheetTitle}>Decline invitation</Text>
            <Text style={[styles.body, { textAlign: 'left' }]}>
              Tell {declining?.invited_by_name || 'the leader'} why you can&apos;t join {declining?.team_name}.
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Your reason (required)"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={200}
              style={[styles.input, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
            />
            <View style={styles.inviteButtons}>
              <Pressable
                onPress={() => setDeclining(null)}
                style={({ pressed }) => [styles.declineButton, pressed && styles.pressed]}
              >
                <Text style={styles.declineText}>Back</Text>
              </Pressable>
              <Pressable
                onPress={() => void sendDecline()}
                disabled={busy}
                style={({ pressed }) => [styles.acceptButton, (pressed || busy) && styles.pressed]}
              >
                <Text style={styles.primaryText}>Send reason & decline</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Invite technician</Text>
              <Pressable onPress={() => setAdding(false)} hitSlop={10} style={styles.close}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            {loadingCandidates ? (
              <ActivityIndicator style={{ margin: 30 }} color={colors.accent} />
            ) : candidates.length === 0 ? (
              <Text style={[styles.body, { textAlign: 'center', margin: 24 }]}>
                No technicians to invite. Everyone else is already in a team or already invited, or no
                other technician has been added yet.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 380 }}>
                {candidates.map((c) => (
                  <View key={c.user_id} style={styles.candidate}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{c.full_name}</Text>
                      <Text style={styles.memberId}>{c.employee_number || 'No staff ID yet'}</Text>
                    </View>
                    <Pressable
                      onPress={() => void inviteMember(c)}
                      disabled={busy || count >= MAX_MEMBERS}
                      style={({ pressed }) => [styles.addButton, (pressed || busy) && styles.pressed]}
                    >
                      <Text style={styles.addButtonText}>INVITE</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 18,
    alignItems: 'center',
  },
  bigIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 6 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
    height: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 14,
    marginTop: 16,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignSelf: 'stretch',
    marginTop: 14,
  },
  primaryText: { color: colors.bg, fontSize: 14, fontWeight: '900' },
  summary: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryBox: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: 12,
    alignItems: 'center',
  },
  summaryValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
  summaryLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 3 },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.accent, fontSize: 17, fontWeight: '900' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: { color: colors.text, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  leaderTag: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  leaderTagText: { color: colors.accent, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  memberId: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '800' },
  memberActions: { flexDirection: 'row', gap: 8 },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 14,
  },
  leaveText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  inviteCard: { marginBottom: 14 },
  inviteButtons: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 14 },
  acceptButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  sectionLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 8 },
  sentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 8,
  },
  reasonText: { color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: 5 },
  footnote: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 16 },
  pressed: { opacity: 0.75 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 8,
  },
  addButton: {
    height: 36,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: colors.bg, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
})
