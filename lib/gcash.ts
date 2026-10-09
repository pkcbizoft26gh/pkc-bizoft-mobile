import { Linking, Platform } from 'react-native'

import { Alert } from '@/components/AppAlert'

// The GCash InstaPay QR that customers scan to pay (bundled with the app).
export const GCASH_QR_IMAGE = require('../assets/images/gcash-qr-crop.png')

/**
 * GCash has no public link that pre-fills a business payment, so this opens the
 * app and the customer scans the QR. Try the app first, then the store listing
 * (app not installed), then the GCash website. openURL is attempted directly
 * instead of gating on canOpenURL, which reports false on Android 11+ unless
 * the package is declared.
 */
export async function openGcashApp() {
  const storeUrl =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/ph/app/gcash/id520020791'
      : 'market://details?id=com.globe.gcash.android'

  const attempts = [
    { url: 'gcash://', label: 'app' },
    { url: storeUrl, label: 'store' },
    { url: 'https://www.gcash.com', label: 'web' },
  ]

  for (const attempt of attempts) {
    try {
      await Linking.openURL(attempt.url)

      if (attempt.label === 'store') {
        Alert.alert('Install GCash', 'GCash is not installed on this phone. Install it, then come back and scan the QR to pay.')
      } else if (attempt.label === 'web') {
        Alert.alert('Opened GCash website', 'Use the GCash app on this or another phone to scan the QR and pay the exact amount shown.')
      }
      return
    } catch (error) {
      console.warn('GCash launch attempt failed:', attempt.label, error)
    }
  }

  Alert.alert('Unable to open GCash', 'Please open the GCash app manually and scan the QR shown here.')
}
