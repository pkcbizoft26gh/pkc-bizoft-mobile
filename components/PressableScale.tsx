import { ReactNode, useRef } from 'react'
import { Animated, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native'

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** Scale while pressed. */
  pressedScale?: number
}

// Layout styles belong on the outer tap area. If they stayed on the inner
// animated view, a percentage width would be measured against a tap area that
// shrinks to its content and the card would collapse to a narrow strip.
const OUTER_KEYS = [
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
] as const

function splitStyle(style: StyleProp<ViewStyle>) {
  const flat = (StyleSheet.flatten(style) || {}) as Record<string, unknown>
  const outer: Record<string, unknown> = {}
  const inner: Record<string, unknown> = {}

  for (const key of Object.keys(flat)) {
    if ((OUTER_KEYS as readonly string[]).includes(key)) {
      outer[key] = flat[key]
    } else {
      inner[key] = flat[key]
    }
  }

  return { outer: outer as ViewStyle, inner: inner as ViewStyle }
}

// A pressable that springs down slightly while held, for tactile feedback.
export function PressableScale({ children, style, pressedScale = 0.97, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current
  const { outer, inner } = splitStyle(style)

  // When the outer area has a fixed size, the card inside fills it.
  const fills = outer.height !== undefined || outer.flex !== undefined

  const animateTo = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      friction: 7,
      tension: 160,
      useNativeDriver: true,
    }).start()

  return (
    <Pressable
      {...rest}
      style={outer}
      onPressIn={(event) => {
        animateTo(pressedScale)
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        animateTo(1)
        onPressOut?.(event)
      }}
    >
      <Animated.View style={[inner, fills && { flexGrow: 1 }, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}
