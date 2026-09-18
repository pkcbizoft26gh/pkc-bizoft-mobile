import { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors, radii } from '@/constants/theme'

export function GlassCard({ children, style }: { children: ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md
  }
})
