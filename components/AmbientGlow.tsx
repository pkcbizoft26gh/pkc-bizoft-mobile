import { memo, useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native'

import { colors } from '@/constants/theme'

// The app's "from the future" backdrop. It sits BEHIND every screen (screens
// are transparent), so it can never cover a button or text. Everything that
// moves uses transforms and opacity on the native driver, so it stays smooth
// and costs almost nothing on the JS thread.
//
//   grid        faint static grid
//   orbs        three large soft glows drifting slowly
//   scan beam   a thin light sweep gliding down the screen
//   particles   motes of light rising and fading
//   brackets    HUD corner marks that breathe

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
          opacity: drift.interpolate({ inputRange: [0, 1], outputRange: [0.07, 0.13] }),
          transform: [
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
            { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
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

function ScanBeam({ height }: { height: number }) {
  const sweep = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(2500),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [sweep])

  return (
    <Animated.View
      style={[
        styles.beam,
        {
          opacity: sweep.interpolate({ inputRange: [0, 0.08, 0.92, 1], outputRange: [0, 1, 1, 0] }),
          transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [-40, height] }) }],
        },
      ]}
    >
      <View style={[styles.beamBand, { opacity: 0.025, height: 46 }]} />
      <View style={[styles.beamBand, { opacity: 0.05, height: 22 }]} />
      <View style={styles.beamLine} />
    </Animated.View>
  )
}

function Particle({ x, size, duration, delay, rise }: {
  x: number
  size: number
  duration: number
  delay: number
  rise: number
}) {
  const t = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [t, duration, delay])

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        bottom: 60,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: colors.accent,
        opacity: t.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.55, 0.3, 0] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -rise] }) },
          { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 10, -6] }) },
        ],
      }}
    />
  )
}

function Brackets() {
  const breathe = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = loop(breathe, 2600)
    return () => animation.stop()
  }, [breathe])

  const opacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.42] })
  const corner = (extra: object) => (
    <Animated.View pointerEvents="none" style={[styles.bracket, extra, { opacity }]} />
  )

  return (
    <>
      {corner({ top: 14, left: 14, borderTopWidth: 1.5, borderLeftWidth: 1.5 })}
      {corner({ top: 14, right: 14, borderTopWidth: 1.5, borderRightWidth: 1.5 })}
      {corner({ bottom: 86, left: 14, borderBottomWidth: 1.5, borderLeftWidth: 1.5 })}
      {corner({ bottom: 86, right: 14, borderBottomWidth: 1.5, borderRightWidth: 1.5 })}
    </>
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

  const particles = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        key: i,
        x: ((i * 0.113 + 0.07) % 1) * width,
        size: 2 + (i % 3),
        duration: 9000 + (i % 4) * 2200,
        delay: i * 900,
        rise: height * (0.45 + (i % 3) * 0.18),
      })),
    [width, height],
  )

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Grid width={width} height={height} />

      <Orb color={colors.accent} size={300} style={{ top: -120, right: -110 }} duration={8000} dx={-26} dy={34} />
      <Orb color={VIOLET} size={260} style={{ top: height * 0.38, left: -140 }} duration={11000} dx={30} dy={-28} />
      <Orb color={colors.info} size={280} style={{ bottom: -90, right: -100 }} duration={9500} dx={-22} dy={-30} />

      <ScanBeam height={height} />

      {particles.map(({ key, ...p }) => (
        <Particle key={key} {...p} />
      ))}

      <Brackets />
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
    opacity: 0.06,
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.accent,
    opacity: 0.06,
  },
  gridFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    opacity: 0.55,
  },
  beam: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  beamBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: colors.accent,
  },
  beamLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 44,
    height: 1.5,
    backgroundColor: colors.accent,
    opacity: 0.35,
  },
  bracket: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: colors.accent,
  },
})
