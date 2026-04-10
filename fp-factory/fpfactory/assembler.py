"""
SCHEDULE ASSEMBLER — maps factory output to the 72-hour schedule grid.

Reads:
  - content_bank/schedule_72hr.json (time slots per day)
  - content_bank/hooks.json (60 hooks)
  - content_bank/captions.json (40 captions + 40 CTAs)
  - content_bank/hashtag_lattice.json (10 clusters)
  - A batch manifest or variants directory

Produces:
  - schedule/day1_tiktok.csv (Later-compatible)
  - schedule/day1_reels.csv
  - schedule/day1_shorts.csv
  - schedule/day1_twitter.csv
  - schedule/day2_*.csv
  - schedule/day3_*.csv
  - schedule/full_grid.csv (master view)

Each CSV is ready for direct import into Later / Planoly / Metricool.
"""

import csv
import json
import os
import random
from datetime import datetime, timedelta

from .content_bank import (
    get_hook,
    get_caption,
    get_cta,
    get_cluster_tags,
    get_comment_prompt,
    get_all_schedule_slots,
)


def assemble_schedule(
    variants_dir: str,
    output_dir: str,
    start_date: str = "",
    manifest_path: str = "",
) -> dict:
    """
    Main assembler. Maps real variant files to the 72-hour schedule.

    Args:
        variants_dir: Path to factory variants/ folder
        output_dir: Where to write schedule CSVs
        start_date: ISO date (YYYY-MM-DD) for Day 1 (default: tomorrow)
        manifest_path: Optional path to batch manifest JSON

    Returns:
        Summary dict with counts.
    """
    os.makedirs(output_dir, exist_ok=True)

    # Resolve start date
    if not start_date:
        start_dt = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    else:
        start_dt = datetime.fromisoformat(start_date)

    # Inventory available variant files
    variant_files = _inventory_variants(variants_dir, manifest_path)
    if not variant_files:
        print("  [assembler] no variant files found")
        return {"error": "no variants"}

    print(f"  [assembler] {len(variant_files)} variants available")

    # Build per-platform pools
    pools = _build_platform_pools(variant_files)

    # Assemble 3 days
    all_rows = []
    total_slots = 0
    total_assigned = 0

    for day in range(1, 4):
        day_dt = start_dt + timedelta(days=day - 1)
        slots = get_all_schedule_slots(day)

        if not slots:
            print(f"  [assembler] no schedule slots for day {day}")
            continue

        day_rows = []

        for slot in slots:
            platform = slot.get("platform", "tiktok")
            time_est = slot.get("time_est", "12:00")
            hook_idx = slot.get("hook", 1) - 1  # 1-indexed → 0-indexed
            caption_idx = slot.get("caption", 1) - 1
            cluster = slot.get("cluster", 1)
            grade = slot.get("grade", "none")

            total_slots += 1

            # Pick a variant file from pool
            pool = pools.get(platform, pools.get("tiktok", []))
            if not pool:
                continue

            # Prefer matching grade, fall back to any
            matched = [v for v in pool if grade in v.get("filename", "")]
            variant = matched[0] if matched else pool[0]

            # Remove from pool to avoid reuse
            if variant in pool:
                pool.remove(variant)

            # Build the post
            hook = get_hook(hook_idx)
            caption = get_caption(caption_idx, hook)
            cta = get_cta((caption_idx * 13) % 40)
            hashtags = get_cluster_tags(cluster - 1, platform)
            comment = get_comment_prompt(hook_idx % 12)

            full_caption = f"{caption}\n\n{hashtags}\n\n{cta}"

            # Parse time
            hour, minute = map(int, time_est.split(":"))
            scheduled_at = day_dt.replace(hour=hour, minute=minute)

            row = {
                "day": day,
                "time_est": time_est,
                "scheduled_at": scheduled_at.isoformat(),
                "platform": platform,
                "filename": variant.get("filename", ""),
                "filepath": variant.get("path", ""),
                "hook": hook,
                "caption": caption,
                "cta": cta,
                "hashtags": hashtags,
                "full_caption": full_caption,
                "comment_prompt": comment,
                "cluster": cluster,
                "grade": grade,
                "hook_index": hook_idx + 1,
                "caption_index": caption_idx + 1,
            }

            day_rows.append(row)
            all_rows.append(row)
            total_assigned += 1

        # Write per-platform CSVs for this day
        platforms_in_day = set(r["platform"] for r in day_rows)
        for plat in platforms_in_day:
            plat_rows = [r for r in day_rows if r["platform"] == plat]
            _write_platform_csv(plat_rows, plat, day, output_dir)
            _write_later_csv(plat_rows, plat, day, output_dir)

    # Write master grid
    _write_master_grid(all_rows, output_dir)

    summary = {
        "total_slots": total_slots,
        "total_assigned": total_assigned,
        "total_variants_available": len(variant_files),
        "days": 3,
        "output_dir": os.path.abspath(output_dir),
    }

    print(f"  [assembler] {total_assigned}/{total_slots} slots filled")
    print(f"  [assembler] output: {output_dir}")

    return summary


# ─── Inventory variant files ────────────────────────────────

def _inventory_variants(variants_dir: str, manifest_path: str = "") -> list[dict]:
    """Build a list of available variant files with metadata."""
    variants = []

    # From manifest if available
    if manifest_path and os.path.exists(manifest_path):
        with open(manifest_path) as f:
            manifest = json.load(f)
        for item in manifest.get("content", []):
            path = item.get("video_path", "")
            if path and os.path.exists(path):
                variants.append({
                    "path": path,
                    "filename": os.path.basename(path),
                    "platform": item.get("platform", "tiktok"),
                    "aspect_ratio": item.get("aspect_ratio", "9:16"),
                    "variant_tag": item.get("variant_tag", ""),
                })
        return variants

    # From directory scan
    if os.path.isdir(variants_dir):
        for f in sorted(os.listdir(variants_dir)):
            if f.endswith(".mp4"):
                path = os.path.join(variants_dir, f)
                # Infer aspect ratio from filename
                ar = "9:16"
                if "1x1" in f:
                    ar = "1:1"
                elif "16x9" in f:
                    ar = "16:9"
                elif "4x5" in f:
                    ar = "4:5"

                variants.append({
                    "path": path,
                    "filename": f,
                    "platform": _infer_platform(ar),
                    "aspect_ratio": ar,
                    "variant_tag": f.replace(".mp4", ""),
                })

    return variants


def _infer_platform(aspect_ratio: str) -> str:
    """Map aspect ratio to primary platform."""
    mapping = {"9:16": "tiktok", "1:1": "instagram_feed", "16:9": "twitter", "4:5": "reels"}
    return mapping.get(aspect_ratio, "tiktok")


# ─── Build platform pools ──────────────────────────────────

def _build_platform_pools(variant_files: list[dict]) -> dict[str, list[dict]]:
    """Group variants into per-platform pools. 9:16 variants go into all short-form platforms."""
    pools: dict[str, list[dict]] = {}

    for v in variant_files:
        ar = v.get("aspect_ratio", "9:16")

        if ar == "9:16":
            # 9:16 content goes to tiktok, reels, shorts
            for plat in ["tiktok", "reels", "shorts"]:
                if plat not in pools:
                    pools[plat] = []
                pools[plat].append(dict(v))
        elif ar == "16:9":
            if "twitter" not in pools:
                pools["twitter"] = []
            pools["twitter"].append(dict(v))
        elif ar == "1:1":
            if "instagram_feed" not in pools:
                pools["instagram_feed"] = []
            pools["instagram_feed"].append(dict(v))
        elif ar == "4:5":
            if "reels" not in pools:
                pools["reels"] = []
            pools["reels"].append(dict(v))

    # Also add 9:16 as twitter fallback if no 16:9
    if "twitter" not in pools:
        pools["twitter"] = list(pools.get("tiktok", []))

    # Shuffle each pool
    for pool in pools.values():
        random.shuffle(pool)

    return pools


# ─── CSV writers ────────────────────────────────────────────

def _write_platform_csv(rows: list[dict], platform: str, day: int, output_dir: str) -> str:
    """Write a per-platform, per-day CSV."""
    path = os.path.join(output_dir, f"day{day}_{platform}.csv")
    headers = ["time_est", "scheduled_at", "filename", "hook", "caption", "cta",
               "hashtags", "full_caption", "comment_prompt", "cluster", "grade"]

    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"    → {path} ({len(rows)} posts)")
    return path


def _write_later_csv(rows: list[dict], platform: str, day: int, output_dir: str) -> str:
    """Write a Later.com-compatible import CSV."""
    path = os.path.join(output_dir, f"day{day}_{platform}_later.csv")
    headers = ["Media URL", "Caption", "Scheduled Date", "Platform"]

    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for row in rows:
            writer.writerow([
                row["filepath"],
                row["full_caption"],
                row["scheduled_at"],
                platform,
            ])

    return path


def _write_master_grid(rows: list[dict], output_dir: str) -> str:
    """Write the full 72-hour master grid."""
    path = os.path.join(output_dir, "full_grid.csv")
    headers = ["day", "time_est", "scheduled_at", "platform", "filename",
               "hook", "caption", "cta", "hashtags", "comment_prompt",
               "cluster", "grade", "hook_index", "caption_index"]

    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"  [assembler] master grid: {path} ({len(rows)} rows)")
    return path
