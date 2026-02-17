"""
SLICER — takes a long screen recording, outputs 100-500 micro-clips.

Three slicing strategies:
  scene   — FFmpeg scene detection (content-aware cuts)
  interval — fixed-length chunks (fast, deterministic)
  silence  — cuts at audio silence points (natural pauses)

All cuts are clean: no partial frames, proper keyframe alignment.
"""

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class ClipInfo:
    """Metadata for a single sliced clip."""
    index: int
    source: str
    start_time: float
    end_time: float
    duration: float
    output_path: str


def probe_duration(input_path: str, ffprobe: str = "ffprobe") -> float:
    """Get video duration in seconds."""
    cmd = [
        ffprobe, "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        input_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr[:300]}")

    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def probe_video_info(input_path: str, ffprobe: str = "ffprobe") -> dict:
    """Get video stream info (resolution, fps, codec)."""
    cmd = [
        ffprobe, "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-select_streams", "v:0",
        input_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr[:300]}")

    data = json.loads(result.stdout)
    stream = data["streams"][0]
    return {
        "width": int(stream.get("width", 1920)),
        "height": int(stream.get("height", 1080)),
        "fps": eval(stream.get("r_frame_rate", "30/1")),
        "codec": stream.get("codec_name", "h264"),
        "duration": float(stream.get("duration", 0)),
    }


# ─── Scene detection ────────────────────────────────────

def detect_scenes(
    input_path: str,
    threshold: float = 0.3,
    min_duration: float = 3.0,
    ffmpeg: str = "ffmpeg",
) -> list[float]:
    """
    Detect scene change timestamps using FFmpeg's scene filter.
    Returns a list of timestamps where cuts should happen.
    """
    cmd = [
        ffmpeg, "-i", input_path,
        "-vf", f"select='gt(scene,{threshold})',showinfo",
        "-f", "null", "-",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)

    timestamps = [0.0]
    for line in result.stderr.split("\n"):
        if "pts_time:" in line:
            try:
                pts = float(line.split("pts_time:")[1].split()[0])
                # Enforce minimum duration between cuts
                if pts - timestamps[-1] >= min_duration:
                    timestamps.append(pts)
            except (ValueError, IndexError):
                continue

    return timestamps


# ─── Silence detection ───────────────────────────────────

def detect_silence(
    input_path: str,
    noise_db: int = -35,
    min_silence: float = 0.5,
    ffmpeg: str = "ffmpeg",
) -> list[float]:
    """
    Detect silence points in audio for natural cut points.
    Returns timestamps of silence midpoints.
    """
    cmd = [
        ffmpeg, "-i", input_path,
        "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}",
        "-f", "null", "-",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)

    timestamps = [0.0]
    for line in result.stderr.split("\n"):
        if "silence_end" in line:
            try:
                end = float(line.split("silence_end: ")[1].split()[0])
                dur = float(line.split("silence_duration: ")[1].split()[0])
                midpoint = end - (dur / 2)
                timestamps.append(midpoint)
            except (ValueError, IndexError):
                continue

    return timestamps


# ─── Cut a single clip ───────────────────────────────────

def cut_clip(
    input_path: str,
    output_path: str,
    start: float,
    end: float,
    ffmpeg: str = "ffmpeg",
) -> bool:
    """Extract a single clip with clean keyframe-aligned cut."""
    duration = end - start
    if duration <= 0:
        return False

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    cmd = [
        ffmpeg, "-y",
        "-ss", f"{start:.3f}",
        "-i", input_path,
        "-t", f"{duration:.3f}",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-avoid_negative_ts", "make_zero",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0


# ─── Main: slice ─────────────────────────────────────────

def slice_video(
    input_path: str,
    output_dir: str,
    method: str = "scene",
    min_clip: float = 3.0,
    max_clip: float = 30.0,
    target_clips: int = 100,
    interval: float = 10.0,
    ffmpeg: str = "ffmpeg",
    ffprobe: str = "ffprobe",
) -> list[ClipInfo]:
    """
    Slice a video into micro-clips.

    Args:
        input_path: path to source video
        output_dir: where to write clips
        method: 'scene', 'interval', or 'silence'
        min_clip: minimum clip duration in seconds
        max_clip: maximum clip duration in seconds
        target_clips: approximate number of clips to produce
        interval: seconds between cuts (interval mode only)
        ffmpeg: path to ffmpeg binary
        ffprobe: path to ffprobe binary

    Returns:
        list of ClipInfo objects
    """
    input_path = os.path.abspath(input_path)
    output_dir = os.path.abspath(output_dir)
    os.makedirs(output_dir, exist_ok=True)

    total_duration = probe_duration(input_path, ffprobe)
    print(f"  [slicer] source: {input_path}")
    print(f"  [slicer] duration: {total_duration:.1f}s")
    print(f"  [slicer] method: {method}")

    # Get cut points
    if method == "scene":
        # Adjust threshold based on target clip count
        estimated_interval = total_duration / target_clips
        threshold = max(0.1, min(0.5, 1.0 - (target_clips / (total_duration / 2))))
        timestamps = detect_scenes(input_path, threshold, min_clip, ffmpeg)
    elif method == "silence":
        timestamps = detect_silence(input_path, ffmpeg=ffmpeg)
    else:  # interval
        timestamps = []
        t = 0.0
        while t < total_duration:
            timestamps.append(t)
            t += interval

    # Add end timestamp
    timestamps.append(total_duration)
    timestamps = sorted(set(timestamps))

    # Build clip segments
    segments: list[tuple[float, float]] = []
    for i in range(len(timestamps) - 1):
        start = timestamps[i]
        end = timestamps[i + 1]
        duration = end - start

        if duration < min_clip:
            continue

        # Split clips that exceed max duration
        if duration > max_clip:
            sub_start = start
            while sub_start < end:
                sub_end = min(sub_start + max_clip, end)
                if sub_end - sub_start >= min_clip:
                    segments.append((sub_start, sub_end))
                sub_start = sub_end
        else:
            segments.append((start, end))

    print(f"  [slicer] {len(segments)} clips identified")

    # Cut clips
    clips: list[ClipInfo] = []
    for i, (start, end) in enumerate(segments):
        filename = f"clip_{i:04d}.mp4"
        output_path = os.path.join(output_dir, filename)

        success = cut_clip(input_path, output_path, start, end, ffmpeg)
        if success:
            clip = ClipInfo(
                index=i,
                source=input_path,
                start_time=start,
                end_time=end,
                duration=end - start,
                output_path=output_path,
            )
            clips.append(clip)
            if (i + 1) % 25 == 0 or i == 0:
                print(f"  [slicer] cut {i + 1}/{len(segments)}: {filename} ({clip.duration:.1f}s)")
        else:
            print(f"  [slicer] FAILED: clip {i} ({start:.1f}s-{end:.1f}s)")

    print(f"  [slicer] done: {len(clips)} clips written to {output_dir}")
    return clips
