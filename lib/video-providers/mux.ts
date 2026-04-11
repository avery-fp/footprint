import Mux from '@mux/mux-node'
import crypto from 'crypto'
import type { VideoProvider, VideoUploadSession, VideoAssetReady } from '../video-provider'

export function createMuxProvider(): VideoProvider {
  const mux = new Mux({
    tokenId: process.env.MUX_TOKEN_ID!,
    tokenSecret: process.env.MUX_TOKEN_SECRET!,
  })

  return {
    async createUploadSession(): Promise<VideoUploadSession> {
      const upload = await mux.video.uploads.create({
        new_asset_settings: {
          playback_policy: ['public'],
          encoding_tier: 'baseline',
        },
        cors_origin: process.env.NEXT_PUBLIC_APP_URL || '*',
      })

      return {
        uploadUrl: upload.url!,
        assetId: upload.id,
      }
    },

    async parseWebhook(body: string, headers: Headers): Promise<VideoAssetReady | null> {
      const secret = process.env.MUX_WEBHOOK_SECRET
      if (secret) {
        const signature = headers.get('mux-signature')
        if (!signature) return null

        // Mux signature format: t=timestamp,v1=hash
        const parts = signature.split(',')
        const tPart = parts.find(p => p.startsWith('t='))
        const vPart = parts.find(p => p.startsWith('v1='))
        if (!tPart || !vPart) return null

        const timestamp = tPart.slice(2)
        const expected = vPart.slice(3)
        const payload = `${timestamp}.${body}`
        const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex')

        if (digest !== expected) return null
      }

      const event = JSON.parse(body)

      // We only care about the asset being ready
      if (event.type !== 'video.asset.ready') return null

      const asset = event.data
      const playbackId = asset.playback_ids?.[0]?.id
      if (!playbackId) return null

      // The upload ID is in passthrough or we correlate via the asset's upload_id
      // Mux webhooks include the upload_id on the asset
      const assetId = asset.upload_id || asset.id

      return {
        assetId,
        playbackUrl: `https://stream.mux.com/${playbackId}.m3u8`,
        posterUrl: `https://image.mux.com/${playbackId}/thumbnail.webp?time=1`,
        durationMs: Math.round((asset.duration || 0) * 1000),
      }
    },

    async deleteAsset(assetId: string): Promise<void> {
      try {
        // assetId might be an upload ID — list assets for the upload
        const assets = await mux.video.assets.list({ upload_id: assetId })
        for (const asset of assets.data || []) {
          await mux.video.assets.delete(asset.id)
        }
      } catch {
        // Non-critical — log but don't throw
      }
    },
  }
}
