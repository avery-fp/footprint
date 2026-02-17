"""
VARIATION ENGINE — multiplies each micro-clip into N variants.

For each clip, produces combinations of:
  - Zoom levels (1.0x, 1.15x, 1.3x)
  - Crop positions (center, top, bottom)
  - Color grades (warm, cool, desaturate, cinematic, etc.)
  - Speed shifts (1.0x, 1.1x, 0.85x)
  - Aspect ratios (9:16, 1:1, 16:9, 4:5)
  - Caption canvas overlays
  - Optional soundtrack placeholder tags

All transforms are FFmpeg filter chains — single-pass, no re-encoding waste.
"""

import os
import subprocess
from dataclasses import dataclass
from itertools import product
from typing import Optional

from .config import ASPECT_RATIOS, COLOR_GRADES


@dataclass
class VariantSpec:
    """Specification for a single variant transform."""
    zoom: float = 1.0
    crop_position: str = "center"    # center, top, bottom
    color_grade: str = "none"
    speed: float = 1.0
    aspect_ratio: str = "9:16"
    caption_text: Optional[str] = None
    lut_path: Optional[str] = None
    tag: str = ""

    @property
    def suffix(self) -> str:
        parts = []
        if self.zoom != 1.0:
            parts.append(f"z{self.zoom:.0%}".replace("%", ""))
        if self.color_grade != "none":
            parts.append(self.color_grade)
        if self.speed != 1.0:
            parts.append(f"s{self.speed:.0%}".replace("%", ""))
        parts.append(self.aspect_ratio.replace(":", "x"))
        if self.crop_position != "center":
            parts.append(self.crop_position)
        return "_".join(parts) if parts else "base"


@dataclass
class VariantResult:
    """Output from a variant transform."""
    source_clip: str
    variant_spec: VariantSpec
    output_path: str
    success: bool
    error: Optional[str] = None


def build_variant_matrix(
    zooms: list[float] = None,
    speed_shifts: list[float] = None,
    color_grades: list[str] = None,
    aspect_ratios: list[str] = None,
    max_variants: int = 0,
) -> list[VariantSpec]:
    """
    Build a list of VariantSpecs from a parameter matrix.
    If max_variants > 0, prune to that count (prioritizing diversity).
    """
    zooms = zooms or [1.0]
    speed_shifts = speed_shifts or [1.0]
    color_grades = color_grades or ["none"]
    aspect_ratios = aspect_ratios or ["9:16"]

    specs = []
    for z, s, c, a in product(zooms, speed_shifts, color_grades, aspect_ratios):
        specs.append(VariantSpec(zoom=z, speed=s, color_grade=c, aspect_ratio=a))

    if max_variants > 0 and len(specs) > max_variants:
        # Ensure diversity: stride through the list
        step = len(specs) / max_variants
        indices = [int(i * step) for i in range(max_variants)]
        specs = [specs[i] for i in indices]

    return specs


# ─── FFmpeg filter chain builder ─────────────────────────

def build_filter_chain(spec: VariantSpec, src_w: int = 1920, src_h: int = 1080) -> str:
    """Build a complete FFmpeg filter chain from a VariantSpec."""
    filters = []

    # 1. Speed shift (video + audio)
    # Speed is applied via setpts for video (handled separately for audio)
    if spec.speed != 1.0:
        filters.append(f"setpts={1.0/spec.speed}*PTS")

    # 2. Zoom (scale up, then crop to original)
    if spec.zoom > 1.0:
        scaled_w = int(src_w * spec.zoom)
        scaled_h = int(src_h * spec.zoom)
        # Make dimensions even
        scaled_w = scaled_w + (scaled_w % 2)
        scaled_h = scaled_h + (scaled_h % 2)
        filters.append(f"scale={scaled_w}:{scaled_h}")
        # Crop back to source size from center/top/bottom
        if spec.crop_position == "top":
            filters.append(f"crop={src_w}:{src_h}:0:0")
        elif spec.crop_position == "bottom":
            filters.append(f"crop={src_w}:{src_h}:0:{scaled_h - src_h}")
        else:
            filters.append(f"crop={src_w}:{src_h}")

    # 3. Color grading
    color_filter = COLOR_GRADES.get(spec.color_grade, "")
    if spec.lut_path and os.path.exists(spec.lut_path):
        filters.append(f"lut3d='{spec.lut_path}'")
    elif color_filter:
        filters.append(color_filter)

    # 4. Aspect ratio transform
    target_w, target_h = ASPECT_RATIOS.get(spec.aspect_ratio, (1080, 1920))

    # Calculate scale to fill target aspect, then crop
    src_aspect = src_w / src_h
    target_aspect = target_w / target_h

    if src_aspect > target_aspect:
        # Source is wider — scale by height, crop width
        scale_h = target_h
        scale_w = int(src_w * (target_h / src_h))
        scale_w = scale_w + (scale_w % 2)
        filters.append(f"scale={scale_w}:{scale_h}")
        filters.append(f"crop={target_w}:{target_h}")
    elif src_aspect < target_aspect:
        # Source is taller — scale by width, crop height
        scale_w = target_w
        scale_h = int(src_h * (target_w / src_w))
        scale_h = scale_h + (scale_h % 2)
        filters.append(f"scale={scale_w}:{scale_h}")
        if spec.crop_position == "top":
            filters.append(f"crop={target_w}:{target_h}:0:0")
        elif spec.crop_position == "bottom":
            filters.append(f"crop={target_w}:{target_h}:0:{scale_h - target_h}")
        else:
            filters.append(f"crop={target_w}:{target_h}")
    else:
        filters.append(f"scale={target_w}:{target_h}")

    # 5. Caption canvas overlay
    if spec.caption_text:
        safe_text = spec.caption_text.replace("'", "\\'").replace(":", "\\:")
        filters.append(
            f"drawtext=text='{safe_text}'"
            f":fontsize=36:fontcolor=white"
            f":x=(w-text_w)/2:y=h-80"
            f":borderw=2:bordercolor=black@0.6"
        )

    return ",".join(filters) if filters else "null"


def build_audio_filter(spec: VariantSpec) -> str:
    """Build audio filter chain (mainly for speed shifts)."""
    if spec.speed != 1.0:
        # atempo only accepts 0.5-2.0, chain for extreme values
        tempo = spec.speed
        parts = []
        while tempo > 2.0:
            parts.append("atempo=2.0")
            tempo /= 2.0
        while tempo < 0.5:
            parts.append("atempo=0.5")
            tempo *= 2.0
        parts.append(f"atempo={tempo:.4f}")
        return ",".join(parts)
    return ""


# ─── Generate a single variant ───────────────────────────

def generate_variant(
    clip_path: str,
    output_path: str,
    spec: VariantSpec,
    src_w: int = 1920,
    src_h: int = 1080,
    ffmpeg: str = "ffmpeg",
) -> VariantResult:
    """Apply a VariantSpec to a clip, write output."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    vf = build_filter_chain(spec, src_w, src_h)
    af = build_audio_filter(spec)

    cmd = [
        ffmpeg, "-y",
        "-i", clip_path,
        "-vf", vf,
    ]

    if af:
        cmd.extend(["-af", af])

    cmd.extend([
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        output_path,
    ])

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        return VariantResult(
            source_clip=clip_path,
            variant_spec=spec,
            output_path=output_path,
            success=False,
            error=result.stderr[-300:] if result.stderr else "Unknown error",
        )

    return VariantResult(
        source_clip=clip_path,
        variant_spec=spec,
        output_path=output_path,
        success=True,
    )


# ─── Batch: generate all variants for a clip ────────────

def generate_all_variants(
    clip_path: str,
    output_dir: str,
    specs: list[VariantSpec],
    src_w: int = 1920,
    src_h: int = 1080,
    ffmpeg: str = "ffmpeg",
) -> list[VariantResult]:
    """Generate all variant specs for a single source clip."""
    clip_name = os.path.splitext(os.path.basename(clip_path))[0]
    results = []

    for i, spec in enumerate(specs):
        filename = f"{clip_name}_{spec.suffix}_{i:03d}.mp4"
        output_path = os.path.join(output_dir, filename)

        result = generate_variant(clip_path, output_path, spec, src_w, src_h, ffmpeg)
        results.append(result)

    return results
