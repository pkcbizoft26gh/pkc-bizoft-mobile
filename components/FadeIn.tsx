import { ReactNode, useEffect, useRef } from 'react'
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native'
import { motion } from '@/constants/theme'

type Props = {
  children: ReactNode
  /** Milliseconds to wait before starting. Use index * motion.stagger for lists. */
  delay?: number
  /** Distance in px the content rises from. */
  distance?: number
  style?: StyleProp<ViewStyle>
}

// Fades and rises its children in once on mount.
export function FadeIn({ children, delay = 0, distance = 16, style }: Props) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.slow,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [delay, progress])

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}
