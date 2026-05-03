export const ENABLE_DEPTH_TILE = true

export type DepthPreviewItem = {
  id: string
  imageUrl: string
  brand: string
  title: string
  price: string
  age: string
  externalUrl: string
}

export type DepthProvider = {
  id: string
  externalUrl: string
  username: string
  section: string
  previewItems: DepthPreviewItem[]
}

export function matchDepthProvider(url: string): DepthProvider | null {
  if (!ENABLE_DEPTH_TILE) return null

  // grailed.com/:username/favorites
  const m = url.match(/grailed\.com\/([^/?#]+)\/favorites/i)
  if (m) {
    return {
      id: 'grailed',
      externalUrl: url,
      username: m[1],
      section: 'favorites',
      previewItems: [],
    }
  }

  return null
}
