#!/usr/bin/env python3
"""
Social network contact export pipeline.
Exports following lists from Twitter + Instagram, merges them,
and attempts email discovery from websites.

Auth via environment variables:
  TWITTER_USER, TWITTER_AUTH_TOKEN, TWITTER_CT0  (cookie-based auth)
  IG_USER, IG_PASS
"""

import asyncio
import csv
import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

DIR = Path(__file__).parent

# ---------------------------------------------------------------------------
# Email discovery
# ---------------------------------------------------------------------------
EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
)
SKIP_EMAILS = {"example.com", "sentry.io", "wixpress.com", "w3.org", "schema.org", "googleapis.com"}


def find_emails_on_page(url: str, timeout: int = 10) -> list[str]:
    """Scrape a URL for email addresses. Returns deduplicated list."""
    if not url or not url.startswith("http"):
        return []
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
        resp = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
        resp.raise_for_status()
        text = resp.text
        emails = set(EMAIL_RE.findall(text))
        # Filter junk
        emails = {
            e for e in emails
            if not any(skip in e for skip in SKIP_EMAILS)
            and not e.endswith(".png")
            and not e.endswith(".jpg")
        }
        return sorted(emails)
    except Exception:
        return []


def discover_email(website: str) -> str:
    """Try the main page, then /contact and /about."""
    if not website:
        return ""
    emails = find_emails_on_page(website)
    if emails:
        return emails[0]
    # Try common subpages
    base = website.rstrip("/")
    for path in ["/contact", "/about", "/contact-us"]:
        emails = find_emails_on_page(base + path)
        if emails:
            return emails[0]
        time.sleep(0.5)
    return ""


# ---------------------------------------------------------------------------
# Twitter via twscrape
# ---------------------------------------------------------------------------
async def scrape_twitter():
    print("\n=== TWITTER ===")
    tw_user = os.environ.get("TWITTER_USER")
    tw_auth_token = os.environ.get("TWITTER_AUTH_TOKEN")
    tw_ct0 = os.environ.get("TWITTER_CT0")

    if not tw_user or not tw_auth_token or not tw_ct0:
        print("SKIP: TWITTER_USER / TWITTER_AUTH_TOKEN / TWITTER_CT0 not set")
        print("  Get cookies from: DevTools → Application → Cookies → x.com")
        return []

    from twscrape import API, AccountsPool

    db_path = str(DIR / "twscrape_accounts.db")
    # Delete stale DB to avoid conflicts with old login-based accounts
    if Path(db_path).exists():
        Path(db_path).unlink()
    pool = AccountsPool(db_file=db_path)

    # Add account with cookie auth (bypasses Cloudflare login)
    cookies = f"auth_token={tw_auth_token};ct0={tw_ct0}"
    print(f"Adding @{tw_user} with cookie auth...")
    await pool.add_account(tw_user, "x", "x", "x", cookies=cookies)
    # ct0 in cookies auto-marks account as active — no login_all() needed

    api = API(pool=pool)

    # Resolve user ID for 100xavery
    target = "100xavery"
    print(f"Resolving @{target}...")
    user = await api.user_by_login(target)
    if not user:
        print(f"ERROR: Could not find @{target}")
        return []
    print(f"Found @{target} (id={user.id})")

    # Fetch following
    print(f"Fetching following list (limit 2000)...")
    rows = []
    raw_data = []
    async for u in api.following(user.id, limit=2000):
        raw_data.append(u.dict())
        # Extract website from descriptionLinks
        website = ""
        if u.descriptionLinks:
            for link in u.descriptionLinks:
                url = getattr(link, "url", "") or ""
                if url and "twitter.com" not in url and "t.co" not in url:
                    website = url
                    break
        rows.append({
            "source": "twitter",
            "username": u.username,
            "display_name": u.displayname,
            "bio": (u.rawDescription or "").replace("\n", " "),
            "website": website,
        })

    # Save raw JSON
    raw_path = DIR / "twitter-following-raw.json"
    with open(raw_path, "w") as f:
        json.dump(raw_data, f, indent=2, default=str)
    print(f"Raw: {raw_path} ({len(raw_data)} users)")

    # Save CSV
    csv_path = DIR / "twitter-following.csv"
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["source", "username", "display_name", "bio", "website"])
        w.writeheader()
        w.writerows(rows)
    print(f"CSV: {csv_path} ({len(rows)} rows)")

    return rows


# ---------------------------------------------------------------------------
# Instagram via instaloader
# ---------------------------------------------------------------------------
def scrape_instagram():
    print("\n=== INSTAGRAM ===")
    ig_login = os.environ.get("IG_LOGIN")  # email or username
    ig_pass = os.environ.get("IG_PASS")

    if not ig_login or not ig_pass:
        print("SKIP: IG_LOGIN / IG_PASS not set")
        return []

    import instaloader

    L = instaloader.Instaloader()
    print(f"Logging in as {ig_login}...")
    L.login(ig_login, ig_pass)

    targets = ["quantum__xx", "opus.visions"]
    seen = set()
    rows = []
    raw_lines = []

    for target in targets:
        print(f"Fetching followees of @{target}...")
        try:
            profile = instaloader.Profile.from_username(L.context, target)
            for followee in profile.get_followees():
                if followee.username in seen:
                    continue
                seen.add(followee.username)
                raw_lines.append(
                    f"{followee.username}\t{followee.full_name}\t"
                    f"{(followee.biography or '').replace(chr(10), ' ')}\t"
                    f"{followee.external_url or ''}"
                )
                rows.append({
                    "source": "instagram",
                    "username": followee.username,
                    "display_name": followee.full_name or "",
                    "bio": (followee.biography or "").replace("\n", " "),
                    "website": followee.external_url or "",
                })
        except Exception as e:
            print(f"  ERROR on @{target}: {e}")

    # Save raw
    raw_path = DIR / "ig-following-raw.txt"
    with open(raw_path, "w") as f:
        f.write("\n".join(raw_lines))
    print(f"Raw: {raw_path} ({len(raw_lines)} users)")

    # Save CSV
    csv_path = DIR / "ig-following.csv"
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["source", "username", "display_name", "bio", "website"])
        w.writeheader()
        w.writerows(rows)
    print(f"CSV: {csv_path} ({len(rows)} rows)")

    return rows


# ---------------------------------------------------------------------------
# Merge + Email Discovery
# ---------------------------------------------------------------------------
def merge_and_discover(tw_rows: list[dict], ig_rows: list[dict]):
    print("\n=== MERGE + EMAIL DISCOVERY ===")
    all_rows = tw_rows + ig_rows

    # Deduplicate by lowercase username
    seen = {}
    for row in all_rows:
        key = row["username"].lower()
        if key not in seen:
            seen[key] = row
        else:
            # Merge: prefer the one with a website
            existing = seen[key]
            if not existing["website"] and row["website"]:
                seen[key] = row
            elif row["source"] != existing["source"]:
                seen[key]["source"] = existing["source"] + "+instagram" if "twitter" in existing["source"] else existing["source"] + "+twitter"

    merged = list(seen.values())
    print(f"Merged: {len(merged)} unique contacts")

    # Email discovery for rows with websites
    has_website = [r for r in merged if r.get("website")]
    print(f"Attempting email discovery for {len(has_website)} contacts with websites...")

    for i, row in enumerate(merged):
        website = row.get("website", "")
        if website:
            print(f"  [{i+1}/{len(has_website)}] {row['username']} -> {website[:60]}...", end=" ")
            email = discover_email(website)
            row["email_found"] = email
            print(f"{'FOUND: ' + email if email else 'none'}")
            time.sleep(1)  # rate limit
        else:
            row["email_found"] = ""

    # Save final CSV
    out_path = DIR / "ae-inner-circle.csv"
    fieldnames = ["source", "username", "display_name", "bio", "website", "email_found"]
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(merged)

    emails_found = sum(1 for r in merged if r["email_found"])
    print(f"\nFinal: {out_path}")
    print(f"  Total contacts: {len(merged)}")
    print(f"  With website:   {len(has_website)}")
    print(f"  Emails found:   {emails_found}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def main():
    print("=" * 50)
    print("CONTACT EXPORT PIPELINE")
    print("=" * 50)

    tw_rows = await scrape_twitter()
    ig_rows = scrape_instagram()
    merge_and_discover(tw_rows, ig_rows)

    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
