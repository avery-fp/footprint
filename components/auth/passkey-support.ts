/**
 * SSR-safe check for WebAuthn / passkey browser support.
 *
 * Returns false in any environment without a window object (including SSR
 * and node tests). The PasskeyButton component uses this to conditionally
 * render — on unsupported browsers, the button is hidden entirely instead
 * of failing on click.
 *
 * Heavy lifting (the actual ceremony) is delegated to @simplewebauthn/browser
 * inside the click handler.
 */
export function isPasskeySupported(): boolean {
  if (typeof window === 'undefined') return false
  return typeof (window as { PublicKeyCredential?: unknown }).PublicKeyCredential !== 'undefined'
}
