export type InvocationPoint = {
  x: number
  y: number
  pointerId: number
}

export const MOBILE_INVOCATION_TOLERANCE_PX = 32

export function beginInvocation(pointerId: number, x: number, y: number): InvocationPoint {
  return { pointerId, x, y }
}

export function isIntentionalInvocation(
  start: InvocationPoint | null,
  pointerId: number,
  x: number,
  y: number,
  tolerance = MOBILE_INVOCATION_TOLERANCE_PX,
) {
  if (!start || start.pointerId !== pointerId) return false
  return Math.hypot(x - start.x, y - start.y) <= tolerance
}
