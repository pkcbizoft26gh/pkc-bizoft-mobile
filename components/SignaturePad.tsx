import { useMemo, useRef, useState } from 'react'
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'

import { colors, radii } from '@/constants/theme'
import type { Stroke } from '@/lib/jobEvidence'

/** A box the customer signs in with a finger. Drawn as a continuous line, saved as strokes. */
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
          stroke.length === 1
            ? [<View key={`${i}-dot`} pointerEvents="none" style={[styles.dot, { left: stroke[0].x - 1.5, top: stroke[0].y - 1.5 }]} />]
            : stroke.slice(1).map((p, j) => {
                // Each piece joins one point to the next, so the signature is one unbroken line.
                const a = stroke[j]
                const dx = p.x - a.x
                const dy = p.y - a.y
                const length = Math.hypot(dx, dy)
                if (length < 0.5) return null
                return (
                  <View
                    key={`${i}-${j}`}
                    pointerEvents="none"
                    style={[
                      styles.segment,
                      {
                        width: length + 1,
                        left: (a.x + p.x) / 2 - (length + 1) / 2,
                        top: (a.y + p.y) / 2 - 1.25,
                        transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                      },
                    ]}
                  />
                )
              }),
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
  segment: { position: 'absolute', height: 2.5, borderRadius: 2, backgroundColor: colors.accent },
  clear: { color: colors.accent, fontSize: 12, fontWeight: '800', marginTop: 8 },
})
