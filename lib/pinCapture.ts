import { Alert } from '@/components/AppAlert'
import { supabase } from '@/lib/supabase'
import { getPreciseCoords } from '@/lib/location'
import { checkPin } from '@/lib/pinCheck'

export type PinResult =
  | { status: 'saved'; accuracy: number }
  | { status: 'no-location' }
  | { status: 'weak'; accuracy: number }
  | { status: 'declined' }
  | { status: 'error'; message: string }

/**
 * Takes the phone's most precise GPS point, checks it is inside the barangay on
 * the customer's account, and saves it as their pin (their record and any open
 * job). Shared by the Home prompt and the Profile card.
 */
export async function savePinHere(): Promise<PinResult> {
  const fix = await getPreciseCoords()
  if (!fix) return { status: 'no-location' }
  if (fix.accuracy > 50) return { status: 'weak', accuracy: fix.accuracy }

  const check = await checkPin(fix)
  if (check?.checked && !check.matches) {
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Are you at your address?',
        `Your GPS says ${check.foundBarangay || 'a different barangay'}, but your account is registered in another barangay. Only continue if you are at the place where the internet is installed.`,
        [
          { text: "No, I'll do it at home", style: 'cancel', onPress: () => resolve(false) },
          { text: 'Yes, pin here', onPress: () => resolve(true) },
        ],
      )
    })
    if (!proceed) return { status: 'declined' }
  }

  const { error } = await supabase.rpc('set_my_location_pin', {
    p_lat: fix.latitude,
    p_lon: fix.longitude,
  })
  if (error) return { status: 'error', message: error.message }

  return { status: 'saved', accuracy: fix.accuracy }
}
