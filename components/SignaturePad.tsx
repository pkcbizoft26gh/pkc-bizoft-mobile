import { useMemo, useRef, useState } from 'react'
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'

import { colors, radii } from '@/constants/theme'
import type { Stroke } from '@/lib/jobEvidence'

/** A box the customer signs in with a finger. Drawn as dots, saved as strokes. */
export function SignaturePad({ strokes, onChange }: { strokes: Stroke[]; onChange: (next: Stroke[]) => void }) {
  const live = useRef<Stroke[]>(strokes)
  const [, bump] = useState(0)
  const box = useRef({ w: 1, h: 1 })

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Keep the scroll view from stealing the gesture.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          live.current = [...live.current, [{ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }]]
          bump((n) => n + 1)
        },
        onPanResponderMove: (event) => {
          const stroke = live.current[live.current.length - 1]
          if (!stroke) return
          stroke.push({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY })
          bump((n) => n + 1)
        },
        onPanResponderRelease: () => onChange(live.current.map((s) => [...s])),
      }),
    [onChange],
  )

  return (
    <View>
      <View
        style={styles.pad}
        onLayout={(e) => (box.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        {...responder.panHandlers}
      >
        {live.current.length === 0 ? <Text style={styles.placeholder}>Customer signs here</Text> : null}
        {live.current.flatMap((stroke, i) =>
          stroke.map((p, j) => <View key={`${i}-${j}`} pointerEvents="none" style={[styles.dot, { left: p.x - 1.5, top: p.y - 1.5 }]} />),
        )}
      </View>
      <Pressable
        onPress={() => {
          live.current = []
          onChange([])
          bump((n) => n + 1)
        }}
        hitSlop={8}
      >
        <Text style={styles.clear}>Clear signature</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  pad: {
    height: 130,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    overflow: 'hidden',
  },
  placeholder: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 55 },
  dot: { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: colors.accent },
  clear: { color: colors.accent, fontSize: 12, fontWeight: '800', marginTop: 8 },
})
