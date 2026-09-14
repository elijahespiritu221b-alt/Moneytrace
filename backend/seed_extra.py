"""Generate + insert 1500 additional projects (DepEd 500, DOH 500, DPWH 500)
per MONEYTRACE_UPDATED_COMPLETE_SPECIFICATION_VERIFIED.pdf.

Preserves the same F1-F6 semantics used by the DILG dataset (pre-computed flags):
  F1: Budget increase >= 20%
  F2: Modification Count > 5
  F3: Payment Discrepancy > 0
  F4: |Z| >= 2.0
  F5: Days Overdue >= 90
  F6: Physical/geospatial verification pending

Also tags every project with a `department` field (DILG / DepEd / DOH / DPWH)
so the frontend can present separate tabs.
"""
import os
import sys
import uuid
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from pymongo import MongoClient

client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
now_iso = datetime.now(timezone.utc).isoformat()


# ---------- Department definitions (per spec) ----------
CDO_DISTRICT_35_BARANGAYS = [
    "Barangay 1", "Carmen", "Puerto", "Lapasan", "Nazareth",
    "Kauswagan", "Gusa", "Macasandig", "Bulua", "Balubal",
]
MISOR_MUNICIPALITIES = [
    "El Salvador City", "Gingoog City", "Opol", "Tagoloan", "Villanueva",
    "Jasaan", "Balingasag", "Carmen", "Alubijid", "Initao", "Manticao",
    "Naawan", "Laguindingan", "Libertad", "Salay", "Sugbongcogon",
    "Kinoguitan", "Talisayan", "Balingoan", "Medina", "Magsaysay", "Claveria",
]
CDO_COORDS = (8.485, 124.647)
BASE_COORDS = {
    "El Salvador City": (8.567, 124.520), "Gingoog City": (8.828, 125.101),
    "Opol": (8.518, 124.590), "Tagoloan": (8.535, 124.756),
    "Villanueva": (8.578, 124.789), "Jasaan": (8.657, 124.752),
    "Balingasag": (8.744, 124.774), "Carmen": (8.500, 124.630),
    "Alubijid": (8.573, 124.466), "Initao": (8.499, 124.316),
    "Manticao": (8.417, 124.286), "Naawan": (8.436, 124.290),
    "Laguindingan": (8.590, 124.445), "Libertad": (8.553, 124.362),
    "Salay": (8.855, 124.815), "Sugbongcogon": (8.980, 124.755),
    "Kinoguitan": (9.075, 124.812), "Talisayan": (9.030, 124.945),
    "Balingoan": (8.960, 124.855), "Medina": (8.906, 125.015),
    "Magsaysay": (8.780, 124.680), "Claveria": (8.610, 124.900),
    "Cagayan de Oro City": CDO_COORDS,
}
DEPTS = {
    "DepEd": {
        "agency": "Department of Education",
        "office_code": "DEPED",
        "types": [
            "School Building Construction",
            "Classroom Construction",
            "School Furniture Procurement",
            "Learning Materials Distribution",
            "SBM Assistance Program",
            "Water Sanitation Facility",
            "Multipurpose Hall",
        ],
        "org_units": ["Division of CDO", "Division of Misamis Oriental", "SDO Cagayan de Oro District 35", "Regional Office X"],
        "roles": ["Project Manager", "Site Engineer", "Procurement Officer", "Inspector"],
    },
    "DOH": {
        "agency": "Department of Health",
        "office_code": "DOH",
        "types": [
            "Rural Health Unit Upgrade",
            "Hospital Facility Improvement",
            "Barangay Health Station Construction",
            "Medical Equipment Procurement",
            "Immunization Campaign",
            "Ambulance Procurement",
            "Nutrition Program",
        ],
        "org_units": ["Regional Office X - Northern Mindanao", "Provincial Health Office - MisOr", "CDO City Health Office"],
        "roles": ["Project Manager", "Site Engineer", "Procurement Officer", "Finance Officer", "Inspector"],
    },
    "DPWH": {
        "agency": "Department of Public Works and Highways",
        "office_code": "DPWH",
        "types": [
            "Road Construction",
            "Road Widening",
            "Bridge Rehabilitation",
            "Flood Control Structure",
            "National Highway Improvement",
            "Drainage Rehabilitation",
            "Slope Protection",
        ],
        "org_units": ["MisOr 1st District Engineering Office (D03)", "MisOr 2nd District Engineering Office (D04)", "Regional Office X"],
        "roles": ["Project Manager", "Site Engineer", "Contract Administrator", "Safety Officer", "Inspector"],
    },
}


def _fake_lat_lng(muni):
    lat, lng = BASE_COORDS.get(muni, CDO_COORDS)
    return lat + random.uniform(-0.02, 0.02), lng + random.uniform(-0.02, 0.02)


def _synth_row(dept_key, idx, cdo_special=False):
    dept = DEPTS[dept_key]
    # 10 DepEd CDO District 35 projects per spec
    if cdo_special:
        muni = "Cagayan de Oro City"
        barangay = random.choice(CDO_DISTRICT_35_BARANGAYS)
        org_unit = "SDO Cagayan de Oro District 35"
    else:
        muni = random.choice(MISOR_MUNICIPALITIES + ["Cagayan de Oro City", "Cagayan de Oro City"])
        barangay = random.choice(["Poblacion", "San Miguel", "Buenavista", "Bagong Silang", "Pag-asa", "San Isidro", "Balubal", "Puerto"])
        org_unit = random.choice(dept["org_units"])

    ptype = random.choice(dept["types"])
    fiscal = random.choice([2024, 2025, 2026])
    status = random.choices(
        ["Completed", "Ongoing", "For Implementation"],
        weights=[3, 4, 3],
    )[0]

    orig = random.choice([2_800_000, 5_400_000, 9_500_000, 15_200_000, 22_600_000, 38_900_000, 65_000_000])
    # F1 candidate
    if random.random() < 0.20:
        curr = orig * random.uniform(1.20, 1.55)
    elif random.random() < 0.30:
        curr = orig * random.uniform(1.02, 1.19)
    else:
        curr = orig
    pct = (curr - orig) / orig * 100 if orig else 0

    mod_count = random.choices([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], weights=[15, 20, 20, 15, 10, 8, 4, 3, 3, 2])[0]

    pay_amt = curr * random.uniform(0.05, 0.85)
    if random.random() < 0.22:
        pay_disc = pay_amt * random.uniform(0.03, 0.30)
    else:
        pay_disc = 0

    z = random.gauss(0, 1.1)
    days_overdue = 0
    start_dt = datetime(fiscal, random.randint(1, 11), random.randint(1, 27))
    dur = random.randint(120, 720)
    end_dt = start_dt + timedelta(days=dur)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    actual_end = None
    if status == "Completed":
        actual_end = end_dt + timedelta(days=random.randint(-30, 200))
        if (actual_end - end_dt).days >= 90:
            days_overdue = (actual_end - end_dt).days
    elif status == "Ongoing" and end_dt < now:
        days_overdue = (now - end_dt).days

    f6_flag = random.random() < 0.25

    f1 = pct >= 20.0
    f2 = mod_count > 5
    f3 = pay_disc > 0
    f4 = abs(z) >= 2.0
    f5 = days_overdue >= 90

    core = int(f1) + int(f2) + int(f3) + int(f4)
    if core == 0:
        level = "green"
    elif core == 1:
        level = "yellow"
    elif core == 2:
        level = "orange"
    else:
        level = "red"

    lat, lng = _fake_lat_lng(muni)
    role = random.choice(dept["roles"])
    entity_id = f"ENT-{random.randint(1, 3500):04d}"
    entity_name = f"Juan Dela Cruz {random.randint(1, 300)}"
    contractor = entity_name

    pid = f"{dept['office_code']}-{idx:04d}"

    proj = {
        "id": pid,
        "title": f"{ptype} - {muni} {idx:03d}",
        "department": dept_key,
        "agency": dept["agency"],
        "office_code": dept["office_code"],
        "organizational_unit": org_unit,
        "municipality": muni,
        "barangay": barangay,
        "project_type": ptype,
        "status": status,
        "fiscal_year": fiscal,
        "approved_budget": float(orig),
        "current_budget": float(curr),
        "disbursed_amount": float(pay_amt),
        "contractor": contractor,
        "entity_id": entity_id,
        "entity_role": role,
        "start_date": start_dt.replace(tzinfo=timezone.utc).isoformat(),
        "end_date": end_dt.replace(tzinfo=timezone.utc).isoformat(),
        "actual_end_date": actual_end.replace(tzinfo=timezone.utc).isoformat() if actual_end else None,
        "location": {"lat": lat, "lng": lng, "address": f"{barangay}, {muni}"},
        "modifications": [
            {"date": now_iso, "reason": random.choice(["Scope expansion", "Site condition change", "Material cost adjustment", "Weather delay"]), "delta_amount": 0.0}
            for _ in range(mod_count)
        ],
        "payments": [{"date": now_iso, "milestone": "Aggregate disbursement", "amount": pay_amt, "verified_progress_pct": 0.0}] if pay_amt > 0 else [],
        "geo_verified": not f6_flag,
        "published": True,
        "cost_per_unit": None,
        "unit_metric": None,
        "description": f"{ptype} — {org_unit} — FY {fiscal} — Location: {barangay}, {muni}",
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    flag_doc = {
        "project_id": pid,
        "F1": f1, "F2": f2, "F3": f3, "F4": f4, "F5": f5, "F6": f6_flag,
        "F1_detail": f"Budget increased {pct:.2f}% (PHP {curr - orig:,.0f})." if f1 else "",
        "F2_detail": f"{mod_count} contract modifications recorded — exceeds threshold of 5." if f2 else "",
        "F3_detail": f"Payment discrepancy of PHP {pay_disc:,.0f} vs recorded progress." if f3 else "",
        "F4_detail": f"Cost profile deviates {z:+.2f}σ from peer benchmark." if f4 else "",
        "F5_detail": f"Schedule overdue by {days_overdue} days." if f5 else "",
        "F6_detail": "GIS coordinate verification pending." if f6_flag else "",
        "alert_level": level,
        "core_count": core,
        "computed_at": now_iso,
    }
    return proj, flag_doc


def _tag_dilg():
    """Backfill department=DILG on existing rows if missing."""
    db.projects.update_many({"department": {"$exists": False}}, {"$set": {"department": "DILG"}})


def main():
    random.seed(42)

    _tag_dilg()

    # Remove any prior non-DILG synthetic rows to keep re-runs idempotent
    for code in ("DEPED", "DOH", "DPWH"):
        db.projects.delete_many({"office_code": code})
        db.project_flags.delete_many({"project_id": {"$regex": f"^{code}-"}})

    projects, flags_docs = [], []

    # DepEd — 500, with 10 in CDO District 35
    for i in range(1, 501):
        p, f = _synth_row("DepEd", i, cdo_special=(i <= 10))
        projects.append(p); flags_docs.append(f)

    # DOH — 500
    for i in range(1, 501):
        p, f = _synth_row("DOH", i)
        projects.append(p); flags_docs.append(f)

    # DPWH — 500
    for i in range(1, 501):
        p, f = _synth_row("DPWH", i)
        projects.append(p); flags_docs.append(f)

    for i in range(0, len(projects), 500):
        db.projects.insert_many(projects[i:i + 500])
        db.project_flags.insert_many(flags_docs[i:i + 500])
        print(f"  inserted {min(i + 500, len(projects))}/{len(projects)}")

    db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "timestamp": now_iso,
        "actor_id": None, "actor_email": "system", "actor_role": "system",
        "action": "SEED_IMPORT",
        "project_id": None, "before": None, "after": None,
        "note": f"Added {len(projects)} additional projects: DepEd (500), DOH (500), DPWH (500) per updated 7,500-record spec.",
    })

    total = db.projects.count_documents({})
    by_dept = {}
    for d in db.projects.aggregate([{"$group": {"_id": "$department", "n": {"$sum": 1}}}]):
        by_dept[d["_id"]] = d["n"]
    print(f"\nTotal projects: {total}")
    print(f"By department: {by_dept}")


if __name__ == "__main__":
    main()
