import { memo, useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native'

import { colors } from '@/constants/theme'

// A calm, futuristic backdrop. It sits BEHIND every screen (screens are
// transparent), so it can never cover a button or text. It is deliberately
// quiet: a barely-there grid and two soft glows that drift very slowly, all on
// the native animation driver.

const VIOLET = '#7B5CFF'

function loop(value: Animated.Value, duration: number, delay = 0) {
  const animation = Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]),
  )
  animation.start()
  return animation
}

function Orb({ color, size, style, duration, dx, dy }: {
  color: string
  size: number
  style: object
  duration: number
  dx: number
  dy: number
}) {
  const drift = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = loop(drift, duration)
    return () => animation.stop()
  }, [drift, duration])

  return (
    <Animated.View
      style={[
        { position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
        {
          opacity: drift.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.1] }),
          transform: [
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
            { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
          ],
        },
      ]}
    >
      {/* inner halo gives the orb a soft, bright core instead of a flat disc */}
      <View
        style={{
          position: 'absolute',
          top: size * 0.22,
          left: size * 0.22,
          width: size * 0.56,
          height: size * 0.56,
          borderRadius: size,
          backgroundColor: color,
          opacity: 0.55,
        }}
      />
    </Animated.View>
  )
}

function Grid({ width, height }: { width: number; height: number }) {
  const columns = Math.ceil(width / 46)
  const rows = Math.ceil(height / 46)

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: columns + 1 }, (_, i) => (
        <View key={`c${i}`} style={[styles.gridV, { left: i * 46 }]} />
      ))}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <View key={`r${i}`} style={[styles.gridH, { top: i * 46 }]} />
      ))}
      {/* fade the grid out toward the middle so content stays calm */}
      <View style={[styles.gridFade, { top: height * 0.18, height: height * 0.5 }]} />
    </View>
  )
}

function AmbientGlowBase() {
  const { width, height } = useWindowDimensions()

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Grid width={width} height={height} />
      <Orb color={colors.accent} size={300} style={{ top: -130, right: -120 }} duration={14000} dx={-18} dy={24} />
      <Orb color={VIOLET} size={280} style={{ bottom: -110, left: -130 }} duration={17000} dx={22} dy={-20} />
    </View>
  )
}

export const AmbientGlow = memo(AmbientGlowBase)

const styles = StyleSheet.create({
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.accent,
    opacity: 0.035,
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.accent,
    opacity: 0.035,
  },
  gridFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    opacity: 0.55,
  },
})
