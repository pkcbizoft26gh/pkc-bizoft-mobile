import * as FileSystem from 'expo-file-system/legacy'
import * as MediaLibrary from 'expo-media-library/legacy'

import { Alert } from '@/components/AppAlert'
import { GCASH_QR_BASE64 } from '@/lib/gcashQrData'

// The GCash InstaPay QR that customers pay to (bundled with the app).
export const GCASH_QR_IMAGE = require('../assets/images/gcash-qr-crop.png')

// GCash has no link that opens a business payment, so the customer saves this
// QR to their gallery and uploads it inside GCash's own "Pay QR" screen.
//
// The image is written from base64 to a real file first: in the release app a
// bundled image has no file path, so handing it to the gallery directly fails.
export async function saveGcashQr() {
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true)
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow saving photos so the QR can be saved to your gallery, then try again.')
      return false
    }

    const target = `${FileSystem.cacheDirectory}PKC-BIZOFT-GCash-QR.png`
    await FileSystem.writeAsStringAsync(target, GCASH_QR_BASE64, { encoding: FileSystem.EncodingType.Base64 })

    await MediaLibrary.saveToLibraryAsync(target)
    Alert.alert('QR saved', 'The PKC BIZOFT GCash QR is in your gallery (Photos). Follow the steps below to pay with it.')
    return true
  } catch (error: any) {
    console.warn('Saving the GCash QR failed:', error)
    Alert.alert(
      'Could not save the QR',
      `${error?.message ? `${error.message}\n\n` : ''}You can also take a screenshot of the QR on this screen and use that in GCash.`,
    )
    return false
  }
}
