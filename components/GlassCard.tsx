import { ReactNode } from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { colors, radii, shadows } from '@/constants/theme'
import { FadeIn } from './FadeIn'
import { PressableScale } from './PressableScale'

type Props = {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** Makes the card tappable with press feedback. */
  onPress?: () => void
  /** Fade/rise the card in. Pass a delay in ms to stagger a list of cards. */
  enterDelay?: number
}

export function GlassCard({ children, style, onPress, enterDelay }: Props) {
  const card = onPress ? (
    <PressableScale onPress={onPress} style={[styles.card, style]}>
      {children}
    </PressableScale>
  ) : (
    <View style={[styles.card, style]}>{children}</View>
  )

  return enterDelay === undefined ? card : <FadeIn delay={enterDelay}>{card}</FadeIn>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    ...shadows.card
  }
})
