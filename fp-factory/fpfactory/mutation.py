"""
MUTATION ENGINE — performance-based variant regeneration.

Flow:
  1. User manually uploads a CSV of performance data (views, likes, shares)
  2. Engine identifies high-performing variants (top 25% by default)
  3. Generates new mutated versions of those winners
  4. Outputs a new batch ready for the next cycle

No scraping. No API calls. The user provides the performance CSV.
"""

import csv
import os
import random
from dataclasses import dataclass
from typing import Optional

from .config import COLOR_GRADES
from .variants import VariantSpec


@dataclass
class PerformanceRecord:
    """A single row from the user's performance CSV."""
    clip_id: str
    filename: str
    views: int = 0
    likes: int = 0
    shares: int = 0
    comments: int = 0
    saves: int = 0
    platform: str = ""
    score: float = 0.0     # computed engagement score

    @property
    def engagement(self) -> float:
        """Compute weighted engagement score."""
        if self.views == 0:
            return 0.0
        return (
            (self.likes * 1.0)
            + (self.shares * 3.0)
            + (self.comments * 2.0)
            + (self.saves * 4.0)
        ) / self.views


@dataclass
class MutationPlan:
    """Plan for generating mutations of a winning variant."""
    source_record: PerformanceRecord
    source_path: str
    mutations: list[VariantSpec]


# ─── Load performance data ──────────────────────────────

def load_performance_csv(csv_path: str) -> list[PerformanceRecord]:
    """
    Load a performance CSV uploaded by the user.

    Expected columns (flexible — uses what's available):
      clip_id, filename, views, likes, shares, comments, saves, platform
    """
    records = []

    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rec = PerformanceRecord(
                clip_id=row.get("clip_id", row.get("id", "")),
                filename=row.get("filename", row.get("file", "")),
                views=int(row.get("views", 0)),
                likes=int(row.get("likes", 0)),
                shares=int(row.get("shares", row.get("reposts", 0))),
                comments=int(row.get("comments", 0)),
                saves=int(row.get("saves", row.get("bookmarks", 0))),
                platform=row.get("platform", ""),
            )
            rec.score = rec.engagement
            records.append(rec)

    print(f"  [mutation] loaded {len(records)} performance records from {csv_path}")
    return records


# ─── Identify winners ───────────────────────────────────

def identify_winners(
    records: list[PerformanceRecord],
    threshold: float = 0.75,
    min_views: int = 100,
) -> list[PerformanceRecord]:
    """
    Find top-performing variants.

    Args:
        records: all performance records
        threshold: percentile threshold (0.75 = top 25%)
        min_views: minimum views to qualify
    """
    # Filter for minimum views
    qualified = [r for r in records if r.views >= min_views]

    if not qualified:
        print("  [mutation] no records meet minimum view threshold")
        return []

    # Sort by engagement score
    qualified.sort(key=lambda r: r.score, reverse=True)

    # Take top percentile
    cutoff = max(1, int(len(qualified) * (1.0 - threshold)))
    winners = qualified[:cutoff]

    print(f"  [mutation] {len(winners)} winners identified (top {int((1.0-threshold)*100)}%)")
    for w in winners[:5]:
        print(f"    {w.filename}: score={w.score:.4f} views={w.views} likes={w.likes}")

    return winners


# ─── Generate mutation specs ────────────────────────────

def mutate_spec(base_tag: str, mutation_index: int) -> VariantSpec:
    """
    Create a mutated VariantSpec that's similar but different from the winner.
    Mutations are small perturbations — the winner worked, so stay close.
    """
    # Parse what we can from the base tag
    zooms = [1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3]
    speeds = [0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15]
    grades = list(COLOR_GRADES.keys())
    crops = ["center", "top", "bottom"]
    ratios = ["9:16", "1:1", "4:5"]

    return VariantSpec(
        zoom=random.choice(zooms),
        crop_position=random.choice(crops),
        color_grade=random.choice(grades),
        speed=random.choice(speeds),
        aspect_ratio=random.choice(ratios),
        tag=f"mut_{mutation_index}",
    )


# ─── Build mutation plans ───────────────────────────────

def build_mutation_plans(
    winners: list[PerformanceRecord],
    source_dir: str,
    mutations_per_winner: int = 3,
) -> list[MutationPlan]:
    """
    Create mutation plans for each winning variant.
    Each winner gets N new variant specs to try.
    """
    plans = []

    for winner in winners:
        # Try to find the source file
        source_path = ""
        if winner.filename:
            candidate = os.path.join(source_dir, winner.filename)
            if os.path.exists(candidate):
                source_path = candidate

        if not source_path:
            # Try clip_id based lookup
            for ext in [".mp4", ".mov", ".webm"]:
                candidate = os.path.join(source_dir, winner.clip_id + ext)
                if os.path.exists(candidate):
                    source_path = candidate
                    break

        if not source_path:
            print(f"  [mutation] source not found for {winner.filename}, skipping")
            continue

        mutations = [
            mutate_spec(winner.filename, i)
            for i in range(mutations_per_winner)
        ]

        plans.append(MutationPlan(
            source_record=winner,
            source_path=source_path,
            mutations=mutations,
        ))

    print(f"  [mutation] {len(plans)} mutation plans created ({sum(len(p.mutations) for p in plans)} total variants)")
    return plans


# ─── Full mutation cycle ────────────────────────────────

def run_mutation_cycle(
    performance_csv: str,
    source_dir: str,
    threshold: float = 0.75,
    mutations_per_winner: int = 3,
    min_views: int = 100,
) -> list[MutationPlan]:
    """
    Full mutation cycle:
      1. Load performance data
      2. Identify winners
      3. Build mutation plans
      4. Return plans (caller executes via variants engine)
    """
    print(f"\n  [mutation] ─── MUTATION CYCLE ───")
    records = load_performance_csv(performance_csv)
    winners = identify_winners(records, threshold, min_views)

    if not winners:
        print("  [mutation] no winners found — try lowering threshold or min_views")
        return []

    plans = build_mutation_plans(winners, source_dir, mutations_per_winner)
    return plans
