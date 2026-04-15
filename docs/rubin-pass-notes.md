# Rubin Pass — notes for ae

> "The work is to remove what doesn't belong." — what Rick says about a song;
> applies the same way to a footprint.

A pass through the friction & ornamentation as a user. Not a plan — a list to
react to. Each one is something I'd rip out, change, or restate before I build
more on top.

## Sizing — stop asking, start choosing

**The S/M/L topology is a tax on the user.** Every tile asks "how big should
I be?" — but the user already told you with the content. A tweet is a tweet.
A YouTube clip is a video. A 200-character thought is a passage. The CMS knows.

Rule of thumb that would replace the topology:

| Content                      | Default size       | Why |
|------------------------------|--------------------|-----|
| Image (any aspect)           | M (2 col, native aspect) | photos read at full width |
| Video (YT / Vimeo / native)  | M wide (2×1 aspect-video) | videos *want* to be 16:9 |
| TikTok / IG reel             | M tall (1×2 aspect-9/16) | vertical, scroll-friendly |
| Tweet / X post               | M square (2×1) | tweets are landscape-ish |
| Thought ≤ 12 chars           | S square — hero type | the line IS the design |
| Thought 13–60                | M square            | breathing room |
| Thought 60+                  | L (2×2)             | passage, not caption |
| Container                    | M minimum           | a door must look like a door |
| Pay / CTA                    | M square, hero type | the ask is the tile |
| Spotify / SoundCloud         | S portrait (3:4)    | album art is square; portrait reads as music |

The "edit" page can still let people resize manually for art reasons. But the
default should be the optimal — they shouldn't have to think.

## Friction inventory — one user thing per pass

Things on the page that don't earn their pixels:

- **"Make Yours" sticky bar at the bottom.** Visible on every scroll. It's
  insistent. Either kill it (the / pay tile in-feed already does the job) or
  show once after 30s of dwell time, then stay dismissed.
- **Multiple play affordances.** Some tiles have a centered play circle
  (GhostTile.tsx:283-294), some have a small bottom-corner play. Pick one
  visual language. I'd kill the centered circle for embed-mode tiles since
  the underlying iframe already has its own controls.
- **Thumbnail-then-iframe transition fade** (GhostTile.tsx:300-303 — 250ms
  opacity crossfade). It's gentle but adds a "loading" feeling. Either crisper
  (no transition) or longer (400ms with a subtle scale). Pick a feeling.
- **The depth-stack lines on container tiles** were ornamental. I deleted the
  inner two; one tasteful corner tick remains. Containers should look like
  doors, not framed paintings.
- **`overflow-x-hidden` on the body** vs. tiles that want to bleed past the
  viewport. Sound room hero tile already wants to break the grid — formalize
  that as a layout primitive instead of a one-off.
- **The 11px `font-mono uppercase tracking-[0.15em]` style** is everywhere
  (container labels, room labels, child counts). It signals "spec sheet" not
  "personal site." Reserve it for actually-numeric stuff (counts, serials).
  Use a humanist sans for labels people read.

## Mobile vs web — pick one, optimize for it

Looking at the breakpoints sprinkled through `getGridClass()` —
`md:col-span-3 md:row-span-2 aspect-video` — the layout currently chases two
masters and ends up neither. Two paths:

1. **Mobile-first single column** — every tile full-width, scroll vertically,
   videos auto-pause on scroll-out. This is the TikTok / Instagram answer.
   Web becomes mobile-zoomed-out. Lossy on desktop but ruthlessly clear.
2. **Desktop-first masonry** — Pinterest / are.na. Flow tiles by aspect, no
   fixed grid cells. On mobile, fall back to single column. This is what the
   site is *trying* to be. Commit to it: rip the `col-span-N` math, use CSS
   columns or a real masonry library.

Either is fine. Right now the page is in between and the seams show in the
empty rectangles you screenshotted.

## "Just content" — what that means concretely

Things that ARE content: the image, the video, the tweet text, the song.
Things that are NOT content but are on every tile right now:

- Backdrop blur / glass border (`bg-white/4` + `border-white/6`)
- Rounded corner (`rounded-2xl`)
- Hover scale (`fp-tile-hover`)
- Drop shadow / depth glow
- Lens flare bokeh background

Each is a choice to make. Yeezus stripped reverb, autotune, the smooth bridge.
Footprint's equivalent: pick one of [glass border, rounded corner, hover scale,
backdrop blur] and remove the other three. Right now they're stacked and the
content has to fight through four layers of treatment to read.

My vote: keep `rounded-2xl`. Drop the rest. Tile is content on background.
Period.

## What I changed today (concrete)

- Twitter/X inline playback (createTweet via widgets.js).
- Thought tile typography: ladder is now 28/20/16/14 with weight 400/300, long
  thoughts scroll instead of clipping, long thoughts auto-bumped to size 2 in
  DB.
- Pay tile: "yours" hero (clamp 28-56px) + small "make one →" caption. The
  whole tile is the target.
- Container tile: bigger label (clamp 15-22px), explicit empty/N-items state,
  removed the two inner depth lines + the bottom glow.
- CSP allows Twitter widget script + iframe.
- TikTok + YT auto-revert to thumbnail when video ends (postMessage listener
  for `onStateChange` info=0).
- YouTube quality forced to 1080p+ (intrinsic 1920×1080 iframe, `vq=hd1080`,
  postMessage `setPlaybackQuality` retries).

## What to consider next

- **Decide the layout doctrine** (single-column vs masonry) before adding more
  tile types. Every new tile type is cheaper to build once that's decided.
- **Kill the topology**. Default to optimal per type. Edit page keeps manual.
- **Delete one treatment layer per tile**. Run the tile through "what's
  earning its pixels" and remove the loser.
- **Instagram embed shows their chrome** (caption + profile + "View on
  Instagram" button). It's the only IG embed they offer. Either accept or
  treat IG tiles as link-out cards (clean preview, click opens IG). You said
  "forget IG" — I'd just keep the inline embed since it works, and not invest
  more time in it.
- **Pay tile actually goes to /home, not Stripe**. That's the conversion play
  but it's confusing — a tile labeled with a price in another column doesn't
  match a "make your own page" CTA. Either rename the column or be honest:
  the price is to start, not to subscribe to ae.
