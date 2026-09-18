import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/constants/theme'

export function RobotMark({ small = false }: { small?: boolean }) {
  const size = small ? 42 : 72

  return (
    <View style={[styles.shell, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <View style={[styles.antenna, { height: small ? 7 : 12 }]} />
      <View style={styles.face}>
        <View style={[styles.eye, { width: small ? 5 : 8, height: small ? 5 : 8 }]} />
        <View style={[styles.eye, { width: small ? 5 : 8, height: small ? 5 : 8 }]} />
      </View>
      {!small && (
        <View style={styles.smile}>
          <Text style={styles.smileText}>⌣</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#0b2542',
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8
  },
  antenna: {
    position: 'absolute',
    top: -8,
    width: 2,
    backgroundColor: colors.accent
  },
  face: {
    flexDirection: 'row',
    gap: 14
  },
  eye: {
    borderRadius: 99,
    backgroundColor: colors.accent
  },
  smile: {
    marginTop: 7
  },
  smileText: {
    color: colors.accent,
    fontSize: 16
  }
})
