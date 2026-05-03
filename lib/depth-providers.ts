export const ENABLE_DEPTH_TILE = true

export type DepthProvider = {
  id: string
  match: (url: string) => boolean
  closedLabel: string
  expandedTitle: string
  externalUrl: string
  descriptor?: string
}

const GRAILED_PROVIDER: DepthProvider = {
  id: 'grailed',
  match: (url: string) => /grailed\.com/i.test(url),
  closedLabel: 'grailed.com',
  expandedTitle: 'Favorites',
  descriptor: 'FAVORITES',
  externalUrl: 'https://www.grailed.com',
}

const PROVIDERS: DepthProvider[] = [GRAILED_PROVIDER]

export function matchDepthProvider(url: string): DepthProvider | null {
  if (!ENABLE_DEPTH_TILE) return null
  return PROVIDERS.find((p) => p.match(url)) ?? null
}
