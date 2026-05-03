import { describe, it, expect } from 'vitest'
import { parseGrailedHtml } from '@/lib/grailed-favorites'

const NEXT_DATA = {
  props: {
    pageProps: {
      favorites: [
        {
          id: 1234,
          title: 'Cargo Belas Pants',
          designers: [{ name: 'Rick Owens' }],
          price: 280,
          currency: 'USD',
          size: 'M',
          location: 'Berlin, DE',
          bumped_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
          cover_photo: { url: 'https://cdn.grailed.com/photo-1.jpg' },
          permalink: '/listings/1234-rick-owens',
        },
        {
          id: 5678,
          title: 'Draped Coat',
          designers: [{ name: 'Yohji Yamamoto' }],
          price: 620,
          size: 'L',
          photos: [{ url: 'https://cdn.grailed.com/photo-2.jpg' }],
        },
      ],
      // a non-listing array nearby — must be ignored
      facets: [{ name: 'category', count: 12 }],
    },
  },
}

function wrap(json: object): string {
  return `<!doctype html><html><head></head><body>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(json)}</script>
    <p>34 favorites</p>
  </body></html>`
}

describe('parseGrailedHtml', () => {
  it('extracts listing image, brand, title, price, size from __NEXT_DATA__', () => {
    const out = parseGrailedHtml(wrap(NEXT_DATA))
    expect(out).toHaveLength(2)
    expect(out[0].imageUrl).toBe('https://cdn.grailed.com/photo-1.jpg')
    expect(out[0].brand).toBe('Rick Owens')
    expect(out[0].title).toBe('Cargo Belas Pants')
    expect(out[0].price).toBe('$280')
    expect(out[0].size).toBe('M')
    expect(out[0].location).toBe('Berlin, DE')
    expect(out[0].age).toMatch(/d ago$/)
    expect(out[0].externalUrl).toBe('https://www.grailed.com/listings/1234-rick-owens')
  })

  it('handles photos[] when cover_photo is missing', () => {
    const out = parseGrailedHtml(wrap(NEXT_DATA))
    expect(out[1].imageUrl).toBe('https://cdn.grailed.com/photo-2.jpg')
    expect(out[1].brand).toBe('Yohji Yamamoto')
    expect(out[1].size).toBe('L')
  })

  it('returns empty array on empty / unrelated HTML', () => {
    expect(parseGrailedHtml('<html></html>')).toEqual([])
    expect(parseGrailedHtml('<html><script id="__NEXT_DATA__">not json</script></html>')).toEqual([])
  })

  it('deduplicates by listing id', () => {
    const dup = {
      props: { pageProps: {
        a: { id: 1, designers: [{ name: 'X' }], cover_photo: { url: 'https://x/a.jpg' } },
        b: { id: 1, designers: [{ name: 'X' }], cover_photo: { url: 'https://x/a.jpg' } },
      } },
    }
    expect(parseGrailedHtml(wrap(dup))).toHaveLength(1)
  })
})
