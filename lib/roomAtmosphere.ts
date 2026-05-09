/**
 * Room atmosphere — wallpaper filter + overlay per active room.
 *
 * Before this existed, only PublicPage.tsx applied per-room color grading
 * to the wallpaper. The editor rendered a flat blur(12px) brightness(0.7)
 * no matter which room was active, so walking editor → public produced
 * a dramatic atmosphere jump per room. Both surfaces now share this
 * table so a room has the same atmosphere on both sides.
 */

// Brightness ×1.25, saturation ×1.10, scrim opacity ×0.75 across the table.
// The lift is multiplicative so the relative curve is preserved — the
// darkest room stays darkest, the most-saturated room stays most-saturated,
// only the floor rises. Sound keeps its dedicated constant for the same
// reason: lifting it inside the array would collapse the "most saturated"
// invariant ae relies on for the room's identity.
export const ROOM_FILTERS = [
  'blur(4px) brightness(0.56) saturate(0.94) hue-rotate(-8deg)',
  'blur(2px) brightness(0.81) saturate(1.54) hue-rotate(25deg)',
  'blur(8px) brightness(0.38) saturate(1.76) hue-rotate(-35deg)',
  'blur(0px) brightness(0.69) saturate(0.22) hue-rotate(0deg)',
  'blur(5px) brightness(0.88) saturate(1.32) hue-rotate(35deg)',
  'blur(7px) brightness(0.44) saturate(0.44) hue-rotate(-20deg)',
]
export const DEFAULT_FILTER = 'blur(6px)'

export const ROOM_OVERLAYS = [
  'rgba(0,0,0,0.26)',
  'rgba(0,0,0,0.23)',
  'rgba(0,0,0,0.32)',
  'rgba(0,0,0,0.29)',
  'rgba(0,0,0,0.21)',
  'rgba(0,0,0,0.34)',
]
export const DEFAULT_OVERLAY = 'rgba(0,0,0,0.26)'

export const SOUND_ROOM_FILTER = 'blur(10px) brightness(0.31) saturate(1.98) hue-rotate(-15deg)'
export const SOUND_ROOM_OVERLAY = 'rgba(0,0,0,0.38)'

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
