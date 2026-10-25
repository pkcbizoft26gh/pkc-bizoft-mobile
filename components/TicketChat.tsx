import { SkeletonRows } from '@/components/Skeleton'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, radii } from '@/constants/theme'
import { Alert } from '@/components/AppAlert'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { markChatSeen, setOpenChat } from '@/lib/chatSeen'
import { useLiveRefresh } from '@/lib/live'

// A message thread on one issue report. Customers, the technician on the job
// and support staff all see the same conversation. The database decides who may
// read and write (see ticket_role / send_ticket_message); this screen just
// refreshes every few seconds while it is open.

type Message = {
  id: string
  sender_user_id: string
  sender_role: 'customer' | 'technician' | 'staff'
  sender_name: string | null
  body: string
  photo_path: string | null
  created_at: string
}

type Props = {
  visible: boolean
  requestId: string | null
  title: string
  subtitle?: string
  /** The thread is closed (for example the request was cancelled). */
  closed?: boolean
  onClose: () => void
}

const POLL_MS = 6000
const PHOTO_BUCKET = 'chat-photos'
// Signed photo links last an hour; they are refreshed before that.
const PHOTO_LINK_SECONDS = 3600
const MAX = 1000

const ROLE_LABEL: Record<Message['sender_role'], string> = {
  customer: 'Customer',
  technician: 'Technician',
  staff: 'Support',
}

function timeLabel(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
  return sameDay ? time : `${date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}, ${time}`
}

export function TicketChat({ visible, requestId, title, subtitle, closed, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList<Message>>(null)
  const [me, setMe] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  // Signed links for the photos in this chat, by storage path.
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [viewing, setViewing] = useState<string | null>(null)

  // Gets viewable links for photos that do not have one yet.
  const linkedRef = useRef<Set<string>>(new Set())
  const linkPhotos = useCallback(async (rows: Message[]) => {
    const need = rows
      .map((row) => row.photo_path)
      .filter((path): path is string => !!path && !linkedRef.current.has(path))
    if (need.length === 0) return
    need.forEach((path) => linkedRef.current.add(path))
    const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(need, PHOTO_LINK_SECONDS)
    const next: Record<string, string> = {}
    for (const item of data ?? []) if (item.path && item.signedUrl) next[item.path] = item.signedUrl
    // Ones that failed are tried again on the next refresh.
    need.filter((path) => !next[path]).forEach((path) => linkedRef.current.delete(path))
    if (Object.keys(next).length > 0) setPhotoUrls((latest) => ({ ...latest, ...next }))
  }, [])

  const load = useCallback(async () => {
    if (!requestId) return
    const { data, error: loadError } = await supabase
      .from('ticket_messages')
      .select('id, sender_user_id, sender_role, sender_name, body, photo_path, created_at')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true })
      .limit(300)

    if (loadError) {
      setError(friendlyError(loadError, 'Could not load the messages.'))
    } else {
      setError('')
      const rows = (data ?? []) as Message[]
      setMessages(rows)
      void linkPhotos(rows)
      // The chat is open, so everything in it counts as read.
      void markChatSeen(requestId)
    }
    setLoading(false)
  }, [requestId, linkPhotos])

  // A new message in this conversation shows up at once.
  useLiveRefresh(['ticket_messages'], load, {
    enabled: visible && !!requestId,
    filter: requestId ? `request_id=eq.${requestId}` : undefined,
  })

  // While this chat is on screen, new messages in it need no banner.
  useEffect(() => {
    if (!visible || !requestId) return undefined
    setOpenChat(requestId)
    return () => setOpenChat(null)
  }, [visible, requestId])

  useEffect(() => {
    if (!visible || !requestId) return undefined
    setLoading(true)
    setMessages([])
    void supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null))
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [visible, requestId, load])

  // Ask camera or gallery first, then only the permission that choice needs.
  function sendPhoto() {
    if (!requestId || sending) return
    const pick = async (fromCamera: boolean) => {
      try {
        const permission = fromCamera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!permission.granted) {
          setError(fromCamera ? 'Allow the camera for PKC BIZOFT to take a photo.' : 'Allow photo access for PKC BIZOFT to send a picture.')
          return
        }
        const options = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 }
        const result = fromCamera
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options)
        if (result.canceled || !result.assets?.[0]?.uri) return
        await uploadAndSend(result.assets[0].uri)
      } catch {
        setError('Could not open the camera or photos.')
      }
    }
    Alert.alert('Send a photo', 'Show the modem lights, the place, or anything that helps.', [
      { text: 'Take a photo', onPress: () => void pick(true) },
      { text: 'Choose from gallery', onPress: () => void pick(false) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  async function uploadAndSend(uri: string) {
    if (!requestId) return
    setSending(true)
    setError('')
    try {
      const bytes = await (await fetch(uri)).arrayBuffer()
      const path = `${requestId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false })
      if (uploadError) throw uploadError
      const { error: sendError } = await supabase.rpc('send_ticket_message', {
        p_request_id: requestId,
        p_body: draft.trim(),
        p_photo_path: path,
      })
      if (sendError) throw sendError
      setDraft('')
      await load()
    } catch (e: any) {
      setError(friendlyError(e, 'Could not send the photo.'))
    } finally {
      setSending(false)
    }
  }

  async function send() {
    const body = draft.trim()
    if (!body || !requestId || sending) return
    setSending(true)
    setError('')
    try {
      const { error: sendError } = await supabase.rpc('send_ticket_message', { p_request_id: requestId, p_body: body })
      if (sendError) throw sendError
      setDraft('')
      await load()
    } catch (e: any) {
      setError(friendlyError(e, 'Could not send your message.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close chat" style={styles.back}>
            <Ionicons name="chevron-down" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {loading ? (
          <SkeletonRows count={4} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={40} color={colors.muted} />
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptyText}>
                  Ask a question or share an update. Everyone on this job can read it.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const mine = item.sender_user_id === me
              return (
                <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {!mine ? (
                      <Text style={styles.sender}>
                        {item.sender_name || ROLE_LABEL[item.sender_role]} · {ROLE_LABEL[item.sender_role]}
                      </Text>
                    ) : null}
                    {item.photo_path ? (
                      <Pressable
                        onPress={() => photoUrls[item.photo_path as string] && setViewing(photoUrls[item.photo_path as string])}
                        accessibilityRole="imagebutton"
                        accessibilityLabel="Photo, tap to open"
                      >
                        {photoUrls[item.photo_path] ? (
                          <Image source={{ uri: photoUrls[item.photo_path] }} style={styles.photo} resizeMode="cover" />
                        ) : (
                          <View style={[styles.photo, styles.photoLoading]}>
                            <ActivityIndicator color={mine ? colors.bg : colors.accent} />
                          </View>
                        )}
                      </Pressable>
                    ) : null}
                    {item.body ? <Text style={[styles.body, mine && styles.bodyMine]}>{item.body}</Text> : null}
                    <Text style={[styles.time, mine && styles.timeMine]}>{timeLabel(item.created_at)}</Text>
                  </View>
                </View>
              )
            }}
          />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {closed ? (
          <View style={[styles.closed, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.closedText}>This conversation is closed.</Text>
          </View>
        ) : (
          <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
            <Pressable
              onPress={sendPhoto}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel="Send a photo"
              style={({ pressed }) => [styles.attach, sending && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="camera" size={21} color={colors.accent} />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={(text) => setDraft(text.slice(0, MAX))}
              placeholder="Write a message"
              placeholderTextColor={colors.muted}
              multiline
              style={styles.input}
              accessibilityLabel="Message"
            />
            <Pressable
              onPress={() => void send()}
              disabled={sending || !draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              style={({ pressed }) => [styles.send, (sending || !draft.trim()) && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
            >
              {sending ? <ActivityIndicator color={colors.bg} /> : <Ionicons name="send" size={20} color={colors.bg} />}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityLabel="Close photo">
          {viewing ? <Image source={{ uri: viewing }} style={styles.viewerImage} resizeMode="contain" /> : null}
          <View style={[styles.viewerClose, { top: insets.top + 12 }]}>
            <Ionicons name="close" size={24} color={colors.white} />
          </View>
        </Pressable>
      </Modal>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radii.round,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.white, fontSize: 17, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 60, paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.lg },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 4 },
  sender: { color: colors.accent, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  bodyMine: { color: colors.bg },
  time: { color: colors.muted, fontSize: 12, marginTop: 4, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(5,11,20,0.6)' },
  error: { color: colors.danger, fontSize: 12, paddingHorizontal: 16, paddingBottom: 6 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.panel,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.lg,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
  },
  attach: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.cardLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { width: 220, height: 220, borderRadius: radii.md, marginBottom: 6, backgroundColor: colors.cardLight },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closed: { paddingTop: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.panel },
  closedText: { color: colors.muted, fontSize: 13 },
})
