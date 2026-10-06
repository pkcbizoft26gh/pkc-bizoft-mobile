import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

import { colors } from '@/constants/theme'

// Two faint, slowly drifting glow orbs in the screen corners. Purely
// decorative: very low opacity and it never blocks touches.

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

export function AmbientGlow() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Orb duration={7000} style={{ top: -90, right: -80, backgroundColor: colors.accent }} />
      <Orb duration={9000} style={{ bottom: 40, left: -110, backgroundColor: colors.info }} />
    </View>
  )
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.05,
  },
})
