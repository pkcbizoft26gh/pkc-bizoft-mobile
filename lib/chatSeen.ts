import AsyncStorage from '@react-native-async-storage/async-storage'

import { supabase } from '@/lib/supabase'

// Which job chats have messages the signed-in person has not read yet.
// "Read" is kept on this phone only: the last time the chat was open.

const key = (requestId: string) => `chat-seen-${requestId}`

// The conversation on screen right now, so a new message there needs no banner.
let openChat: string | null = null
export function setOpenChat(requestId: string | null) {
  openChat = requestId
}
export function getOpenChat() {
  return openChat
}
const listeners = new Set<(requestId: string) => void>()

/** Remembers that the chat for this request was just read, and tells listeners. */
export async function markChatSeen(requestId: string) {
  try {
    await AsyncStorage.setItem(key(requestId), String(Date.now()))
  } catch {
    // Not critical.
  }
  listeners.forEach((listener) => listener(requestId))
}

/** Called after a chat was read, so screens can clear their unread dots. */
export function subscribeChatSeen(listener: (requestId: string) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export type UnreadChat = { requestId: string; at: number; senderName: string | null; body: string }

/** The newest unread message from someone else, per request id (requests without one are left out). */
export async function unreadChats(requestIds: string[], myId: string): Promise<Map<string, UnreadChat>> {
  const ids = [...new Set(requestIds)].slice(0, 100)
  const result = new Map<string, UnreadChat>()
  if (ids.length === 0) return result

  const [{ data }, seenPairs] = await Promise.all([
    supabase
      .from('ticket_messages')
      .select('request_id, sender_name, body, created_at')
      .in('request_id', ids)
      .neq('sender_user_id', myId)
      .order('created_at', { ascending: false })
      .limit(300),
    AsyncStorage.multiGet(ids.map(key)).catch(() => [] as readonly [string, string | null][]),
  ])

  const seen = new Map(seenPairs.map(([k, v]) => [k, Number(v || 0)]))
  for (const row of (data ?? []) as { request_id: string; sender_name: string | null; body: string; created_at: string }[]) {
    if (result.has(row.request_id)) continue
    const at = new Date(row.created_at).getTime()
    if (at > (seen.get(key(row.request_id)) ?? 0)) {
      result.set(row.request_id, { requestId: row.request_id, at, senderName: row.sender_name, body: row.body })
    }
  }
  return result
}
