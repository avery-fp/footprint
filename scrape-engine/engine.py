#!/usr/bin/env python3
"""
Footprint Scrape Engine — Contact sourcing from cultural clusters.

Replaces Apollo. No credit limit. No monthly cap.
Runs until you tell it to stop.

Uses twscrape (Twitter/X) and instaloader (Instagram) to:
1. Scrape followers of seed accounts per cultural cluster
2. Extract emails from bios
3. Filter: 1K-50K followers, active last 30 days, email visible
4. Deduplicate across clusters
5. Output CSV: email, name, vertical, source

Usage:
  python engine.py --config clusters.json
  python engine.py --config clusters.json --output ./output
  python engine.py --config clusters.json --platform twitter
  python engine.py --config clusters.json --max-per-seed 5000
  python engine.py --config clusters.json --resume
"""

import argparse
import asyncio
import csv
import json
import logging
import os
import re
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("scrape-engine")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
MIN_FOLLOWERS = 1_000
MAX_FOLLOWERS = 50_000
ACTIVE_DAYS = 30
RATE_LIMIT_SLEEP = 2  # seconds between follower page fetches
STATE_FILE = "scrape_state.json"

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Contact:
    email: str
    name: str
    vertical: str
    source: str
    platform: str
    username: str
    followers: int
    bio: str = ""
    website: str = ""
    engagement_rate: float = 0.0
    posts_per_week: float = 0.0
    last_post_days_ago: int = 999
    is_creator_account: bool = False
    total_score: int = 0

    @property
    def csv_row(self) -> dict:
        return {
            "email": self.email,
            "name": self.name,
            "vertical": self.vertical,
            "source": self.source,
            "total_score": self.total_score,
        }


# ---------------------------------------------------------------------------
# Email extraction
# ---------------------------------------------------------------------------

def extract_emails(text: str) -> list[str]:
    """Pull emails from bio text. Filters obvious non-emails."""
    if not text:
        return []
    raw = EMAIL_RE.findall(text)
    cleaned = []
    for e in raw:
        e = e.lower().strip().rstrip(".")
        # skip image extensions, common false positives
        if any(e.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".gif", ".svg")):
            continue
        if "@" not in e:
            continue
        cleaned.append(e)
    return cleaned


# ---------------------------------------------------------------------------
# Scoring — 0-100 per contact
# ---------------------------------------------------------------------------

# Link-in-bio services
LINKTREE_RE = re.compile(
    r"(linktree|linktr\.ee|beacons\.ai|carrd\.co|bio\.link|lnk\.bio|stan\.store|hoo\.be|tap\.bio|campsite\.bio|solo\.to)",
    re.IGNORECASE,
)

# Creative identity keywords
CREATIVE_KEYWORDS = {
    "music", "photo", "design", "film", "art", "fashion", "creative",
    "studio", "brand", "producer", "dj", "model", "stylist", "director",
    "writer", "dance", "fitness", "chef", "architect",
}

# Visual identity keywords
VISUAL_KEYWORDS = {"photo", "design", "art", "film", "video", "visual", "creative"}

# Sharing / availability keywords
SHARING_KEYWORDS = {"collab", "booking", "inquiries", "open to", "available", "dm for", "hire"}

# Intent keywords
INTENT_KEYWORDS = {"new", "out now", "launching", "2026", "coming soon", "pre-order", "presave", "pre-save"}

# Business keywords
BUSINESS_KEYWORDS = {"booking", "inquiries", "management", "press", "agency", "mgmt", "manager"}

# Paid tool mentions
PAID_TOOL_KEYWORDS = {
    "adobe", "figma", "canva pro", "lightroom", "photoshop", "premiere",
    "logic pro", "ableton", "fl studio", "pro tools", "final cut",
    "davinci", "capture one", "procreate", "sketch", "after effects",
}

# High-GDP countries (ISO patterns in bio / location)
HIGH_GDP_LOCATIONS = {
    "us", "usa", "united states", "new york", "nyc", "la", "los angeles",
    "chicago", "miami", "atlanta", "houston", "sf", "san francisco",
    "uk", "london", "manchester", "united kingdom", "england",
    "canada", "toronto", "vancouver", "montreal",
    "australia", "sydney", "melbourne",
    "germany", "berlin", "munich", "france", "paris", "lyon",
    "japan", "tokyo", "osaka", "korea", "seoul",
    "netherlands", "amsterdam", "sweden", "stockholm",
    "switzerland", "zurich", "norway", "oslo", "denmark", "copenhagen",
    "singapore", "dubai", "uae", "abu dhabi",
}

# Clusters known for tool spend
HIGH_SPEND_CLUSTERS = {
    "music", "design", "photo", "photography", "film", "filmmaking",
    "ui-ux", "graphic-design", "3d-design", "motion-graphics",
    "cinematography", "animation", "vfx", "music-production",
    "hip-hop", "rnb", "edm", "house", "techno",
}

# Platform URL patterns for counting linked platforms
PLATFORM_URLS = re.compile(
    r"(youtube|spotify|soundcloud|tiktok|twitter|x\.com|instagram|facebook|"
    r"twitch|bandcamp|apple\s*music|deezer|linkedin|pinterest|behance|dribbble|"
    r"vimeo|github|medium|substack)",
    re.IGNORECASE,
)

WEBSITE_RE = re.compile(r"https?://[^\s]+|www\.[^\s]+", re.IGNORECASE)
CUSTOM_DOMAIN_RE = re.compile(r"https?://(?!.*(?:linktree|beacons|carrd|bio\.link|linktr\.ee))[a-z0-9-]+\.[a-z]{2,}", re.IGNORECASE)


def score_contact(contact: Contact, vertical: str) -> int:
    """Score a contact 0-100. CASCADE (60) + BUY (40)."""
    bio = (contact.bio + " " + contact.website).lower()
    score = 0

    # ── CASCADE (60 points) ──────────────────────────────────────────────

    # Fragmentation (20)
    if LINKTREE_RE.search(bio):
        score += 7
    platform_mentions = len(set(PLATFORM_URLS.findall(bio)))
    if platform_mentions >= 3:
        score += 7
    creative_hits = sum(1 for kw in CREATIVE_KEYWORDS if kw in bio)
    if creative_hits >= 2:
        score += 6

    # Visual (12)
    if any(kw in bio for kw in VISUAL_KEYWORDS):
        score += 6
    if WEBSITE_RE.search(bio):
        score += 6

    # Network (12)
    if contact.engagement_rate > 0.05:
        score += 6
    if 5_000 <= contact.followers <= 50_000:
        score += 6
    elif MIN_FOLLOWERS <= contact.followers < 5_000:
        score += 3

    # Sharing (8)
    if contact.posts_per_week >= 3.0:
        score += 4
    if any(kw in bio for kw in SHARING_KEYWORDS):
        score += 4

    # Bridge (8)
    # Bio spans 2+ cultural worlds — count distinct creative keyword clusters
    world_tags = {"sound", "visual", "motion", "design", "build", "word", "body", "taste", "mind", "play"}
    WORLD_MAP = {
        "sound": {"music", "producer", "dj", "singer", "rapper", "beat", "audio", "vocal"},
        "visual": {"photo", "film", "video", "visual", "cinema", "camera"},
        "design": {"design", "graphic", "ui", "ux", "brand", "type", "illustration"},
        "motion": {"dance", "animation", "skate", "surf", "choreograph"},
        "fashion": {"fashion", "style", "model", "stylist", "vintage", "streetwear"},
        "build": {"code", "dev", "startup", "tech", "hack", "engineer"},
        "word": {"writer", "poet", "author", "journalist", "fiction", "screenplay"},
        "body": {"fitness", "yoga", "gym", "athlete", "train", "coach"},
        "taste": {"chef", "cook", "food", "bake", "mixolog", "coffee", "barista"},
    }
    worlds_present = sum(1 for _w, keywords in WORLD_MAP.items() if any(k in bio for k in keywords))
    if worlds_present >= 2:
        score += 5
    # follows diverse cluster hubs — approximated by platform count
    if platform_mentions >= 2:
        score += 3

    # ── BUY (40 points) ─────────────────────────────────────────────────

    # Capacity (12)
    if any(loc in bio for loc in HIGH_GDP_LOCATIONS):
        score += 4
    if contact.is_creator_account:
        score += 4
    if any(tool in bio for tool in PAID_TOOL_KEYWORDS):
        score += 4

    # Intent (12)
    if any(kw in bio for kw in INTENT_KEYWORDS):
        score += 4
    if any(kw in bio for kw in BUSINESS_KEYWORDS):
        score += 4
    if contact.last_post_days_ago <= 7:
        score += 4

    # Adoption (8)
    if LINKTREE_RE.search(bio):
        score += 4
    if CUSTOM_DOMAIN_RE.search(bio):
        score += 4

    # Community (8)
    vertical_lower = vertical.lower().replace("-", " ")
    if any(c in vertical_lower for c in HIGH_SPEND_CLUSTERS):
        score += 4
    if any(tool in bio for tool in PAID_TOOL_KEYWORDS):
        score += 4

    return min(score, 100)


# ---------------------------------------------------------------------------
# State persistence (resume support)
# ---------------------------------------------------------------------------

class ScrapeState:
    """Track which seeds have been fully scraped for resume support."""

    def __init__(self, state_dir: Path):
        self.path = state_dir / STATE_FILE
        self.completed_seeds: set[str] = set()
        self.seen_emails: set[str] = set()
        self._load()

    def _load(self):
        if self.path.exists():
            data = json.loads(self.path.read_text())
            self.completed_seeds = set(data.get("completed_seeds", []))
            self.seen_emails = set(data.get("seen_emails", []))
            log.info("Resumed state: %d seeds done, %d emails seen",
                     len(self.completed_seeds), len(self.seen_emails))

    def save(self):
        self.path.write_text(json.dumps({
            "completed_seeds": list(self.completed_seeds),
            "seen_emails": list(self.seen_emails),
        }, indent=2))

    def mark_seed_done(self, seed: str):
        self.completed_seeds.add(seed)
        self.save()

    def is_seed_done(self, seed: str) -> bool:
        return seed in self.completed_seeds

    def add_email(self, email: str) -> bool:
        """Returns True if email is new (not a duplicate)."""
        if email in self.seen_emails:
            return False
        self.seen_emails.add(email)
        self.save()
        return True


# ---------------------------------------------------------------------------
# Twitter scraper (twscrape)
# ---------------------------------------------------------------------------

async def scrape_twitter(
    seeds: list[str],
    vertical: str,
    state: ScrapeState,
    max_per_seed: int,
    accounts_file: Optional[str] = None,
) -> list[Contact]:
    """Scrape Twitter followers of seed accounts using twscrape."""
    try:
        from twscrape import API, gather
    except ImportError:
        log.error("twscrape not installed. Run: pip install twscrape")
        return []

    api = API()

    # Add accounts from file if provided
    if accounts_file and Path(accounts_file).exists():
        with open(accounts_file) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split(":")
                if len(parts) >= 4:
                    await api.pool.add_account(
                        parts[0], parts[1], parts[2], parts[3]
                    )
        await api.pool.login_all()
        log.info("Twitter account pool loaded")
    else:
        # Check if accounts already exist in the pool
        accounts = await api.pool.accounts_info()
        if not accounts:
            log.warning(
                "No Twitter accounts in pool. "
                "Create twitter_accounts.txt with lines: username:password:email:email_password"
            )
            return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=ACTIVE_DAYS)
    contacts: list[Contact] = []

    for seed in seeds:
        seed_handle = seed.lstrip("@")
        seed_key = f"twitter:{seed_handle}"

        if state.is_seed_done(seed_key):
            log.info("Skipping %s (already scraped)", seed_handle)
            continue

        log.info("Twitter: scraping followers of @%s for [%s]", seed_handle, vertical)

        try:
            # Resolve seed account to numeric ID
            seed_user = await api.user_by_login(seed_handle)
            if not seed_user:
                log.warning("Could not find Twitter user @%s", seed_handle)
                continue

            count = 0
            async for follower in api.followers(seed_user.id, limit=max_per_seed):
                count += 1
                if count % 100 == 0:
                    log.info("  @%s: processed %d followers", seed_handle, count)

                # Filter: follower count sweet spot
                fc = follower.followersCount
                if fc < MIN_FOLLOWERS or fc > MAX_FOLLOWERS:
                    continue

                # Filter: has email in bio
                emails = extract_emails(follower.rawDescription or "")
                if not emails:
                    continue

                # Filter: active in last 30 days
                if follower.statusesCount == 0:
                    continue
                # twscrape user object has `created` but not always last tweet date
                # Use status count + account age as activity proxy if no recent tweet
                # The followers endpoint returns user objects with status field
                if hasattr(follower, "status") and follower.status:
                    last_active = follower.status.date
                    if last_active < cutoff:
                        continue

                # Collect engagement/activity signals for scoring
                eng_rate = 0.0
                ppw = 0.0
                last_days = 999
                is_creator = getattr(follower, "verified", False) or fc >= 5000

                if hasattr(follower, "status") and follower.status:
                    delta = datetime.now(timezone.utc) - follower.status.date
                    last_days = delta.days
                    # Approximate posts-per-week from statusesCount and account age
                    acct_age_weeks = max(1, (datetime.now(timezone.utc) - follower.created).days / 7)
                    ppw = follower.statusesCount / acct_age_weeks
                    # Engagement proxy: favs+retweets on last tweet / followers
                    if fc > 0 and hasattr(follower.status, "likeCount"):
                        eng_rate = (
                            getattr(follower.status, "likeCount", 0) +
                            getattr(follower.status, "retweetCount", 0)
                        ) / fc

                raw_bio = (follower.rawDescription or "")[:200]
                website = getattr(follower, "url", "") or ""

                for email in emails:
                    if state.add_email(email):
                        c = Contact(
                            email=email,
                            name=follower.displayname or follower.username,
                            vertical=vertical,
                            source=f"twitter:@{seed_handle}",
                            platform="twitter",
                            username=follower.username,
                            followers=fc,
                            bio=raw_bio,
                            website=website,
                            engagement_rate=eng_rate,
                            posts_per_week=ppw,
                            last_post_days_ago=last_days,
                            is_creator_account=is_creator,
                        )
                        c.total_score = score_contact(c, vertical)
                        contacts.append(c)

                # Rate limit courtesy
                if count % 200 == 0:
                    await asyncio.sleep(RATE_LIMIT_SLEEP)

            log.info("  @%s: done. %d followers scanned, %d contacts so far",
                     seed_handle, count, len(contacts))
            state.mark_seed_done(seed_key)

        except Exception as e:
            log.error("Twitter error on @%s: %s", seed_handle, e)
            # Don't mark as done — will retry on resume
            continue

    return contacts


# ---------------------------------------------------------------------------
# Instagram scraper (instaloader)
# ---------------------------------------------------------------------------

def scrape_instagram(
    seeds: list[str],
    vertical: str,
    state: ScrapeState,
    max_per_seed: int,
    ig_user: Optional[str] = None,
    ig_pass: Optional[str] = None,
    session_file: Optional[str] = None,
) -> list[Contact]:
    """Scrape Instagram followers of seed accounts using instaloader."""
    try:
        import instaloader
    except ImportError:
        log.error("instaloader not installed. Run: pip install instaloader")
        return []

    L = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        quiet=True,
    )

    # Login — required for follower lists
    if session_file and Path(session_file).exists():
        L.load_session_from_file(ig_user or "", filename=session_file)
        log.info("Instagram session loaded from file")
    elif ig_user and ig_pass:
        try:
            L.login(ig_user, ig_pass)
            log.info("Instagram login successful")
        except Exception as e:
            log.error("Instagram login failed: %s", e)
            return []
    else:
        log.warning(
            "Instagram requires login for follower lists. "
            "Set INSTA_USER + INSTA_PASS env vars, or provide --ig-session"
        )
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=ACTIVE_DAYS)
    contacts: list[Contact] = []

    for seed in seeds:
        seed_handle = seed.lstrip("@")
        seed_key = f"instagram:{seed_handle}"

        if state.is_seed_done(seed_key):
            log.info("Skipping %s (already scraped)", seed_handle)
            continue

        log.info("Instagram: scraping followers of @%s for [%s]", seed_handle, vertical)

        try:
            profile = instaloader.Profile.from_username(L.context, seed_handle)
            count = 0

            for follower in profile.get_followers():
                count += 1
                if count > max_per_seed:
                    break
                if count % 100 == 0:
                    log.info("  @%s: processed %d followers", seed_handle, count)

                # Filter: follower count sweet spot
                fc = follower.followers
                if fc < MIN_FOLLOWERS or fc > MAX_FOLLOWERS:
                    continue

                # Filter: has email in bio
                bio = follower.biography or ""
                emails = extract_emails(bio)
                if not emails:
                    # Also check external URL for email patterns
                    ext_url = follower.external_url or ""
                    emails = extract_emails(ext_url)
                    if not emails:
                        continue

                # Filter: active in last 30 days
                if follower.mediacount == 0:
                    continue
                try:
                    posts = follower.get_posts()
                    latest = next(iter(posts), None)
                    if latest and latest.date_utc < cutoff:
                        continue
                except Exception:
                    # If we can't check posts, keep the contact if they have content
                    if follower.mediacount < 5:
                        continue

                # Collect engagement/activity signals for scoring
                eng_rate = 0.0
                ppw = 0.0
                last_days = 999
                is_creator = getattr(follower, "is_business_account", False) or fc >= 5000
                ext_url = follower.external_url or ""

                try:
                    recent = list(zip(range(10), follower.get_posts()))
                    if recent:
                        # Engagement rate: avg (likes+comments) / followers over last 10
                        total_eng = sum(
                            (getattr(p, "likes", 0) or 0) + (getattr(p, "comments", 0) or 0)
                            for _, p in recent
                        )
                        eng_rate = (total_eng / len(recent)) / max(fc, 1)
                        # Posts per week from date span
                        first_date = recent[0][1].date_utc
                        last_date = recent[-1][1].date_utc
                        span_days = max(1, (first_date - last_date).days)
                        ppw = len(recent) / (span_days / 7) if span_days > 0 else 0
                        last_days = (datetime.now(timezone.utc) - first_date).days
                except Exception:
                    pass

                for email in emails:
                    if state.add_email(email):
                        c = Contact(
                            email=email,
                            name=follower.full_name or follower.username,
                            vertical=vertical,
                            source=f"instagram:@{seed_handle}",
                            platform="instagram",
                            username=follower.username,
                            followers=fc,
                            bio=bio[:200],
                            website=ext_url,
                            engagement_rate=eng_rate,
                            posts_per_week=ppw,
                            last_post_days_ago=last_days,
                            is_creator_account=is_creator,
                        )
                        c.total_score = score_contact(c, vertical)
                        contacts.append(c)

                # Rate limit — Instagram is aggressive
                if count % 50 == 0:
                    time.sleep(RATE_LIMIT_SLEEP * 2)

            log.info("  @%s: done. %d followers scanned, %d contacts so far",
                     seed_handle, count, len(contacts))
            state.mark_seed_done(seed_key)

        except instaloader.exceptions.ProfileNotExistsException:
            log.warning("Instagram profile @%s not found", seed_handle)
            continue
        except instaloader.exceptions.LoginRequiredException:
            log.error("Instagram login expired. Re-authenticate.")
            break
        except Exception as e:
            log.error("Instagram error on @%s: %s", seed_handle, e)
            continue

    return contacts


# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------

def detect_platform(handle: str) -> str:
    """Guess platform from handle format. Defaults to twitter."""
    h = handle.lstrip("@").lower()
    # If the config explicitly tags it, that takes priority (handled in main)
    # Otherwise, heuristic: Instagram handles don't usually start with @
    # but since both use @, we default to twitter unless overridden
    return "twitter"


# ---------------------------------------------------------------------------
# CSV output
# ---------------------------------------------------------------------------

CSV_FIELDS = ["email", "name", "vertical", "source", "total_score"]


def write_csv(contacts: list[Contact], output_dir: Path, vertical: str):
    """Write contacts to CSV sorted by total_score descending."""
    output_dir.mkdir(parents=True, exist_ok=True)

    safe_name = re.sub(r"[^a-z0-9_-]", "_", vertical.lower())
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = output_dir / f"{safe_name}_{ts}.csv"

    sorted_contacts = sorted(contacts, key=lambda c: c.total_score, reverse=True)

    with open(filename, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for c in sorted_contacts:
            writer.writerow(c.csv_row)

    log.info("Wrote %d contacts to %s (top score: %d)",
             len(sorted_contacts), filename,
             sorted_contacts[0].total_score if sorted_contacts else 0)
    return filename


def write_master_csv(contacts: list[Contact], output_dir: Path):
    """Write deduplicated master CSV across all verticals, sorted by score."""
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = output_dir / f"all_contacts_{ts}.csv"

    # Deduplicate by email, keep highest-scored occurrence
    best: dict[str, Contact] = {}
    for c in contacts:
        if c.email not in best or c.total_score > best[c.email].total_score:
            best[c.email] = c

    deduped = sorted(best.values(), key=lambda c: c.total_score, reverse=True)

    with open(filename, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for c in deduped:
            writer.writerow(c.csv_row)

    log.info("Master CSV: %d unique contacts to %s (top score: %d)",
             len(deduped), filename,
             deduped[0].total_score if deduped else 0)
    return filename


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

async def run(args):
    # Load config
    config_path = Path(args.config)
    if not config_path.exists():
        log.error("Config file not found: %s", config_path)
        sys.exit(1)

    with open(config_path) as f:
        clusters: dict[str, list[str]] = json.load(f)

    log.info("Loaded %d clusters: %s", len(clusters), ", ".join(clusters.keys()))

    output_dir = Path(args.output)
    state = ScrapeState(output_dir)
    all_contacts: list[Contact] = []

    # Platform-specific creds from env
    ig_user = os.environ.get("INSTA_USER")
    ig_pass = os.environ.get("INSTA_PASS")
    tw_accounts = args.twitter_accounts or os.environ.get("TWITTER_ACCOUNTS_FILE")

    for vertical, seeds in clusters.items():
        log.info("=== Cluster: %s (%d seeds) ===", vertical, len(seeds))

        # Split seeds by platform
        twitter_seeds = []
        instagram_seeds = []

        for seed in seeds:
            handle = seed.lstrip("@")
            if args.platform == "twitter":
                twitter_seeds.append(seed)
            elif args.platform == "instagram":
                instagram_seeds.append(seed)
            else:
                # Auto-detect: if config has platform prefix, use it
                if seed.startswith("ig:") or seed.startswith("instagram:"):
                    instagram_seeds.append(seed.split(":", 1)[1])
                elif seed.startswith("tw:") or seed.startswith("twitter:"):
                    twitter_seeds.append(seed.split(":", 1)[1])
                else:
                    # Default: try both (twitter first since it's faster)
                    twitter_seeds.append(seed)

        # Scrape Twitter
        if twitter_seeds:
            tw_contacts = await scrape_twitter(
                twitter_seeds, vertical, state,
                max_per_seed=args.max_per_seed,
                accounts_file=tw_accounts,
            )
            all_contacts.extend(tw_contacts)
            if tw_contacts:
                write_csv(tw_contacts, output_dir, f"{vertical}_twitter")

        # Scrape Instagram
        if instagram_seeds:
            ig_contacts = scrape_instagram(
                instagram_seeds, vertical, state,
                max_per_seed=args.max_per_seed,
                ig_user=ig_user,
                ig_pass=ig_pass,
                session_file=args.ig_session,
            )
            all_contacts.extend(ig_contacts)
            if ig_contacts:
                write_csv(ig_contacts, output_dir, f"{vertical}_instagram")

    # Master CSV with cross-cluster dedup
    if all_contacts:
        write_master_csv(all_contacts, output_dir)

    # Summary
    unique_emails = len(set(c.email for c in all_contacts))
    log.info("=" * 60)
    log.info("SCRAPE COMPLETE")
    log.info("  Total contacts: %d", len(all_contacts))
    log.info("  Unique emails:  %d", unique_emails)
    log.info("  Verticals:      %s", ", ".join(clusters.keys()))
    log.info("  Output:         %s", output_dir)
    log.info("=" * 60)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Footprint Scrape Engine — Contact sourcing from cultural clusters"
    )
    parser.add_argument(
        "--config", required=True,
        help="Path to clusters JSON config file"
    )
    parser.add_argument(
        "--output", default="./output/scrape",
        help="Output directory for CSVs (default: ./output/scrape)"
    )
    parser.add_argument(
        "--platform", choices=["twitter", "instagram", "both"], default="both",
        help="Platform to scrape (default: both)"
    )
    parser.add_argument(
        "--max-per-seed", type=int, default=5000,
        help="Max followers to scan per seed account (default: 5000)"
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="Resume from previous run (skips completed seeds)"
    )
    parser.add_argument(
        "--twitter-accounts",
        help="Path to twitter accounts file (username:password:email:email_password per line)"
    )
    parser.add_argument(
        "--ig-session",
        help="Path to instaloader session file"
    )
    parser.add_argument(
        "--min-followers", type=int, default=MIN_FOLLOWERS,
        help=f"Minimum follower count (default: {MIN_FOLLOWERS})"
    )
    parser.add_argument(
        "--max-followers", type=int, default=MAX_FOLLOWERS,
        help=f"Maximum follower count (default: {MAX_FOLLOWERS})"
    )

    args = parser.parse_args()

    # Override globals if custom range provided
    global MIN_FOLLOWERS, MAX_FOLLOWERS
    MIN_FOLLOWERS = args.min_followers
    MAX_FOLLOWERS = args.max_followers

    # Clear state if not resuming
    state_path = Path(args.output) / STATE_FILE
    if not args.resume and state_path.exists():
        state_path.unlink()

    asyncio.run(run(args))


if __name__ == "__main__":
    main()
