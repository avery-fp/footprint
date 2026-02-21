// ═══════════════════════════════════════════
// Haptic feedback — safe wrapper with fallback
// ═══════════════════════════════════════════

type HapticStyle = 'light' | 'medium' | 'heavy'

const VIBRATE_MAP: Record<HapticStyle, number> = {
  light: 10,
  medium: 20,
  heavy: 40,
}

export function haptic(style: HapticStyle = 'light'): void {
  if (typeof window === 'undefined') return

  try {
    // Prefer navigator.vibrate (widely supported on Android, partial on iOS)
    if (navigator.vibrate) {
      navigator.vibrate(VIBRATE_MAP[style])
    }
  } catch {
    // Silently fail — haptics are enhancement only
  }
}
