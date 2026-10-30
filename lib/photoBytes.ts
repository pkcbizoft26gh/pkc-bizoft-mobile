import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

// Phone cameras take 3000-4000 px photos (2-5 MB). Shrink them before upload
// so they cost far less mobile data: the long side becomes at most `maxSide`
// pixels and the photo is saved as JPEG. Text on receipts stays readable.

const MAX_SIDE = 1280

/** Returns the photo as small JPEG bytes ready for upload. Falls back to the original file. */
export async function photoBytes(uri: string, maxSide = MAX_SIDE, quality = 0.6): Promise<ArrayBuffer> {
  try {
    const context = ImageManipulator.manipulate(uri)
    const first = await context.renderAsync()
    if (Math.max(first.width, first.height) > maxSide) {
      context.resize(first.width >= first.height ? { width: maxSide } : { height: maxSide })
    }
    const image = await context.renderAsync()
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality })
    return await (await fetch(result.uri)).arrayBuffer()
  } catch {
    return await (await fetch(uri)).arrayBuffer()
  }
}
