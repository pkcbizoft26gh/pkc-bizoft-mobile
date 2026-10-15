import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, radii } from '@/constants/theme'

// Grey-blue placeholder shapes that pulse while a screen loads, so the page looks
// like it is already there instead of showing a spinner. One animation drives every
// block in a group, which keeps it cheap on weaker phones.

const PulseContext = createContext<Animated.Value | null>(null)

export function SkeletonGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  return (
    <PulseContext.Provider value={pulse}>
      <View style={style} accessibilityLabel="Loading" accessibilityRole="progressbar">
        {children}
      </View>
    </PulseContext.Provider>
  )
}

export function Bone({
  width = '100%',
  height = 14,
  radius = 8,
  style,
}: {
  width?: DimensionValue
  height?: number
  radius?: number
  style?: StyleProp<ViewStyle>
}) {
  const pulse = useContext(PulseContext)
  const opacity = pulse ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }) : 0.6
  return <Animated.View style={[styles.bone, { width, height, borderRadius: radius, opacity }, style]} />
}

/** A card-shaped block with a title line and a few text lines. */
export function SkeletonCard({ lines = 2, height }: { lines?: number; height?: number }) {
  return (
    <View style={[styles.card, height ? { minHeight: height } : null]}>
      <Bone width="45%" height={16} />
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} width={i === lines - 1 ? '65%' : '100%'} height={12} />
      ))}
    </View>
  )
}

/** A list row: round icon, two lines of text and a short value on the right. */
export function SkeletonRow() {
  return (
    <View style={styles.row}>
      <Bone width={42} height={42} radius={21} />
      <View style={{ flex: 1, gap: 8 }}>
        <Bone width="60%" height={14} />
        <Bone width="85%" height={11} />
      </View>
      <Bone width={52} height={14} />
    </View>
  )
}

/** Rows for inside a sheet, modal or card that is loading. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <SkeletonGroup style={{ paddingVertical: 8 }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </SkeletonGroup>
  )
}

/**
 * A whole screen while it loads. "home" = header, a big card, then cards;
 * "list" = title and rows; "profile" = avatar, name and detail rows.
 */
export function SkeletonScreen({ variant = 'home' }: { variant?: 'home' | 'list' | 'profile' }) {
  const insets = useSafeAreaInsets()
  return (
    <SkeletonGroup style={[styles.screen, { paddingTop: insets.top + 18 }]}>
      {variant === 'profile' ? (
        <View style={styles.profileHead}>
          <Bone width={84} height={84} radius={42} />
          <Bone width="50%" height={18} />
          <Bone width="35%" height={12} />
        </View>
      ) : (
        <View style={{ gap: 8, marginBottom: 6 }}>
          <Bone width="40%" height={22} />
          <Bone width="65%" height={12} />
        </View>
      )}

      {variant === 'home' ? (
        <>
          <SkeletonCard lines={3} height={150} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </>
      ) : variant === 'list' ? (
        <View style={styles.card}>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      ) : (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      )}
    </SkeletonGroup>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 18, gap: 14 },
  bone: { backgroundColor: colors.border },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  profileHead: { alignItems: 'center', gap: 10, marginBottom: 6 },
})
