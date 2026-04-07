import { describe, it, expect } from 'vitest'
import {
  signupSchema,
  contentPostSchema,
  contentReorderSchema,
  eventsSchema,
  checkoutSchema,
  checkoutActivateSchema,
  checkoutFreeSchema,
  setPasswordSchema,
  publishSchema,
  roomsPostSchema,
  roomsPatchSchema,
  tilesPostSchema,
  tilesDeleteSchema,
  tilesPatchSchema,
} from '@/lib/schemas'

describe('signupSchema', () => {
  it('accepts valid signup and normalizes', () => {
    const result = signupSchema.safeParse({ username: 'TestUser', email: ' A@B.COM ', password: 'hunter2' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('a@b.com')
      expect(result.data.username).toBe('testuser')
    }
  })

  it('rejects missing fields', () => {
    expect(signupSchema.safeParse({}).success).toBe(false)
    expect(signupSchema.safeParse({ email: 'a@b.com' }).success).toBe(false)
  })

  it('rejects short password', () => {
    expect(signupSchema.safeParse({ username: 'abc', email: 'a@b.com', password: '12345' }).success).toBe(false)
  })

  it('rejects invalid email', () => {
    expect(signupSchema.safeParse({ username: 'abc', email: 'notanemail', password: 'hunter2' }).success).toBe(false)
  })

  it('rejects invalid username characters', () => {
    expect(signupSchema.safeParse({ username: 'a b', email: 'a@b.com', password: 'hunter2' }).success).toBe(false)
    expect(signupSchema.safeParse({ username: 'a@b', email: 'a@b.com', password: 'hunter2' }).success).toBe(false)
  })

  it('rejects username too short', () => {
    expect(signupSchema.safeParse({ username: 'a', email: 'a@b.com', password: 'hunter2' }).success).toBe(false)
    expect(signupSchema.safeParse({ username: 'ab', email: 'a@b.com', password: 'hunter2' }).success).toBe(false)
  })
})

describe('contentPostSchema', () => {
  it('accepts valid content', () => {
    expect(contentPostSchema.safeParse({ url: 'https://youtube.com/watch', footprint_id: 'abc123' }).success).toBe(true)
  })

  it('rejects missing fields', () => {
    expect(contentPostSchema.safeParse({ url: 'https://youtube.com' }).success).toBe(false)
    expect(contentPostSchema.safeParse({ footprint_id: 'abc' }).success).toBe(false)
  })
})

describe('contentReorderSchema', () => {
  it('accepts valid reorder', () => {
    const result = contentReorderSchema.safeParse({
      footprint_id: 'abc',
      updates: [{ id: '1', position: 0 }, { id: '2', position: 1 }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-integer position', () => {
    expect(contentReorderSchema.safeParse({
      footprint_id: 'abc',
      updates: [{ id: '1', position: 1.5 }],
    }).success).toBe(false)
  })

  it('rejects negative position', () => {
    expect(contentReorderSchema.safeParse({
      footprint_id: 'abc',
      updates: [{ id: '1', position: -1 }],
    }).success).toBe(false)
  })
})

describe('eventsSchema', () => {
  it('accepts valid events', () => {
    expect(eventsSchema.safeParse({ footprint_id: 'abc', event_type: 'visit' }).success).toBe(true)
    expect(eventsSchema.safeParse({ footprint_id: 'abc', event_type: 'tile_click', event_data: { tile_id: '123' } }).success).toBe(true)
  })

  it('rejects invalid event type', () => {
    const result = eventsSchema.safeParse({ footprint_id: 'abc', event_type: 'INVALID' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Invalid event_type')
    }
  })

  it('rejects missing footprint_id', () => {
    expect(eventsSchema.safeParse({ event_type: 'visit' }).success).toBe(false)
  })
})

describe('checkoutSchema', () => {
  it('accepts email checkout', () => {
    expect(checkoutSchema.safeParse({ email: 'a@b.com' }).success).toBe(true)
  })

  it('accepts remix checkout', () => {
    expect(checkoutSchema.safeParse({ remix_source: 'some-source' }).success).toBe(true)
  })

  it('rejects neither email nor remix_source', () => {
    expect(checkoutSchema.safeParse({}).success).toBe(false)
  })
})

describe('checkoutActivateSchema', () => {
  it('accepts valid session_id', () => {
    expect(checkoutActivateSchema.safeParse({ session_id: 'cs_test_123' }).success).toBe(true)
  })

  it('rejects empty session_id', () => {
    expect(checkoutActivateSchema.safeParse({ session_id: '' }).success).toBe(false)
  })
})

describe('checkoutFreeSchema', () => {
  it('accepts email with promo', () => {
    expect(checkoutFreeSchema.safeParse({ email: 'a@b.com', promo: 'please' }).success).toBe(true)
  })

  it('rejects missing promo', () => {
    expect(checkoutFreeSchema.safeParse({ email: 'a@b.com' }).success).toBe(false)
  })

  it('rejects missing email', () => {
    expect(checkoutFreeSchema.safeParse({}).success).toBe(false)
  })
})

describe('setPasswordSchema', () => {
  it('accepts valid password', () => {
    expect(setPasswordSchema.safeParse({ password: 'hunter2' }).success).toBe(true)
  })

  it('rejects short password', () => {
    expect(setPasswordSchema.safeParse({ password: '12345' }).success).toBe(false)
  })
})

describe('publishSchema', () => {
  it('accepts check-username action', () => {
    expect(publishSchema.safeParse({ action: 'check-username', username: 'test' }).success).toBe(true)
  })

  it('accepts publish-free action', () => {
    expect(publishSchema.safeParse({ action: 'publish-free', username: 'test', promo: 'please' }).success).toBe(true)
  })

  it('accepts publish-paid action', () => {
    expect(publishSchema.safeParse({ action: 'publish-paid', username: 'test' }).success).toBe(true)
  })

  it('accepts finalize action', () => {
    expect(publishSchema.safeParse({ action: 'finalize', session_id: 'cs_123', username: 'test' }).success).toBe(true)
  })

  it('rejects invalid action', () => {
    expect(publishSchema.safeParse({ action: 'invalid' }).success).toBe(false)
  })

  it('rejects finalize without session_id', () => {
    expect(publishSchema.safeParse({ action: 'finalize', username: 'test' }).success).toBe(false)
  })
})

describe('roomsPostSchema', () => {
  it('accepts valid room creation', () => {
    expect(roomsPostSchema.safeParse({ serial_number: 7777, name: 'Music' }).success).toBe(true)
  })

  it('rejects missing name', () => {
    expect(roomsPostSchema.safeParse({ serial_number: 7777 }).success).toBe(false)
  })
})

describe('roomsPatchSchema', () => {
  it('accepts valid patch', () => {
    expect(roomsPatchSchema.safeParse({ id: 'abc', hidden: true }).success).toBe(true)
    expect(roomsPatchSchema.safeParse({ id: 'abc', name: 'New Name' }).success).toBe(true)
  })

  it('rejects missing id', () => {
    expect(roomsPatchSchema.safeParse({ hidden: true }).success).toBe(false)
  })
})

describe('tilesPostSchema', () => {
  it('accepts url tile', () => {
    expect(tilesPostSchema.safeParse({ slug: 'test', url: 'https://youtube.com' }).success).toBe(true)
  })

  it('accepts thought tile', () => {
    expect(tilesPostSchema.safeParse({ slug: 'test', thought: 'hello world' }).success).toBe(true)
  })

  it('rejects no url and no thought', () => {
    expect(tilesPostSchema.safeParse({ slug: 'test' }).success).toBe(false)
  })
})

describe('tilesDeleteSchema', () => {
  it('accepts valid delete', () => {
    expect(tilesDeleteSchema.safeParse({ slug: 'test', source: 'library', id: 'abc' }).success).toBe(true)
  })

  it('rejects invalid source', () => {
    expect(tilesDeleteSchema.safeParse({ slug: 'test', source: 'invalid', id: 'abc' }).success).toBe(false)
  })
})

describe('tilesPatchSchema', () => {
  it('accepts valid size', () => {
    expect(tilesPatchSchema.safeParse({ id: 'abc', source: 'library', slug: 'test', size: 2 }).success).toBe(true)
  })

  it('rejects invalid size', () => {
    expect(tilesPatchSchema.safeParse({ id: 'abc', source: 'library', slug: 'test', size: 5 }).success).toBe(false)
  })

  it('accepts valid aspect', () => {
    expect(tilesPatchSchema.safeParse({ id: 'abc', source: 'links', slug: 'test', aspect: 'wide' }).success).toBe(true)
  })

  it('rejects invalid aspect', () => {
    expect(tilesPatchSchema.safeParse({ id: 'abc', source: 'links', slug: 'test', aspect: 'circle' }).success).toBe(false)
  })
})
