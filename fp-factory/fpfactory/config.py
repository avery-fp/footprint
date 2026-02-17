"""
Configuration and presets for the content factory.
"""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ─── Aspect ratios ───────────────────────────────────────

ASPECT_RATIOS = {
    "9:16": (1080, 1920),   # TikTok, Reels, Shorts, Stories
    "1:1": (1080, 1080),    # Instagram feed, Twitter
    "16:9": (1920, 1080),   # YouTube, Twitter
    "4:5": (1080, 1350),    # Instagram portrait
}

# ─── Platform export specs ───────────────────────────────

PLATFORM_SPECS = {
    "tiktok": {
        "aspect": "9:16",
        "max_duration": 180,
        "max_size_mb": 287,
        "format": "mp4",
        "codec": "libx264",
    },
    "reels": {
        "aspect": "9:16",
        "max_duration": 90,
        "max_size_mb": 250,
        "format": "mp4",
        "codec": "libx264",
    },
    "shorts": {
        "aspect": "9:16",
        "max_duration": 60,
        "max_size_mb": 256,
        "format": "mp4",
        "codec": "libx264",
    },
    "twitter": {
        "aspect": "16:9",
        "max_duration": 140,
        "max_size_mb": 512,
        "format": "mp4",
        "codec": "libx264",
    },
    "instagram_feed": {
        "aspect": "1:1",
        "max_duration": 60,
        "max_size_mb": 250,
        "format": "mp4",
        "codec": "libx264",
    },
}

# ─── Default variant matrix ─────────────────────────────

DEFAULT_VARIANT_MATRIX = {
    "zooms": [1.0, 1.15, 1.3],
    "speed_shifts": [1.0, 1.1, 0.85],
    "color_grades": ["none", "warm", "cool", "desaturate", "high_contrast"],
    "aspect_ratios": ["9:16", "1:1"],
}

# ─── Color grade presets (FFmpeg filter chains) ──────────

COLOR_GRADES = {
    "none": "",
    "warm": "colorbalance=rs=0.1:gs=0.0:bs=-0.1:rm=0.1:gm=0.0:bm=-0.05",
    "cool": "colorbalance=rs=-0.1:gs=0.0:bs=0.1:rm=-0.05:gm=0.0:bm=0.1",
    "desaturate": "hue=s=0.6",
    "high_contrast": "curves=preset=increase_contrast",
    "vintage": "curves=preset=vintage,hue=s=0.8",
    "cinematic": "colorbalance=rs=0.05:gs=-0.02:bs=-0.05,curves=preset=increase_contrast,hue=s=0.85",
    "noir": "hue=s=0.0,curves=preset=increase_contrast",
    "pastel": "hue=s=0.5,colorbalance=rs=0.1:gs=0.05:bs=0.1",
    "neon": "curves=preset=increase_contrast,hue=s=1.5",
}

# ─── CTA presets ─────────────────────────────────────────

CTA_TEMPLATES = [
    "footprint.onl — $10 digital identity",
    "build yours at footprint.onl",
    "link in bio",
    "footprint.onl",
    "",
]

# ─── Hashtag pools ───────────────────────────────────────

HASHTAG_POOLS = {
    "core": ["#footprint", "#digitalidentity", "#linkinbio"],
    "aesthetic": ["#aesthetic", "#curated", "#minimal", "#darkaesthetic", "#moodboard"],
    "music": ["#musicpage", "#spotify", "#playlist", "#vibes"],
    "fashion": ["#streetwear", "#fashion", "#style", "#drip"],
    "art": ["#contemporaryart", "#digitalart", "#artcollector"],
    "culture": ["#internet", "#gen_z", "#culturepage"],
    "growth": ["#fyp", "#viral", "#trending", "#foryou", "#explore"],
}


@dataclass
class FactoryConfig:
    """Master configuration for a factory run."""

    # Input
    input_path: str = ""
    output_dir: str = "output"

    # Slicing
    slice_method: str = "scene"          # scene, interval, silence
    min_clip_seconds: float = 3.0
    max_clip_seconds: float = 30.0
    target_clips: int = 100
    interval_seconds: float = 10.0       # for interval mode

    # Variants
    variants_per_clip: int = 5
    variant_matrix: dict = field(default_factory=lambda: DEFAULT_VARIANT_MATRIX.copy())

    # Metadata
    metadata_preset: str = "default"
    hashtag_categories: list = field(default_factory=lambda: ["core", "growth"])
    cta_index: int = 0
    slug_prefix: str = "fp"

    # Mutation
    performance_csv: Optional[str] = None
    winner_threshold: float = 0.75       # top 25% = winners
    mutation_count: int = 3              # new variants per winner

    # Concurrency
    workers: int = 4
    chunk_size: int = 10

    # Packaging
    platforms: list = field(default_factory=lambda: ["tiktok", "reels", "shorts"])
    create_zips: bool = True
    generate_thumbnails: bool = True
    thumbnail_count: int = 3

    # FFmpeg
    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"

    @classmethod
    def from_file(cls, path: str) -> "FactoryConfig":
        with open(path) as f:
            data = json.load(f)
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})

    def to_dict(self) -> dict:
        return {k: getattr(self, k) for k in self.__dataclass_fields__}
