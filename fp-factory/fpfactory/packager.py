"""
PACKAGER — distribution-ready export.

Organizes everything into:
  - Platform-specific folders (tiktok/, reels/, shorts/, twitter/)
  - Aspect-ratio subfolders
  - Zipped bundles per platform
  - Metadata sidecar files
  - Thumbnail strips

All output is local. No uploads. Ready for manual upload or scheduling tool import.
"""

import json
import os
import shutil
import subprocess
import zipfile
from dataclasses import dataclass
from typing import Optional

from .metadata import ClipMetadata


@dataclass
class PackageResult:
    """Output from the packaging step."""
    platform: str
    folder: str
    file_count: int
    zip_path: Optional[str]
    thumbnail_count: int
    total_size_mb: float


# ─── Thumbnail generation ───────────────────────────────

def generate_thumbnail(
    video_path: str,
    output_path: str,
    timestamp: float = 1.0,
    width: int = 480,
    height: int = 480,
    ffmpeg: str = "ffmpeg",
) -> bool:
    """Extract a single thumbnail frame from a video."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    cmd = [
        ffmpeg, "-y",
        "-ss", str(timestamp),
        "-i", video_path,
        "-vframes", "1",
        "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:-1:-1:color=black",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0


def generate_thumbnails(
    video_path: str,
    output_dir: str,
    count: int = 3,
    ffmpeg: str = "ffmpeg",
) -> list[str]:
    """Generate multiple thumbnails at different timestamps."""
    # Get duration
    probe_cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        video_path,
    ]
    result = subprocess.run(probe_cmd, capture_output=True, text=True)
    duration = 10.0
    if result.returncode == 0:
        data = json.loads(result.stdout)
        duration = float(data.get("format", {}).get("duration", 10.0))

    thumbs = []
    basename = os.path.splitext(os.path.basename(video_path))[0]

    for i in range(count):
        ts = max(0.5, duration * (i + 1) / (count + 1))
        thumb_path = os.path.join(output_dir, f"{basename}_thumb_{i}.jpg")
        if generate_thumbnail(video_path, thumb_path, ts, ffmpeg=ffmpeg):
            thumbs.append(thumb_path)

    return thumbs


# ─── Platform folder builder ────────────────────────────

def organize_by_platform(
    metadata_list: list[ClipMetadata],
    output_base: str,
) -> dict[str, list[ClipMetadata]]:
    """
    Copy files into platform-specific folder structure:
    output_base/
      tiktok/
        9x16/
          video.mp4
          video.json
      reels/
        9x16/
          ...
    """
    platform_groups: dict[str, list[ClipMetadata]] = {}

    for meta in metadata_list:
        if not meta.video_path or not os.path.exists(meta.video_path):
            continue

        platform_dir = os.path.join(output_base, meta.platform)
        ratio_dir = os.path.join(platform_dir, meta.aspect_ratio.replace(":", "x"))
        os.makedirs(ratio_dir, exist_ok=True)

        # Copy video
        dest_video = os.path.join(ratio_dir, meta.filename)
        if meta.video_path != dest_video:
            shutil.copy2(meta.video_path, dest_video)

        # Copy sidecar
        if meta.sidecar_path and os.path.exists(meta.sidecar_path):
            sidecar_name = os.path.splitext(meta.filename)[0] + ".json"
            shutil.copy2(meta.sidecar_path, os.path.join(ratio_dir, sidecar_name))

        # Copy thumbnail
        if meta.thumbnail_path and os.path.exists(meta.thumbnail_path):
            thumb_name = os.path.splitext(meta.filename)[0] + "_thumb.jpg"
            shutil.copy2(meta.thumbnail_path, os.path.join(ratio_dir, thumb_name))

        # Track in groups
        if meta.platform not in platform_groups:
            platform_groups[meta.platform] = []
        platform_groups[meta.platform].append(meta)

    return platform_groups


# ─── Zip bundle creator ─────────────────────────────────

def create_zip_bundle(
    folder: str,
    zip_path: str,
    include_metadata: bool = True,
) -> str:
    """Create a zip bundle from a platform folder."""
    os.makedirs(os.path.dirname(zip_path), exist_ok=True)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(folder):
            for file in files:
                if not include_metadata and file.endswith(".json"):
                    continue
                filepath = os.path.join(root, file)
                arcname = os.path.relpath(filepath, os.path.dirname(folder))
                zf.write(filepath, arcname)

    size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    print(f"  [packager] zip: {zip_path} ({size_mb:.1f} MB)")
    return zip_path


# ─── Calculate folder size ──────────────────────────────

def folder_size_mb(folder: str) -> float:
    """Get total size of a folder in MB."""
    total = 0
    for root, _, files in os.walk(folder):
        for f in files:
            total += os.path.getsize(os.path.join(root, f))
    return total / (1024 * 1024)


# ─── Main: package everything ───────────────────────────

def package(
    metadata_list: list[ClipMetadata],
    output_base: str,
    platforms: list[str] = None,
    create_zips: bool = True,
    gen_thumbnails: bool = True,
    thumbnail_count: int = 3,
    ffmpeg: str = "ffmpeg",
) -> list[PackageResult]:
    """
    Full packaging pipeline:
      1. Generate thumbnails
      2. Organize into platform folders
      3. Create zip bundles
      4. Return results
    """
    if platforms:
        metadata_list = [m for m in metadata_list if m.platform in platforms]

    if not metadata_list:
        print("  [packager] no content to package")
        return []

    print(f"  [packager] packaging {len(metadata_list)} pieces...")

    # 1. Thumbnails
    if gen_thumbnails:
        thumb_dir = os.path.join(output_base, "_thumbnails")
        os.makedirs(thumb_dir, exist_ok=True)
        for meta in metadata_list:
            if meta.video_path and os.path.exists(meta.video_path):
                thumbs = generate_thumbnails(
                    meta.video_path, thumb_dir, thumbnail_count, ffmpeg
                )
                if thumbs:
                    meta.thumbnail_path = thumbs[0]

    # 2. Organize
    dist_dir = os.path.join(output_base, "dist")
    platform_groups = organize_by_platform(metadata_list, dist_dir)

    # 3. Bundle
    results = []
    for platform, group in platform_groups.items():
        platform_dir = os.path.join(dist_dir, platform)
        zip_path = None

        if create_zips:
            zip_path = os.path.join(output_base, "zips", f"{platform}.zip")
            create_zip_bundle(platform_dir, zip_path)

        result = PackageResult(
            platform=platform,
            folder=platform_dir,
            file_count=len(group),
            zip_path=zip_path,
            thumbnail_count=thumbnail_count * len(group) if gen_thumbnails else 0,
            total_size_mb=folder_size_mb(platform_dir),
        )
        results.append(result)

        print(f"  [packager] {platform}: {result.file_count} files ({result.total_size_mb:.1f} MB)")

    return results
