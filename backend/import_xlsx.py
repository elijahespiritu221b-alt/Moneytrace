"""One-shot importer for MONEYTRACE_DILG_6000_Misamis_Oriental.xlsx.
Wipes projects/flags/audit and re-seeds from the workbook, preserving pre-computed F1-F6 + alert levels.
Run: python /app/backend/import_xlsx.py [xlsx_path]
"""
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import openpyxl
from pymongo import MongoClient

DB_NAME = os.environ["DB_NAME"]
MONGO_URL = os.environ["MONGO_URL"]

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

xlsx_path = sys.argv[1] if len(sys.argv) > 1 else "/app/uploads/dilg.xlsx"
print(f"Reading {xlsx_path}")

wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
ws = wb["All_DILG_6000"]

FLAG_MAP = {"Flagged": True, "Not Flagged": False}
LEVEL_MAP = {"Green": "green", "Yellow": "yellow", "Orange": "orange", "Red": "red"}

def _iso(x):
    if isinstance(x, datetime):
        return x.replace(tzinfo=timezone.utc).isoformat()
    return None

now_iso = datetime.now(timezone.utc).isoformat()

# Wipe project-scoped data (keep users, rule_config)
print("Wiping projects, flags, audit, ai_reviews, change_requests…")
db.projects.delete_many({})
db.project_flags.delete_many({})
db.audit_logs.delete_many({})
db.ai_reviews.delete_many({})
db.change_requests.delete_many({})

projects = []
flags_docs = []
headers = None

for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i == 0:
        headers = row
        continue
    if not row[0]:
        continue
    d = dict(zip(headers, row))
    pid = d["Project_ID"]

    mod_count = int(d.get("Modification_Count") or 0)
    mods = [
        {"date": now_iso, "reason": f"Recorded contract modification #{k+1}", "delta_amount": 0.0}
        for k in range(mod_count)
    ]

    pay_amt = float(d.get("Payment_Amount_PHP") or 0)
    payments = (
        [{"date": now_iso, "milestone": "Aggregate disbursement", "amount": pay_amt, "verified_progress_pct": 0.0}]
        if pay_amt > 0 else []
    )

    orig = float(d.get("Original_Budget_PHP") or 0)
    curr = float(d.get("Current_Budget_PHP") or 0)

    p = {
        "id": pid,
        "title": d["Project_Name"],
        "agency": d["Office_Agency"],
        "office_code": d.get("Office_Code"),
        "organizational_unit": d.get("Organizational_Unit"),
        "municipality": d["Municipality_City"],
        "barangay": d.get("Barangay"),
        "project_type": d["Project_Type"],
        "status": d["Project_Status"],
        "fiscal_year": d.get("Fiscal_Year"),
        "approved_budget": orig,
        "current_budget": curr,
        "disbursed_amount": pay_amt,
        "contractor": d.get("Entity_Name") or "—",
        "entity_id": d.get("Entity_ID"),
        "entity_role": d.get("Entity_Role"),
        "start_date": _iso(d.get("Contract_Start_Date")),
        "end_date": _iso(d.get("Proposed_End_Date")),
        "actual_end_date": _iso(d.get("Actual_End_Date")),
        "location": {
            "lat": float(d["Latitude"]) if d.get("Latitude") is not None else 0.0,
            "lng": float(d["Longitude"]) if d.get("Longitude") is not None else 0.0,
            "address": f"{d.get('Barangay', '')}, {d['Municipality_City']}".strip(", "),
        },
        "modifications": mods,
        "payments": payments,
        "geo_verified": not FLAG_MAP.get(d.get("F6_Physical_Flag"), False),
        "published": True,
        "cost_per_unit": None,
        "unit_metric": None,
        "description": (
            f"{d.get('Project_Type', '')} — {d.get('Organizational_Unit', '')} — FY {d.get('Fiscal_Year', '')} — "
            f"Location: {d.get('Barangay', '')}, {d.get('Municipality_City', '')}"
        ),
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    projects.append(p)

    f1 = FLAG_MAP.get(d.get("F1_Budget_Flag"), False)
    f2 = FLAG_MAP.get(d.get("F2_Modification_Flag"), False)
    f3 = FLAG_MAP.get(d.get("F3_Payment_Flag"), False)
    f4 = FLAG_MAP.get(d.get("F4_Statistical_Flag"), False)
    f5 = FLAG_MAP.get(d.get("F5_Date_Flag"), False)
    f6 = FLAG_MAP.get(d.get("F6_Physical_Flag"), False)
    bud_pct = float(d.get("Budget_Increase_Percent") or 0)
    delta = curr - orig
    z = float(d.get("Z_Score") or 0)
    days = int(d.get("Days_Overdue") or 0)
    pay_disc = float(d.get("Payment_Discrepancy_PHP") or 0)

    flags_docs.append({
        "project_id": pid,
        "F1": f1, "F2": f2, "F3": f3, "F4": f4, "F5": f5, "F6": f6,
        "F1_detail": f"Budget increased {bud_pct}% (PHP {delta:,.0f})." if f1 else "",
        "F2_detail": f"{mod_count} contract modifications recorded — exceeds threshold." if f2 else "",
        "F3_detail": f"Payment discrepancy of PHP {pay_disc:,.0f} vs recorded progress." if f3 else "",
        "F4_detail": f"Cost profile deviates {z:+.2f}σ from peer benchmark." if f4 else "",
        "F5_detail": f"Schedule overdue by {days} days." if f5 else "",
        "F6_detail": "GIS coordinate verification pending." if f6 else "",
        "alert_level": LEVEL_MAP.get(d.get("Overall_Alert_Level"), "green"),
        "core_count": int(d.get("Primary_Anomaly_Score") or 0),
        "computed_at": now_iso,
    })

    if len(projects) % 1000 == 0:
        print(f"  parsed {len(projects)} rows…")

print(f"Bulk inserting {len(projects)} projects…")
# Insert in batches of 1000 to avoid BSON size limits
for i in range(0, len(projects), 1000):
    db.projects.insert_many(projects[i:i+1000])
    db.project_flags.insert_many(flags_docs[i:i+1000])
    print(f"  inserted {min(i+1000, len(projects))}/{len(projects)}")

# Audit entry
db.audit_logs.insert_one({
    "id": str(uuid.uuid4()),
    "timestamp": now_iso,
    "actor_id": None,
    "actor_email": "system",
    "actor_role": "system",
    "action": "SEED_IMPORT",
    "project_id": None,
    "before": None,
    "after": None,
    "note": f"Imported {len(projects)} DILG projects from MONEYTRACE_DILG_6000_Misamis_Oriental.xlsx (Misamis Oriental, 12 offices).",
})

# Ensure indexes still exist
db.projects.create_index("id", unique=True)
db.project_flags.create_index("project_id", unique=True)

# Summary
counts = {"green": 0, "yellow": 0, "orange": 0, "red": 0}
for f in flags_docs:
    counts[f["alert_level"]] = counts.get(f["alert_level"], 0) + 1
print(f"\nDone. Total: {len(projects)} projects")
print(f"Alert distribution: {counts}")
print(f"Agencies: {len(set(p['agency'] for p in projects))}")
print(f"Municipalities: {len(set(p['municipality'] for p in projects))}")
