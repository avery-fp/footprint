/**
 * SSRF protection — shared utility for all URL-fetching routes.
 *
 * Blocks requests to private/internal IP ranges and reserved hostnames.
 */

export function isPrivateHost(hostname: string): boolean {
  // Block localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') return true
  // Block private IPv4 ranges
  const parts = hostname.split('.').map(Number)
  if (parts.length === 4 && parts.every(n => !isNaN(n))) {
    if (parts[0] === 10) return true                                         // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true   // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true                   // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true                   // 169.254.0.0/16 (link-local / AWS metadata)
  }
  // Block .internal, .local, .localhost TLDs
  if (/\.(internal|local|localhost)$/i.test(hostname)) return true
  return false
}

export function validateFetchUrl(url: string): { valid: boolean; parsed?: URL; error?: string } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { valid: false, error: 'Invalid URL' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTP(S) URLs allowed' }
  }

  if (isPrivateHost(parsed.hostname)) {
    return { valid: false, error: 'Private/internal hosts not allowed' }
  }

  return { valid: true, parsed }
}
