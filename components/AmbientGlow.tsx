import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

import { colors } from '@/constants/theme'

// Soft drifting glow orbs and a few twinkling dots that sit over the screen
// corners. Purely decorative: low opacity and it never blocks touches.

const DOTS = [
  { top: '14%', left: '8%', size: 3, delay: 0 },
  { top: '22%', left: '86%', size: 4, delay: 700 },
  { top: '46%', left: '4%', size: 3, delay: 1400 },
  { top: '61%', left: '92%', size: 3, delay: 400 },
  { top: '78%', left: '12%', size: 4, delay: 1100 },
] as const

function Orb({ style, duration }: { style: object; duration: number }) {
  const drift = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [drift, duration])

  return (
    <Animated.View
      style={[
        styles.orb,
        style,
        {
          transform: [
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) },
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
          ],
        },
      ]}
    />
  )
}

function Dot({ top, left, size, delay }: (typeof DOTS)[number]) {
  const twinkle = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(twinkle, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [twinkle, delay])

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top,
        left,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: colors.accent,
        opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.5] }),
      }}
    />
  )
}

export function AmbientGlow() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Orb duration={7000} style={{ top: -90, right: -80, backgroundColor: colors.accent }} />
      <Orb duration={9000} style={{ bottom: 40, left: -110, backgroundColor: colors.info }} />
      {DOTS.map((dot, index) => (
        <Dot key={index} {...dot} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.07,
  },
})
