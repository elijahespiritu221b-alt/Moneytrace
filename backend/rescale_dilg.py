"""Rescale DILG project budgets so DILG aggregate totals match the updated spec:
  Original Budget: 79,306,867,400
  Current Budget:  88,163,083,700
  Total Increase:   8,856,216,300
Flag booleans are preserved (already stored). F1_detail text is regenerated for consistency.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")
from pymongo import MongoClient

TARGET_ORIG = 79_306_867_400.0
TARGET_CURR = 88_163_083_700.0

client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

dilg = list(db.projects.find({"department": "DILG"}, {"_id": 0}))
cur_orig = sum(float(p.get("approved_budget", 0)) for p in dilg)
cur_curr = sum(float(p.get("current_budget",  0)) for p in dilg)
so = TARGET_ORIG / cur_orig
sc = TARGET_CURR / cur_curr
print(f"DILG rows: {len(dilg)}")
print(f"Before: orig={cur_orig:,.0f} curr={cur_curr:,.0f}")
print(f"Scale : orig×{so:.6f} curr×{sc:.6f}")

new_orig = new_curr = 0.0
for p in dilg:
    o = float(p.get("approved_budget", 0)) * so
    c = float(p.get("current_budget",  0)) * sc
    # keep disbursed proportional to current
    old_c = float(p.get("current_budget", 0)) or 1
    dratio = c / old_c
    disb = float(p.get("disbursed_amount", 0)) * dratio
    db.projects.update_one(
        {"id": p["id"]},
        {"$set": {"approved_budget": o, "current_budget": c, "disbursed_amount": disb}},
    )
    # Regenerate F1 detail if F1 flag is set
    pct = ((c - o) / o * 100) if o else 0
    f = db.project_flags.find_one({"project_id": p["id"]}, {"_id": 0})
    if f and f.get("F1"):
        db.project_flags.update_one(
            {"project_id": p["id"]},
            {"$set": {"F1_detail": f"Budget increased {pct:.2f}% (PHP {c - o:,.0f})."}}
        )
    new_orig += o; new_curr += c

print(f"After : orig={new_orig:,.0f} curr={new_curr:,.0f} Δ={new_curr - new_orig:,.0f}")
print(f"Diff from target: orig {new_orig - TARGET_ORIG:,.2f}, curr {new_curr - TARGET_CURR:,.2f}")
