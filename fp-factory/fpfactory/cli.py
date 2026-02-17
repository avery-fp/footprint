"""
CLI — single entry point for the Footprint Content Factory.

Usage:
  fpfactory run input.mp4 --output ./batch1 --variants 5 --workers 8
  fpfactory slice input.mp4 --method scene --min-clip 3 --max-clip 20
  fpfactory mutate --csv performance.csv --source ./batch1/variants
  fpfactory package --input ./batch1 --platforms tiktok,reels,shorts
"""

import argparse
import os
import sys

from .config import FactoryConfig, DEFAULT_VARIANT_MATRIX
from .pipeline import run_factory, stage_slice, stage_mutation
from .mutation import run_mutation_cycle


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="fpfactory",
        description="Footprint Content Factory — local content automation pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  # Full pipeline: slice → variants → metadata → package
  fpfactory run recording.mp4 --output ./batch1

  # High-throughput: 8 workers, 10 variants per clip
  fpfactory run recording.mp4 --workers 8 --variants 10

  # Tier 1 only: 9:16 for TikTok + Reels
  fpfactory run recording.mp4 --ratios 9:16 --platforms tiktok,reels

  # Slice only (no variants)
  fpfactory slice recording.mp4 --method scene --target-clips 200

  # Mutate winners from previous batch
  fpfactory mutate --csv metrics.csv --source ./batch1/variants

  # Package existing variants
  fpfactory package --input ./batch1 --zip
        """,
    )

    subparsers = parser.add_subparsers(dest="command", help="command to run")

    # ─── run: full pipeline ──────────────────────────────

    run_parser = subparsers.add_parser("run", help="Run the full pipeline")
    run_parser.add_argument("input", help="Source video file")
    run_parser.add_argument("-o", "--output", default="output", help="Output directory (default: output)")

    # Slicing
    run_parser.add_argument("--method", choices=["scene", "interval", "silence"], default="scene",
                            help="Slicing method (default: scene)")
    run_parser.add_argument("--min-clip", type=float, default=3.0,
                            help="Minimum clip duration in seconds (default: 3)")
    run_parser.add_argument("--max-clip", type=float, default=30.0,
                            help="Maximum clip duration in seconds (default: 30)")
    run_parser.add_argument("--target-clips", type=int, default=100,
                            help="Target number of clips (default: 100)")
    run_parser.add_argument("--interval", type=float, default=10.0,
                            help="Interval seconds for interval mode (default: 10)")

    # Variants
    run_parser.add_argument("--variants", type=int, default=5,
                            help="Variants per clip (default: 5)")
    run_parser.add_argument("--zooms", default="1.0,1.15,1.3",
                            help="Zoom levels, comma-separated (default: 1.0,1.15,1.3)")
    run_parser.add_argument("--speeds", default="1.0,1.1,0.85",
                            help="Speed shifts, comma-separated (default: 1.0,1.1,0.85)")
    run_parser.add_argument("--grades", default="none,warm,cool,cinematic",
                            help="Color grades, comma-separated (default: none,warm,cool,cinematic)")
    run_parser.add_argument("--ratios", default="9:16,1:1",
                            help="Aspect ratios, comma-separated (default: 9:16,1:1)")

    # Metadata
    run_parser.add_argument("--preset", default="default",
                            help="Metadata preset name (default: default)")
    run_parser.add_argument("--hashtags", default="core,growth",
                            help="Hashtag categories, comma-separated (default: core,growth)")
    run_parser.add_argument("--cta", type=int, default=0,
                            help="CTA template index (default: 0)")

    # Mutation
    run_parser.add_argument("--perf-csv", default=None,
                            help="Performance CSV for mutation cycle")
    run_parser.add_argument("--winner-threshold", type=float, default=0.75,
                            help="Winner percentile threshold (default: 0.75 = top 25%%)")
    run_parser.add_argument("--mutations", type=int, default=3,
                            help="Mutations per winner (default: 3)")

    # Concurrency
    run_parser.add_argument("--workers", type=int, default=4,
                            help="Worker processes (default: 4)")
    run_parser.add_argument("--chunk-size", type=int, default=10,
                            help="Items per worker chunk (default: 10)")

    # Packaging
    run_parser.add_argument("--platforms", default="tiktok,reels,shorts",
                            help="Target platforms, comma-separated (default: tiktok,reels,shorts)")
    run_parser.add_argument("--zip", action="store_true", default=True,
                            help="Create zip bundles (default: true)")
    run_parser.add_argument("--no-zip", action="store_true",
                            help="Skip zip bundles")
    run_parser.add_argument("--thumbnails", type=int, default=3,
                            help="Thumbnails per clip (default: 3, 0 to disable)")

    # FFmpeg
    run_parser.add_argument("--ffmpeg", default="ffmpeg",
                            help="Path to ffmpeg binary")
    run_parser.add_argument("--ffprobe", default="ffprobe",
                            help="Path to ffprobe binary")

    # ─── slice: slice only ───────────────────────────────

    slice_parser = subparsers.add_parser("slice", help="Slice video only (no variants)")
    slice_parser.add_argument("input", help="Source video file")
    slice_parser.add_argument("-o", "--output", default="output/clips",
                              help="Output directory for clips")
    slice_parser.add_argument("--method", choices=["scene", "interval", "silence"], default="scene")
    slice_parser.add_argument("--min-clip", type=float, default=3.0)
    slice_parser.add_argument("--max-clip", type=float, default=30.0)
    slice_parser.add_argument("--target-clips", type=int, default=100)
    slice_parser.add_argument("--interval", type=float, default=10.0)
    slice_parser.add_argument("--ffmpeg", default="ffmpeg")
    slice_parser.add_argument("--ffprobe", default="ffprobe")

    # ─── mutate: mutation cycle only ─────────────────────

    mut_parser = subparsers.add_parser("mutate", help="Run mutation cycle on previous batch")
    mut_parser.add_argument("--csv", required=True, help="Performance data CSV")
    mut_parser.add_argument("--source", required=True, help="Source variants directory")
    mut_parser.add_argument("-o", "--output", default="output/mutations",
                            help="Output directory for mutations")
    mut_parser.add_argument("--threshold", type=float, default=0.75)
    mut_parser.add_argument("--count", type=int, default=3,
                            help="Mutations per winner")
    mut_parser.add_argument("--min-views", type=int, default=100)
    mut_parser.add_argument("--ffmpeg", default="ffmpeg")

    # ─── package: package only ───────────────────────────

    pkg_parser = subparsers.add_parser("package", help="Package existing variants")
    pkg_parser.add_argument("--input", required=True, help="Directory with variants + metadata")
    pkg_parser.add_argument("-o", "--output", default=None, help="Output base (default: same as input)")
    pkg_parser.add_argument("--platforms", default="tiktok,reels,shorts")
    pkg_parser.add_argument("--zip", action="store_true", default=True)
    pkg_parser.add_argument("--no-zip", action="store_true")
    pkg_parser.add_argument("--thumbnails", type=int, default=3)
    pkg_parser.add_argument("--ffmpeg", default="ffmpeg")

    return parser


def cmd_run(args):
    """Execute the full pipeline."""
    if not os.path.exists(args.input):
        print(f"Error: input file not found: {args.input}")
        sys.exit(1)

    cfg = FactoryConfig(
        input_path=os.path.abspath(args.input),
        output_dir=os.path.abspath(args.output),
        slice_method=args.method,
        min_clip_seconds=args.min_clip,
        max_clip_seconds=args.max_clip,
        target_clips=args.target_clips,
        interval_seconds=args.interval,
        variants_per_clip=args.variants,
        variant_matrix={
            "zooms": [float(x) for x in args.zooms.split(",")],
            "speed_shifts": [float(x) for x in args.speeds.split(",")],
            "color_grades": [x.strip() for x in args.grades.split(",")],
            "aspect_ratios": [x.strip() for x in args.ratios.split(",")],
        },
        metadata_preset=args.preset,
        hashtag_categories=[x.strip() for x in args.hashtags.split(",")],
        cta_index=args.cta,
        performance_csv=args.perf_csv,
        winner_threshold=args.winner_threshold,
        mutation_count=args.mutations,
        workers=args.workers,
        chunk_size=args.chunk_size,
        platforms=[x.strip() for x in args.platforms.split(",")],
        create_zips=not args.no_zip,
        generate_thumbnails=args.thumbnails > 0,
        thumbnail_count=args.thumbnails,
        ffmpeg_path=args.ffmpeg,
        ffprobe_path=args.ffprobe,
    )

    run_factory(cfg)


def cmd_slice(args):
    """Slice only."""
    from .slicer import slice_video

    if not os.path.exists(args.input):
        print(f"Error: input file not found: {args.input}")
        sys.exit(1)

    clips = slice_video(
        input_path=os.path.abspath(args.input),
        output_dir=os.path.abspath(args.output),
        method=args.method,
        min_clip=args.min_clip,
        max_clip=args.max_clip,
        target_clips=args.target_clips,
        interval=args.interval,
        ffmpeg=args.ffmpeg,
        ffprobe=args.ffprobe,
    )
    print(f"\n{len(clips)} clips written to {args.output}")


def cmd_mutate(args):
    """Mutation cycle only."""
    from .mutation import run_mutation_cycle
    from .variants import generate_variant

    if not os.path.exists(args.csv):
        print(f"Error: CSV not found: {args.csv}")
        sys.exit(1)

    plans = run_mutation_cycle(
        performance_csv=args.csv,
        source_dir=os.path.abspath(args.source),
        threshold=args.threshold,
        mutations_per_winner=args.count,
        min_views=args.min_views,
    )

    if not plans:
        print("No mutation plans generated.")
        return

    output_dir = os.path.abspath(args.output)
    os.makedirs(output_dir, exist_ok=True)

    total = 0
    for plan in plans:
        for i, spec in enumerate(plan.mutations):
            base = os.path.splitext(os.path.basename(plan.source_path))[0]
            filename = f"mut_{base}_{i:03d}.mp4"
            output_path = os.path.join(output_dir, filename)

            result = generate_variant(
                clip_path=plan.source_path,
                output_path=output_path,
                spec=spec,
                ffmpeg=args.ffmpeg,
            )
            if result.success:
                total += 1

    print(f"\n{total} mutations written to {output_dir}")


def cmd_package(args):
    """Package only."""
    import glob
    import json as json_mod
    from .metadata import ClipMetadata
    from .packager import package

    input_dir = os.path.abspath(args.input)
    output_base = os.path.abspath(args.output) if args.output else input_dir

    # Load metadata from sidecar JSONs
    metadata_list = []
    for sidecar in glob.glob(os.path.join(input_dir, "metadata", "*.json")):
        with open(sidecar) as f:
            data = json_mod.load(f)
        meta = ClipMetadata(**{
            k: data.get(k, "") for k in ClipMetadata.__dataclass_fields__
        })
        metadata_list.append(meta)

    if not metadata_list:
        print(f"No metadata found in {input_dir}/metadata/")
        sys.exit(1)

    platforms = [x.strip() for x in args.platforms.split(",")]

    package(
        metadata_list=metadata_list,
        output_base=output_base,
        platforms=platforms,
        create_zips=not args.no_zip,
        gen_thumbnails=args.thumbnails > 0,
        thumbnail_count=args.thumbnails,
        ffmpeg=args.ffmpeg,
    )


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    commands = {
        "run": cmd_run,
        "slice": cmd_slice,
        "mutate": cmd_mutate,
        "package": cmd_package,
    }

    handler = commands.get(args.command)
    if handler:
        handler(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
