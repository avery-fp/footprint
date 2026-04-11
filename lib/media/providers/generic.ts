import type { IdentifiedMedia } from '../types'

export async function resolve(url: string): Promise<Partial<IdentifiedMedia>> {
  let hostname = 'Link'
  try {
    hostname = new URL(url).hostname.replace('www.', '')
  } catch {}

  return {
    kind: 'link',
    provider: 'generic',
    title: hostname,
    renderMode: 'link_only',
    connectionRequired: false,
    rawMetadata: {},
  }
}
