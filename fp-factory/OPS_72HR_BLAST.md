# FOOTPRINT — 72-HOUR CONTENT BLAST OPS GUIDE

Everything below is copy/paste ready. No fluff. Execute in order.

---

## A) RUN COMMANDS

All commands assume you are in `fp-factory/` and have run `pip install -e .`
Replace `recording.mp4` with your actual file path.

### PRESET 1: FAST START (first batch uploading in 1-2 hours)

Goal: 40 clips x 3 variants = 120 pieces across TikTok + Reels + Shorts.
Scene detection, low variant count, 4 workers. Fast.

```bash
fpfactory run recording.mp4 \
  --output ./blast_day1_fast \
  --method scene \
  --target-clips 40 \
  --min-clip 4 \
  --max-clip 20 \
  --variants 3 \
  --zooms 1.0,1.15 \
  --speeds 1.0,1.1 \
  --grades none,high_contrast,cinematic \
  --ratios 9:16 \
  --workers 4 \
  --chunk-size 5 \
  --platforms tiktok,reels,shorts \
  --hashtags core,growth,aesthetic \
  --cta 0 \
  --thumbnails 1
```

**Expected output:** ~120 variants + metadata + 3 platform zips
**Expected time:** 30-60 min depending on hardware
**Output folder:** `blast_day1_fast/`

### PRESET 2: MAX THROUGHPUT (overnight compute)

Goal: 100 clips x 10 variants = 1000 pieces. Full matrix. All platforms.
Let this cook while you sleep.

```bash
fpfactory run recording.mp4 \
  --output ./blast_max \
  --method scene \
  --target-clips 100 \
  --min-clip 3 \
  --max-clip 25 \
  --variants 10 \
  --zooms 1.0,1.1,1.2,1.3 \
  --speeds 0.85,0.95,1.0,1.1,1.15 \
  --grades none,warm,cool,cinematic,high_contrast,neon,vintage,desaturate \
  --ratios 9:16,1:1 \
  --workers 8 \
  --chunk-size 10 \
  --platforms tiktok,reels,shorts,twitter \
  --hashtags core,growth,aesthetic,culture \
  --cta 0 \
  --thumbnails 3
```

**Expected output:** ~1000 variants + full metadata + 4 platform zips
**Expected time:** 2-6 hours depending on hardware
**Output folder:** `blast_max/`

### PRESET 3: MUTATION LOOP (daily iteration from analytics)

Goal: Take yesterday's winners, generate 5 mutations each.
Run this every morning after pulling analytics.

```bash
# Step 1: Run mutation cycle
fpfactory mutate \
  --csv ./analytics/day1_perf.csv \
  --source ./blast_max/variants \
  --output ./blast_day2_mutations/variants \
  --threshold 0.75 \
  --count 5 \
  --min-views 100

# Step 2: Repackage the mutations for upload
fpfactory package \
  --input ./blast_day2_mutations \
  --platforms tiktok,reels,shorts \
  --thumbnails 1
```

**Expected output:** 5 mutations per winner (if 10 winners = 50 new pieces)
**Expected time:** 10-20 min
**Output folder:** `blast_day2_mutations/`

### QUICK REPACKAGE (different platform split from existing batch)

```bash
fpfactory package \
  --input ./blast_max \
  --platforms tiktok,reels,shorts,twitter \
  --thumbnails 3 \
  --zip
```

---

## B) POSTING BRAIN

### B.1) 60 HOOKS

Short. Punchy. First line = scroll stopper. Second line = context.

**Identity / Self-Expression (1-15)**

```
1.  this is what my internet looks like
2.  one page. everything about me.
3.  I built a room for my taste
4.  if your personality had a homepage
5.  my whole identity in one link
6.  stopped using linktree. built this instead.
7.  what if your bio link actually looked good
8.  this replaced every link in my bio
9.  my corner of the internet. $10.
10. finally something that looks like me
11. I wanted one page that just gets it
12. this is my digital living room
13. not a link dump. a footprint.
14. I made my internet presence match my taste
15. one link. zero clutter.
```

**Curiosity / Pattern Interrupt (16-30)**

```
16. wait til you see the tiles
17. nobody's talking about this yet
18. $10 and it looks like this?
19. I found the anti-linktree
20. this changes how people see your links
21. scroll and tell me this isn't hard
22. you've never seen a bio page do this
23. the internet needed this
24. why does nobody know about this
25. I can't go back to linktree after this
26. bruh. look at this page.
27. my friends keep asking what this is
28. this is what personalization actually looks like
29. I didn't know bio links could look like this
30. this thing is criminally underrated
```

**Design / Aesthetic (31-45)**

```
31. the grid. the tiles. the vibe.
32. minimalism but make it personal
33. if pinterest and notion had a link page
34. clean design hits different
35. this is the most aesthetic thing on my phone
36. curated not cluttered
37. dark mode everything
38. when your link page has better design than most websites
39. tiles > list of links
40. the aesthetic internet is here
41. design nerds are gonna love this
42. it's giving gallery wall but digital
43. I spent 5 minutes and it looks like I hired a designer
44. UI so clean it's therapeutic
45. this layout is immaculate
```

**Social Proof / FOMO (46-60)**

```
46. 200 people made one this week
47. my followers keep DM'ing me about my link
48. every creator needs to see this
49. musicians are going crazy with this
50. artists finally have a page that matches their work
51. photographers. this one's for you.
52. if you have a brand this is non-negotiable
53. replaced my entire website with this
54. the comments on my last post were all about my bio link
55. people think I paid hundreds for this. it was $10.
56. streamers are sleeping on this
57. fashion pages need this immediately
58. everyone who sees it wants one
59. this is the move for 2026
60. your page should look as good as your content
```

### B.2) 40 CAPTION TEMPLATES

Use `{hook}` = hook from above. Use `{cta}` = CTA from below.

```
1.  {hook}

    footprint.onl

2.  {hook}

    $10. your identity. your rules.

3.  {hook}

    build yours — footprint.onl

4.  {hook}

    link in bio to make your own

5.  {hook}

    this is footprint. it's $10 and it's yours forever.

6.  {hook}

    tiles, not lists. vibes, not clutter.

7.  {hook}

    I built this in 5 minutes. footprint.onl

8.  {hook}

    your internet should look like you.

9.  {hook}

    stop sending people to an ugly link page.

10. {hook}

    footprint — digital identity room. $10.

11. {hook}

    not a linktree. not a website. a footprint.

12. {hook}

    one link that actually represents you.

13. {hook}

    own your corner. footprint.onl

14. {hook}

    curated identity for $10. footprint.onl

15. {hook}

    if you care about how your internet looks — link in bio.

16. {hook}

    the only bio link that doesn't look generic.

17. {hook}

    designed for people with taste.

18. {hook}

    make your link look like your feed.

19. {hook}

    you curate everything else. now curate your links.

20. {hook}

    footprint.onl — digital rooms for people who care.

21. {hook}

    I switched and I'm not going back.

22. {hook}

    this is what my bio link looks like now.

23. {hook}

    see for yourself — footprint.onl

24. {hook}

    aesthetic link pages exist now. footprint.onl

25. {hook}

    the internet just got more personal.

26. {hook}

    no templates. no limits. your identity.

27. {hook}

    10 dollars. infinite personality.

28. {hook}

    the design speaks for itself.

29. {hook}

    I just wanted my links to look good. found footprint.

30. {hook}

    this is the page your content deserves.

31. {hook}

    finally. a bio link with taste.

32. {hook}

    looks expensive. costs $10.

33. {hook}

    identity room > link tree.

34. {hook}

    your page, your curation, your footprint.

35. {hook}

    the visual internet is personal now.

36. {hook}

    tell me this doesn't look hard.

37. {hook}

    made mine in under 10 minutes.

38. {hook}

    if you're still using a list of links I feel bad for you.

39. {hook}

    this is what happens when bio links get designed right.

40. {hook}

    footprint.onl — go look.
```

### B.3) 40 CTA VARIANTS

Ultra-short. Goes at the end of every caption or in comments.

```
1.  footprint.onl
2.  link in bio
3.  footprint.onl — $10
4.  build yours now
5.  footprint.onl — go
6.  link in bio to build yours
7.  make your own — link in bio
8.  $10 — footprint.onl
9.  grab yours — link in bio
10. footprint.onl — own your corner
11. try it — link in bio
12. yours in 5 min — footprint.onl
13. see it yourself — link in bio
14. start building — footprint.onl
15. link in bio — trust me
16. footprint.onl — you'll thank me
17. go make one — link in bio
18. one click — link in bio
19. footprint.onl ←
20. → link in bio
21. $10 and it's yours. link in bio.
22. footprint.onl if you care about aesthetics
23. your identity is waiting — link in bio
24. build it — footprint.onl
25. don't sleep on this — link in bio
26. link in bio. seriously.
27. footprint.onl — make it yours
28. get footprint — link in bio
29. $10 to own it forever — footprint.onl
30. footprint.onl — digital identity room
31. make yours ugly-proof — link in bio
32. level up your bio — link in bio
33. the link is in the bio. go.
34. footprint.onl — you need this
35. go build — link in bio
36. replace your linktree — footprint.onl
37. upgrade your link — footprint.onl
38. footprint.onl — tiles not lists
39. own your internet — link in bio
40. footprint.onl — that's it. that's the CTA.
```

### B.4) 12 COMMENT PROMPTS

Drop these as your own first comment to seed engagement. Natural, not desperate.

```
1.  what would you put in your room?
2.  drop your niche — I'll tell you which layout fits
3.  who needs one of these?
4.  musicians, artists, or fashion — who's making the best rooms?
5.  what's your current bio link setup?
6.  would you switch from linktree for this?
7.  dark mode or light mode rooms?
8.  what tiles would you add first?
9.  honest question — does your bio link match your content?
10. rate this setup 1-10
11. which vibe is yours — minimal, maximal, or gallery?
12. what's the first link you'd feature in your room?
```

---

## B.5) HASHTAG LATTICE

10 clusters x 15 tags. No two posts use the same cluster. Rotate sequentially.

### CLUSTER 1 — Core Identity
```
#footprint #digitalidentity #linkinbio #biolink #personalbranding #identitydesign #onlineidentity #digitalroom #myinternet #curatedidentity #internetpresence #ownit #digitalself #webidentity #footprintonl
```

### CLUSTER 2 — Design Minimal
```
#minimaldesign #cleandesign #uiux #designinspiration #designersofinstagram #minimal #moderndesign #interfacedesign #digitalaesthetic #gridlayout #uidesign #designdetails #visualdesign #designlover #simplicity
```

### CLUSTER 3 — Dark Aesthetic
```
#darkaesthetic #darkmode #moodyaesthetic #darkvibes #aestheticpage #grunge #darktones #cyberaesthetic #nocturnal #vibecheck #moodboard #darkfeed #gothicaesthetic #shadowaesthetic #blackaesthetic
```

### CLUSTER 4 — Creator Economy
```
#creatoreconomy #creatortips #contentcreator #creatortools #digitalcreator #influencertools #socialmediastrategy #growthhacks #buildyourbrand #sidehustle #creatorsofinstagram #independentcreator #onlinebusiness #monetize #passiveincome
```

### CLUSTER 5 — Music Niche
```
#musicpage #spotifyplaylist #musiccurator #musicaesthetic #albumart #vinylvibes #musicproducer #beatmaker #soundcloud #musicblog #indiemusic #hiphopculture #rnbaesthetic #musiclover #playlistcurator
```

### CLUSTER 6 — Fashion / Style
```
#streetwear #fashionpage #styleinspiration #ootd #fashiondesign #fashionaesthetic #drip #wardrobestyle #fashioncurator #lookbook #fashionblogger #fitcheck #mensfashion #womensfashion #styleinspo
```

### CLUSTER 7 — Art / Visual
```
#digitalart #contemporaryart #artcollector #artcuration #visualart #gallerywall #artaesthetic #graphicdesign #illustrationart #creativedirection #artdaily #artoftheday #artistsoninstagram #artworld #curatedart
```

### CLUSTER 8 — Gen Z / Culture
```
#genz #internetculture #culturepage #trending #fyp #foryou #viral #memeculture #zoomer #aesthetic #vibe #iykyk #niche #core #chronicallyonline
```

### CLUSTER 9 — Tech / Product
```
#webapp #saas #indiemaker #techproduct #productdesign #buildinpublic #startuplife #techtools #digitaltools #appdesign #productlaunch #shipfast #makersmovement #nocode #indieweb
```

### CLUSTER 10 — Growth Amplifier
```
#explore #explorepage #reels #tiktokviral #instagramreels #youtubeshorts #contentmarketing #socialmediatips #algorithm #engagement #followforfollowback #discoverpage #viralcontent #trendingsound #blowup
```

### ROTATION RULES

| Post # | Cluster     | Rule                                            |
|--------|-------------|--------------------------------------------------|
| 1      | Cluster 1   | Always include core identity on first post        |
| 2      | Cluster 8   | Gen Z / viral tags for reach                     |
| 3      | Cluster 2   | Design audience                                  |
| 4      | Cluster 5   | Niche lane: music                                |
| 5      | Cluster 3   | Dark aesthetic lane                              |
| 6      | Cluster 10  | Pure growth amplifier                            |
| 7      | Cluster 6   | Niche lane: fashion                              |
| 8      | Cluster 4   | Creator economy                                  |
| 9      | Cluster 7   | Niche lane: art                                  |
| 10     | Cluster 9   | Tech / indie maker                               |

After post 10: restart at Cluster 1. Always shift by +1 on restart so no adjacent posts repeat clusters.

**Cross-pollination rule:** On every 3rd post, add 3 tags from the NEXT cluster in rotation. This prevents algorithmic pigeonholing.

**Platform-specific caps:**
- TikTok: 5-8 tags (fewer = better)
- IG Reels: 10-15 tags
- YouTube Shorts: 5-8 tags in description
- X/Twitter: 2-3 tags max (put rest in alt text or thread)

---

## B.6) 72-HOUR SCHEDULE GRID

### Timezone Logic

| Window         | US East     | US West     | EU (CET)    | Priority |
|----------------|-------------|-------------|-------------|----------|
| MORNING WAVE   | 7-9 AM EST  | 4-6 AM PST | 1-3 PM CET  | HIGH     |
| LUNCH WAVE     | 12-1 PM EST | 9-10 AM PST| 6-7 PM CET  | HIGH     |
| AFTERNOON WAVE | 3-5 PM EST  | 12-2 PM PST| 9-11 PM CET | MEDIUM   |
| EVENING WAVE   | 7-9 PM EST  | 4-6 PM PST | 1-3 AM CET  | HIGHEST  |
| LATE NIGHT     | 10-11 PM EST| 7-8 PM PST | 4-5 AM CET  | MEDIUM   |

### Daily Cadence Per Platform

| Platform       | Posts/Day | Best Windows              |
|----------------|-----------|---------------------------|
| TikTok         | 4-6       | Morning, Lunch, Evening, Late |
| IG Reels       | 3-4       | Morning, Afternoon, Evening   |
| YouTube Shorts | 2-3       | Lunch, Evening                |
| X/Twitter      | 3-4       | Morning, Lunch, Evening       |

### DAY 1 (Hours 0-24)

| Time (EST) | Platform       | Hook Set | Caption # | Hashtag Cluster | Variant Type     |
|------------|----------------|----------|-----------|-----------------|------------------|
| 7:00 AM    | TikTok         | 16       | 1         | Cluster 1       | high_contrast 9:16 |
| 7:30 AM    | IG Reels       | 1        | 10        | Cluster 1       | cinematic 9:16   |
| 8:00 AM    | X              | 31       | 28        | Cluster 9       | none 9:16        |
| 9:00 AM    | TikTok         | 26       | 36        | Cluster 8       | neon 9:16        |
| 12:00 PM   | TikTok         | 19       | 3         | Cluster 2       | warm 9:16        |
| 12:00 PM   | YouTube Shorts | 2        | 5         | Cluster 4       | high_contrast 9:16 |
| 12:30 PM   | IG Reels       | 5        | 12        | Cluster 2       | cool 9:16        |
| 1:00 PM    | X              | 46       | 32        | Cluster 4       | none 9:16        |
| 3:00 PM    | TikTok         | 36       | 7         | Cluster 5       | cinematic 9:16   |
| 3:30 PM    | IG Reels       | 10       | 15        | Cluster 3       | desaturate 9:16  |
| 5:00 PM    | X              | 55       | 22        | Cluster 6       | warm 9:16        |
| 7:00 PM    | TikTok         | 22       | 4         | Cluster 3       | neon 9:16        |
| 7:00 PM    | YouTube Shorts | 3        | 10        | Cluster 10      | high_contrast 9:16 |
| 7:30 PM    | IG Reels       | 42       | 20        | Cluster 10      | cinematic 9:16   |
| 8:00 PM    | X              | 49       | 33        | Cluster 7       | none 9:16        |
| 9:00 PM    | TikTok         | 29       | 6         | Cluster 6       | cool 9:16        |
| 10:00 PM   | TikTok         | 17       | 2         | Cluster 10      | vintage 9:16     |
| 10:30 PM   | YouTube Shorts | 8        | 27        | Cluster 8       | warm 9:16        |

**Day 1 total: 18 posts (6 TikTok, 4 Reels, 3 Shorts, 4 X, 1 buffer)**

### DAY 2 (Hours 24-48)

| Time (EST) | Platform       | Hook Set | Caption # | Hashtag Cluster | Variant Type     |
|------------|----------------|----------|-----------|-----------------|------------------|
| 7:00 AM    | TikTok         | 4        | 8         | Cluster 7       | cinematic 9:16   |
| 7:30 AM    | IG Reels       | 33       | 14        | Cluster 7       | warm 9:16        |
| 8:00 AM    | X              | 43       | 25        | Cluster 2       | none 9:16        |
| 9:00 AM    | TikTok         | 50       | 11        | Cluster 9       | high_contrast 9:16 |
| 12:00 PM   | TikTok         | 24       | 9         | Cluster 4       | neon 9:16        |
| 12:00 PM   | YouTube Shorts | 6        | 17        | Cluster 5       | cinematic 9:16   |
| 12:30 PM   | IG Reels       | 38       | 21        | Cluster 4       | cool 9:16        |
| 1:00 PM    | X              | 57       | 30        | Cluster 5       | none 9:16        |
| 3:00 PM    | TikTok         | 14       | 16        | Cluster 6       | warm 9:16        |
| 3:30 PM    | IG Reels       | 40       | 23        | Cluster 6       | desaturate 9:16  |
| 5:00 PM    | X              | 52       | 35        | Cluster 8       | none 9:16        |
| 7:00 PM    | TikTok         | 20       | 13        | Cluster 8       | neon 9:16        |
| 7:00 PM    | YouTube Shorts | 9        | 26        | Cluster 1       | high_contrast 9:16 |
| 7:30 PM    | IG Reels       | 35       | 18        | Cluster 3       | cinematic 9:16   |
| 8:00 PM    | X              | 59       | 37        | Cluster 9       | none 9:16        |
| 9:00 PM    | TikTok         | 27       | 19        | Cluster 10      | cool 9:16        |
| 10:00 PM   | TikTok         | 47       | 24        | Cluster 5       | vintage 9:16     |
| 10:30 PM   | YouTube Shorts | 12       | 29        | Cluster 3       | warm 9:16        |

**Day 2 total: 18 posts (6 TikTok, 4 Reels, 3 Shorts, 4 X, 1 buffer)**

### DAY 3 (Hours 48-72)

| Time (EST) | Platform       | Hook Set | Caption # | Hashtag Cluster | Variant Type     |
|------------|----------------|----------|-----------|-----------------|------------------|
| 7:00 AM    | TikTok         | 7        | 31        | Cluster 1       | cinematic 9:16   |
| 7:30 AM    | IG Reels       | 44       | 34        | Cluster 2       | warm 9:16        |
| 8:00 AM    | X              | 53       | 38        | Cluster 10      | none 9:16        |
| 9:00 AM    | TikTok         | 30       | 39        | Cluster 3       | high_contrast 9:16 |
| 12:00 PM   | TikTok         | 48       | 40        | Cluster 9       | neon 9:16        |
| 12:00 PM   | YouTube Shorts | 11       | 1         | Cluster 6       | cinematic 9:16   |
| 12:30 PM   | IG Reels       | 37       | 2         | Cluster 7       | cool 9:16        |
| 1:00 PM    | X              | 56       | 5         | Cluster 4       | none 9:16        |
| 3:00 PM    | TikTok         | 58       | 8         | Cluster 8       | warm 9:16        |
| 3:30 PM    | IG Reels       | 41       | 15        | Cluster 5       | desaturate 9:16  |
| 5:00 PM    | X              | 60       | 22        | Cluster 1       | none 9:16        |
| 7:00 PM    | TikTok         | 15       | 10        | Cluster 10      | neon 9:16        |
| 7:00 PM    | YouTube Shorts | 13       | 17        | Cluster 2       | high_contrast 9:16 |
| 7:30 PM    | IG Reels       | 34       | 20        | Cluster 9       | cinematic 9:16   |
| 8:00 PM    | X              | 54       | 26        | Cluster 6       | none 9:16        |
| 9:00 PM    | TikTok         | 23       | 33        | Cluster 4       | cool 9:16        |
| 10:00 PM   | TikTok         | 39       | 36        | Cluster 7       | vintage 9:16     |
| 10:30 PM   | YouTube Shorts | 18       | 29        | Cluster 8       | warm 9:16        |

**Day 3 total: 18 posts (6 TikTok, 4 Reels, 3 Shorts, 4 X, 1 buffer)**

### 72-HOUR TOTALS
- **54 posts total** (18/day)
- **18 TikTok** | **12 IG Reels** | **9 YouTube Shorts** | **12 X** | **3 buffer slots**
- **Zero cluster repeats** in any consecutive 3-post window
- **Zero hook repeats** across entire 72 hours

### BURST MODE (when a post spikes)

Trigger: any post exceeds 2x your average views within 2 hours.

**Immediate actions (within 30 min of spike):**
1. Post the SAME clip with a DIFFERENT hook + cluster on the OTHER platforms you haven't posted it to yet
2. Post 2 additional variants of the same source clip on the spiking platform (different grade/zoom)
3. Drop comment prompt #1 or #10 on the spiking post
4. Move the next 2 scheduled posts FORWARD by 1 hour (ride the algorithmic wave)

**Within 2 hours of spike:**
5. Run FAST START preset using only the source recording segment that produced the winner
6. Queue 3-4 new variants from that batch in the next available slots

**Never do:**
- Don't repost the exact same file
- Don't post more than 3x in 1 hour on any single platform
- Don't change your bio link mid-spike (keep it stable)

---

## C) ANALYTICS → MUTATION LOOP

### C.5) Analytics CSV Schema

Create this file manually. One row per posted clip. Paste from platform dashboards.

**Required columns:**

```csv
clip_id,filename,views,likes,shares,comments,saves,platform
fp_20260218_0000_000,clip_0000_z115_high_contrast_9x16_000.mp4,4200,180,42,15,290,tiktok
fp_20260218_0001_000,clip_0001_z100_cinematic_9x16_000.mp4,1100,25,3,2,40,reels
fp_20260218_0002_000,clip_0002_z100_neon_9x16_000.mp4,8500,410,95,38,620,tiktok
```

**Column definitions:**

| Column     | Required | Source                        | Notes                           |
|------------|----------|-------------------------------|---------------------------------|
| clip_id    | YES      | From metadata.json sidecar    | Matches factory output          |
| filename   | YES      | From metadata.json sidecar    | Exact filename for mutation     |
| views      | YES      | Platform analytics dashboard  | Total views at time of capture  |
| likes      | YES      | Platform analytics dashboard  |                                 |
| shares     | YES      | Platform dashboard or "reposts" | TikTok=shares, X=reposts      |
| comments   | YES      | Platform analytics dashboard  |                                 |
| saves      | YES      | Platform dashboard or "bookmarks" | TikTok=saves, IG=saves, X=bookmarks |
| platform   | YES      | Which platform this was posted to | tiktok, reels, shorts, twitter |

**Alternative column names accepted:** `id` (for clip_id), `file` (for filename), `reposts` (for shares), `bookmarks` (for saves)

**File location:** Save as `./analytics/day1_perf.csv`, `./analytics/day2_perf.csv`, etc.

### C.6) Winner Selection Rules

The mutation engine uses this formula:

```
engagement_score = (likes×1 + shares×3 + comments×2 + saves×4) / views
```

**Weight rationale:**
- Saves (4x): strongest intent signal — they want to come back
- Shares (3x): distribution signal — they're spreading it
- Comments (2x): engagement signal — they care enough to type
- Likes (1x): baseline signal — lowest friction

**Thresholds:**

| Metric              | Value   | What it means                         |
|---------------------|---------|---------------------------------------|
| --threshold         | 0.75    | Top 25% of qualifying clips become winners |
| --min-views         | 100     | Clips under 100 views are excluded (not enough data) |
| Engagement > 0.10   | Good    | 10%+ weighted engagement = solid performer |
| Engagement > 0.25   | Great   | 25%+ = strong winner, mutate aggressively |
| Engagement > 0.50   | Viral   | 50%+ = run burst mode immediately     |

**What to mutate based on score breakdown:**

| Signal                      | Action                                      |
|-----------------------------|---------------------------------------------|
| High saves, low shares      | Keep content. Change hook to be more shareable. |
| High shares, low saves      | Content is entertaining but not useful. Add utility CTA. |
| High comments, rest low     | Provocative hook works. Keep hook, swap visuals. |
| All signals high            | Perfect clip. Mutate VISUAL ONLY (zoom/grade/speed). Don't touch copy. |
| Views high, engagement low  | Hook works (stops scroll) but content doesn't convert. New clip, keep hook. |

### C.7) Daily Mutation Cadence

| Day   | Input                    | Action                        | New Variants | Total Active |
|-------|--------------------------|-------------------------------|-------------|--------------|
| Day 1 | Recording → FAST START   | First batch, no analytics yet | 120         | 120          |
| Day 1 | Recording → MAX THROUGH  | Overnight compute             | 1000        | 1120         |
| Day 2 | day1_perf.csv            | Mutate top 25% of Day 1 posts| ~50         | 1170         |
| Day 2 | Manual review            | Kill bottom 50% from queue   | 0           | ~585         |
| Day 3 | day2_perf.csv            | Mutate top 25% of Day 2 posts| ~50         | ~635         |
| Day 3 | Manual review            | Kill bottom 50%, keep winners | 0           | ~320         |

**Daily workflow:**
1. Morning (8 AM): Download/enter yesterday's analytics into CSV
2. Run mutation: `fpfactory mutate --csv ./analytics/dayN_perf.csv --source ./blast_max/variants --output ./blast_dayN_mutations/variants --threshold 0.75 --count 5`
3. Package: `fpfactory package --input ./blast_dayN_mutations --platforms tiktok,reels,shorts`
4. Upload mutation zips to scheduler
5. Slot mutations into that day's remaining schedule slots
6. Evening: record new angles if Day 1 data shows clear winners (see recording scripts below)

**Repackaging for upload:**
- Mutations land in `blast_dayN_mutations/dist/<platform>/9x16/`
- Each platform folder zips separately: `blast_dayN_mutations/zips/tiktok.zip`
- Upload the zip to Later/Planoly/Metricool and schedule per the grid above
- Mutations get the SAME caption/hook rotation as regular variants — just slot them into the next available grid position

---

## D) OPERATOR CHECKLISTS

### D.8) 48-Hour Execution Checklist

#### DAY 0 (PREP — evening before launch)

```
[ ] Record 3-5 min MP4 of Footprint (see recording scripts below)
[ ] Transfer recording to machine with fp-factory installed
[ ] Verify: pip install -e . (in fp-factory/)
[ ] Verify: ffmpeg --version
[ ] Run FAST START command (copy from Section A above)
[ ] While FAST START computes → write first 6 hooks + captions in Notes app
[ ] FAST START done? → open blast_day1_fast/zips/
[ ] Upload tiktok.zip to Later (or your scheduler)
[ ] Upload reels.zip to Planoly (or your scheduler)
[ ] Upload shorts.zip to YouTube Studio drafts
[ ] Schedule Day 1 morning wave (7-9 AM posts) per grid
[ ] Run MAX THROUGHPUT command (copy from Section A above) → let it run overnight
[ ] Set alarm: 6:45 AM
[ ] Sleep.
```

#### DAY 1

```
06:45  [ ] Wake up. Check MAX THROUGHPUT finished (look for summary.json)
07:00  [ ] Day 1 morning wave posts go live (auto-scheduled)
07:15  [ ] Upload blast_max/zips/ to all schedulers
        [ ] TikTok batch → Later
        [ ] Reels batch → Planoly
        [ ] Shorts batch → YouTube Studio drafts
        [ ] X clips → schedule via Metricool or TweetDeck
07:45  [ ] Schedule remaining Day 1 posts per grid (12PM through 10:30PM)
08:00  [ ] Drop comment prompt on first TikTok (prompt #1 or #10)
09:00  [ ] Check first post performance (quick glance, don't obsess)
12:00  [ ] Lunch wave goes live
12:30  [ ] Drop comment prompt on best-performing morning post
15:00  [ ] Afternoon wave goes live
15:30  [ ] Quick analytics check: any post spiking? If yes → BURST MODE
17:00  [ ] Start pulling rough numbers for morning posts into analytics CSV
19:00  [ ] Evening wave goes live (highest priority)
19:15  [ ] Drop comment prompt on evening TikTok
21:00  [ ] Late evening wave goes live
21:30  [ ] Fill in Day 1 analytics CSV with all available numbers
        [ ] Save as ./analytics/day1_perf.csv
22:00  [ ] Schedule Day 2 morning wave posts
22:30  [ ] Record new 2-3 min MP4 if Day 1 data shows clear format winner
        [ ] (See Recording Script 2 below)
23:00  [ ] Sleep.
```

#### DAY 2

```
06:45  [ ] Wake up. Finalize day1_perf.csv with overnight numbers
07:00  [ ] Day 2 morning wave goes live (auto-scheduled)
07:15  [ ] Run MUTATION LOOP (copy from Section A above)
        [ ] fpfactory mutate --csv ./analytics/day1_perf.csv ...
        [ ] fpfactory package --input ./blast_day2_mutations ...
07:30  [ ] Upload mutation zips to schedulers
07:45  [ ] Slot mutations into Day 2 afternoon/evening schedule slots
08:00  [ ] Drop comment prompt on first Day 2 TikTok
09:00  [ ] Quick check: any Day 1 post still gaining? Boost it (repost variant)
12:00  [ ] Lunch wave
15:00  [ ] Afternoon wave (include mutations here)
17:00  [ ] Start Day 2 analytics CSV
19:00  [ ] Evening wave
21:00  [ ] Late wave
21:30  [ ] Finalize day2_perf.csv
22:00  [ ] Run MUTATION LOOP on day2_perf.csv for Day 3
22:30  [ ] If new recording from last night → run FAST START on it
        [ ] Schedule Day 3 morning wave
23:00  [ ] Sleep.
```

#### DAY 3 (Hours 48-72)

Repeat Day 2 pattern. By Day 3:
- You have 2-3 recordings worth of content
- Mutation loop has identified your top performers
- You should see compounding views on winner variants
- Focus posting energy on the platform showing best traction

### D.9) RECORDING SCRIPTS

#### RECORDING 1: "The Grand Tour" (first recording, 3-5 min)

Purpose: show the product from first impression to full experience.

```
SHOT LIST (record in this order, don't stop recording):

00:00-00:15  COLD OPEN
  → Open browser. Type footprint.onl. Hit enter.
  → Let the page load fully. Pause 2 seconds.

00:15-00:45  LANDING PAGE SCAN
  → Slow scroll down the landing page
  → Pause on any key visual (hero image, price, CTA)
  → Mouse hover over the $10 price point — hold 2 sec

00:45-01:30  ROOM ENTRY
  → Click into a demo room (or your own room)
  → Let it load. Don't move mouse for 3 seconds (this is the money shot)
  → Slow pan — scroll DOWN the room at half speed
  → Let every tile become visible

01:30-02:30  TILE INTERACTION
  → Click on 3-4 different tiles
  → Show the expand/detail view for each
  → Pause 2 sec on each expanded tile
  → Show variety: music tile, image tile, link tile, text tile

02:30-03:15  CUSTOMIZATION SPEED RUN
  → Go to edit/customize mode
  → Drag a tile to rearrange — show it snap into place
  → Change a color or theme toggle
  → Add a new tile (any type) — show the flow start to finish
  → Show the save/publish action

03:15-04:00  MOBILE VIEW (if possible)
  → Open the room on phone (or use browser responsive mode)
  → Scroll the room on mobile
  → Show it looks just as good
  → Tap a tile

04:00-04:30  CLOSE
  → Return to the room's main view
  → Slow final scroll from top to bottom
  → End on the room fully visible — hold 3 seconds
```

#### RECORDING 2: "The Before/After" (2-3 min)

Purpose: contrast Footprint against ugly alternatives. Creates desire.

```
SHOT LIST:

00:00-00:30  THE "BEFORE"
  → Open a generic linktree page (your own or a fake example)
  → Scroll it slowly — show how plain/generic it looks
  → Highlight: just a list of links, no personality

00:30-00:45  THE TRANSITION
  → Close that tab
  → Type footprint.onl
  → Hit enter. Let it load.

00:45-02:00  THE "AFTER"
  → Open your Footprint room
  → Same slow scroll treatment
  → The visual contrast sells itself — don't rush
  → Open 2-3 tiles to show depth
  → Show any custom theming

02:00-02:30  THE NICHE ANGLE
  → If music page: show Spotify embeds, album art tiles
  → If fashion: show outfit grid, brand tiles
  → If art: show gallery layout, portfolio tiles
  → Pick your angle and lean into it

02:30-03:00  CLOSE
  → Back to full room view
  → Hold for 3 seconds
```

#### RECORDING 3: "The 5-Minute Build" (2-3 min, sped up)

Purpose: show how fast and easy it is. Removes friction objection.

```
SHOT LIST:

00:00-00:10  START
  → Show footprint.onl signup/start page
  → Click "get started" or equivalent

00:10-01:30  BUILD IN REAL TIME
  → Pick a template/start blank
  → Add 4-5 tiles quickly (title, link, image, music, text)
  → Arrange them into a layout
  → Pick a theme/color scheme
  → NOTE: record at normal speed. fp-factory will create speed variants automatically.

01:30-02:00  PUBLISH
  → Hit publish/save
  → Show the live URL
  → Open it in a new tab
  → Scroll the finished room

02:00-02:30  CLOSE
  → Show the room on the live URL
  → Slow scroll, hold 3 seconds at bottom
```

**Recording tips (all recordings):**
- Screen record at 1080p minimum (1440p preferred)
- Record the BROWSER ONLY (hide desktop, dock, bookmarks bar)
- Use a clean browser profile (no embarrassing tabs or bookmarks)
- Move mouse SLOWLY — fast cursor = bad clips
- Every pause = a natural scene cut point for the slicer
- Include 2-3 deliberate 3-second pauses (these become clean clip boundaries)
- No voiceover needed — the visual product sells
- If you add music later, the silence detection slicer can cut on pauses

---

## REFERENCE: FILE TREE AFTER FULL BLAST

```
fp-factory/
├── fpfactory/                    # Engine (don't touch)
├── presets/                      # Preset configs
├── recording.mp4                 # Your source video
├── recording_v2.mp4              # Day 2 recording
├── analytics/
│   ├── day1_perf.csv             # You create this manually
│   ├── day2_perf.csv
│   └── day3_perf.csv
├── blast_day1_fast/              # FAST START output
│   ├── clips/
│   ├── variants/
│   ├── metadata/
│   ├── csv/
│   ├── dist/
│   │   ├── tiktok/9x16/
│   │   ├── reels/9x16/
│   │   └── shorts/9x16/
│   └── zips/
│       ├── tiktok.zip            # ← Upload this to Later
│       ├── reels.zip             # ← Upload this to Planoly
│       └── shorts.zip            # ← Upload to YouTube Studio
├── blast_max/                    # MAX THROUGHPUT output
│   ├── clips/
│   ├── variants/
│   ├── metadata/
│   ├── csv/
│   │   ├── fp_*_later.csv        # ← Import to Later directly
│   │   ├── fp_*_planoly.csv      # ← Import to Planoly directly
│   │   └── fp_*_metricool.csv    # ← Import to Metricool directly
│   ├── dist/
│   │   ├── tiktok/9x16/
│   │   ├── reels/9x16/
│   │   ├── shorts/9x16/
│   │   └── twitter/16x9/
│   └── zips/
├── blast_day2_mutations/         # MUTATION output (Day 2)
│   ├── variants/
│   ├── dist/
│   └── zips/
└── blast_day3_mutations/         # MUTATION output (Day 3)
    ├── variants/
    ├── dist/
    └── zips/
```

---

## DONE. NEXT STEPS.

1. Paste your fp-factory output folder tree and first 30 lines of metadata.csv
2. I will refine the schedule grid + rotation rules to match your actual generated assets exactly
3. We lock in and execute
