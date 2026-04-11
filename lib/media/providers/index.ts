/**
 * FOOTPRINT — Provider Adapter Registry
 *
 * Routes provider detection to the correct adapter.
 * Each adapter: url → Partial<IdentifiedMedia>
 */

import type { MediaProvider, IdentifiedMedia } from '../types'

import * as youtube from './youtube'
import * as spotify from './spotify'
import * as twitter from './twitter'
import * as tiktok from './tiktok'
import * as instagram from './instagram'
import * as appleMusic from './appleMusic'
import * as generic from './generic'

type ProviderAdapter = {
  resolve: (url: string) => Promise<Partial<IdentifiedMedia>>
}

const ADAPTERS: Record<string, ProviderAdapter> = {
  youtube,
  spotify,
  x: twitter,
  tiktok,
  instagram,
  apple_music: appleMusic,
  generic,
}

export async function resolveProvider(
  url: string,
  provider: MediaProvider
): Promise<Partial<IdentifiedMedia>> {
  const adapter = ADAPTERS[provider]
  if (!adapter) return generic.resolve(url)

  try {
    return await adapter.resolve(url)
  } catch {
    // Adapter threw — fall back to generic
    return generic.resolve(url)
  }
}
