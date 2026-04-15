# AE PRESENTATION LAYER SPECIFICATION
## DO NOT DEVIATE. DO NOT REFACTOR UNRELATED CODE. EXECUTE ONLY THESE INSTRUCTIONS.

### THE PHILOSOPHY
Footprint does not embed platforms. It translates artifacts.
The source platform may remain as provenance, but the interface must become Footprint-native.
Tiles are dormant objects. When tapped, they wake up (Z-axis expansion). They never link out unless explicitly instructed. They never show platform chrome.

### TASK 1: THE UNIVERSAL E-STATE (TEXT EXPANSION)
Problem: Text tiles currently truncate ('line-clamp') and have no way to be read fully. They feel like dead previews.
Goal: Tapping a text tile pulls it forward in Z-space, dimming the background, revealing the full text. Tapping the void returns it to the grid.

Execution Details:
1. In the component that renders Text tiles (e.g., 'ContentCard.tsx' or 'UnifiedTile.tsx'), add a local 'isExpanded' state.
2. DORMANT STATE: Apply 'line-clamp-3' (or similar) to truncate text in the grid.
3. ON CLICK: Toggle 'isExpanded = true'.
4. EXPANDED STATE (E-State):
   - Render the tile in a fixed, full-screen overlay (Z-index high).
   - Background must be a dark, blurred void ('bg-black/80 backdrop-blur-md').
   - The text container must be centered, max-width appropriate for reading, 'max-h-[80vh]', and 'overflow-y-auto' so long text scrolls *inside* the modal, not the page.
5. EXIT: Clicking the blurred background (the Void) or an explicit minimal 'X' must toggle 'isExpanded = false'.
6. ANIMATION: Use Framer Motion (if installed) for a heavy, calm spring transition. No bouncy startup energy. If no Framer Motion, use a clean 200ms CSS fade/scale.

### TASK 2: YOUTUBE CONSOLIDATION (KILL THE RED BUTTON)
Problem: YouTube's native UI (the red play button, video titles, watch later icons) keeps leaking onto the grid because embed URLs are hardcoded differently across multiple files.
Goal: One single, de-branded YouTube embed URL format used everywhere. Clean thumbnail facade → click → iframe mounts and autoplays.

Execution Details:
1. Create ONE helper function in 'lib/parseEmbed.ts' (or similar utility file):
   ```ts
   export function buildYouTubeEmbedUrl(videoId: string, start = 0): string {
     return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&start=${start}`
   }
   ```
2. Search the entire codebase (grep) for ANY inline strings containing 'youtube.com/embed' or 'youtube-nocookie.com/embed'.
3. Replace every single instance with a call to 'buildYouTubeEmbedUrl'.
4. Ensure the "facade" pattern is intact: The tile shows a high-res thumbnail and a custom, minimal Footprint play icon. Only when tapped does the iframe mount (triggering the autoplay URL).

### TASK 3: THE FALLBACK CARD (KILL THE GRAY BOXES)
Problem: X (Twitter), TikTok, and Instagram embeds often fail due to platform API restrictions, resulting in ugly gray or broken tiles. This destroys the museum wall aesthetic.
Goal: If an embed fails or cannot load a thumbnail, it must degrade gracefully into a beautiful, intentional "Link Card."

Execution Details:
1. Identify where embeds fail or return null/empty states (likely in 'ContentCard.tsx' or 'UnifiedTile.tsx').
2. Instead of rendering an empty div or a gray box, render a generic 'FallbackCard'.
3. The FallbackCard must display:
   - A subtle icon or text indicating the provider (e.g., 'X', 'TikTok', 'Instagram').
   - The extracted title or URL snippet (truncated cleanly).
   - A muted "open source ↗" affordance.
4. The FallbackCard must look like a deliberate design choice, using the established 'ae' dark-glass aesthetic, not an error state.

### VERIFICATION REQUIREMENTS BEFORE COMMIT:
- Text tiles truncate in the grid.
- Tapping a text tile opens the E-State modal; full text is readable and scrollable.
- Tapping outside the E-State modal closes it.
- YouTube tiles show a custom thumbnail/icon, NOT the red YouTube button.
- Tapping a YouTube tile plays the video inline with modest branding.
- Broken social links render as clean FallbackCards, not gray boxes.

### IMPLEMENTATION NOTE (PLAN DEVIATIONS, RECORDED HERE FOR AUDIT)

The helper function signature was extended beyond the spec's `(videoId, start = 0)` because two behaviors in the existing codebase are load-bearing and would regress if removed:

1. **`mute=1` + `enablejsapi=1`** — required for mobile-Safari autoplay + the `postMessage({command: 'unMute'})` hack in [components/ContentCard.tsx:166](../../components/ContentCard.tsx). Removing these breaks sound on iOS.
2. **`autoplay=0` facade mode** — [lib/parseEmbed.ts:47](../../lib/parseEmbed.ts) `parseYouTube()` returns the URL used for non-active states (e.g. identity-intake pipeline). It must not autoplay.

Final signature:
```ts
buildYouTubeEmbedUrl(videoId, { autoplay = true, mute = true, start = 0 } = {})
```
Always emits `modestbranding=1&rel=0&iv_load_policy=3&playsinline=1` to honor the spec's de-branding intent.
