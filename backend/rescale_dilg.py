"""Rescale ALL 7,500 project budgets so the PORTFOLIO aggregate matches the spec:
  Original Budget: 79,306,867,400
  Current Budget:  88,163,083,700
  Total Increase:   8,856,216,300
Flag booleans are preserved (already stored). F1_detail text is regenerated.
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

projects = list(db.projects.find({}, {"_id": 0}))
cur_orig = sum(float(p.get("approved_budget", 0)) for p in projects)
cur_curr = sum(float(p.get("current_budget",  0)) for p in projects)
so = TARGET_ORIG / cur_orig
sc = TARGET_CURR / cur_curr
print(f"Total rows: {len(projects)}")
print(f"Before: orig={cur_orig:,.0f} curr={cur_curr:,.0f}")
print(f"Scale : orig×{so:.6f} curr×{sc:.6f}")

new_orig = new_curr = 0.0
for p in projects:
    o = float(p.get("approved_budget", 0)) * so
    c = float(p.get("current_budget",  0)) * sc
    old_c = float(p.get("current_budget", 0)) or 1
    disb = float(p.get("disbursed_amount", 0)) * (c / old_c)
    db.projects.update_one(
        {"id": p["id"]},
        {"$set": {"approved_budget": o, "current_budget": c, "disbursed_amount": disb}},
    )
    pct = ((c - o) / o * 100) if o else 0
    f = db.project_flags.find_one({"project_id": p["id"]}, {"_id": 0})
    if f and f.get("F1"):
        db.project_flags.update_one(
            {"project_id": p["id"]},
            {"$set": {"F1_detail": f"Budget increased {pct:.2f}% (PHP {c - o:,.0f})."}}
        )
    new_orig += o; new_curr += c

# Absorb tiny floating-point drift on the largest single project so totals land exact
drift_o = TARGET_ORIG - new_orig
drift_c = TARGET_CURR - new_curr
if abs(drift_o) > 0.001 or abs(drift_c) > 0.001:
    biggest = max(projects, key=lambda p: float(p.get("current_budget", 0)))
    doc = db.projects.find_one({"id": biggest["id"]}, {"_id": 0})
    db.projects.update_one(
        {"id": biggest["id"]},
        {"$set": {
            "approved_budget": float(doc["approved_budget"]) * so + drift_o,
            "current_budget":  float(doc["current_budget"])  * sc + drift_c,
        }}
    )

# Recount
final_o = sum(float(p["approved_budget"]) for p in db.projects.find({}, {"approved_budget": 1}))
final_c = sum(float(p["current_budget"])  for p in db.projects.find({}, {"current_budget": 1}))
print(f"After : orig={final_o:,.0f} curr={final_c:,.0f} Δ={final_c - final_o:,.0f}")
print(f"Targets:orig={TARGET_ORIG:,.0f} curr={TARGET_CURR:,.0f} Δ={TARGET_CURR - TARGET_ORIG:,.0f}")
