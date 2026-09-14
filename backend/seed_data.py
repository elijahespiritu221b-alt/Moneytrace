"""Seed data for CDO / Misamis Oriental projects."""
from datetime import datetime, timezone, timedelta
import random
import uuid


AGENCIES = [
    "Department of Public Works and Highways (DPWH)",
    "CDO City Engineering Office",
    "Misamis Oriental Provincial Engineering Office",
    "National Irrigation Administration",
    "Department of Health Regional Office X",
    "MinDA / Regional Development Council",
]

MUNICIPALITIES = [
    "Cagayan de Oro City", "El Salvador City", "Gingoog City",
    "Opol", "Tagoloan", "Villanueva", "Jasaan", "Balingasag",
    "Carmen", "Alubijid", "Initao", "Manticao",
]

TYPES = ["Roads", "Bridges", "Water", "Buildings", "Flood Control"]

STATUSES = ["Planning", "Ongoing", "Completed", "On Hold"]

CONTRACTORS = [
    "Northern Mindanao Construction Corp.", "MinCon Builders Inc.",
    "Cagayan Infra Ventures", "Prime Coastal Engineering",
    "Bukidnon Mountain Contractors", "Golden Ridge Developers",
]

# Real-ish CDO/MisOr project names
REAL_TITLES = [
    ("Macabalan Coastal Bypass Road Phase 2", "Roads", "Cagayan de Oro City", 9.005, 124.660),
    ("CDO River Flood Risk Management Project", "Flood Control", "Cagayan de Oro City", 8.485, 124.647),
    ("Carmen Bridge Rehabilitation", "Bridges", "Carmen", 8.500, 124.630),
    ("El Salvador Public Market Modernization", "Buildings", "El Salvador City", 8.567, 124.520),
    ("Gingoog Municipal Water System Expansion", "Water", "Gingoog City", 8.828, 125.101),
    ("Tagoloan Riverside Dike Construction", "Flood Control", "Tagoloan", 8.535, 124.756),
    ("Opol Coastal Road Widening", "Roads", "Opol", 8.518, 124.590),
    ("Balingasag District Hospital Wing", "Buildings", "Balingasag", 8.744, 124.774),
    ("Villanueva Pier Access Road", "Roads", "Villanueva", 8.578, 124.789),
    ("Jasaan Elementary School Complex", "Buildings", "Jasaan", 8.657, 124.752),
    ("Alubijid Irrigation Canal Repair", "Water", "Alubijid", 8.573, 124.466),
    ("Initao National Highway Pavement", "Roads", "Initao", 8.499, 124.316),
    ("Manticao Bridge Retrofitting", "Bridges", "Manticao", 8.417, 124.286),
    ("CDO Flyover Traffic Realignment", "Bridges", "Cagayan de Oro City", 8.480, 124.652),
    ("Gingoog Coastal Embankment", "Flood Control", "Gingoog City", 8.820, 125.108),
    ("Sitio Puerto Farm-to-Market Road", "Roads", "Alubijid", 8.605, 124.470),
    ("Bugo Public Health Center Upgrade", "Buildings", "Cagayan de Oro City", 8.514, 124.721),
    ("Salay River Drainage System", "Flood Control", "Balingasag", 8.855, 124.815),
    ("Iponan Bridge Approach Widening", "Bridges", "Cagayan de Oro City", 8.489, 124.585),
    ("Puerto Water Reservoir Construction", "Water", "Cagayan de Oro City", 8.500, 124.720),
]


UNIT_METRIC = {"Roads": "PHP/km", "Bridges": "PHP/m", "Water": "PHP/household", "Buildings": "PHP/sqm", "Flood Control": "PHP/m"}
BASE_UNIT = {"Roads": 25_000_000, "Bridges": 3_500_000, "Water": 45_000, "Buildings": 65_000, "Flood Control": 2_100_000}


def _dt(days_offset: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days_offset)


def build_seed_projects() -> list:
    random.seed(42)
    projects = []
    for i, (title, ptype, muni, lat, lng) in enumerate(REAL_TITLES):
        pid = str(uuid.uuid4())
        approved = random.choice([80_000_000, 150_000_000, 220_000_000, 45_000_000, 310_000_000, 95_000_000])
        # Trigger some F1s
        current = approved
        if i % 4 == 0:
            current = approved * random.uniform(1.22, 1.5)
        elif i % 7 == 0:
            current = approved * 1.08
        # Modifications
        n_mods = random.choice([0, 1, 2, 3, 6, 8, 4]) if i % 3 == 0 else random.choice([0, 1, 2])
        mods = [
            {"date": _dt(-60 - k * 25).isoformat(),
             "reason": random.choice(["Scope expansion", "Site condition change", "Material cost adjustment", "Weather delay"]),
             "delta_amount": random.uniform(-2_000_000, 8_000_000)}
            for k in range(n_mods)
        ]
        # Status + schedule
        status = random.choices(STATUSES, weights=[1, 5, 3, 1])[0]
        start_offset = random.randint(-720, -120)
        duration = random.randint(180, 540)
        start = _dt(start_offset)
        end = start + timedelta(days=duration)
        actual_end = None
        if status == "Completed":
            actual_end = end + timedelta(days=random.randint(-30, 120))
        # Payments (introduce F3 sometimes)
        disbursed = 0.0
        payments = []
        n_pays = random.randint(0, 5)
        for k in range(n_pays):
            amt = current * random.uniform(0.08, 0.25)
            prog = min(100, (k + 1) * random.uniform(15, 25))
            # Inject F3 mismatches on some
            if i % 5 == 0:
                prog = prog * 0.55
            payments.append({
                "date": (_dt(start_offset + (k + 1) * 60)).isoformat(),
                "milestone": f"Milestone {k+1}",
                "amount": amt,
                "verified_progress_pct": prog,
            })
            disbursed += amt
        # cost per unit (introduce F4 outliers on some)
        base = BASE_UNIT[ptype]
        multiplier = random.uniform(0.8, 1.2)
        if i % 6 == 0:
            multiplier = random.uniform(1.7, 2.4)  # outlier high
        cpu = base * multiplier
        geo_verified = (i % 3 != 0)  # ~1/3 pending -> F6

        projects.append({
            "id": pid,
            "title": title,
            "agency": random.choice(AGENCIES),
            "municipality": muni,
            "project_type": ptype,
            "status": status,
            "approved_budget": float(approved),
            "current_budget": float(current),
            "disbursed_amount": float(disbursed),
            "contractor": random.choice(CONTRACTORS),
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "actual_end_date": actual_end.isoformat() if actual_end else None,
            "location": {"lat": lat + random.uniform(-0.015, 0.015), "lng": lng + random.uniform(-0.015, 0.015), "address": muni},
            "modifications": mods,
            "payments": payments,
            "geo_verified": geo_verified,
            "published": True,
            "cost_per_unit": cpu,
            "unit_metric": UNIT_METRIC[ptype],
            "description": f"Infrastructure project delivered by {random.choice(CONTRACTORS)} across {muni}.",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    return projects
