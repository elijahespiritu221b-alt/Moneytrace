"""Redistribute DepEd, DOH, DPWH projects across their real monitoring units per user spec.

DepEd — 35 school districts (13 1st LD + 22 2nd LD)
DOH   — 3 divisions (MSSD, RLED, LHSD)
DPWH  — 4 District Engineering Offices (MisOr 1st, MisOr 2nd, CDO 1st, CDO 2nd)
"""
import os, random
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")
from pymongo import MongoClient

client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

DEPED_FIRST_LD = [
    "Balingasag Central", "Balingasag North", "Balingasag South",
    "Balingoan", "Kinoguitan", "Lagonglong",
    "Magsaysay I", "Magsaysay II",
    "Medina North", "Medina South",
    "Salay", "Sugbongcogon", "Talisayan",
]
DEPED_SECOND_LD = [
    "Alubijid East", "Alubijid West",
    "Claveria Central", "Claveria Northeast", "Claveria West",
    "Gitagum", "Initao North", "Initao South",
    "Jasaan North", "Jasaan South",
    "Laguindingan", "Libertad", "Lugait", "Manticao", "Naawan",
    "Opol East", "Opol West",
    "Tagoloan East", "Tagoloan West",
    "Villanueva North", "Villanueva South",
    "MOGCHS",
]
DEPED_ALL = [(d, "1st Legislative District") for d in DEPED_FIRST_LD] + \
            [(d, "2nd Legislative District") for d in DEPED_SECOND_LD]

# Approx coordinates per district (derived from municipality)
MUNI_COORDS = {
    "Balingasag": (8.744, 124.774), "Balingoan": (8.960, 124.855),
    "Kinoguitan": (9.075, 124.812), "Lagonglong": (8.809, 124.808),
    "Magsaysay": (8.780, 124.680), "Medina": (8.906, 125.015),
    "Salay": (8.855, 124.815), "Sugbongcogon": (8.980, 124.755),
    "Talisayan": (9.030, 124.945), "Alubijid": (8.573, 124.466),
    "Claveria": (8.610, 124.900), "Gitagum": (8.549, 124.463),
    "Initao": (8.499, 124.316), "Jasaan": (8.657, 124.752),
    "Laguindingan": (8.590, 124.445), "Libertad": (8.553, 124.362),
    "Lugait": (8.399, 124.238), "Manticao": (8.417, 124.286),
    "Naawan": (8.436, 124.290), "Opol": (8.518, 124.590),
    "Tagoloan": (8.535, 124.756), "Villanueva": (8.578, 124.789),
    "MOGCHS": (8.485, 124.647),
}
def _muni_from_district(d):
    for k in MUNI_COORDS:
        if k in d: return k, MUNI_COORDS[k]
    return "Cagayan de Oro City", (8.485, 124.647)


DOH_DIVISIONS = [
    ("MSSD", "Management Support Services Division"),
    ("RLED", "Regulations, Licensing and Enforcement Division"),
    ("LHSD", "Local Health Support Division"),
]

DPWH_DEO = [
    ("MisOr-1st-DEO", "Misamis Oriental 1st District Engineering Office"),
    ("MisOr-2nd-DEO", "Misamis Oriental 2nd District Engineering Office"),
    ("CDO-1st-DEO",   "Cagayan de Oro City 1st District Engineering Office"),
    ("CDO-2nd-DEO",   "Cagayan de Oro City 2nd District Engineering Office"),
]


random.seed(7)

# -------- DepEd: distribute 500 across 35 districts --------
deped = list(db.projects.find({"office_code": "DEPED"}, {"_id": 1, "id": 1}))
random.shuffle(deped)
# roughly even distribution: 500/35 ≈ 14 per district
for i, p in enumerate(deped):
    district, ld = DEPED_ALL[i % len(DEPED_ALL)]
    muni, coords = _muni_from_district(district)
    lat = coords[0] + random.uniform(-0.02, 0.02)
    lng = coords[1] + random.uniform(-0.02, 0.02)
    db.projects.update_one({"id": p["id"]}, {"$set": {
        "monitoring_unit_type": "School District",
        "monitoring_unit": district,
        "organizational_unit": ld,   # 1st or 2nd Legislative District
        "district": district,
        "legislative_district": ld,
        "municipality": muni,
        "location": {"lat": lat, "lng": lng, "address": f"{district}, {muni}"},
    }})
print(f"DepEd: distributed {len(deped)} projects across {len(DEPED_ALL)} school districts")

# -------- DOH: distribute 500 across 3 divisions --------
doh = list(db.projects.find({"office_code": "DOH"}, {"_id": 1, "id": 1}))
random.shuffle(doh)
for i, p in enumerate(doh):
    code, name = DOH_DIVISIONS[i % 3]
    db.projects.update_one({"id": p["id"]}, {"$set": {
        "monitoring_unit_type": "DOH Division",
        "monitoring_unit": code,
        "organizational_unit": name,
        "division": name,
    }})
print(f"DOH: distributed {len(doh)} projects across {len(DOH_DIVISIONS)} divisions")

# -------- DPWH: distribute 500 across 4 District Engineering Offices --------
dpwh = list(db.projects.find({"office_code": "DPWH"}, {"_id": 1, "id": 1}))
random.shuffle(dpwh)
DPWH_MUNI = {
    "MisOr-1st-DEO": ["Alubijid", "Balingasag", "Balingoan", "Gitagum", "Initao", "Laguindingan", "Libertad", "Lugait", "Manticao", "Naawan"],
    "MisOr-2nd-DEO": ["Claveria", "Jasaan", "Kinoguitan", "Lagonglong", "Magsaysay", "Medina", "Opol", "Salay", "Sugbongcogon", "Tagoloan", "Talisayan", "Villanueva"],
    "CDO-1st-DEO":   ["Cagayan de Oro City"],
    "CDO-2nd-DEO":   ["Cagayan de Oro City"],
}
for i, p in enumerate(dpwh):
    code, name = DPWH_DEO[i % 4]
    muni = random.choice(DPWH_MUNI[code])
    coords = MUNI_COORDS.get(muni, (8.485, 124.647))
    lat = coords[0] + random.uniform(-0.02, 0.02)
    lng = coords[1] + random.uniform(-0.02, 0.02)
    db.projects.update_one({"id": p["id"]}, {"$set": {
        "monitoring_unit_type": "District Engineering Office",
        "monitoring_unit": code,
        "organizational_unit": name,
        "district_engineering_office": name,
        "municipality": muni,
        "location": {"lat": lat, "lng": lng, "address": f"{muni}"},
    }})
print(f"DPWH: distributed {len(dpwh)} projects across {len(DPWH_DEO)} District Engineering Offices")
