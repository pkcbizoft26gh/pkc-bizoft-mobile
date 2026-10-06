import AsyncStorage from '@react-native-async-storage/async-storage'
import * as LocalAuthentication from 'expo-local-authentication'

const ENABLED_KEY = 'biometric-lock-enabled'

/** True when this phone has a fingerprint / face sensor with something enrolled. */
export async function biometricAvailable() {
  try {
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ])
    return hardware && enrolled
  } catch {
    return false
  }
}

export async function isBiometricLockEnabled() {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === '1'
  } catch {
    return false
  }
}

export async function setBiometricLockEnabled(enabled: boolean) {
  try {
    if (enabled) await AsyncStorage.setItem(ENABLED_KEY, '1')
    else await AsyncStorage.removeItem(ENABLED_KEY)
  } catch {
    // The lock simply stays as it was if storage fails.
  }
}

/** Shows the system fingerprint / face prompt. Resolves true when it succeeds. */
export async function unlockWithBiometrics(message = 'Unlock PKC BIZOFT') {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: message,
      cancelLabel: 'Cancel',
    })
    return result.success
  } catch {
    return false
  }
}
