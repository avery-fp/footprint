// ═══════════════════════════════════════════
// Motion + timing constants — single source of truth
// Designers: tweak durations and easing here.
// ═══════════════════════════════════════════

export const MOTION = {
  // PlusButton tap ritual
  plus: {
    duration: 0.15,           // 150ms total
    scale: [1, 1.1, 0],
    opacity: [1, 1, 0],
    rotate: [0, 90],
    easing: [0.22, 1, 0.36, 1],  // custom ease-out
  },

  // RemoveBubble
  bubble: {
    fadeIn: 0.1,              // 100ms
    fadeOut: 0.2,             // 200ms
    linger: 1000,             // 1000ms auto-dismiss
    offsetX: 12,              // px from press point
    offsetY: 12,
  },

  // RolodexDrawer
  drawer: {
    duration: 0.25,           // 250ms
    easing: [0.33, 1, 0.68, 1],  // ease-out
    backdropBlur: 16,         // px
  },

  // CommandLayer — concealed search surface
  command: {
    duration: 0.25,
    easing: [0.33, 1, 0.68, 1],
    staggerDelay: 0.04,
    exitDuration: 0.18,
  },

  // Long press
  longPress: {
    threshold: 450,           // ms
    moveCancel: 10,           // px — cancel if finger moves beyond this
  },

  // ZoomableImage — double-tap zoom cycling (1x → 2x → 3x → 1x)
  zoom: {
    in:  '0.4s cubic-bezier(0.16, 1, 0.3, 1)',   // spring in
    out: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',     // ease out
  },
} as const

export type MotionConfig = typeof MOTION
