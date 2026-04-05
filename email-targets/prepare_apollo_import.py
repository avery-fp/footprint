#!/usr/bin/env python3
"""Phase 3: Prepare Apollo-importable CSVs for web UI enrichment.

Reads ae-inner-circle.csv, filters to handles with no email found,
produces Apollo-compatible CSVs split into batches of 1000.
Sorts by likely value (creative keywords in bio) so highest-value
handles get imported first.
"""
import csv
import json
import re
from pathlib import Path

DIR = Path(__file__).parent

CREATIVE_KEYWORDS = {
    "music", "photo", "design", "film", "art", "fashion", "creative",
    "studio", "brand", "producer", "dj", "model", "stylist", "director",
    "writer", "dance", "fitness", "chef", "architect", "founder",
    "engineer", "developer", "photographer", "filmmaker", "artist",
    "creator", "video", "3d", "animation", "illustrator",
}

BATCH_SIZE = 1000


def value_score(bio: str, website: str) -> int:
    """Quick heuristic for sorting — higher = more likely valuable."""
    text = (bio + " " + website).lower()
    score = 0
    for kw in CREATIVE_KEYWORDS:
        if kw in text:
            score += 1
    if website:
        score += 2
    return score


def split_name(display_name: str) -> tuple[str, str]:
    parts = display_name.strip().split(None, 1)
    first = parts[0] if parts else ""
    last = parts[1] if len(parts) > 1 else ""
    return first, last


def main():
    cache_path = DIR / "email_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}

    # Load merged CSV
    inner_circle = DIR / "ae-inner-circle.csv"
    if not inner_circle.exists():
        print("ae-inner-circle.csv not found — run merge_and_discover.py first")
        return

    no_email_rows = []
    with open(inner_circle) as f:
        for row in csv.DictReader(f):
            username = row.get("username", "")
            email_found = row.get("email_found", "").strip()
            cached_email = cache.get(username, "").strip()

            if email_found or cached_email:
                continue

            bio = row.get("bio", "")
            website = row.get("website", "")
            display_name = row.get("display_name", "") or username
            source = row.get("source", "")

            first, last = split_name(display_name)
            twitter_url = f"https://twitter.com/{username}" if "twitter" in source else ""

            no_email_rows.append({
                "First Name": first,
                "Last Name": last,
                "Twitter URL": twitter_url,
                "Website": website,
                "Company": "",
                "_username": username,
                "_bio": bio,
                "_score": value_score(bio, website),
            })

    # Sort by value score descending
    no_email_rows.sort(key=lambda r: r["_score"], reverse=True)

    # Write batches
    apollo_fields = ["First Name", "Last Name", "Twitter URL", "Website", "Company"]
    batch_num = 0
    total = 0

    for i in range(0, len(no_email_rows), BATCH_SIZE):
        batch_num += 1
        batch = no_email_rows[i:i + BATCH_SIZE]
        out_path = DIR / f"apollo-import-batch-{batch_num}.csv"

        with open(out_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=apollo_fields, extrasaction="ignore")
            writer.writeheader()
            for row in batch:
                writer.writerow(row)

        total += len(batch)
        print(f"Wrote {out_path.name}: {len(batch)} rows (top value score: {batch[0]['_score']})")

    print(f"\nTotal: {total} handles without emails across {batch_num} batch(es)")
    print(f"Upload to Apollo: People > Import > CSV")
    print(f"Map columns: First Name, Last Name, Twitter URL, Website")


if __name__ == "__main__":
    main()
