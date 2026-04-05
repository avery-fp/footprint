#!/usr/bin/env python3
"""Phase 1: Extract emails from Twitter bio text (no network calls).

Scans the `bio` column of twitter-following.csv for email addresses,
merges new finds into email_cache.json.
"""
import csv
import json
import re
from pathlib import Path

DIR = Path(__file__).parent

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
SKIP_DOMAINS = {"example.com", "sentry.io", "wixpress.com", "w3.org", "schema.org",
                "googleapis.com", "apple.com", "google.com", "facebook.com",
                "twitter.com", "instagram.com", "youtube.com", "tiktok.com"}
SKIP_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".woff", ".woff2"}

PLACEHOLDER_EMAILS = {"your@email.com", "user@domain.com", "cto@yourcompany.com",
                      "email@example.com", "name@domain.com", "you@yours.com"}


def is_valid_email(email: str) -> bool:
    e = email.lower().strip().rstrip(".")
    domain = e.split("@")[-1]
    if domain in SKIP_DOMAINS:
        return False
    if any(e.endswith(ext) for ext in SKIP_EXTENSIONS):
        return False
    if e in PLACEHOLDER_EMAILS:
        return False
    return True


def extract_emails_from_text(text: str) -> list[str]:
    if not text:
        return []
    raw = EMAIL_RE.findall(text)
    return [e.lower().strip().rstrip(".") for e in raw if is_valid_email(e)]


def main():
    cache_path = DIR / "email_cache.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    before_count = sum(1 for v in cache.values() if v)

    # Scan Twitter bios
    tw_path = DIR / "twitter-following.csv"
    new_from_bio = 0
    updated_empty = 0
    total_with_bio_email = 0

    with open(tw_path) as f:
        for row in csv.DictReader(f):
            bio = row.get("bio", "")
            username = row.get("username", "")
            if not bio or not username:
                continue

            emails = extract_emails_from_text(bio)
            if not emails:
                continue

            total_with_bio_email += 1
            best_email = emails[0]

            if username not in cache:
                cache[username] = best_email
                new_from_bio += 1
            elif not cache[username]:
                cache[username] = best_email
                updated_empty += 1

    # Also scan IG bios (they're mostly empty but check anyway)
    ig_path = DIR / "ig-following.csv"
    ig_found = 0
    with open(ig_path) as f:
        for row in csv.DictReader(f):
            bio = row.get("bio", "")
            username = row.get("username", "")
            if not bio or not username:
                continue
            emails = extract_emails_from_text(bio)
            if not emails:
                continue
            ig_found += 1
            best_email = emails[0]
            if username not in cache:
                cache[username] = best_email
                new_from_bio += 1
            elif not cache[username]:
                cache[username] = best_email
                updated_empty += 1

    # Save
    cache_path.write_text(json.dumps(cache, indent=2))

    after_count = sum(1 for v in cache.values() if v)
    print(f"Twitter bios with emails: {total_with_bio_email}")
    print(f"IG bios with emails: {ig_found}")
    print(f"New usernames added to cache: {new_from_bio}")
    print(f"Empty cache entries updated: {updated_empty}")
    print(f"Emails in cache: {before_count} -> {after_count} (+{after_count - before_count})")
    print(f"Total cache entries: {len(cache)}")


if __name__ == "__main__":
    main()
