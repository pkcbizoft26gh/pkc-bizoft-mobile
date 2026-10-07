import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'

import { supabase } from '@/lib/supabase'

/**
 * Saves this phone's push token so the server can alert the customer even
 * when the app is closed (payment verified / not accepted). Safe to call on
 * every open; it only talks to the server when the token is new.
 */
export async function registerForPush() {
  try {
    if (Platform.OS !== 'android') return
    const current = await Notifications.getPermissionsAsync()
    const granted = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted)
    if (!granted) return

    const token = (await Notifications.getDevicePushTokenAsync()).data
    if (typeof token !== 'string' || !token) return

    await supabase.rpc('register_push_token', { p_token: token, p_platform: 'android' })
  } catch (error) {
    // Push is a convenience; never break the screen because of it.
    console.warn('Could not register for push:', error)
  }
}
