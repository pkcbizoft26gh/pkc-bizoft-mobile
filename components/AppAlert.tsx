import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii, shadows } from '@/constants/theme'

// Drop-in replacement for React Native's Alert.alert that uses the app's own
// design. Import { Alert } from '@/components/AppAlert' and call Alert.alert()
// exactly as before; <AlertHost /> (mounted once in the root layout) renders it.

export type AlertButton = {
  text?: string
  style?: 'default' | 'cancel' | 'destructive'
  onPress?: () => void
}

type AlertItem = {
  id: number
  title: string
  message?: string
  buttons: AlertButton[]
}

type Listener = (item: AlertItem) => void

let nextId = 1
let listener: Listener | null = null
const pending: AlertItem[] = []

function alert(title: string, message?: string, buttons?: AlertButton[]) {
  const item: AlertItem = {
    id: nextId++,
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
  }

  if (listener) listener(item)
  else pending.push(item)
}

export const Alert = { alert }

type Tone = 'danger' | 'success' | 'warning' | 'info'

function toneFor(item: AlertItem): Tone {
  const text = `${item.title} ${item.message ?? ''}`.toLowerCase()

  if (item.buttons.some((b) => b.style === 'destructive')) return 'warning'
  if (/(unable|failed|invalid|error|required|missing|too short|can't|cannot|not available|lost|no internet)/.test(text)) {
    return 'danger'
  }
  if (/(success|submitted|scheduled|removed|saved|sent|complete|updated|thank)/.test(text)) return 'success'
  return 'info'
}

const TONES: Record<Tone, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  danger: { icon: 'alert-circle', color: colors.danger },
  success: { icon: 'checkmark-circle', color: colors.success },
  warning: { icon: 'warning', color: colors.medium },
  info: { icon: 'information-circle', color: colors.accent },
}

export function AlertHost() {
  const [queue, setQueue] = useState<AlertItem[]>([])
  const fade = useRef(new Animated.Value(0)).current
  const current = queue[0]

  useEffect(() => {
    listener = (item) => setQueue((q) => [...q, item])
    if (pending.length > 0) {
      const items = pending.splice(0, pending.length)
      setQueue((q) => [...q, ...items])
    }
    return () => {
      listener = null
    }
  }, [])

  useEffect(() => {
    if (!current) return
    fade.setValue(0)
    Animated.timing(fade, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [current?.id, fade])

  const close = useCallback((button?: AlertButton) => {
    setQueue((q) => q.slice(1))
    // Run after the popup is gone so a button that opens another popup works.
    setTimeout(() => button?.onPress?.(), 0)
  }, [])

  if (!current) return null

  const tone = TONES[toneFor(current)]
  const cancel = current.buttons.find((b) => b.style === 'cancel')
  const stacked = current.buttons.length > 2

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent onRequestClose={() => close(cancel)}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Animated.View
          style={[
            styles.card,
            {
              borderColor: tone.color + '55',
              transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: tone.color + '22', borderColor: tone.color + '66' }]}>
            <Ionicons name={tone.icon} size={30} color={tone.color} />
          </View>

          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}

          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            {current.buttons.map((button, index) => {
              const destructive = button.style === 'destructive'
              const isCancel = button.style === 'cancel'
              const primary = !isCancel && !destructive && index === current.buttons.length - 1

              return (
                <Pressable
                  key={`${button.text}-${index}`}
                  onPress={() => close(button)}
                  style={({ pressed }) => [
                    styles.button,
                    !stacked && styles.buttonFlex,
                    primary && { backgroundColor: colors.accent, borderColor: colors.accent },
                    destructive && { backgroundColor: colors.danger + '22', borderColor: colors.danger + '88' },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      primary && { color: colors.bg },
                      destructive && { color: colors.danger },
                    ]}
                  >
                    {button.text || 'OK'}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 12, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: 'center',
    ...shadows.card,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: radii.round,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    alignSelf: 'stretch',
  },
  buttonsStacked: {
    flexDirection: 'column',
  },
  button: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFlex: {
    flex: 1,
  },
  buttonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.75,
  },
})
