import { Alert, Linking, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'

import { supabase } from '@/lib/supabase'

/** Server pushes use this channel (send-push sets channel_id): pops up with sound, shows on the lock screen. */
export const ALERT_CHANNEL_ID = 'pkc-alerts'
const BACKGROUND_TIP_KEY = 'pkc.push.backgroundTipShown'

/** Chat message pushes use this category (send-push sets categoryId): it adds a Reply button with a text box. */
export const CHAT_CATEGORY_ID = 'chat-message'
export const CHAT_REPLY_ACTION = 'reply'

async function ensureChatCategory() {
  await Notifications.setNotificationCategoryAsync(CHAT_CATEGORY_ID, [
    {
      identifier: CHAT_REPLY_ACTION,
      buttonTitle: 'Reply',
      textInput: { submitButtonTitle: 'Send', placeholder: 'Write a reply' },
      // The app opens to send the reply and show the conversation.
      options: { opensAppToForeground: true },
    },
  ])
}

let tokenListener: Notifications.EventSubscription | null = null

async function ensureAlertChannel() {
  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
    name: 'Alerts',
    description: 'Bills, payments, jobs and messages from PKC BIZOFT',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
  })
}

async function saveToken(token: unknown) {
  if (typeof token !== 'string' || !token) return
  // The version tells the server this app can show chat notifications with a Reply button.
  await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: 'android',
    p_app_version: Constants.expoConfig?.version ?? null,
  })
}

/**
 * Budget phones (Xiaomi, Oppo, Vivo, realme...) often stop apps in the background, and then pushes
 * arrive late or never. Once, point the person to the app's settings to allow it.
 */
async function showBackgroundTipOnce() {
  if ((await AsyncStorage.getItem(BACKGROUND_TIP_KEY)) === '1') return
  await AsyncStorage.setItem(BACKGROUND_TIP_KEY, '1')
  Alert.alert(
    'Get every notification on time',
    'Some phones block apps in the background. In the next screen, open Battery and choose "No restrictions" (or allow Autostart), so bills, payments and job updates always reach you.',
    [
      { text: 'Later', style: 'cancel' },
      { text: 'Open settings', onPress: () => void Linking.openSettings() },
    ],
  )
}

/**
 * Saves this phone's push token so the server can alert the person even when the app is closed.
 * Safe to call on every open. Also keeps the token up to date when the phone gets a new one.
 */
export async function registerForPush() {
  try {
    if (Platform.OS !== 'android') return
    await ensureAlertChannel()
    await ensureChatCategory()
    const current = await Notifications.getPermissionsAsync()
    const granted = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted)
    if (!granted) return

    await saveToken((await Notifications.getDevicePushTokenAsync()).data)

    if (!tokenListener) {
      tokenListener = Notifications.addPushTokenListener((next) => {
        void saveToken(next.data).catch(() => {})
      })
    }

    await showBackgroundTipOnce()
  } catch (error) {
    // Push is a convenience; never break the screen because of it.
    console.warn('Could not register for push:', error)
  }
}
