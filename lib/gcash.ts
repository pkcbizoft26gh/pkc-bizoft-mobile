import { Asset } from 'expo-asset'
import * as MediaLibrary from 'expo-media-library'

import { Alert } from '@/components/AppAlert'

// The GCash InstaPay QR that customers pay to (bundled with the app).
export const GCASH_QR_IMAGE = require('../assets/images/gcash-qr-crop.png')

// GCash has no link that opens a business payment, so the customer saves this
// QR to their gallery and uploads it inside GCash's own "Pay QR" screen.
export async function saveGcashQr() {
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true)
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow saving photos so the QR can be saved to your gallery, then try again.')
      return false
    }

    const asset = Asset.fromModule(GCASH_QR_IMAGE)
    await asset.downloadAsync()
    if (!asset.localUri) throw new Error('QR image is not available.')

    await MediaLibrary.saveToLibraryAsync(asset.localUri)
    Alert.alert('QR saved', 'The PKC BIZOFT GCash QR is in your gallery. Follow the steps below to pay with it.')
    return true
  } catch (error) {
    console.warn('Saving the GCash QR failed:', error)
    Alert.alert('Could not save the QR', 'Please try again, or take a screenshot of the QR on this screen.')
    return false
  }
}
