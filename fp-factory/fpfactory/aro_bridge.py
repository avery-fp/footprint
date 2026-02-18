"""
ARO BRIDGE — converts fp-factory performance CSVs into ARO event format.

Takes:
  fp-factory analytics/day1_perf.csv
    clip_id,filename,views,likes,shares,comments,saves,platform

Produces:
  aro-compatible events CSV ready for:
    npx tsx cli/aro.ts ingest-events <output.csv>

Also generates a targets CSV from the performance data for ARO ingestion.
"""

import csv
import os
from datetime import datetime


def bridge_perf_to_events(
    perf_csv: str,
    output_path: str,
    channel: str = "content",
) -> dict:
    """
    Convert fp-factory performance CSV → ARO events CSV.

    Each row in perf_csv becomes multiple event rows:
      - 1 'sent' event (the post was published)
      - N 'click' events (proportional to likes + shares)
      - N 'convert' events (proportional to saves — highest intent)

    Conversion heuristic:
      saves * 0.03 = estimated conversions (3% of savers convert)
      (likes + shares) * 0.01 = estimated clicks (1% click through)
    """
    if not os.path.exists(perf_csv):
        return {"error": f"File not found: {perf_csv}"}

    events = []
    now = datetime.now().isoformat()

    with open(perf_csv, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            clip_id = row.get("clip_id", row.get("id", ""))
            filename = row.get("filename", row.get("file", ""))
            platform = row.get("platform", "tiktok")
            views = int(row.get("views", 0))
            likes = int(row.get("likes", 0))
            shares = int(row.get("shares", row.get("reposts", 0)))
            comments = int(row.get("comments", 0))
            saves = int(row.get("saves", row.get("bookmarks", 0)))

            if views == 0:
                continue

            # 'sent' event — the post exists
            events.append({
                "occurred_at": now,
                "event_type": "sent",
                "channel": channel,
                "username": clip_id,
                "serial_number": "",
                "variant_name": filename,
                "value": str(views),
                "meta_json": f'{{"platform":"{platform}","views":{views},"likes":{likes},"shares":{shares},"comments":{comments},"saves":{saves}}}',
            })

            # 'click' events — estimated from engagement
            est_clicks = max(1, int((likes + shares) * 0.01))
            for _ in range(est_clicks):
                events.append({
                    "occurred_at": now,
                    "event_type": "click",
                    "channel": channel,
                    "username": clip_id,
                    "serial_number": "",
                    "variant_name": filename,
                    "value": "1",
                    "meta_json": "",
                })

            # 'convert' events — estimated from saves
            est_converts = max(0, int(saves * 0.03))
            for _ in range(est_converts):
                events.append({
                    "occurred_at": now,
                    "event_type": "convert",
                    "channel": channel,
                    "username": clip_id,
                    "serial_number": "",
                    "variant_name": filename,
                    "value": "10",
                    "meta_json": "",
                })

    # Write output
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "occurred_at", "event_type", "channel", "username",
            "serial_number", "variant_name", "value", "meta_json",
        ])
        writer.writeheader()
        writer.writerows(events)

    sent = sum(1 for e in events if e["event_type"] == "sent")
    clicks = sum(1 for e in events if e["event_type"] == "click")
    converts = sum(1 for e in events if e["event_type"] == "convert")

    print(f"  [aro-bridge] {len(events)} events generated from {sent} clips")
    print(f"    sent: {sent}  clicks: {clicks}  converts: {converts}")
    print(f"    output: {output_path}")

    return {
        "events": len(events),
        "sent": sent,
        "clicks": clicks,
        "converts": converts,
        "output": output_path,
    }


def bridge_perf_to_targets(
    perf_csv: str,
    output_path: str,
) -> dict:
    """
    Extract unique platform/clip combos as ARO targets.
    This lets ARO track which content pieces are performing.
    """
    if not os.path.exists(perf_csv):
        return {"error": f"File not found: {perf_csv}"}

    targets = []
    seen = set()

    with open(perf_csv, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            clip_id = row.get("clip_id", row.get("id", ""))
            platform = row.get("platform", "tiktok")
            key = f"{platform}:{clip_id}"

            if key in seen:
                continue
            seen.add(key)

            views = int(row.get("views", 0))
            likes = int(row.get("likes", 0))
            saves = int(row.get("saves", row.get("bookmarks", 0)))

            # Assign layer based on performance
            engagement = (likes + saves * 4) / max(views, 1)
            if engagement > 0.25:
                layer = 1
            elif engagement > 0.10:
                layer = 3
            else:
                layer = 5

            targets.append({
                "platform": platform,
                "username": clip_id,
                "display_name": row.get("filename", ""),
                "url": "",
                "category": "content",
                "followers": str(views),
                "link_in_bio": "false",
                "layer": str(layer),
                "signals_json": f'{{"engagement_rate":{engagement:.4f}}}',
            })

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "platform", "username", "display_name", "url",
            "category", "followers", "link_in_bio", "layer", "signals_json",
        ])
        writer.writeheader()
        writer.writerows(targets)

    print(f"  [aro-bridge] {len(targets)} targets extracted → {output_path}")
    return {"targets": len(targets), "output": output_path}
