#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  FOOTPRINT BLAST — Mac Runbook
#  Copy-paste this entire script into Terminal.
#  It will: verify deps → install → find your MP4 → run → open output
# ═══════════════════════════════════════════════════════════
set -e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║          FOOTPRINT BLAST — Mac Setup             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Verify dependencies ─────────────────────────
echo "→ Step 1: Checking dependencies..."

# Python 3.11
PY=""
if [ -x "/opt/homebrew/opt/python@3.11/bin/python3.11" ]; then
  PY="/opt/homebrew/opt/python@3.11/bin/python3.11"
elif command -v python3.11 &>/dev/null; then
  PY="python3.11"
elif command -v python3 &>/dev/null; then
  PY="python3"
else
  echo "ERROR: Python 3 not found. Install with: brew install python@3.11"
  exit 1
fi
echo "  Python: $($PY --version) at $PY"

# FFmpeg
if ! command -v ffmpeg &>/dev/null; then
  echo "  FFmpeg not found. Installing..."
  brew install ffmpeg
fi
echo "  FFmpeg: $(ffmpeg -version 2>&1 | head -n 1)"

# ─── Step 2: Clone or pull repo ──────────────────────────
echo ""
echo "→ Step 2: Setting up repo..."

if [ ! -d "$HOME/footprint/.git" ]; then
  echo "  Cloning footprint repo..."
  cd "$HOME"
  git clone git@github.com:avery-fp/footprint.git
fi

cd "$HOME/footprint"
git pull origin main 2>/dev/null || true
echo "  Repo: $HOME/footprint"

# ─── Step 3: Install fp-factory ──────────────────────────
echo ""
echo "→ Step 3: Installing fp-factory..."

cd "$HOME/footprint/fp-factory"
$PY -m pip install -U pip --quiet
$PY -m pip install -e . --quiet

# Verify
if command -v fpfactory &>/dev/null; then
  FPCMD="fpfactory"
else
  FPCMD="$PY -m fpfactory"
fi
echo "  fp-factory installed. Command: $FPCMD"

# ─── Step 4: Find newest video ───────────────────────────
echo ""
echo "→ Step 4: Finding your recording..."

NEWEST=$(ls -t "$HOME/Downloads/"*.mp4 "$HOME/Downloads/"*.mov 2>/dev/null | head -n 1)

if [ -z "$NEWEST" ]; then
  echo "ERROR: No .mp4 or .mov files found in ~/Downloads"
  echo "  Place your Footprint screen recording in ~/Downloads and re-run."
  exit 1
fi

echo "  Found: $NEWEST"
echo "  Size: $(du -h "$NEWEST" | cut -f1)"

# ─── Step 5: Run FAST START blast ────────────────────────
echo ""
echo "→ Step 5: Running FAST START blast..."

BATCH_DIR="$HOME/Desktop/footprint_blast"
mkdir -p "$BATCH_DIR"

$FPCMD blast "$NEWEST" \
  --output "$BATCH_DIR" \
  --preset fast \
  --workers 4 \
  --start-date "$(date -v+1d '+%Y-%m-%d')"

# ─── Step 6: Show results ────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║          BLAST COMPLETE                          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "YOUR FILES:"
echo ""
echo "  UPLOAD THESE ZIPS:"
echo "    → TikTok:  $BATCH_DIR/zips/tiktok.zip"
echo "    → Reels:   $BATCH_DIR/zips/reels.zip"
echo "    → Shorts:  $BATCH_DIR/zips/shorts.zip"
echo "    → Twitter:  $BATCH_DIR/zips/twitter.zip"
echo ""
echo "  IMPORT THESE CSVs:"
echo "    → Later.com:  $BATCH_DIR/csv/*_later.csv"
echo "    → Planoly:    $BATCH_DIR/csv/*_planoly.csv"
echo "    → Metricool:  $BATCH_DIR/csv/*_metricool.csv"
echo ""
echo "  SCHEDULE REFERENCE:"
echo "    → Full grid:  $BATCH_DIR/schedule/full_grid.csv"
echo "    → Day 1:      $BATCH_DIR/schedule/day1_*.csv"
echo "    → Day 2:      $BATCH_DIR/schedule/day2_*.csv"
echo "    → Day 3:      $BATCH_DIR/schedule/day3_*.csv"
echo ""

# Open in Finder
open "$BATCH_DIR"
echo "  Opened in Finder."
echo ""
echo "NEXT: Upload zips → schedule per grid → collect analytics → run mutation"
