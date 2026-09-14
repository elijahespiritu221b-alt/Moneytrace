"""Enrich DILG projects with proper Monitoring Unit taxonomy per user spec.
Adds `monitoring_unit_type` (label) and normalises `monitoring_unit` (specific value).
The existing `organizational_unit` becomes the specific unit value.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")
from pymongo import MongoClient

client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

# Per-office monitoring unit type label
UNIT_TYPE = {
    "BLGS":     "Division / Area Monitoring Unit",
    "BLGD":     "Division / Area Monitoring Unit",
    "NBOO":     "Barangay / City / Municipality Monitoring Unit",
    "OPDS":     "Project Monitoring Unit / Division",
    "PNP":      "Police District / Station / Unit",
    "BFP":      "Fire District / Fire Station",
    "BJMP":     "Jail Facility / Jail Unit",
    "NAPOLCOM": "Regional Office / Oversight Unit",
    "PPSC":     "Constituent Training Institution",
    "LGA":      "Division / Training Center / Resource Center",
    "NYC":      "Regional / Program Unit",
    "NCMF":     "Regional / Bureau / Program Unit",
    "DEPED":    "School Division / District",
    "DOH":      "Regional / Provincial Health Office",
    "DPWH":     "District Engineering Office",
}

n = 0
for p in db.projects.find({}, {"id": 1, "office_code": 1, "organizational_unit": 1}):
    code = p.get("office_code") or "OTHER"
    unit_type = UNIT_TYPE.get(code, "Monitoring Unit")
    unit_value = p.get("organizational_unit") or "General"
    db.projects.update_one(
        {"id": p["id"]},
        {"$set": {
            "monitoring_unit_type": unit_type,
            "monitoring_unit": unit_value,
            "region": "Region X — Northern Mindanao",
        }}
    )
    n += 1

print(f"Enriched {n} projects with monitoring_unit_type + monitoring_unit + region")
