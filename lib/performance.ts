import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import * as Device from 'expo-device'

// Phones with under 4 GB of RAM are the budget ones (often with weak graphics chips too).
const LOW_END_MEMORY = 4 * 1024 ** 3

/** True on budget phones: decorative, never-ending animations should stay still there. */
export const isLowEndDevice = typeof Device.totalMemory === 'number' && Device.totalMemory < LOW_END_MEMORY

/** Whether decorative motion should run: not on budget phones, not when the person turned animations off. */
export function useDecorativeMotion() {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let alive = true
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduceMotion(on)
    })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => {
      alive = false
      sub.remove()
    }
  }, [])

  return !isLowEndDevice && !reduceMotion
}
