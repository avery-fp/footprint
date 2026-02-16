/**
 * Environment config for the autonomous pipeline.
 * Loads .env if present, validates required keys.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Load .env file if it exists (for standalone script execution)
function loadDotenv() {
  const envPath = resolve(process.cwd(), '.env.local')
  const fallback = resolve(process.cwd(), '.env')
  const file = existsSync(envPath) ? envPath : existsSync(fallback) ? fallback : null
  if (!file) return

  const lines = readFileSync(file, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = val
    }
  }
}

loadDotenv()

export interface FPConfig {
  BING_API_KEY: string
  SPOTIFY_CLIENT_ID: string
  SPOTIFY_CLIENT_SECRET: string
  ANTHROPIC_API_KEY: string
  ARO_KEY: string
  FP_BASE_URL: string
}

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) {
    throw new Error(`Missing required env var: ${key}`)
  }
  return val
}

let _config: FPConfig | null = null

export function getConfig(): FPConfig {
  if (_config) return _config
  _config = {
    BING_API_KEY: requireEnv('BING_API_KEY'),
    SPOTIFY_CLIENT_ID: requireEnv('SPOTIFY_CLIENT_ID'),
    SPOTIFY_CLIENT_SECRET: requireEnv('SPOTIFY_CLIENT_SECRET'),
    ANTHROPIC_API_KEY: requireEnv('ANTHROPIC_API_KEY'),
    ARO_KEY: requireEnv('ARO_KEY'),
    FP_BASE_URL: process.env.FP_BASE_URL || 'https://footprint.onl',
  }
  return _config
}

/**
 * Validate that all env vars are present. Throws with list of missing vars.
 */
export function validateEnv(): void {
  const required = [
    'BING_API_KEY',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'ANTHROPIC_API_KEY',
    'ARO_KEY',
  ]
  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`)
  }
}
