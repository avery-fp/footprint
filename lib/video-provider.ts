/**
 * Video Provider Abstraction
 *
 * Interface for video processing services (Mux, Cloudflare Stream, etc.).
 * Keeps the rest of the codebase provider-agnostic — swapping providers
 * is a single env var change + one implementation file.
 */

export interface VideoUploadSession {
  /** URL the client PUTs the raw file to (direct upload, bypasses our server) */
  uploadUrl: string
  /** Provider's identifier for this upload/asset (used for webhook correlation) */
  assetId: string
}

export interface VideoAssetReady {
  /** Provider's asset ID */
  assetId: string
  /** HLS streaming URL */
  playbackUrl: string
  /** Provider-generated poster/thumbnail URL */
  posterUrl: string
  /** Duration in milliseconds */
  durationMs: number
}

export interface VideoProvider {
  /** Create a direct upload session. Client uploads raw file to the returned URL. */
  createUploadSession(): Promise<VideoUploadSession>

  /** Parse and verify an incoming webhook payload. Returns null if invalid/irrelevant. */
  parseWebhook(body: string, headers: Headers): Promise<VideoAssetReady | null>

  /** Delete an asset by ID (cleanup on tile delete). Non-critical — should not throw. */
  deleteAsset(assetId: string): Promise<void>
}
