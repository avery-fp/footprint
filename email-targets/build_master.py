#!/usr/bin/env python3
"""Phase 4: Score + deduplicate + merge all email sources into master-scored.csv.

Collects emails from:
  - ae-inner-circle.csv (bio + website-scraped emails)
  - email_cache.json (bio extraction results)
  - apollo-enriched.csv (if exists, from Apollo web UI export)
  - outreach.csv (existing 324 contacts)

Scores using the scoring logic from scrape-engine/engine.py,
deduplicates, and outputs lists/master-scored.csv.
"""
import csv
import json
import re
import sys
from pathlib import Path

DIR = Path(__file__).parent
ROOT = DIR.parent
LISTS_DIR = ROOT / "lists"

# ── Scoring (inlined from scrape-engine/engine.py to avoid import issues) ──

LINKTREE_RE = re.compile(
    r"(linktree|linktr\.ee|beacons\.ai|carrd\.co|bio\.link|lnk\.bio|stan\.store|hoo\.be|tap\.bio|campsite\.bio|solo\.to)",
    re.IGNORECASE,
)
PLATFORM_URLS = re.compile(
    r"(youtube|spotify|soundcloud|tiktok|twitter|x\.com|instagram|facebook|"
    r"twitch|bandcamp|apple\s*music|deezer|linkedin|pinterest|behance|dribbble|"
    r"vimeo|github|medium|substack)",
    re.IGNORECASE,
)
CREATIVE_KEYWORDS = {
    "music", "photo", "design", "film", "art", "fashion", "creative",
    "studio", "brand", "producer", "dj", "model", "stylist", "director",
    "writer", "dance", "fitness", "chef", "architect",
}
VISUAL_KEYWORDS = {"photo", "design", "art", "film", "video", "visual", "creative"}
SHARING_KEYWORDS = {"collab", "booking", "inquiries", "open to", "available", "dm for", "hire"}
INTENT_KEYWORDS = {"new", "out now", "launching", "2026", "coming soon", "pre-order", "presave", "pre-save"}
BUSINESS_KEYWORDS = {"booking", "inquiries", "management", "press", "agency", "mgmt", "manager"}
PAID_TOOL_KEYWORDS = {
    "adobe", "figma", "canva pro", "lightroom", "photoshop", "premiere",
    "logic pro", "ableton", "fl studio", "pro tools", "final cut",
    "davinci", "capture one", "procreate", "sketch", "after effects",
}
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
HIGH_SPEND_CLUSTERS = {
    "music", "design", "photo", "photography", "film", "filmmaking",
    "ui-ux", "graphic-design", "3d-design", "motion-graphics",
    "cinematography", "animation", "vfx", "music-production",
    "hip-hop", "rnb", "edm", "house", "techno",
}
WEBSITE_RE = re.compile(r"https?://[^\s]+|www\.[^\s]+", re.IGNORECASE)
CUSTOM_DOMAIN_RE = re.compile(r"https?://(?!.*(?:linktree|beacons|carrd|bio\.link|linktr\.ee))[a-z0-9-]+\.[a-z]{2,}", re.IGNORECASE)

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


def score_bio(bio: str, website: str, vertical: str) -> int:
    """Score 0-100 from bio + website text. Adapted from scrape-engine/engine.py."""
    text = (bio + " " + website).lower()
    score = 0

    # CASCADE (60)
    if LINKTREE_RE.search(text):
        score += 7
    platform_mentions = len(set(PLATFORM_URLS.findall(text)))
    if platform_mentions >= 3:
        score += 7
    if sum(1 for kw in CREATIVE_KEYWORDS if kw in text) >= 2:
        score += 6
    if any(kw in text for kw in VISUAL_KEYWORDS):
        score += 6
    if WEBSITE_RE.search(text):
        score += 6
    if any(kw in text for kw in SHARING_KEYWORDS):
        score += 4
    worlds = sum(1 for keywords in WORLD_MAP.values() if any(k in text for k in keywords))
    if worlds >= 2:
        score += 5
    if platform_mentions >= 2:
        score += 3

    # BUY (40)
    if any(loc in text for loc in HIGH_GDP_LOCATIONS):
        score += 4
    if any(tool in text for tool in PAID_TOOL_KEYWORDS):
        score += 4
    if any(kw in text for kw in INTENT_KEYWORDS):
        score += 4
    if any(kw in text for kw in BUSINESS_KEYWORDS):
        score += 4
    if LINKTREE_RE.search(text):
        score += 4
    if CUSTOM_DOMAIN_RE.search(text):
        score += 4
    vert = vertical.lower().replace("-", " ")
    if any(c in vert for c in HIGH_SPEND_CLUSTERS):
        score += 4
    if any(tool in text for tool in PAID_TOOL_KEYWORDS):
        score += 4

    return min(score, 100)


def infer_vertical(source: str, bio: str) -> str:
    """Infer vertical from source column or bio keywords."""
    if "twitter" in source and "instagram" in source:
        return "twitter+instagram"
    if "instagram" in source:
        return "instagram"
    if "twitter" in source:
        return "twitter"
    return "unknown"


def main():
    # ── Load all sources ──

    # 1. ae-inner-circle.csv + email_cache.json for metadata lookup
    cache_path = DIR / "email_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}

    inner_circle_path = DIR / "ae-inner-circle.csv"
    username_meta = {}  # username -> {bio, website, source, display_name}
    if inner_circle_path.exists():
        with open(inner_circle_path) as f:
            for row in csv.DictReader(f):
                username_meta[row.get("username", "")] = {
                    "bio": row.get("bio", ""),
                    "website": row.get("website", ""),
                    "source": row.get("source", ""),
                    "display_name": row.get("display_name", ""),
                    "email_found": row.get("email_found", ""),
                }

    # Collect all contacts: email -> {name, bio, website, source, vertical}
    contacts = {}  # email -> dict

    # From inner circle + cache
    for username, meta in username_meta.items():
        email = meta["email_found"].strip() or cache.get(username, "").strip()
        if not email:
            continue
        email = email.lower().strip()
        if email in contacts:
            # Keep record with more metadata
            if len(meta["bio"]) > len(contacts[email].get("bio", "")):
                contacts[email].update({
                    "name": meta["display_name"] or username,
                    "bio": meta["bio"],
                    "website": meta["website"],
                    "source": meta["source"],
                })
        else:
            contacts[email] = {
                "name": meta["display_name"] or username,
                "bio": meta["bio"],
                "website": meta["website"],
                "source": meta["source"],
            }

    # 2. Apollo enriched (if exists)
    apollo_path = DIR / "apollo-enriched.csv"
    apollo_count = 0
    if apollo_path.exists():
        with open(apollo_path) as f:
            for row in csv.DictReader(f):
                email = (row.get("Email") or row.get("email") or "").lower().strip()
                if not email:
                    continue
                if email not in contacts:
                    first = row.get("First Name", row.get("first_name", ""))
                    last = row.get("Last Name", row.get("last_name", ""))
                    name = f"{first} {last}".strip()
                    contacts[email] = {
                        "name": name,
                        "bio": "",
                        "website": row.get("Website", row.get("website", "")),
                        "source": "apollo",
                    }
                    apollo_count += 1

    # 3. Existing outreach.csv
    outreach_path = LISTS_DIR / "outreach.csv"
    outreach_emails = set()
    if outreach_path.exists():
        with open(outreach_path) as f:
            for row in csv.DictReader(f):
                email = row.get("email", "").lower().strip()
                if email:
                    outreach_emails.add(email)
                    if email not in contacts:
                        contacts[email] = {
                            "name": row.get("name", ""),
                            "bio": "",
                            "website": "",
                            "source": row.get("vertical", "outreach"),
                        }

    # ── Score all contacts ──
    scored = []
    for email, info in contacts.items():
        vertical = infer_vertical(info["source"], info["bio"])
        total_score = score_bio(info["bio"], info["website"], vertical)
        # Contacts already in outreach get a boost (they were manually curated)
        if email in outreach_emails:
            total_score = max(total_score, 100)
        scored.append({
            "email": email,
            "name": info["name"],
            "vertical": vertical,
            "total_score": total_score,
        })

    # Sort by score descending
    scored.sort(key=lambda r: r["total_score"], reverse=True)

    # ── Write master-scored.csv ──
    LISTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = LISTS_DIR / "master-scored.csv"
    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["email", "name", "vertical", "total_score"])
        writer.writeheader()
        for row in scored:
            writer.writerow(row)

    # ── Stats ──
    already_contacted = sum(1 for r in scored if r["email"] in outreach_emails)
    new_contacts = len(scored) - already_contacted
    high_score = sum(1 for r in scored if r["total_score"] >= 50)

    print(f"\n{'='*60}")
    print(f"MASTER SCORED LIST BUILT")
    print(f"{'='*60}")
    print(f"Total unique contacts:   {len(scored)}")
    print(f"New (not in outreach):   {new_contacts}")
    print(f"Already in outreach:     {already_contacted}")
    print(f"Score >= 50:             {high_score}")
    if apollo_count:
        print(f"From Apollo enrichment:  {apollo_count}")
    print(f"Output: {out_path}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
