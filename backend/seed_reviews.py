"""Seed 100 fake reviews across the DB:
- 34 AI Reviews (Claude-style advisory notes attached to flagged projects)
- 33 Public Complaints (citizen submissions with mixed statuses/categories)
- 33 Change Requests (reviewer-driven sensitive edits with AI risk notes + decisions)

Reviews reference REAL flag details so they read as believable audit context.

Usage:
    cd /app/backend && python seed_reviews.py
    cd /app/backend && python seed_reviews.py --wipe   # clear existing seeded fakes first
"""
import argparse
import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient

random.seed(42)

SEED_TAG = "seeded:v1"  # so we can wipe just these later

MODELS = ["claude-sonnet-5", "claude-haiku-4-5-20251001"]
PROMPT_VERSION = "v1.0"

REVIEWERS = [
    ("reviewer@moneytrace.gov.ph", "Senior Reviewer"),
    ("elijahespiritu221b@gmail.com", "Elijah Espiritu"),
    ("mmaglasang@moneytrace.gov.ph", "M. Maglasang"),
    ("jrosales@moneytrace.gov.ph", "J. Rosales"),
    ("aacosta@moneytrace.gov.ph", "A. Acosta"),
]

COMPLAINT_CATEGORIES = ["Financial", "Delay", "Quality", "Missing progress", "Other"]
COMPLAINT_STATUSES = ["new", "under_review", "resolved", "dismissed"]
SUBMITTERS = [
    ("Maria Dela Cruz", "maria.dc@gmail.com"),
    ("Juan Ramirez", "juan.r@yahoo.com"),
    ("Concerned Citizen", None),
    ("Roberto Sy", "rsy@outlook.com"),
    ("Angela Reyes", "angreyes@gmail.com"),
    ("Baranggay Watch CDO", "watch.cdo@proton.me"),
    ("Anonymous", None),
    ("Pedro Villanueva", "pvilla@gmail.com"),
    ("Grace Bautista", "gbautista@yahoo.com"),
    ("Chester Lim", "clim@gmail.com"),
]

COMPLAINT_TITLES = {
    "Financial": [
        "Unexplained budget inflation on this project",
        "Suspicious payment schedule not matching progress",
        "Billboard shows higher amount than what is actually being built",
        "Suppliers reportedly overpriced compared to market rate",
        "No BAC posting for the awarded contract",
    ],
    "Delay": [
        "Project stalled for months — nothing happening on site",
        "Contractor abandoned the site last quarter",
        "Deadline passed but no completion in sight",
        "Repeated delays with no explanation from the office",
    ],
    "Quality": [
        "Concrete cracking barely a month after pouring",
        "Substandard materials used on the rehabilitation",
        "Newly installed roofing already leaking during first rain",
        "Poor workmanship on the drainage section",
    ],
    "Missing progress": [
        "Site is untouched but records say 60% complete",
        "Signage claims completion but nothing has been built",
        "No visible progress despite reported disbursements",
    ],
    "Other": [
        "Signage says one thing, actual scope is different",
        "Trees cut down that were not covered by the plan",
        "Community was not consulted before groundbreaking",
    ],
}

COMPLAINT_BODIES = [
    "Our barangay has been trying to get answers about this project for weeks. The billboard clearly indicates a specific budget amount and completion date, but on the ground there is barely any construction activity. Neighbors have documented photos for the past three months showing no meaningful progress. We are respectfully asking MONEYTRACE reviewers to look into the actual disbursement records and verify whether the payments align with what has been physically delivered.",
    "As a taxpayer and homeowner directly adjacent to this site, I want to formally report that the reported project cost does not appear consistent with similar projects in nearby barangays. Please review whether the current budget increase is justified. The change appears to have happened without any public consultation or bidding notice.",
    "We had a small community meeting where the punong barangay showed the plans. However, what is now being built does not match those plans. Sections that were supposed to include drainage are being paved over without pipes. Please send an engineer for physical verification before more milestone payments are released.",
    "This is the third time I am filing something about this same road project. The contractor has changed at least once, the deadline has been extended multiple times, and yet the disbursed amount keeps going up. Something is clearly off. Please attach this complaint to your file for that project.",
    "The materials being used look visibly substandard. The aggregate is unwashed, the rebar spacing is wider than the plans indicate, and there is no visible engineer or inspector on site during work hours. Requesting a site verification with QC testing.",
    "Nothing has been built here. There is a signboard, there are stakes on the ground, but no actual construction. Yet the office keeps reporting progress. Please cross-check the physical status of this project with what has been reported and paid out.",
]

# ------------------------ AI review templates (contextual) ------------------------

FLAG_EXPLAINERS = {
    "F1": "the current budget has grown materially beyond the approved amount",
    "F2": "the modification count has crossed the configured threshold",
    "F3": "disbursed amount is drifting away from weighted verified progress",
    "F4": "cost-per-unit is a statistical outlier vs the project-type mean",
    "F5": "the scheduled end date is well past the overdue threshold",
    "F6": "geospatial verification has not been filed",
}

AUDIT_QUESTIONS_BY_FLAG = {
    "F1": [
        "Is there a signed variation order in the 201 file covering this increase?",
        "Was the budget increase disclosed in the annual investment program (AIP)?",
        "Were any add-on scopes bid out separately or lumped into a supplemental?",
    ],
    "F2": [
        "Do all modifications carry documented technical justification?",
        "Are the modifications concentrated on the same contract line items?",
        "Is any modification pushing the total > 20% of the original contract price?",
    ],
    "F3": [
        "Do milestone billings match physical progress recorded in the DUR/POW?",
        "Was the last billing certified by the resident engineer on site?",
        "Is there a re-measurement or retention issue not yet reconciled?",
    ],
    "F4": [
        "Was the cost estimate benchmarked against DPWH or DBM cost references?",
        "Are unit-rate assumptions comparable to prior year contracts?",
        "Has a shopping/canvass been done in the last 12 months?",
    ],
    "F5": [
        "Was a time extension formally filed and approved?",
        "Is liquidated damages accrual being computed and withheld?",
        "What is the last documented on-site status report?",
    ],
    "F6": [
        "Has the field engineer filed the geotagged completion photo set?",
        "Is the recorded lat/lng within the intended barangay boundary?",
        "Are any pin drift or duplicated coordinates flagged in the GIS layer?",
    ],
}


def _fmt_php(n):
    try:
        return f"PHP {float(n):,.0f}"
    except Exception:
        return "PHP 0"


def build_review_markdown(project: dict, flags: dict) -> tuple[str, str]:
    """Returns (markdown_content, risk_level: low|medium|high)."""
    triggered = [k for k in ("F1", "F2", "F3", "F4", "F5", "F6") if flags.get(k)]
    core = flags.get("core_count", 0) or 0
    alert = (flags.get("alert_level") or "green").lower()
    risk = {"red": "high", "orange": "high", "yellow": "medium", "green": "low"}.get(alert, "medium")

    lines = []
    lines.append("### Risk Summary")
    if not triggered:
        lines.append(
            f"This {project.get('project_type', 'project').lower()} in {project.get('municipality', 'the municipality')} "
            f"under {project.get('agency', 'the agency')} currently shows no active screening flags. "
            f"Budget utilization is within tolerance. Recommended monitoring cadence: routine."
        )
    else:
        joined = ", ".join(triggered)
        lines.append(
            f"This {project.get('project_type', 'project').lower()} under {project.get('agency', 'the agency')} "
            f"({project.get('municipality', 'unknown LGU')}) has {len(triggered)} triggered screening flag"
            f"{'s' if len(triggered) > 1 else ''} ({joined}). Overall alert level: {alert.upper()}. "
            f"The core-flag count of {core} suggests {'compounding indicators worth prioritizing' if core >= 2 else 'a single-vector signal — verify context before escalation'}."
        )

    lines.append("")
    lines.append("### Why This Was Flagged")
    for k in triggered:
        detail = flags.get(f"{k}_detail") or FLAG_EXPLAINERS[k]
        lines.append(f"- **{k}**: {detail}")
    if not triggered:
        lines.append("- No flags currently active. Retained for baseline advisory.")

    lines.append("")
    lines.append("### Suggested Audit Questions")
    q_pool = []
    for k in triggered or ["F1", "F3"]:
        q_pool.extend(AUDIT_QUESTIONS_BY_FLAG.get(k, []))
    random.shuffle(q_pool)
    for i, q in enumerate(q_pool[:4], 1):
        lines.append(f"{i}. {q}")

    lines.append("")
    lines.append("### Recommended Reviewer Action")
    if risk == "high":
        lines.append(
            "Advisory: prioritize this record for physical/document verification within the current review cycle. "
            "Cross-reference the 201 file, latest DUR, and any supplemental agreements. This note is advisory only — "
            "final classification remains with the assigned human reviewer."
        )
    elif risk == "medium":
        lines.append(
            "Advisory: schedule a documentary review in the next cycle. No immediate site visit required unless a "
            "corroborating complaint is filed. Ensure the responsible engineer refreshes the progress report."
        )
    else:
        lines.append(
            "Advisory: keep on routine monitoring. No escalation recommended at this time based on the current signal set."
        )

    lines.append("")
    lines.append("### Draft Reviewer Memo")
    lines.append(
        f"Project {project.get('title', '')[:90]} (agency: {project.get('agency', '')}) is under review. "
        f"Current budget stands at {_fmt_php(project.get('current_budget'))} against an approved "
        f"{_fmt_php(project.get('approved_budget'))}. Reported disbursement is "
        f"{_fmt_php(project.get('disbursed_amount'))}. "
        f"{'Active flags: ' + ', '.join(triggered) + '.' if triggered else 'No active flags at this time.'} "
        f"Recommend {'documentary + on-site verification' if risk == 'high' else 'documentary review'} "
        f"per MONEYTRACE SOP-{random.randint(2, 9)}.{random.randint(1, 4)}."
    )
    return "\n".join(lines), risk


# ------------------------ AI risk notes for change requests ------------------------

CR_FIELDS = ["current_budget", "end_date", "contractor", "status"]

CR_RISK_TEMPLATES = {
    "high": [
        "This edit represents a material change to a sensitive financial field. The proposed value diverges "
        "significantly from the baseline recorded at award. Recommend a second reviewer confirm the supporting "
        "variation order and BAC minutes before approval.",
        "The proposed change is substantial relative to the project's historical values and would materially "
        "impact utilization ratios and F1/F3 flag status. Verify audit trail attachments before deciding.",
    ],
    "medium": [
        "Moderate change. Values are within a plausible operational range, but the update should be cross-checked "
        "against the latest DUR and any pending change orders on file.",
        "Change is not unusual for this project type, but does merit a documentary check. Confirm supporting "
        "memo is attached before approving.",
    ],
    "low": [
        "Routine field update. The proposed value is consistent with the project's operational trajectory and "
        "does not appear to alter risk classification.",
        "Low-risk correction. Appears to be a data-quality adjustment rather than a substantive change to scope, "
        "schedule, or cost.",
    ],
}


def build_cr_risk_note(field: str, old, new) -> tuple[str, str]:
    if field == "current_budget":
        try:
            delta_pct = abs((float(new) - float(old)) / max(float(old), 1)) * 100
        except Exception:
            delta_pct = 0
        risk = "high" if delta_pct >= 15 else "medium" if delta_pct >= 5 else "low"
    elif field == "end_date":
        risk = "medium"
    elif field == "contractor":
        risk = "high"
    else:
        risk = "low"
    return random.choice(CR_RISK_TEMPLATES[risk]), risk


# ------------------------ Main ------------------------

async def main(wipe: bool = False):
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    if wipe:
        r1 = await db.ai_reviews.delete_many({"seed_tag": SEED_TAG})
        r2 = await db.complaints.delete_many({"seed_tag": SEED_TAG})
        r3 = await db.change_requests.delete_many({"seed_tag": SEED_TAG})
        print(f"Wiped: {r1.deleted_count} ai_reviews, {r2.deleted_count} complaints, {r3.deleted_count} change_requests")

    # Concentrate on top ~25 contractors (most projects) so entity detail pages
    # show meaningful traces. Fallback to any flagged if none pooled.
    from collections import Counter
    ctr = Counter()
    async for p in db.projects.find({}, {"contractor": 1}):
        ctr[p.get("contractor")] += 1
    top_contractors = {c for c, _ in ctr.most_common(25)}

    flagged = await db.project_flags.find(
        {"alert_level": {"$in": ["red", "orange", "yellow"]}}, {"_id": 0}
    ).to_list(4000)
    if not flagged:
        print("No flagged projects available. Aborting.")
        return

    proj_index = {}
    ids = [f["project_id"] for f in flagged]
    async for p in db.projects.find({"id": {"$in": ids}}, {"_id": 0}):
        proj_index[p["id"]] = p

    flagged = [f for f in flagged if f["project_id"] in proj_index]
    # Prefer flagged projects that belong to the top contractors
    preferred = [f for f in flagged if proj_index[f["project_id"]].get("contractor") in top_contractors]
    if len(preferred) >= 80:
        flagged = preferred
    print(f"Candidate flagged projects: {len(flagged)} (top-contractor subset preferred)")

    now = datetime.now(timezone.utc)

    # ---------- 34 AI Reviews ----------
    ai_docs = []
    for f in random.sample(flagged, min(34, len(flagged))):
        p = proj_index[f["project_id"]]
        content, risk = build_review_markdown(p, f)
        model = random.choices(MODELS, weights=[0.65, 0.35])[0]
        ts = now - timedelta(days=random.randint(0, 40), hours=random.randint(0, 23))
        reviewer_email, reviewer_name = random.choice(REVIEWERS)
        ai_docs.append({
            "id": str(uuid.uuid4()),
            "project_id": p["id"],
            "project_title": p.get("title"),
            "project_agency": p.get("agency"),
            "model": model,
            "prompt_version": PROMPT_VERSION,
            "content": content,
            "risk": risk,
            "created_at": ts.isoformat(),
            "created_by": reviewer_email,
            "created_by_name": reviewer_name,
            "seed_tag": SEED_TAG,
        })
    if ai_docs:
        await db.ai_reviews.insert_many(ai_docs)
        print(f"Inserted {len(ai_docs)} AI reviews")

    # ---------- 33 Complaints ----------
    comp_docs = []
    complaint_pool = flagged + [{"project_id": None}] * 6  # ~15% orphan (no linked project)
    for _ in range(33):
        pick = random.choice(complaint_pool)
        pid = pick.get("project_id")
        p = proj_index.get(pid) if pid else None
        cat = random.choice(COMPLAINT_CATEGORIES)
        title = random.choice(COMPLAINT_TITLES[cat])
        body = random.choice(COMPLAINT_BODIES)
        anon = random.random() < 0.35
        sub_name, sub_email = random.choice(SUBMITTERS)
        status = random.choices(COMPLAINT_STATUSES, weights=[0.35, 0.30, 0.20, 0.15])[0]
        ts = now - timedelta(days=random.randint(0, 45), hours=random.randint(0, 23))
        entry = {
            "id": str(uuid.uuid4()),
            "created_at": ts.isoformat(),
            "project_id": pid,
            "category": cat,
            "title": title,
            "description": body,
            "submitter_name": None if anon else sub_name,
            "submitter_email": None if anon else sub_email,
            "submitter_contact": None,
            "anonymous": anon,
            "status": status,
            "reviewer_notes": "",
            "reviewer_email": None,
            "decided_at": None,
            "ip_hint": f"10.0.{random.randint(1,255)}.{random.randint(1,255)}",
            "seed_tag": SEED_TAG,
        }
        if p:
            entry["project_title"] = p.get("title")
            entry["project_agency"] = p.get("agency")
        if status in ("resolved", "dismissed", "under_review"):
            reviewer_email, _ = random.choice(REVIEWERS[:2])
            entry["reviewer_email"] = reviewer_email
            entry["decided_at"] = (ts + timedelta(days=random.randint(1, 7))).isoformat()
            entry["reviewer_notes"] = {
                "resolved": "Site verified. Records reconciled with physical progress. Complaint closed.",
                "dismissed": "After documentary review, no discrepancy found. Complaint dismissed with note to complainant.",
                "under_review": "Assigned to field team for site inspection. Awaiting geotagged validation.",
            }[status]
        comp_docs.append(entry)
    if comp_docs:
        await db.complaints.insert_many(comp_docs)
        print(f"Inserted {len(comp_docs)} complaints")

    # ---------- 33 Change Requests ----------
    cr_docs = []
    for _ in range(33):
        f = random.choice(flagged)
        p = proj_index[f["project_id"]]
        field = random.choice(CR_FIELDS)
        old_v = p.get(field)
        if field == "current_budget":
            factor = random.choice([1.03, 1.08, 1.12, 1.18, 0.95, 1.05])
            new_v = round(float(old_v or 1_000_000) * factor, 2)
        elif field == "end_date":
            try:
                base = datetime.fromisoformat(str(old_v).replace("Z", "+00:00"))
            except Exception:
                base = now
            new_v = (base + timedelta(days=random.choice([30, 60, 90, 120]))).isoformat()
        elif field == "contractor":
            new_v = random.choice([
                "Northern Mindanao Builders Inc.",
                "Cagayan Highlands Construction Corp.",
                "Misamis Infrastructure Partners",
                "Bukidnon Ridge Engineering Services",
                "Kagay-an Development Group",
            ])
        else:
            new_v = random.choice(["Ongoing", "On Hold", "Completed"])

        risk_note, risk = build_cr_risk_note(field, old_v, new_v)
        requester_email, requester_name = random.choice(REVIEWERS[2:])  # non-admin reviewers request
        decider_email, _ = random.choice(REVIEWERS[:2])
        status = random.choices(["pending", "approved", "rejected", "returned"], weights=[0.30, 0.40, 0.20, 0.10])[0]
        ts = now - timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))

        cr = {
            "id": str(uuid.uuid4()),
            "project_id": p["id"],
            "project_title": p.get("title"),
            "project_agency": p.get("agency"),
            "field": field,
            "old_value": old_v,
            "new_value": new_v,
            "requested_by": str(uuid.uuid4()),
            "requested_by_email": requester_email,
            "requested_by_name": requester_name,
            "requested_at": ts.isoformat(),
            "status": status,
            "ai_review": risk_note,
            "ai_risk": risk,
            "decided_by": decider_email if status != "pending" else None,
            "decided_at": (ts + timedelta(days=random.randint(1, 5))).isoformat() if status != "pending" else None,
            "decision_note": {
                "approved": "Documents in order. Change reflects legitimate variation.",
                "rejected": "Insufficient supporting documentation. Please resubmit with variation order attached.",
                "returned": "Requesting more context — see reviewer notes.",
                "pending": None,
            }[status],
            "seed_tag": SEED_TAG,
        }
        cr_docs.append(cr)
    if cr_docs:
        await db.change_requests.insert_many(cr_docs)
        print(f"Inserted {len(cr_docs)} change requests")

    total = len(ai_docs) + len(comp_docs) + len(cr_docs)
    print(f"\nDone. Total seeded fake reviews: {total}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wipe", action="store_true", help="Wipe previously seeded fakes first")
    args = ap.parse_args()
    asyncio.run(main(wipe=args.wipe))
