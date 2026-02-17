# Footprint Content Factory

Local content-automation system for high-volume short-form content preparation. All processing is local. No automated posting. No social platform API calls.

## Architecture

```
INPUT                    PIPELINE                           OUTPUT
─────                    ────────                           ──────
                    ┌──────────────┐
screen recording →  │   SLICER     │  → 100-500 micro-clips
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  VARIANTS    │  → N variants per clip
                    │  zoom/crop   │    (zoom, color, speed,
                    │  color/speed │     aspect ratio, overlay)
                    │  aspect/pan  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  METADATA    │  → captions, hashtags, CTAs,
                    │  captions    │    JSON sidecars, CSV exports
                    │  hashtags    │    (Later, Planoly, Metricool)
                    │  csv/json    │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  MUTATION    │  → performance CSV in,
                    │  (optional)  │    new winner variants out
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐     platform folders
                    │  PACKAGER    │  → zip bundles
                    │  folders/zip │    thumbnails
                    │  thumbnails  │    metadata sidecars
                    └──────────────┘
```

## File Tree

```
fp-factory/
├── fpfactory/
│   ├── __init__.py          # Package init
│   ├── __main__.py          # python -m fpfactory
│   ├── cli.py               # CLI entry point (argparse)
│   ├── config.py            # Config, presets, constants
│   ├── slicer.py            # FFmpeg video slicing (scene/interval/silence)
│   ├── variants.py          # Variation engine (zoom/crop/color/speed/ratio)
│   ├── metadata.py          # Metadata generation (captions/hashtags/CSV)
│   ├── mutation.py          # Performance-based winner regeneration
│   ├── workers.py           # Multiprocessing pool with chunking
│   └── packager.py          # Platform folders, zips, thumbnails
├── presets/
│   ├── variant_presets.json  # Pre-built variant matrices
│   └── metadata_presets.json # Hashtag/CTA preset configs
├── luts/                     # Drop custom .cube LUT files here
├── examples/
│   └── performance_data.csv  # Example mutation input
├── requirements.txt
├── setup.py
└── README.md
```

## Setup (macOS)

```bash
# 1. Install FFmpeg
brew install ffmpeg

# 2. Verify FFmpeg
ffmpeg -version
ffprobe -version

# 3. Install the factory
cd fp-factory
pip install -e .

# 4. Verify
fpfactory --help
```

### Alternative (no install)

```bash
cd fp-factory
python -m fpfactory --help
```

## Usage

### Full Pipeline

```bash
# Slice → Variants → Metadata → Package
fpfactory run recording.mp4 --output ./batch1

# High throughput: 8 workers, 10 variants per clip, 200 target clips
fpfactory run recording.mp4 \
  --output ./batch1 \
  --target-clips 200 \
  --variants 10 \
  --workers 8

# TikTok-focused: 9:16 only, high contrast + neon grades
fpfactory run recording.mp4 \
  --output ./tiktok-batch \
  --ratios 9:16 \
  --grades none,high_contrast,neon,cinematic \
  --platforms tiktok

# Instagram multi-format
fpfactory run recording.mp4 \
  --output ./ig-batch \
  --ratios 1:1,4:5,9:16 \
  --grades none,warm,pastel,vintage \
  --platforms reels,instagram_feed

# Maximum throughput (thousands of variants)
fpfactory run recording.mp4 \
  --output ./max-batch \
  --target-clips 500 \
  --variants 20 \
  --workers 12 \
  --zooms 1.0,1.1,1.2,1.3 \
  --speeds 0.85,0.95,1.0,1.1,1.15 \
  --grades none,warm,cool,cinematic,vintage,desaturate,high_contrast,neon \
  --ratios 9:16,1:1,16:9,4:5
```

### Slice Only

```bash
# Scene detection (content-aware cuts)
fpfactory slice recording.mp4 --method scene --target-clips 200

# Fixed intervals (10-second clips)
fpfactory slice recording.mp4 --method interval --interval 10

# Silence-based cuts (natural pauses)
fpfactory slice recording.mp4 --method silence --min-clip 5

# Short clips for Shorts/TikTok
fpfactory slice recording.mp4 --method scene --min-clip 3 --max-clip 15
```

### Mutation Cycle

```bash
# 1. Run initial batch
fpfactory run recording.mp4 --output ./batch1

# 2. Post content manually via scheduling tools

# 3. Download performance data from platform analytics
#    Save as CSV with columns: clip_id, filename, views, likes, shares, comments, saves

# 4. Run mutation cycle
fpfactory mutate \
  --csv performance_data.csv \
  --source ./batch1/variants \
  --output ./batch2/mutations \
  --threshold 0.75 \
  --count 5

# 5. Package mutations
fpfactory package --input ./batch2 --platforms tiktok,reels
```

### Package Only

```bash
# Package existing variants for upload
fpfactory package \
  --input ./batch1 \
  --platforms tiktok,reels,shorts \
  --thumbnails 3 \
  --zip
```

## Output Structure

```
output/
├── clips/                           # Raw micro-clips from slicer
│   ├── clip_0000.mp4
│   ├── clip_0001.mp4
│   └── ...
├── variants/                        # All variant files
│   ├── clip_0000_z115_warm_9x16_000.mp4
│   ├── clip_0000_z100_none_1x1_001.mp4
│   └── ...
├── metadata/                        # JSON sidecar per variant
│   ├── clip_0000_z115_warm_9x16_000.json
│   └── ...
├── csv/                             # Scheduling tool CSVs
│   ├── fp_20260217_generic.csv
│   ├── fp_20260217_later.csv
│   ├── fp_20260217_planoly.csv
│   └── fp_20260217_metricool.csv
├── dist/                            # Platform-organized folders
│   ├── tiktok/
│   │   └── 9x16/
│   │       ├── clip_0000_z115_warm_9x16_000.mp4
│   │       └── clip_0000_z115_warm_9x16_000.json
│   ├── reels/
│   │   └── 9x16/
│   └── shorts/
│       └── 9x16/
├── _thumbnails/                     # Generated thumbnails
│   ├── clip_0000_z115_warm_9x16_000_thumb_0.jpg
│   └── ...
├── zips/                            # Upload-ready bundles
│   ├── tiktok.zip
│   ├── reels.zip
│   └── shorts.zip
├── mutations/                       # Mutation cycle outputs (if run)
├── fp_20260217_config.json          # Run configuration
├── fp_20260217_manifest.json        # Master manifest
└── fp_20260217_summary.json         # Run summary + stats
```

## Variant Matrix

Each clip is transformed through a matrix of parameters:

| Parameter | Values | Effect |
|-----------|--------|--------|
| Zoom | 1.0x, 1.15x, 1.3x | Subtle zoom + center crop |
| Speed | 0.85x, 1.0x, 1.1x | Slight slow-mo or speed-up |
| Color Grade | none, warm, cool, cinematic, vintage, desaturate, high_contrast, neon, pastel, noir | FFmpeg color filters |
| Aspect Ratio | 9:16, 1:1, 16:9, 4:5 | Platform-specific crops |
| Crop Position | center, top, bottom | Where to anchor the crop |

**Throughput math:**
- 100 clips x 5 variants = 500 pieces
- 200 clips x 10 variants = 2,000 pieces
- 500 clips x 20 variants = 10,000 pieces

## Mutation Engine

The mutation loop is a manual feedback cycle:

1. **Run initial batch** → thousands of variants
2. **Post manually** via Later/Planoly/Metricool
3. **Download analytics** → save as CSV
4. **Feed CSV to mutation engine** → identifies top 25% performers
5. **Engine generates new variants** of winners (tweaked zoom, color, speed)
6. **Repeat** — each cycle converges on what works

The mutation engine never touches any platform. You provide the CSV manually.

## Color Grades

| Grade | Description |
|-------|-------------|
| `none` | Original colors |
| `warm` | Orange/amber shift |
| `cool` | Blue/teal shift |
| `desaturate` | 60% saturation |
| `high_contrast` | Increased contrast curve |
| `vintage` | Faded + warm |
| `cinematic` | Warm shadows, cool highlights, slight desat |
| `noir` | Black and white + contrast |
| `pastel` | Low saturation + soft tint |
| `neon` | High saturation + contrast |

### Custom LUTs

Drop `.cube` LUT files in the `luts/` directory. Use in variants:

```bash
fpfactory run recording.mp4 --grades none,lut:luts/my_grade.cube
```

## CSV Formats

### Generic (all fields)
Full metadata for internal tracking.

### Later.com
`Media URL, Caption, Scheduled Date, Platform`

### Planoly
`file, caption, date, time, hashtags`

### Metricool
`Date, Content, Media, Network`

## Concurrency

The factory uses Python multiprocessing for parallel FFmpeg execution:

| Workers | Clips | Variants/Clip | Total | Est. Time |
|---------|-------|---------------|-------|-----------|
| 4 | 100 | 5 | 500 | ~8 min |
| 8 | 200 | 10 | 2,000 | ~15 min |
| 12 | 500 | 5 | 2,500 | ~12 min |

Times depend on source resolution, clip duration, and hardware.

## Constraints

- All processing is local (FFmpeg on your machine)
- No automated posting to any platform
- No direct interaction with TikTok, IG, YouTube, or X APIs
- No scraping, no rate limit bypass, no captcha bypass
- Performance data is manually provided via CSV
- Content is uploaded manually or through authorized scheduling tools
