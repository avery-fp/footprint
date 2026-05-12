/**
 * Room atmosphere — wallpaper filter + overlay per active room.
 *
 * Before this existed, only PublicPage.tsx applied per-room color grading
 * to the wallpaper. The editor rendered a flat blur(12px) brightness(0.7)
 * no matter which room was active, so walking editor → public produced
 * a dramatic atmosphere jump per room. Both surfaces now share this
 * table so a room has the same atmosphere on both sides.
 */

export const ROOM_FILTERS = [
  'blur(4px) brightness(0.45) saturate(0.85) hue-rotate(-8deg)',
  'blur(2px) brightness(0.65) saturate(1.4) hue-rotate(25deg)',
  'blur(8px) brightness(0.3) saturate(1.6) hue-rotate(-35deg)',
  'blur(0px) brightness(0.55) saturate(0.2) hue-rotate(0deg)',
  'blur(5px) brightness(0.7) saturate(1.2) hue-rotate(35deg)',
  'blur(7px) brightness(0.35) saturate(0.4) hue-rotate(-20deg)',
]
export const DEFAULT_FILTER = 'blur(6px)'

export const ROOM_OVERLAYS = [
  'rgba(0,0,0,0.35)',
  'rgba(0,0,0,0.30)',
  'rgba(0,0,0,0.42)',
  'rgba(0,0,0,0.38)',
  'rgba(0,0,0,0.28)',
  'rgba(0,0,0,0.45)',
]
export const DEFAULT_OVERLAY = 'rgba(0,0,0,0.35)'

export const SOUND_ROOM_FILTER = 'blur(10px) brightness(0.25) saturate(1.8) hue-rotate(-15deg)'
export const SOUND_ROOM_OVERLAY = 'rgba(0,0,0,0.50)'

export interface RoomAtmosphere {
  filter: string
  overlay: string
}

/**
 * Resolve the wallpaper filter + overlay for a room.
 *
 * @param roomIndex  Index of the active room in the visible-rooms array.
 *                   Pass -1 when no room is active (fall back to defaults).
 * @param isSoundRoom True when the active room is the sound room
 *                    (name toLowerCase === 'sound') — gets its own look.
 */
export function getRoomAtmosphere(
  roomIndex: number,
  isSoundRoom: boolean
): RoomAtmosphere {
  if (isSoundRoom) {
    return { filter: SOUND_ROOM_FILTER, overlay: SOUND_ROOM_OVERLAY }
  }
  if (roomIndex >= 0) {
    return {
      filter: ROOM_FILTERS[roomIndex % ROOM_FILTERS.length],
      overlay: ROOM_OVERLAYS[roomIndex % ROOM_OVERLAYS.length],
    }
  }
  return { filter: DEFAULT_FILTER, overlay: DEFAULT_OVERLAY }
}
