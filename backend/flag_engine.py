"""Flag engine — F1..F6."""
from datetime import datetime, timezone
from statistics import mean, pstdev
from typing import Dict, List


def _parse_dt(v):
    if isinstance(v, datetime):
        return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v
    if isinstance(v, str):
        try:
            d = datetime.fromisoformat(v.replace("Z", "+00:00"))
            return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d
        except Exception:
            return None
    return None


def _mean_cost_by_type(projects: List[dict]) -> Dict[str, Dict[str, float]]:
    """Return {project_type: {mean, std}} of cost_per_unit."""
    buckets: Dict[str, List[float]] = {}
    for p in projects:
        cpu = p.get("cost_per_unit")
        if cpu is not None:
            buckets.setdefault(p.get("project_type", ""), []).append(float(cpu))
    stats = {}
    for k, vals in buckets.items():
        if len(vals) >= 2:
            m = mean(vals)
            s = pstdev(vals) or 1.0
            stats[k] = {"mean": m, "std": s}
    return stats


def compute_flags_for(project: dict, cfg: dict, type_stats: Dict[str, Dict[str, float]]) -> dict:
    """Return flags dict for a single project."""
    approved = float(project.get("approved_budget", 0) or 0)
    current = float(project.get("current_budget", approved) or approved)
    disbursed = float(project.get("disbursed_amount", 0) or 0)
    mods = project.get("modifications", []) or []
    payments = project.get("payments", []) or []
    end_date = _parse_dt(project.get("end_date"))
    actual_end = _parse_dt(project.get("actual_end_date"))
    status = project.get("status", "")

    flags = {
        "project_id": project["id"],
        "F1": False, "F2": False, "F3": False,
        "F4": False, "F5": False, "F6": False,
        "F1_detail": "", "F2_detail": "", "F3_detail": "",
        "F4_detail": "", "F5_detail": "", "F6_detail": "",
    }

    # F1: budget increase >= X% with absolute floor
    if approved > 0:
        pct = ((current - approved) / approved) * 100
        delta = current - approved
        if pct >= cfg.get("F1_pct", 20.0) and delta >= cfg.get("F1_floor", 500000.0):
            flags["F1"] = True
            flags["F1_detail"] = f"Budget increased {pct:.1f}% (PHP {delta:,.0f}) — exceeds {cfg['F1_pct']}% / PHP {cfg['F1_floor']:,.0f} floor."

    # F2: > N modifications
    if len(mods) > cfg.get("F2_max_mods", 5):
        flags["F2"] = True
        flags["F2_detail"] = f"{len(mods)} modifications recorded — exceeds threshold of {cfg['F2_max_mods']}."

    # F3: disbursed vs weighted progress with tolerance
    if payments:
        total_paid = sum(float(p.get("amount", 0)) for p in payments)
        weighted_progress = sum(float(p.get("verified_progress_pct", 0)) * float(p.get("amount", 0)) for p in payments)
        avg_progress = (weighted_progress / total_paid) if total_paid else 0
        if current > 0:
            expected = current * (avg_progress / 100.0)
            if expected > 0:
                diff_pct = abs(total_paid - expected) / expected * 100
                if diff_pct > cfg.get("F3_tolerance_pct", 5.0):
                    flags["F3"] = True
                    flags["F3_detail"] = f"Payments PHP {total_paid:,.0f} vs expected PHP {expected:,.0f} at {avg_progress:.0f}% progress — {diff_pct:.1f}% off (tol {cfg['F3_tolerance_pct']}%)."

    # F4: statistical outlier |Z| >= threshold within project type
    ptype = project.get("project_type", "")
    cpu = project.get("cost_per_unit")
    if cpu is not None and ptype in type_stats:
        stats = type_stats[ptype]
        z = (float(cpu) - stats["mean"]) / stats["std"] if stats["std"] else 0
        if abs(z) >= cfg.get("F4_z_threshold", 2.0):
            flags["F4"] = True
            flags["F4_detail"] = f"Cost per unit {cpu:,.0f} deviates {z:+.2f}σ from {ptype} mean {stats['mean']:,.0f}."

    # F5: schedule >= N days overdue
    if end_date and status != "Completed":
        now = datetime.now(timezone.utc)
        overdue_days = (now - end_date).days
        if overdue_days >= cfg.get("F5_days_overdue", 90):
            flags["F5"] = True
            flags["F5_detail"] = f"Schedule overdue by {overdue_days} days (end date {end_date.date().isoformat()})."
    elif actual_end and end_date and (actual_end - end_date).days >= cfg.get("F5_days_overdue", 90):
        flags["F5"] = True
        flags["F5_detail"] = f"Completed {(actual_end - end_date).days} days late."

    # F6: geospatial verification pending
    if not project.get("geo_verified", False):
        flags["F6"] = True
        flags["F6_detail"] = "GIS coordinates not yet field-verified by inspector."

    core = int(flags["F1"]) + int(flags["F2"]) + int(flags["F3"]) + int(flags["F4"])
    flags["core_count"] = core
    if core == 0:
        flags["alert_level"] = "green"
    elif core == 1:
        flags["alert_level"] = "yellow"
    elif core == 2:
        flags["alert_level"] = "orange"
    else:
        flags["alert_level"] = "red"

    return flags


def compute_all_flags(projects: List[dict], cfg: dict) -> List[dict]:
    stats = _mean_cost_by_type(projects)
    return [compute_flags_for(p, cfg, stats) for p in projects]
