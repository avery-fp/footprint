"""
PIPELINE — full orchestrator.

ingest → slice → variants → metadata → package → export

Each stage is modular and can run independently.
The pipeline connects them into a single end-to-end flow.
"""

import json
import os
import time
from datetime import datetime
from typing import Optional

from .config import FactoryConfig, PLATFORM_SPECS
from .slicer import slice_video, probe_video_info, ClipInfo
from .variants import (
    build_variant_matrix,
    generate_variant,
    VariantSpec,
    VariantResult,
)
from .metadata import (
    build_metadata,
    write_sidecar,
    export_csv,
    export_manifest,
    ClipMetadata,
)
from .mutation import run_mutation_cycle
from .workers import run_pool
from .packager import package


def _make_batch_id() -> str:
    return datetime.now().strftime("fp_%Y%m%d_%H%M%S")


# ─── Stage 1: Ingest + Slice ────────────────────────────

def stage_slice(cfg: FactoryConfig) -> list[ClipInfo]:
    """Slice source video into micro-clips."""
    print(f"\n{'='*50}")
    print("  STAGE 1: SLICE")
    print(f"{'='*50}")

    clips_dir = os.path.join(cfg.output_dir, "clips")

    clips = slice_video(
        input_path=cfg.input_path,
        output_dir=clips_dir,
        method=cfg.slice_method,
        min_clip=cfg.min_clip_seconds,
        max_clip=cfg.max_clip_seconds,
        target_clips=cfg.target_clips,
        interval=cfg.interval_seconds,
        ffmpeg=cfg.ffmpeg_path,
        ffprobe=cfg.ffprobe_path,
    )

    return clips


# ─── Stage 2: Variant Generation ────────────────────────

def _process_variant_job(job: dict) -> Optional[VariantResult]:
    """Worker function for parallel variant generation."""
    from .variants import generate_variant, VariantSpec

    spec = VariantSpec(**job["spec"])
    result = generate_variant(
        clip_path=job["clip_path"],
        output_path=job["output_path"],
        spec=spec,
        src_w=job["src_w"],
        src_h=job["src_h"],
        ffmpeg=job["ffmpeg"],
    )
    return result


def stage_variants(
    cfg: FactoryConfig,
    clips: list[ClipInfo],
    batch_id: str,
) -> list[VariantResult]:
    """Generate all variants for all clips."""
    print(f"\n{'='*50}")
    print("  STAGE 2: VARIANTS")
    print(f"{'='*50}")

    # Build variant matrix
    specs = build_variant_matrix(
        zooms=cfg.variant_matrix.get("zooms", [1.0]),
        speed_shifts=cfg.variant_matrix.get("speed_shifts", [1.0]),
        color_grades=cfg.variant_matrix.get("color_grades", ["none"]),
        aspect_ratios=cfg.variant_matrix.get("aspect_ratios", ["9:16"]),
        max_variants=cfg.variants_per_clip,
    )

    print(f"  {len(specs)} variant specs × {len(clips)} clips = {len(specs)*len(clips)} total")

    # Get source video info for scaling
    src_w, src_h = 1920, 1080
    if clips:
        try:
            info = probe_video_info(clips[0].source, cfg.ffprobe_path)
            src_w = info["width"]
            src_h = info["height"]
        except Exception:
            pass

    variants_dir = os.path.join(cfg.output_dir, "variants")
    os.makedirs(variants_dir, exist_ok=True)

    # Build job list
    jobs = []
    for clip in clips:
        clip_name = os.path.splitext(os.path.basename(clip.output_path))[0]
        for i, spec in enumerate(specs):
            filename = f"{clip_name}_{spec.suffix}_{i:03d}.mp4"
            output_path = os.path.join(variants_dir, filename)
            jobs.append({
                "clip_path": clip.output_path,
                "output_path": output_path,
                "spec": {
                    "zoom": spec.zoom,
                    "crop_position": spec.crop_position,
                    "color_grade": spec.color_grade,
                    "speed": spec.speed,
                    "aspect_ratio": spec.aspect_ratio,
                    "caption_text": spec.caption_text,
                    "lut_path": spec.lut_path,
                    "tag": spec.tag,
                },
                "src_w": src_w,
                "src_h": src_h,
                "ffmpeg": cfg.ffmpeg_path,
            })

    # Run in parallel
    if cfg.workers > 1:
        stats = run_pool(
            fn=_process_variant_job,
            items=jobs,
            workers=cfg.workers,
            chunk_size=cfg.chunk_size,
            label="variants",
        )
        print(
            "  [variants] pool summary: "
            f"{stats.completed}/{stats.total_items} in {stats.elapsed_seconds:.1f}s "
            f"({stats.items_per_second:.1f}/s)"
        )
        # Collect results from files on disk
        results = []
        for job in jobs:
            path = job["output_path"]
            spec = VariantSpec(**job["spec"])
            results.append(VariantResult(
                source_clip=job["clip_path"],
                variant_spec=spec,
                output_path=path,
                success=os.path.exists(path),
            ))
    else:
        results = []
        for i, job in enumerate(jobs):
            result = _process_variant_job(job)
            if result:
                results.append(result)
            if (i + 1) % 25 == 0 or (i + 1) == len(jobs):
                print(f"  [variants] {i+1}/{len(jobs)}")

    successful = [r for r in results if r.success]
    print(f"  [variants] {len(successful)}/{len(results)} variants generated")

    return results


# ─── Stage 3: Metadata ──────────────────────────────────

def stage_metadata(
    cfg: FactoryConfig,
    variant_results: list[VariantResult],
    batch_id: str,
) -> list[ClipMetadata]:
    """Generate metadata for all successful variants."""
    print(f"\n{'='*50}")
    print("  STAGE 3: METADATA")
    print(f"{'='*50}")

    successful = [r for r in variant_results if r.success]
    metadata_dir = os.path.join(cfg.output_dir, "metadata")
    os.makedirs(metadata_dir, exist_ok=True)

    all_metadata: list[ClipMetadata] = []

    # Assign each variant to platforms based on aspect ratio
    aspect_to_platforms = {}
    for platform, spec in PLATFORM_SPECS.items():
        if platform not in cfg.platforms:
            continue
        ar = spec["aspect"]
        if ar not in aspect_to_platforms:
            aspect_to_platforms[ar] = []
        aspect_to_platforms[ar].append(platform)

    for i, result in enumerate(successful):
        ar = result.variant_spec.aspect_ratio
        target_platforms = aspect_to_platforms.get(ar, cfg.platforms[:1])

        for platform in target_platforms:
            meta = build_metadata(
                clip_index=i,
                variant_index=0,
                variant_tag=result.variant_spec.suffix,
                source_clip=result.source_clip,
                platform=platform,
                aspect_ratio=ar,
                duration=0,  # Could probe but skip for speed
                video_path=result.output_path,
                batch_id=batch_id,
                hashtag_categories=cfg.hashtag_categories,
                cta_index=cfg.cta_index,
            )

            # Write sidecar JSON
            write_sidecar(meta, metadata_dir)
            all_metadata.append(meta)

    # Export CSVs in multiple formats
    csv_dir = os.path.join(cfg.output_dir, "csv")
    os.makedirs(csv_dir, exist_ok=True)

    for fmt in ["generic", "later", "planoly", "metricool"]:
        export_csv(
            all_metadata,
            os.path.join(csv_dir, f"{batch_id}_{fmt}.csv"),
            format=fmt,
        )

    # Master manifest
    export_manifest(
        all_metadata,
        os.path.join(cfg.output_dir, f"{batch_id}_manifest.json"),
        batch_id,
    )

    print(f"  [metadata] {len(all_metadata)} metadata records generated")
    return all_metadata


# ─── Stage 4: Mutation (optional) ───────────────────────

def stage_mutation(
    cfg: FactoryConfig,
    batch_id: str,
) -> list[VariantResult]:
    """Run mutation cycle if performance data provided."""
    if not cfg.performance_csv or not os.path.exists(cfg.performance_csv):
        return []

    print(f"\n{'='*50}")
    print("  STAGE 4: MUTATION")
    print(f"{'='*50}")

    variants_dir = os.path.join(cfg.output_dir, "variants")
    plans = run_mutation_cycle(
        performance_csv=cfg.performance_csv,
        source_dir=variants_dir,
        threshold=cfg.winner_threshold,
        mutations_per_winner=cfg.mutation_count,
    )

    if not plans:
        return []

    # Execute mutation plans via variant engine
    mutation_dir = os.path.join(cfg.output_dir, "mutations")
    os.makedirs(mutation_dir, exist_ok=True)

    results = []
    for plan in plans:
        for i, spec in enumerate(plan.mutations):
            filename = f"mut_{os.path.basename(plan.source_path).replace('.mp4','')}_{i:03d}.mp4"
            output_path = os.path.join(mutation_dir, filename)

            result = generate_variant(
                clip_path=plan.source_path,
                output_path=output_path,
                spec=spec,
                ffmpeg=cfg.ffmpeg_path,
            )
            results.append(result)

    successful = [r for r in results if r.success]
    print(f"  [mutation] {len(successful)}/{len(results)} mutations generated")
    return results


# ─── Stage 5: Package ───────────────────────────────────

def stage_package(
    cfg: FactoryConfig,
    metadata_list: list[ClipMetadata],
    batch_id: str,
):
    """Package everything for distribution."""
    print(f"\n{'='*50}")
    print("  STAGE 5: PACKAGE")
    print(f"{'='*50}")

    results = package(
        metadata_list=metadata_list,
        output_base=cfg.output_dir,
        platforms=cfg.platforms,
        create_zips=cfg.create_zips,
        gen_thumbnails=cfg.generate_thumbnails,
        thumbnail_count=cfg.thumbnail_count,
        ffmpeg=cfg.ffmpeg_path,
    )

    return results


# ─── Full pipeline ──────────────────────────────────────

def run_factory(cfg: FactoryConfig) -> dict:
    """
    Run the complete content factory pipeline.

    Returns a summary dict with stats from each stage.
    """
    start = time.time()
    batch_id = _make_batch_id()

    print(f"""
╔══════════════════════════════════════════════════╗
║          FOOTPRINT CONTENT FACTORY               ║
║                                                  ║
║  Batch: {batch_id:<39} ║
║  Input: {os.path.basename(cfg.input_path):<39} ║
║  Workers: {cfg.workers:<37} ║
╚══════════════════════════════════════════════════╝
""")

    os.makedirs(cfg.output_dir, exist_ok=True)

    # Save config
    config_path = os.path.join(cfg.output_dir, f"{batch_id}_config.json")
    with open(config_path, "w") as f:
        json.dump(cfg.to_dict(), f, indent=2)

    # Stage 1: Slice
    clips = stage_slice(cfg)

    if not clips:
        print("\n  No clips produced. Check input file and slice settings.")
        return {"batch_id": batch_id, "error": "no clips produced"}

    # Stage 2: Variants
    variant_results = stage_variants(cfg, clips, batch_id)

    # Stage 3: Metadata
    metadata_list = stage_metadata(cfg, variant_results, batch_id)

    # Stage 4: Mutation (if performance data provided)
    mutation_results = []
    if cfg.performance_csv:
        mutation_results = stage_mutation(cfg, batch_id)
        if mutation_results:
            # Add mutation metadata
            mutation_metadata = stage_metadata(
                cfg,
                mutation_results,
                batch_id + "_mut",
            )
            metadata_list.extend(mutation_metadata)

    # Stage 5: Package
    package_results = stage_package(cfg, metadata_list, batch_id)

    elapsed = time.time() - start

    summary = {
        "batch_id": batch_id,
        "elapsed_seconds": round(elapsed, 1),
        "clips_sliced": len(clips),
        "variants_generated": len([r for r in variant_results if r.success]),
        "variants_failed": len([r for r in variant_results if not r.success]),
        "mutations_generated": len([r for r in mutation_results if r.success]),
        "metadata_records": len(metadata_list),
        "platforms_packaged": len(package_results),
        "output_dir": os.path.abspath(cfg.output_dir),
    }

    # Write summary
    summary_path = os.path.join(cfg.output_dir, f"{batch_id}_summary.json")
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)

    print(f"""
══════════════════════════════════════════════════
  FACTORY COMPLETE

  Batch:        {batch_id}
  Clips:        {summary['clips_sliced']}
  Variants:     {summary['variants_generated']} ({summary['variants_failed']} failed)
  Mutations:    {summary['mutations_generated']}
  Metadata:     {summary['metadata_records']} records
  Platforms:    {summary['platforms_packaged']}
  Time:         {summary['elapsed_seconds']}s
  Output:       {summary['output_dir']}
══════════════════════════════════════════════════
""")

    return summary
