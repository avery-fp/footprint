"""
METADATA ENGINE — auto-generates captions, hashtags, CTAs, filenames, JSON, CSV.

Outputs are formatted for direct import into scheduling tools:
  - Repurpose.io
  - Later
  - Planoly
  - Metricool

No API calls. All generation is template-based and deterministic.
"""

import csv
import json
import os
import random
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from .config import HASHTAG_POOLS, CTA_TEMPLATES

# Try to load the expanded content bank; fall back to built-in templates
try:
    from . import content_bank as _bank
    _HAS_BANK = bool(_bank.all_hooks())
except Exception:
    _bank = None  # type: ignore
    _HAS_BANK = False


@dataclass
class ClipMetadata:
    """Complete metadata for a single content piece."""
    # Identity
    clip_id: str
    filename: str
    source_clip: str
    variant_tag: str

    # Content
    caption: str
    hashtags: str
    cta: str
    full_caption: str    # caption + hashtags + cta combined

    # Scheduling
    platform: str
    aspect_ratio: str
    duration_seconds: float
    scheduled_time: Optional[str] = None

    # Taxonomy
    batch_id: str = ""
    category: str = ""
    tier: str = ""

    # File refs
    video_path: str = ""
    thumbnail_path: str = ""
    sidecar_path: str = ""

    # Extended (content bank fields — populated when bank available)
    hook: str = ""
    hook_category: str = ""
    comment_prompt: str = ""
    cluster_index: int = 0


# ─── Caption generation ─────────────────────────────────

CAPTION_TEMPLATES = [
    "footprint.onl",
    "build yours",
    "the room speaks for itself",
    "$10 to own your corner of the internet",
    "curated identity",
    "not a linktree. a footprint.",
    "your internet, curated",
    "digital identity, done different",
    "one page. everything about you.",
    "taste is the product",
]

def generate_caption(clip_index: int, variant_index: int, slug_prefix: str = "fp") -> str:
    """Generate a short caption for a clip variant."""
    if _HAS_BANK:
        global_index = clip_index * 5 + variant_index
        hook = _bank.get_hook(global_index)
        return _bank.get_caption((global_index * 7) % 40, hook)
    return CAPTION_TEMPLATES[clip_index % len(CAPTION_TEMPLATES)]


# ─── Hashtag generation ──────────────────────────────────

def generate_hashtags(
    categories: list[str],
    max_tags: int = 15,
    shuffle: bool = True,
    variant_index: int = 0,
    platform: str = "tiktok",
) -> str:
    """Build a hashtag string from category pools or content bank clusters."""
    if _HAS_BANK:
        return _bank.get_cluster_tags(variant_index, platform)

    tags = []
    for cat in categories:
        pool = HASHTAG_POOLS.get(cat, [])
        tags.extend(pool)

    # Dedupe
    tags = list(dict.fromkeys(tags))

    if shuffle:
        random.shuffle(tags)

    return " ".join(tags[:max_tags])


# ─── CTA selection ───────────────────────────────────────

def get_cta(index: int = 0) -> str:
    """Get a CTA string by index."""
    if _HAS_BANK:
        return _bank.get_cta(index)
    return CTA_TEMPLATES[index % len(CTA_TEMPLATES)]


# ─── Filename generation ────────────────────────────────

def generate_filename(
    clip_index: int,
    variant_tag: str,
    platform: str,
    batch_id: str,
    ext: str = "mp4",
) -> str:
    """Generate a deterministic, sort-friendly filename."""
    return f"{batch_id}_{clip_index:04d}_{variant_tag}_{platform}.{ext}"


# ─── Build full metadata for one variant ────────────────

def build_metadata(
    clip_index: int,
    variant_index: int,
    variant_tag: str,
    source_clip: str,
    platform: str,
    aspect_ratio: str,
    duration: float,
    video_path: str,
    batch_id: str = "",
    slug_prefix: str = "fp",
    hashtag_categories: list[str] = None,
    cta_index: int = 0,
    thumbnail_path: str = "",
) -> ClipMetadata:
    """Build complete metadata for a single content piece."""
    global_index = clip_index * 5 + variant_index

    caption = generate_caption(clip_index, variant_index, slug_prefix)
    hashtags = generate_hashtags(
        hashtag_categories or ["core", "growth"],
        variant_index=global_index,
        platform=platform,
    )
    cta = get_cta(cta_index if not _HAS_BANK else (global_index * 13) % 40)

    full_parts = [p for p in [caption, hashtags, cta] if p]
    full_caption = "\n\n".join(full_parts)

    clip_id = f"{batch_id}_{clip_index:04d}_{variant_index:03d}"
    filename = os.path.basename(video_path)

    # Extended fields from content bank
    hook = ""
    hook_category = ""
    comment_prompt = ""
    cluster_index = 0
    if _HAS_BANK:
        hook = _bank.get_hook(global_index)
        hook_category = _bank.get_hook_category(global_index)
        comment_prompt = _bank.get_comment_prompt(global_index % 12)
        names = _bank.get_cluster_names()
        cluster_index = global_index % len(names) if names else 0

    return ClipMetadata(
        clip_id=clip_id,
        filename=filename,
        source_clip=source_clip,
        variant_tag=variant_tag,
        caption=caption,
        hashtags=hashtags,
        cta=cta,
        full_caption=full_caption,
        platform=platform,
        aspect_ratio=aspect_ratio,
        duration_seconds=duration,
        batch_id=batch_id,
        video_path=video_path,
        thumbnail_path=thumbnail_path,
        hook=hook,
        hook_category=hook_category,
        comment_prompt=comment_prompt,
        cluster_index=cluster_index,
    )


# ─── JSON sidecar export ────────────────────────────────

def write_sidecar(meta: ClipMetadata, output_dir: str) -> str:
    """Write a JSON sidecar file alongside the video."""
    sidecar_name = os.path.splitext(meta.filename)[0] + ".json"
    sidecar_path = os.path.join(output_dir, sidecar_name)

    with open(sidecar_path, "w") as f:
        json.dump(asdict(meta), f, indent=2)

    meta.sidecar_path = sidecar_path
    return sidecar_path


# ─── CSV export (bulk) ──────────────────────────────────

def export_csv(
    metadata_list: list[ClipMetadata],
    output_path: str,
    format: str = "generic",
) -> str:
    """
    Export metadata as CSV for scheduling tool import.

    Formats:
      generic   — all fields
      later     — Later.com compatible columns
      planoly   — Planoly compatible columns
      metricool — Metricool compatible columns
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    if format == "later":
        headers = ["Media URL", "Caption", "Scheduled Date", "Platform"]
        rows = [
            [m.video_path, m.full_caption, m.scheduled_time or "", m.platform]
            for m in metadata_list
        ]
    elif format == "planoly":
        headers = ["file", "caption", "date", "time", "hashtags"]
        rows = [
            [m.filename, m.caption, "", "", m.hashtags]
            for m in metadata_list
        ]
    elif format == "metricool":
        headers = ["Date", "Content", "Media", "Network"]
        rows = [
            [m.scheduled_time or "", m.full_caption, m.filename, m.platform]
            for m in metadata_list
        ]
    else:
        headers = list(ClipMetadata.__dataclass_fields__.keys())
        rows = [list(asdict(m).values()) for m in metadata_list]

    with open(output_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)

    print(f"  [metadata] CSV exported: {output_path} ({len(rows)} rows, {format} format)")
    return output_path


# ─── Master JSON manifest ───────────────────────────────

def export_manifest(
    metadata_list: list[ClipMetadata],
    output_path: str,
    batch_id: str = "",
) -> str:
    """Write a master JSON manifest of all content in a batch."""
    manifest = {
        "batch_id": batch_id,
        "generated_at": datetime.now().isoformat(),
        "total_pieces": len(metadata_list),
        "platforms": list(set(m.platform for m in metadata_list)),
        "aspect_ratios": list(set(m.aspect_ratio for m in metadata_list)),
        "content": [asdict(m) for m in metadata_list],
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"  [metadata] manifest: {output_path}")
    return output_path
