import { supabase } from '@/lib/supabase'

// Wrong-password lockout. The database counts the failures per email address
// (5 wrong passwords in 15 minutes lock that address for 15 minutes). The free
// Supabase plan cannot stop a sign-in on the server, so this app checks first
// and signs out again if an account turns out to be locked. If the check itself
// fails (no network, function missing) it never blocks a real sign-in.

export type LockStatus = {
  locked: boolean
  secondsLeft: number
  attemptsLeft: number
}

const OPEN: LockStatus = { locked: false, secondsLeft: 0, attemptsLeft: 5 }

function parse(data: unknown): LockStatus {
  const row = (data ?? {}) as { locked?: boolean; seconds_left?: number; attempts_left?: number }
  return {
    locked: !!row.locked,
    secondsLeft: Number(row.seconds_left ?? 0),
    attemptsLeft: Number(row.attempts_left ?? 5),
  }
}

export async function checkLock(email: string): Promise<LockStatus> {
  try {
    const { data, error } = await supabase.rpc('login_status', { p_email: email })
    return error ? OPEN : parse(data)
  } catch {
    return OPEN
  }
}

export async function recordAttempt(email: string, success: boolean): Promise<LockStatus> {
  try {
    const { data, error } = await supabase.rpc('record_login_attempt', { p_email: email, p_success: success })
    return error ? OPEN : parse(data)
  } catch {
    return OPEN
  }
}

export function lockMessage(secondsLeft: number) {
  const minutes = Math.max(1, Math.ceil(secondsLeft / 60))
  return `Too many wrong passwords. For your security, sign-in is paused for about ${minutes} minute${minutes === 1 ? '' : 's'}. You can also use "Forgot password".`
}

export function attemptsMessage(attemptsLeft: number) {
  if (attemptsLeft <= 0 || attemptsLeft > 2) return ''
  return ` You have ${attemptsLeft} more ${attemptsLeft === 1 ? 'try' : 'tries'} before sign-in is paused.`
}
