import { ReactNode, useRef } from 'react'
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native'

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** Scale while pressed. */
  pressedScale?: number
}

// A pressable that springs down slightly while held, for tactile feedback.
export function PressableScale({ children, style, pressedScale = 0.97, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current

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
      onPressIn={(event) => {
        animateTo(pressedScale)
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        animateTo(1)
        onPressOut?.(event)
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}
