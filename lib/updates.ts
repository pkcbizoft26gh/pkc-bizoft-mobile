import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as FileSystem from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'

// The app is distributed as an APK on GitHub releases (see .github/workflows/release.yml).
const RELEASES_API = 'https://api.github.com/repos/pkcbizoft26gh/pkc-bizoft-mobile/releases/latest'
const APK_NAME = 'app-release.apk'

export type AvailableUpdate = {
  version: string
  url: string
  notes: string
}

function parseVersion(text: string | null | undefined): number[] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text ?? '')
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

function isNewer(candidate: number[], current: number[]) {
  for (let i = 0; i < 3; i++) {
    if (candidate[i] !== current[i]) return candidate[i] > current[i]
  }
  return false
}

export const installedVersion = Constants.expoConfig?.version ?? '0.0.0'

/**
 * Asks GitHub for the latest published release. Returns the update when it is
 * newer than the installed version, otherwise null. Never throws: a failed
 * check (offline, rate limit) just means "no update known".
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (Platform.OS !== 'android') return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
    if (!response.ok) return null

    const release = await response.json()
    if (release?.draft || release?.prerelease) return null

    const latest = parseVersion(release?.tag_name)
    const current = parseVersion(installedVersion)
    if (!latest || !current || !isNewer(latest, current)) return null

    const asset = (release.assets ?? []).find((a: { name?: string }) => a.name === APK_NAME)
    if (!asset?.browser_download_url) return null

    return {
      version: latest.join('.'),
      url: asset.browser_download_url as string,
      notes: typeof release.body === 'string' ? release.body.slice(0, 400) : '',
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Downloads the APK into the app cache and hands it to Android's installer.
 * Android always asks the user to confirm an install, so this is "one tap"
 * rather than fully silent.
 */
export async function downloadAndInstall(update: AvailableUpdate, onProgress: (fraction: number) => void) {
  const target = `${FileSystem.cacheDirectory}pkc-update-${update.version}.apk`

  await FileSystem.deleteAsync(target, { idempotent: true })

  const download = FileSystem.createDownloadResumable(update.url, target, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
    if (totalBytesExpectedToWrite > 0) onProgress(totalBytesWritten / totalBytesExpectedToWrite)
  })

  const result = await download.downloadAsync()
  if (!result || result.status !== 200) {
    throw new Error('The download did not finish. Check your connection and try again.')
  }

  const contentUri = await FileSystem.getContentUriAsync(result.uri)

  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  })
}
