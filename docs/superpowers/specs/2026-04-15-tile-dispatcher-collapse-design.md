# Spec — Tile Dispatcher Collapse

> "One unified dispatcher keyed on `item.type` — full stop. Everything else is
> technical debt accruing interest." — ae, 2026-04-15

## Why

`UnifiedTile.tsx` currently has **three competing dispatchers** that fire in
sequence. Every new tile type bug found during the 2026-04-14 → 2026-04-15
sessions has the same root cause: a tile of type X gets a `render_mode` value
from the identity intake layer that routes it through dispatcher #2 before
dispatcher #3 (the type-aware branch) can fire.

Dispatcher inventory in `components/UnifiedTile.tsx` (post-fix state):

| # | Branch | Keyed on | Routes to |
|---|---|---|---|
| 1 | Type early-returns | `item.type === 'container' \| 'thought' \| 'payment'` | ContainerTile / inline thought / inline CTA |
| 2 | Identity intake `isNewStyleRenderMode(item.render_mode)` | `render_mode in {'native_video', 'embed', 'preview_card', 'link_only', ...}` | Native video / ContentCard |
| 3 | Legacy `render_mode === 'ghost'` + media_id | `render_mode === 'ghost'` | GhostTile |
| 4 | Fallback `if (url \|\| thumbnail \|\| embed_html)` | always | ContentCard |
| 5 | RecoveryTile fallback | nothing left | broken-state component |

The early returns in #1 are bandaids I added today. They work but they're
brittle — the next person adding a `payment_link` or `quote` type will write
the renderer, forget the early return, and hit the same bug.

## What changed today (concrete bugs from this design)

1. Thought tiles silently routed through ContentCard instead of the typography
   ladder (they had `render_mode='preview_card'`).
2. Pay/CTA tile silently routed through ContentCard (had `render_mode='embed'`).
3. 4 YouTube tiles bypassed GhostTile and rendered via ContentCard fallback
   (had `render_mode='embed'` + missing `media_id`).
4. Tweet tiles ended up routing fine but only because they were already
   `render_mode='ghost'` in DB — luck, not design.

Each of these took 5–30 min to diagnose. None had a test that would have
caught them.

## The collapse — single dispatcher keyed on `item.type`

```tsx
// components/UnifiedTile.tsx — proposed shape

const TYPE_RENDERERS: Record<string, React.FC<TileRenderProps>> = {
  // Text content — no URL needed
  thought:   ThoughtTile,
  payment:   PayTile,         // pay/CTA tile
  container: ContainerTileWrapper,

  // Media with click-to-play iframe
  youtube:   GhostVisualTile,  // YouTube embed
  vimeo:     GhostVisualTile,  // same shape
  tiktok:    GhostVisualTile,
  instagram: GhostVisualTile,
  twitter:   TwitterTile,      // widgets.js, not iframe
  x:         TwitterTile,

  // Audio
  spotify:    SpotifyShareTile,
  soundcloud: GhostAudioTile,
  apple_music: AppleMusicCompactTile,

  // Static
  image: ImageTile,
  video: NativeVideoTile,      // direct .mp4/.webm

  // Generic web
  link:    LinkPreviewTile,    // OG card
  payment: PayTile,            // already above
}

export default function UnifiedTile({ item, ...props }: UnifiedTileProps) {
  // Step 1: normalize type. Some legacy rows have type='link' but URL is YT.
  const type = canonicalizeType(item)

  // Step 2: pick the renderer. ONE source of truth.
  const Renderer = TYPE_RENDERERS[type]
  if (!Renderer) return <RecoveryTile id={item.id} reason={`unknown type: ${type}`} />

  return (
    <div className="w-full h-full" data-tile-id={item.id} data-tile-type={type}>
      <Renderer item={item} {...props} />
    </div>
  )
}
```

`canonicalizeType` consolidates today's three dispatchers into a single function:

```tsx
function canonicalizeType(item: TileItem): string {
  // 1. Explicit type wins (DB platform column)
  if (item.type && item.type !== 'link') return item.type

  // 2. Infer from URL for legacy 'link'-typed rows
  const url = item.url || ''
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube'
  if (/vimeo\.com/.test(url)) return 'vimeo'
  if (/tiktok\.com/.test(url)) return 'tiktok'
  if (/instagram\.com/.test(url)) return 'instagram'
  if (/twitter\.com|x\.com/.test(url)) return 'twitter'
  if (/open\.spotify\.com/.test(url)) return 'spotify'
  if (/soundcloud\.com/.test(url)) return 'soundcloud'
  if (/buy\.stripe\.com|checkout\.stripe\.com/.test(url)) return 'payment'
  if (item.media_kind === 'video') return 'video'
  if (item.media_kind === 'image' || item.image_url) return 'image'

  return 'link' // generic OG card
}
```

`render_mode` is **deleted from the dispatch path entirely**. It can stay on
the row as a hint for downstream rendering decisions (e.g., GhostVisualTile
might check `item.render_mode === 'ghost'` to decide between branded vs
de-branded chrome), but it never decides which component fires.

## Migration plan (one PR, mechanical)

1. **Extract the existing inline branches into proper components.** Each
   becomes a file under `components/tiles/`:
   - `components/tiles/ThoughtTile.tsx` (the typography ladder from today)
   - `components/tiles/PayTile.tsx` (the "yours" hero)
   - `components/tiles/GhostVisualTile.tsx` (most of GhostTile.tsx — the
     blurred-bg + iframe-on-play pattern, parameterized by platform)
   - `components/tiles/TwitterTile.tsx` (widgets.js facade + createTweet)
   - `components/tiles/SpotifyShareTile.tsx` (the album-art-only branch)
   - etc.
2. **Build the `TYPE_RENDERERS` map and `canonicalizeType` function.**
3. **Delete the three dispatchers from UnifiedTile** and replace with the
   single map lookup.
4. **Delete `isNewStyleRenderMode` and the `RenderMode` switch.** Components
   that need render_mode-derived behavior read it from `item.render_mode`
   themselves.
5. **Add tests:**
   - One snapshot test per type renderer (input: typed item, output: DOM).
   - One integration test per type ensuring `UnifiedTile` routes correctly
     given (a) item.type explicit, (b) item.type='link' + URL hint.
   - Property test: every row in the live `links` table renders WITHOUT
     hitting `RecoveryTile`.

## Test that would have caught today's bugs

```ts
// tests/tile-dispatch.test.ts
describe('UnifiedTile dispatch', () => {
  it.each([
    ['thought tile with preview_card render_mode goes to ThoughtTile',
      { type: 'thought', render_mode: 'preview_card', title: 'hi' }, 'thought'],
    ['payment tile with embed render_mode goes to PayTile',
      { type: 'payment', render_mode: 'embed', url: 'https://buy.stripe.com/x' }, 'cta'],
    ['youtube tile with embed render_mode goes to GhostVisualTile',
      { type: 'youtube', render_mode: 'embed', media_id: 'abc' }, 'ghost-youtube'],
  ])('%s', (_, item, expectedDataTileType) => {
    const { container } = render(<UnifiedTile item={item} />)
    expect(container.querySelector(`[data-tile-type="${expectedDataTileType}"]`)).toBeTruthy()
  })
})
```

3 lines per case. Each one would have caught a bug we ate hours on today.

## Risk

- **Behavior change for non-bug paths.** Some current rows depend on
  render_mode dispatch routing them to ContentCard for legitimate reasons
  (e.g., a `link`-typed row that should render as the rich OG preview card
  instead of as a ghost tile). The migration must preserve this — the
  `LinkPreviewTile` renderer is responsible for that.
- **`canonicalizeType` is a new derived value.** Edge cases: a tweet URL
  pasted with `type=image` should still render as a tweet? Or as the image
  the user explicitly typed? Default to platform: trust `item.type` first,
  fall back to URL inference. Document.
- **Legacy data in production.** Any row whose `type` doesn't match the
  TYPE_RENDERERS keys hits RecoveryTile. Add a one-time DB audit before
  deploy: `SELECT DISTINCT platform FROM links` + `SELECT DISTINCT
  media_kind FROM library` + verify every value has a renderer.

## Estimated scope

- ~6 component extractions (each <100 LOC, mostly copy-paste from current
  UnifiedTile branches)
- ~30 LOC for `canonicalizeType` + `TYPE_RENDERERS` map
- ~40 LOC for the new `UnifiedTile` body (down from 350)
- ~150 LOC for tests (one per type)
- 1 PR. Half a day if uninterrupted, full day with reviews.

## What this unlocks

- Adding a new tile type becomes "write the renderer + register in map." No
  dispatcher reasoning, no debugging which branch fires.
- Future render_mode changes (intake layer evolution) cannot break tile
  rendering. The dispatch is decoupled.
- The bug class "tile silently routes to wrong renderer" is structurally
  impossible — every type maps to exactly one component.
- Test coverage becomes meaningful — one component, one test file, isolated.

## Order of operations relative to other work

Per ae 2026-04-15: this is #2 after analytics endpoints (DONE), tied with
the library upload newline fix (DONE). Recommend doing this BEFORE the
sizing doctrine change (rubin-pass), because the size doctrine wants to
key off `item.type` — which means it needs the type system to be the
authoritative source. Do collapse first, doctrine second.
