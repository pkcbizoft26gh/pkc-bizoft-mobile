import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants/theme'

export function RobotMark({ small = false }: { small?: boolean }) {
  const size = small ? 42 : 72
  const eyeSize = small ? 5 : 8

  const float = useRef(new Animated.Value(0)).current
  const blink = useRef(new Animated.Value(1)).current
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Gentle hover.
    const floating = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
      ])
    )

    // Occasional blink: eyes squash shut, then reopen.
    const blinking = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(blink, { toValue: 0.1, duration: 90, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: true })
      ])
    )

    // Antenna tip glow.
    const pulsing = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true })
      ])
    )

    floating.start()
    blinking.start()
    pulsing.start()

    return () => {
      floating.stop()
      blinking.stop()
      pulsing.stop()
    }
  }, [float, blink, pulse])

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, small ? -2 : -4] })
  const tipOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] })
  const tipSize = small ? 6 : 9

  return (
    <Animated.View
      style={[styles.shell, { width: size, height: size, borderRadius: size * 0.3, transform: [{ translateY }] }]}
    >
      <View style={[styles.antenna, { height: small ? 7 : 12 }]} />
      <Animated.View
        style={[
          styles.tip,
          { width: tipSize, height: tipSize, top: small ? -12 : -18, opacity: tipOpacity }
        ]}
      />
      <View style={styles.face}>
        <Animated.View style={[styles.eye, { width: eyeSize, height: eyeSize, transform: [{ scaleY: blink }] }]} />
        <Animated.View style={[styles.eye, { width: eyeSize, height: eyeSize, transform: [{ scaleY: blink }] }]} />
      </View>
      {!small && (
        <View style={styles.smile}>
          <Text style={styles.smileText}>⌣</Text>
        </View>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#0b2542',
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8
  },
  antenna: {
    position: 'absolute',
    top: -8,
    width: 2,
    backgroundColor: colors.accent
  },
  tip: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 6
  },
  face: {
    flexDirection: 'row',
    gap: 14
  },
  eye: {
    borderRadius: 99,
    backgroundColor: colors.accent
  },
  smile: {
    marginTop: 7
  },
  smileText: {
    color: colors.accent,
    fontSize: 16
  }
})
