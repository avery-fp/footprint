import { NextResponse } from 'next/server'
import { ZodSchema } from 'zod'

export function validateBody<T>(schema: ZodSchema<T>, body: unknown):
  | { success: true; data: T }
  | { success: false; response: NextResponse } {
  const result = schema.safeParse(body)
  if (!result.success) {
    const firstError = result.error.issues[0]?.message || 'Invalid request'
    return {
      success: false,
      response: NextResponse.json({ error: firstError }, { status: 400 }),
    }
  }
  return { success: true, data: result.data }
}
