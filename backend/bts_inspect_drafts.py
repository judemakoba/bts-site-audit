#!/usr/bin/env python3
"""Inspect drafts on LXC 203 and save results to a file."""
import json, os

data_path = "/opt/bts-audit/data.json"
out_path = "/tmp/drafts_report.txt"

with open(data_path) as f:
    d = json.load(f)

records = d.get("records", {})
drafts = {k: v for k, v in records.items() if "draft" in k.lower()}

lines = []
lines.append(f"Total records: {len(records)}")
lines.append(f"Draft records: {len(drafts)}")

# Find Mwesigwa Tom drafts
mwdrafts = {}
for k, v in drafts.items():
    cb = v.get("captured_by", "")
    if "mwesigwa" in cb.lower() or "tom" in cb.lower():
        mwdrafts[k] = v

lines.append(f"Mwesigwa Tom drafts: {len(mwdrafts)}")
lines.append("")

if mwdrafts:
    for k, v in mwdrafts.items():
        lines.append(f"--- Draft: {k} ---")
        lines.append(f"  captured_by: {v.get('captured_by', 'N/A')}")
        lines.append(f"  site_id: {v.get('site_id', 'N/A')}")
        lines.append(f"  site_name: {v.get('site_name', 'N/A')}")
        lines.append(f"  updated_at: {v.get('updated_at', 'N/A')}")
        photos = v.get("photos", [])
        lines.append(f"  photos count: {len(photos)}")
        for p in photos:
            lines.append(f"    {p}")
        lines.append(f"  tower_data present: {'tower_data' in v}")
        lines.append(f"  dcdb_data present: {'dcdb_data' in v}")
        lines.append(f"  ground_data present: {'ground_data' in v}")
        lines.append(f"  keys: {list(v.keys())}")
        lines.append("")
else:
    lines.append("No Mwesigwa Tom drafts found.")
    lines.append("")
    lines.append("All draft captured_by values:")
    for k, v in list(drafts.items())[:10]:
        lines.append(f"  {k}: captured_by={v.get('captured_by','N/A')}, site={v.get('site_id','N/A')}")

with open(out_path, "w") as f:
    f.write("\n".join(lines))

print(f"Report written to {out_path}")
print(f"Total records: {len(records)}, Drafts: {len(drafts)}, Mwesigwa Tom drafts: {len(mwdrafts)}")
