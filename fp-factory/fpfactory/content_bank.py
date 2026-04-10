"""
CONTENT BANK — loads hooks, captions, CTAs, hashtag clusters from JSON.

Replaces the hardcoded 10-template system with the full 60+40+40+12 bank.
Includes rotation logic so no two consecutive metadata records
get the same hook, caption, CTA, or hashtag cluster.
"""

import json
import os
import random
from typing import Optional

# ─── Paths ──────────────────────────────────────────────────

_BANK_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "content_bank")


def _load_json(filename: str) -> dict:
    path = os.path.join(_BANK_DIR, filename)
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


# ─── Lazy loaders ───────────────────────────────────────────

_hooks_cache: Optional[dict] = None
_captions_cache: Optional[dict] = None
_lattice_cache: Optional[dict] = None
_schedule_cache: Optional[dict] = None


def _hooks() -> dict:
    global _hooks_cache
    if _hooks_cache is None:
        _hooks_cache = _load_json("hooks.json")
    return _hooks_cache


def _captions() -> dict:
    global _captions_cache
    if _captions_cache is None:
        _captions_cache = _load_json("captions.json")
    return _captions_cache


def _lattice() -> dict:
    global _lattice_cache
    if _lattice_cache is None:
        _lattice_cache = _load_json("hashtag_lattice.json")
    return _lattice_cache


def _schedule() -> dict:
    global _schedule_cache
    if _schedule_cache is None:
        _schedule_cache = _load_json("schedule_72hr.json")
    return _schedule_cache


# ─── Hook selection ─────────────────────────────────────────

def all_hooks() -> list[str]:
    """Return all 60 hooks as a flat list."""
    hooks = _hooks()
    if not hooks:
        return []
    result = []
    for category in ["identity", "curiosity", "design", "social_proof"]:
        result.extend(hooks.get(category, []))
    return result


def get_hook(index: int) -> str:
    """Get hook by rotating index. Never repeats within 60."""
    hooks = all_hooks()
    if not hooks:
        return "footprint.onl"
    return hooks[index % len(hooks)]


def get_hook_category(index: int) -> str:
    """Return which hook category this index falls into."""
    hooks = _hooks()
    categories = ["identity", "curiosity", "design", "social_proof"]
    for cat in categories:
        pool = hooks.get(cat, [])
        if index < len(pool):
            return cat
        index -= len(pool)
    return "identity"


# ─── Caption selection ──────────────────────────────────────

def all_caption_templates() -> list[str]:
    """Return all 40 caption templates."""
    captions = _captions()
    return captions.get("templates", [])


def get_caption(index: int, hook_text: str = "") -> str:
    """Get caption by index, substitute {hook} if present."""
    templates = all_caption_templates()
    if not templates:
        return hook_text or "footprint.onl"
    template = templates[index % len(templates)]
    return template.replace("{hook}", hook_text)


# ─── CTA selection ──────────────────────────────────────────

def all_ctas() -> list[str]:
    """Return all 40 CTA variants."""
    captions = _captions()
    return captions.get("ctas", [])


def get_cta(index: int) -> str:
    """Get CTA by rotating index."""
    ctas = all_ctas()
    if not ctas:
        return "footprint.onl"
    return ctas[index % len(ctas)]


# ─── Comment prompts ────────────────────────────────────────

def all_comment_prompts() -> list[str]:
    captions = _captions()
    return captions.get("comment_prompts", [])


def get_comment_prompt(index: int) -> str:
    prompts = all_comment_prompts()
    if not prompts:
        return ""
    return prompts[index % len(prompts)]


# ─── Hashtag cluster selection ──────────────────────────────

def get_cluster_names() -> list[str]:
    """Return cluster names in rotation order."""
    lattice = _lattice()
    clusters = lattice.get("clusters", {})
    rotation = lattice.get("rotation_order", list(range(1, 11)))
    names = sorted(clusters.keys())
    # Reorder by rotation
    ordered = []
    for num in rotation:
        for name in names:
            if name.startswith(f"{num}_"):
                ordered.append(name)
                break
    return ordered or names


def get_cluster_tags(index: int, platform: str = "reels") -> str:
    """
    Get hashtag string from cluster at rotation position `index`.
    Respects platform-specific tag caps.
    Cross-pollinates every 3rd post with 3 tags from next cluster.
    """
    lattice = _lattice()
    clusters = lattice.get("clusters", {})
    caps = lattice.get("platform_caps", {})
    cross = lattice.get("cross_pollination", {})

    names = get_cluster_names()
    if not names or not clusters:
        return "#footprint #fyp"

    cluster_name = names[index % len(names)]
    tags = list(clusters.get(cluster_name, []))

    # Cross-pollination: every Nth post, add tags from next cluster
    every_n = cross.get("every_nth_post", 3)
    extra_count = cross.get("tags_from_next_cluster", 3)
    if (index + 1) % every_n == 0:
        next_name = names[(index + 1) % len(names)]
        next_tags = clusters.get(next_name, [])
        tags.extend(next_tags[:extra_count])

    # Dedupe + shuffle
    tags = list(dict.fromkeys(tags))
    random.shuffle(tags)

    # Platform cap
    cap = caps.get(platform, 15)
    tags = tags[:cap]

    return " ".join(tags)


def get_all_schedule_slots(day: int) -> list[dict]:
    """Get all schedule slots for a given day."""
    schedule = _schedule()
    return schedule.get(f"day{day}", [])
