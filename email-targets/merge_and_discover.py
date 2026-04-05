#!/usr/bin/env python3
"""Merge Twitter + IG CSVs, deduplicate, discover emails from websites.

Uses concurrent requests (10 workers) to speed up email discovery.
Saves progress incrementally so it can be resumed if interrupted.
"""
import csv
import json
import re
import time
import os
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

DIR = Path(__file__).parent

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
SKIP_DOMAINS = {"example.com", "sentry.io", "wixpress.com", "w3.org", "schema.org",
                "googleapis.com", "apple.com", "google.com", "facebook.com",
                "twitter.com", "instagram.com", "youtube.com", "tiktok.com"}
SKIP_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".woff", ".woff2"}

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
TIMEOUT = 8
WORKERS = 10


def find_emails(url: str) -> list[str]:
    if not url or not url.startswith("http"):
        return []
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        resp.raise_for_status()
        raw = set(EMAIL_RE.findall(resp.text))
        return sorted(
            e for e in raw
            if not any(skip in e.lower() for skip in SKIP_DOMAINS)
            and not any(e.lower().endswith(ext) for ext in SKIP_EXTENSIONS)
        )
    except Exception:
        return []


def discover_email(website: str) -> str:
    if not website:
        return ""
    emails = find_emails(website)
    if emails:
        return emails[0]
    base = website.rstrip("/")
    for path in ["/contact", "/about"]:
        emails = find_emails(base + path)
        if emails:
            return emails[0]
    return ""


def discover_worker(item: tuple) -> tuple:
    """Worker function for thread pool. Returns (username, email)."""
    username, website = item
    email = discover_email(website)
    return (username, email)


def main():
    # --- Load + Merge ---
    tw_rows = []
    tw_path = DIR / "twitter-following.csv"
    if tw_path.exists():
        with open(tw_path) as f:
            tw_rows = list(csv.DictReader(f))
    print(f"Twitter: {len(tw_rows)} users")

    ig_rows = []
    ig_path = DIR / "ig-following.csv"
    if ig_path.exists():
        with open(ig_path) as f:
            ig_rows = list(csv.DictReader(f))
    print(f"Instagram: {len(ig_rows)} users")

    # Deduplicate
    seen = {}
    for row in tw_rows + ig_rows:
        key = row["username"].lower()
        if key not in seen:
            seen[key] = row
        else:
            existing = seen[key]
            if not existing.get("website") and row.get("website"):
                seen[key] = row
            if row["source"] != existing["source"]:
                seen[key]["source"] = "twitter+instagram"

    merged = list(seen.values())
    print(f"Merged: {len(merged)} unique contacts")

    # --- Email Discovery ---
    # Load any previously discovered emails (resume support)
    cache_path = DIR / "email_cache.json"
    email_cache = {}
    if cache_path.exists():
        with open(cache_path) as f:
            email_cache = json.load(f)
        print(f"Loaded {len(email_cache)} cached email results")

    to_discover = []
    for row in merged:
        website = row.get("website", "").strip()
        if website and row["username"] not in email_cache:
            to_discover.append((row["username"], website))

    print(f"Need to discover: {len(to_discover)} ({len(email_cache)} already cached)")

    if to_discover:
        found = sum(1 for v in email_cache.values() if v)
        processed = 0
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = {pool.submit(discover_worker, item): item for item in to_discover}
            for future in as_completed(futures):
                username, email = future.result()
                email_cache[username] = email
                processed += 1
                if email:
                    found += 1
                    print(f"  [{found}] {username} -> {email}")
                if processed % 100 == 0:
                    print(f"  ...{processed}/{len(to_discover)} done ({found} emails found)")
                    # Save progress
                    with open(cache_path, "w") as f:
                        json.dump(email_cache, f)

        # Final cache save
        with open(cache_path, "w") as f:
            json.dump(email_cache, f)
        print(f"Discovery complete: {found} emails found")

    # --- Write final CSV ---
    for row in merged:
        row["email_found"] = email_cache.get(row["username"], "")

    out_path = DIR / "ae-inner-circle.csv"
    fieldnames = ["source", "username", "display_name", "bio", "website", "email_found"]
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(merged)

    has_website = sum(1 for r in merged if r.get("website", "").strip())
    emails_found = sum(1 for r in merged if r.get("email_found"))
    print(f"\nFinal: {out_path}")
    print(f"  Total contacts: {len(merged)}")
    print(f"  With website:   {has_website}")
    print(f"  Emails found:   {emails_found}")


if __name__ == "__main__":
    main()
