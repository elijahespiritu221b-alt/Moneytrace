"""MONEYTRACE FastAPI server."""
from dotenv import load_dotenv
from pathlib import Path

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

import os
import re
import time
import logging
from collections import deque
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from models import (
    LoginRequest, UserOut, Project, RuleConfig, AuditLog,
    ChangeRequest, gen_id, now_utc,
)
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_role,
)
from flag_engine import compute_all_flags, compute_flags_for, _mean_cost_by_type
from seed_data import build_seed_projects
import ai_service
from pdf_memo import render_case_memo
from fastapi.responses import StreamingResponse
from io import BytesIO


# ---------- DB ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="MONEYTRACE API")
api = APIRouter(prefix="/api")

log = logging.getLogger("moneytrace")
logging.basicConfig(level=logging.INFO)


# ---------- Security: startup checks ----------
_jwt_secret = os.environ.get("JWT_SECRET", "")
if len(_jwt_secret) < 32:
    raise RuntimeError(
        "JWT_SECRET must be at least 32 characters. Set a strong random value in backend/.env."
    )


# ---------- Security: helpers ----------
def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]


def _safe_regex(q: str) -> str:
    """Escape user-supplied search input for Mongo $regex to prevent ReDoS
    and unintended pattern matching. Only alphanumerics + spaces remain
    'regex-special'; everything else is literal."""
    return re.escape((q or "")[:120])


# Field allowlists — refuse any write to a field not on the list.
DIRECT_EDIT_FIELDS = {
    "description", "status", "geo_verified", "published",
    "monitoring_unit_type", "monitoring_unit",
}
CHANGE_REQUEST_FIELDS = {
    "current_budget", "end_date", "contractor", "status",
    "actual_end_date", "cost_per_unit", "unit_metric",
}


# ---------- Security: rate limiting (in-memory sliding window per IP/key) ----------
_RL_BUCKETS: dict[str, deque] = {}

def _rate_limit(key: str, limit: int, window_sec: int):
    """Raise 429 if `key` has exceeded `limit` events in the last `window_sec`."""
    now = time.time()
    dq = _RL_BUCKETS.setdefault(key, deque())
    cutoff = now - window_sec
    while dq and dq[0] < cutoff:
        dq.popleft()
    if len(dq) >= limit:
        retry_after = int(window_sec - (now - dq[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Retry in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )
    dq.append(now)


# ---------- Security: middleware (headers + basic API rate limit) ----------
class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Coarse per-IP request cap: 240 req/min per IP for /api/*
        # (Adjust upward if you get complaints; 4 rps sustained per IP is generous.)
        if request.url.path.startswith("/api"):
            try:
                _rate_limit(f"ip:{_client_ip(request)}", 240, 60)
            except HTTPException as e:
                return Response(status_code=e.status_code,
                                content=(e.detail or "").encode(),
                                headers=e.headers or {})
        response = await call_next(request)
        # Security headers
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "geolocation=(), microphone=(), camera=(), payment=()",
        )
        # HSTS: only meaningful over HTTPS
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
        return response


app.add_middleware(SecurityMiddleware)


# ---------- Helpers ----------
async def _log_audit(action: str, actor: Optional[dict] = None, project_id: Optional[str] = None,
                     before: Any = None, after: Any = None, note: str = ""):
    entry = AuditLog(
        action=action,
        actor_id=actor.get("id") if actor else None,
        actor_email=actor.get("email") if actor else None,
        actor_role=actor.get("role") if actor else None,
        project_id=project_id,
        before=before,
        after=after,
        note=note,
    ).model_dump()
    entry["timestamp"] = entry["timestamp"].isoformat()
    await db.audit_logs.insert_one(entry)


async def _get_rule_config() -> dict:
    cfg = await db.rule_configs.find_one({"id": "default"}, {"_id": 0})
    if not cfg:
        cfg = RuleConfig().model_dump()
        cfg["updated_at"] = cfg["updated_at"].isoformat()
        await db.rule_configs.insert_one(dict(cfg))
        cfg.pop("_id", None)
    return cfg


async def _recompute_all_flags(actor: Optional[dict] = None):
    cfg = await _get_rule_config()
    projects = await db.projects.find({}, {"_id": 0}).to_list(10000)
    # capture prior alert levels so we can notify on green/yellow/orange → red transitions
    prior_levels = {
        f["project_id"]: (f.get("alert_level") or "green")
        async for f in db.project_flags.find({}, {"project_id": 1, "alert_level": 1})
    }
    project_titles = {p["id"]: p.get("title", "") for p in projects}
    all_flags = compute_all_flags(projects, cfg)
    await db.project_flags.delete_many({})
    newly_red = []
    for f in all_flags:
        f["computed_at"] = now_utc().isoformat()
        await db.project_flags.insert_one(f)
        pid = f["project_id"]
        if (f.get("alert_level") == "red") and prior_levels.get(pid) != "red":
            newly_red.append(pid)
    await _log_audit("FLAGS_RECOMPUTED", actor=actor, note=f"Recomputed flags for {len(all_flags)} projects.")
    # Fan-out red-alert notifications (cap to avoid noise on initial recompute of huge sets)
    for pid in newly_red[:25]:
        title = project_titles.get(pid, pid)
        await _notify_reviewers(
            title=f"New RED alert: {title[:80]}",
            body="A project just crossed into RED alert level after the latest flag recomputation.",
            link=f"/console/projects/{pid}",
            kind="red_alert",
            project_id=pid,
        )
    return len(all_flags)


# ---------- Notifications (fan-out) ----------
async def _notify_reviewers(title: str, body: str, link: Optional[str] = None,
                            kind: str = "info", project_id: Optional[str] = None,
                            exclude_user_id: Optional[str] = None):
    """Insert one notification per admin/reviewer. Cheap for small user sets."""
    docs = []
    async for u in db.users.find({"role": {"$in": ["admin", "reviewer"]}}, {"id": 1}):
        if exclude_user_id and u.get("id") == exclude_user_id:
            continue
        docs.append({
            "id": gen_id(),
            "user_id": u["id"],
            "title": title,
            "body": body,
            "link": link,
            "kind": kind,          # complaint | change_request | red_alert | info
            "project_id": project_id,
            "read": False,
            "created_at": now_utc().isoformat(),
        })
    if docs:
        await db.notifications.insert_many(docs)


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.projects.create_index("id", unique=True)
    await db.project_flags.create_index("project_id", unique=True)
    # Seed users
    admin_email = os.environ["ADMIN_EMAIL"]
    admin_pw = os.environ["ADMIN_PASSWORD"]
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "id": gen_id(), "email": admin_email,
            "password_hash": hash_password(admin_pw),
            "name": "Elijah Espiritu", "role": "admin",
            "created_at": now_utc().isoformat(),
        })
        log.info(f"Seeded admin {admin_email}")
    else:
        existing = await db.users.find_one({"email": admin_email})
        if not verify_password(admin_pw, existing["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})
    rev_email = os.environ["REVIEWER_EMAIL"]
    rev_pw = os.environ["REVIEWER_PASSWORD"]
    if not await db.users.find_one({"email": rev_email}):
        await db.users.insert_one({
            "id": gen_id(), "email": rev_email,
            "password_hash": hash_password(rev_pw),
            "name": "Senior Reviewer", "role": "reviewer",
            "created_at": now_utc().isoformat(),
        })
        log.info(f"Seeded reviewer {rev_email}")
    # Seed projects
    if await db.projects.count_documents({}) == 0:
        try:
            from import_xlsx import xlsx_path  # noqa
        except Exception:
            pass
        xlsx = "/app/uploads/dilg.xlsx"
        if os.path.exists(xlsx):
            log.info(f"Auto-importing seed from {xlsx}")
            import subprocess
            subprocess.run(["python", "/app/backend/import_xlsx.py", xlsx], check=False)
        else:
            for p in build_seed_projects():
                await db.projects.insert_one(p)
            log.info("Seeded synthetic projects")
            await _recompute_all_flags()
            await _log_audit("SEED", note="Initial seed data loaded.")
    await _get_rule_config()


# ---------- Auth ----------
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW_SEC = 15 * 60
LOGIN_LOCKOUT_SEC = 30 * 60


@api.post("/auth/login")
async def login(body: LoginRequest, request: Request, response: Response):
    email = body.email.lower().strip()
    ip = _client_ip(request)

    # Per-IP throttle: 5 login attempts / 15 min
    _rate_limit(f"login-ip:{ip}", LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SEC)

    # Per-email soft lockout: after 5 failed attempts, block for 30 min
    lockout = await db.login_lockouts.find_one({"email": email}, {"_id": 0})
    if lockout and lockout.get("locked_until"):
        try:
            until = datetime.fromisoformat(lockout["locked_until"])
        except Exception:
            until = None
        if until and until > datetime.now(timezone.utc):
            remaining = int((until - datetime.now(timezone.utc)).total_seconds())
            raise HTTPException(
                status_code=429,
                detail=f"Account temporarily locked. Try again in {remaining}s.",
                headers={"Retry-After": str(remaining)},
            )

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        # Track failed attempt for this email
        fails = ((lockout or {}).get("fails") or 0) + 1
        update = {"email": email, "fails": fails,
                  "last_fail_at": now_utc().isoformat()}
        if fails >= LOGIN_MAX_ATTEMPTS:
            update["locked_until"] = (
                datetime.now(timezone.utc) + timedelta(seconds=LOGIN_LOCKOUT_SEC)
            ).isoformat()
            update["fails"] = 0  # reset counter once locked
        await db.login_lockouts.update_one(
            {"email": email}, {"$set": update}, upsert=True,
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Success: clear any prior lockout state
    await db.login_lockouts.delete_one({"email": email})

    token = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie(
        key="access_token", value=token, httponly=True, secure=True,
        samesite="none", max_age=86400, path="/",
    )
    await _log_audit("LOGIN", actor=user)
    # NOTE: access_token intentionally NOT returned in body — cookie only.
    return {
        "id": user["id"], "email": user["email"], "name": user["name"],
        "role": user["role"],
    }


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


# ---------- Projects ----------
@api.get("/projects")
async def list_projects(
    response: Response,
    agency: Optional[str] = None, municipality: Optional[str] = None,
    project_type: Optional[str] = None, status: Optional[str] = None,
    alert_level: Optional[str] = None, flag: Optional[str] = None,
    q: Optional[str] = None, published_only: bool = False,
    limit: int = 500, offset: int = 0,
    user: dict = Depends(get_current_user),
):
    query: dict = {}
    if agency: query["agency"] = agency
    if municipality: query["municipality"] = municipality
    if project_type: query["project_type"] = project_type
    if status: query["status"] = status
    if published_only: query["published"] = True
    if q: query["title"] = {"$regex": _safe_regex(q), "$options": "i"}
    # For flag & alert_level filters, we need to join with project_flags — pull matching IDs first
    if alert_level or flag:
        fq: dict = {}
        if alert_level: fq["alert_level"] = alert_level
        if flag: fq[flag] = True
        matching = [f["project_id"] async for f in db.project_flags.find(fq, {"project_id": 1})]
        query["id"] = {"$in": matching}
    total = await db.projects.count_documents(query)
    projects = await db.projects.find(query, {"_id": 0}).skip(offset).limit(min(limit, 2000)).to_list(2000)
    ids = [p["id"] for p in projects]
    flags_map = {f["project_id"]: f async for f in db.project_flags.find({"project_id": {"$in": ids}}, {"_id": 0})}
    out = [{**p, "flags": flags_map.get(p["id"], {})} for p in projects]
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return out


@api.get("/projects/{pid}")
async def get_project(pid: str, user: dict = Depends(get_current_user)):
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    f = await db.project_flags.find_one({"project_id": pid}, {"_id": 0}) or {}
    return {**p, "flags": f}


@api.get("/projects/{pid}/memo.pdf")
async def project_memo_pdf(pid: str, request: Request):
    """Case memo PDF: project detail + flags + AI advisory (latest) + audit trail.
    Auth accepted ONLY via httpOnly cookie or Authorization header — never a
    URL query param (which would leak the token into logs, history, and
    referrer headers)."""
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    from auth import _decode
    payload = _decode(token)
    if payload.get("type") != "access":
        raise HTTPException(401, "Invalid token type")
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    flags = await db.project_flags.find_one({"project_id": pid}, {"_id": 0}) or {}
    audit = await db.audit_logs.find({"project_id": pid}, {"_id": 0}).sort("timestamp", -1).to_list(500)
    ai_reviews = await db.ai_reviews.find({"project_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(5)
    pdf_bytes = render_case_memo(p, flags, audit, ai_reviews)
    safe_title = "".join(c if c.isalnum() or c in "-_ " else "_" for c in (p.get("title", "project"))).strip()[:60]
    filename = f"MONEYTRACE_Memo_{safe_title}_{pid[:8]}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class ProjectPatch(BaseModel):
    field: str
    value: Any


@api.patch("/projects/{pid}/direct")
async def direct_patch(pid: str, body: ProjectPatch, user: dict = Depends(require_role("admin"))):
    """Direct admin edit (non-sensitive fields only). For sensitive fields use /change-requests."""
    if body.field not in DIRECT_EDIT_FIELDS:
        raise HTTPException(
            400,
            f"Field '{body.field}' is not allowed for direct edit. "
            f"Allowed: {sorted(DIRECT_EDIT_FIELDS)}",
        )
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    old = p.get(body.field)
    p[body.field] = body.value
    p["updated_at"] = now_utc().isoformat()
    await db.projects.update_one({"id": pid}, {"$set": {body.field: body.value, "updated_at": p["updated_at"]}})
    await _log_audit("PROJECT_EDIT", actor=user, project_id=pid, before={body.field: old}, after={body.field: body.value})
    return {"ok": True}


@api.post("/projects/{pid}/verify-geo")
async def verify_geo(pid: str, user: dict = Depends(get_current_user)):
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    await db.projects.update_one({"id": pid}, {"$set": {"geo_verified": True, "updated_at": now_utc().isoformat()}})
    p["geo_verified"] = True
    cfg = await _get_rule_config()
    all_projects = await db.projects.find({}, {"_id": 0}).to_list(2000)
    stats = _mean_cost_by_type(all_projects)
    f = compute_flags_for(p, cfg, stats)
    f["computed_at"] = now_utc().isoformat()
    await db.project_flags.update_one({"project_id": pid}, {"$set": f}, upsert=True)
    await _log_audit("VERIFICATION_FILED", actor=user, project_id=pid, note="Geo verification filed.")
    return {"ok": True, "flags": f}


# ---------- Change Requests (sensitive edit workflow) ----------
class ChangeRequestCreate(BaseModel):
    project_id: str
    field: str
    new_value: Any


@api.post("/change-requests")
async def create_change_request(body: ChangeRequestCreate, user: dict = Depends(get_current_user)):
    if body.field not in CHANGE_REQUEST_FIELDS:
        raise HTTPException(
            400,
            f"Field '{body.field}' is not allowed in a change request. "
            f"Allowed: {sorted(CHANGE_REQUEST_FIELDS)}",
        )
    p = await db.projects.find_one({"id": body.project_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    old = p.get(body.field)
    cr = ChangeRequest(
        project_id=body.project_id, field=body.field,
        old_value=old, new_value=body.new_value,
        requested_by=user["id"], requested_by_email=user["email"],
    ).model_dump()
    cr["requested_at"] = cr["requested_at"].isoformat()
    # AI advisory review
    try:
        adv = await ai_service.review_change_request(p, body.field, old, body.new_value)
        cr["ai_review"] = adv["content"]
        cr["ai_risk"] = adv["risk"]
    except Exception as e:
        cr["ai_review"] = f"AI review unavailable: {e}"
        cr["ai_risk"] = "unknown"
    await db.change_requests.insert_one(cr)
    await _log_audit("CHANGE_REQUESTED", actor=user, project_id=body.project_id,
                     before={body.field: old}, after={body.field: body.value if hasattr(body, "value") else body.new_value})
    await _notify_reviewers(
        title=f"Change request: {body.field} on {(p.get('title') or '')[:70]}",
        body=f"Requested by {user['email']} — awaiting a second reviewer's decision.",
        link=f"/console/requests",
        kind="change_request",
        project_id=body.project_id,
        exclude_user_id=user.get("id"),
    )
    return {**cr, "_id": None}


@api.get("/change-requests")
async def list_change_requests(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"status": status} if status else {}
    return await db.change_requests.find(q, {"_id": 0}).sort("requested_at", -1).to_list(500)


class DecideCR(BaseModel):
    decision: str  # approve | reject | return
    note: Optional[str] = ""


@api.post("/change-requests/{crid}/decide")
async def decide_cr(crid: str, body: DecideCR, user: dict = Depends(get_current_user)):
    cr = await db.change_requests.find_one({"id": crid}, {"_id": 0})
    if not cr:
        raise HTTPException(404, "Not found")
    if cr["status"] != "pending":
        raise HTTPException(400, "Already decided")
    if cr["requested_by"] == user["id"]:
        raise HTTPException(403, "Cannot decide on your own request")
    new_status = {"approve": "approved", "reject": "rejected", "return": "returned"}.get(body.decision)
    if not new_status:
        raise HTTPException(400, "Invalid decision")
    updates = {
        "status": new_status,
        "decided_by": user["email"],
        "decided_at": now_utc().isoformat(),
        "decision_note": body.note or "",
    }
    await db.change_requests.update_one({"id": crid}, {"$set": updates})
    if new_status == "approved":
        await db.projects.update_one({"id": cr["project_id"]},
                                     {"$set": {cr["field"]: cr["new_value"], "updated_at": now_utc().isoformat()}})
        await _recompute_all_flags(actor=user)
    action = "APPROVED" if new_status == "approved" else "REJECTED" if new_status == "rejected" else "RETURNED"
    await _log_audit(action, actor=user, project_id=cr["project_id"],
                     before={cr["field"]: cr["old_value"]}, after={cr["field"]: cr["new_value"]},
                     note=body.note or "")
    return {"ok": True, "status": new_status}


# ---------- AI ----------
@api.post("/ai/review/{pid}")
async def ai_review(pid: str, user: dict = Depends(get_current_user)):
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p: raise HTTPException(404, "Not found")
    f = await db.project_flags.find_one({"project_id": pid}, {"_id": 0}) or {}
    adv = await ai_service.review_project_flags(p, f)
    record = {
        "id": gen_id(), "project_id": pid, **adv,
        "created_at": now_utc().isoformat(), "created_by": user["email"],
    }
    await db.ai_reviews.insert_one(record)
    return {**adv, "id": record["id"]}


@api.get("/ai/reviews/{pid}")
async def ai_reviews_list(pid: str, user: dict = Depends(get_current_user)):
    return await db.ai_reviews.find({"project_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(20)


@api.post("/ai/summary/{pid}")
async def ai_summary(pid: str, user: dict = Depends(get_current_user)):
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p: raise HTTPException(404, "Not found")
    f = await db.project_flags.find_one({"project_id": pid}, {"_id": 0}) or {}
    s = await ai_service.summarize_project(p, f)
    return {"summary": s, "model": "claude-haiku-4-5-20251001"}


# ---------- Rule Config ----------
@api.get("/rule-config")
async def get_rules(user: dict = Depends(get_current_user)):
    return await _get_rule_config()


class RuleUpdate(BaseModel):
    F1_pct: float
    F1_floor: float
    F2_max_mods: int
    F3_tolerance_pct: float
    F4_z_threshold: float
    F5_days_overdue: int


@api.put("/rule-config")
async def update_rules(body: RuleUpdate, user: dict = Depends(require_role("admin"))):
    before = await _get_rule_config()
    new = body.model_dump()
    new["id"] = "default"
    new["updated_at"] = now_utc().isoformat()
    new["updated_by"] = user["email"]
    await db.rule_configs.update_one({"id": "default"}, {"$set": new}, upsert=True)
    count = await _recompute_all_flags(actor=user)
    await _log_audit("RULE_UPDATED", actor=user, before=before, after=new, note=f"Recomputed {count} projects.")
    return {"ok": True, "config": new, "recomputed": count}


@api.post("/recompute-flags")
async def recompute(user: dict = Depends(require_role("admin"))):
    n = await _recompute_all_flags(actor=user)
    return {"ok": True, "recomputed": n}


# ---------- Audit ----------
@api.get("/audit-logs")
async def audit_logs(limit: int = 200, user: dict = Depends(get_current_user)):
    return await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)


# ---------- Analytics ----------
@api.get("/analytics/by-office")
async def analytics_by_office(user: dict = Depends(get_current_user)):
    projects = await db.projects.find({}, {"_id": 0}).to_list(20000)
    flags = await db.project_flags.find({}, {"_id": 0}).to_list(20000)
    fby = {f["project_id"]: f for f in flags}
    by_office = {}
    for p in projects:
        code = p.get("office_code") or "OTHER"
        agency = p.get("agency") or code
        b = by_office.setdefault(code, {
            "office_code": code,
            "office_agency": agency,
            "count": 0,
            "total_budget": 0.0,
            "original_budget": 0.0,
            "total_disbursed": 0.0,
            "alert_counts": {"green": 0, "yellow": 0, "orange": 0, "red": 0},
            "flag_counts": {"F1": 0, "F2": 0, "F3": 0, "F4": 0, "F5": 0, "F6": 0},
            "municipalities": set(),
        })
        b["count"] += 1
        b["total_budget"] += float(p.get("current_budget", 0))
        b["original_budget"] += float(p.get("approved_budget", 0))
        b["total_disbursed"] += float(p.get("disbursed_amount", 0))
        b["municipalities"].add(p.get("municipality", ""))
        f = fby.get(p["id"], {})
        b["alert_counts"][f.get("alert_level", "green")] = b["alert_counts"].get(f.get("alert_level", "green"), 0) + 1
        for c in ("F1", "F2", "F3", "F4", "F5", "F6"):
            if f.get(c): b["flag_counts"][c] += 1
    out = []
    for k, v in by_office.items():
        v["municipality_count"] = len(v["municipalities"])
        v["budget_increase"] = v["total_budget"] - v["original_budget"]
        del v["municipalities"]
        out.append(v)
    out.sort(key=lambda x: -(x["alert_counts"]["red"] * 100 + x["alert_counts"]["orange"] * 10 + x["alert_counts"]["yellow"]))
    return out


@api.get("/analytics/overview")
async def analytics_overview(user: dict = Depends(get_current_user)):
    projects = await db.projects.find({}, {"_id": 0}).to_list(20000)
    flags = await db.project_flags.find({}, {"_id": 0}).to_list(20000)
    by_id = {f["project_id"]: f for f in flags}
    alert_counts = {"green": 0, "yellow": 0, "orange": 0, "red": 0}
    flag_counts = {k: 0 for k in ("F1", "F2", "F3", "F4", "F5", "F6")}
    by_agency = {}
    by_muni = {"green": {}, "yellow": {}, "orange": {}, "red": {}}
    status_counts = {}
    total_budget = 0.0
    original_budget = 0.0
    for p in projects:
        f = by_id.get(p["id"], {})
        al = f.get("alert_level", "green")
        alert_counts[al] = alert_counts.get(al, 0) + 1
        for k in flag_counts:
            if f.get(k): flag_counts[k] += 1
        by_agency[p["agency"]] = by_agency.get(p["agency"], 0) + float(p.get("current_budget", 0))
        by_muni[al][p["municipality"]] = by_muni[al].get(p["municipality"], 0) + 1
        status_counts[p["status"]] = status_counts.get(p["status"], 0) + 1
        total_budget += float(p.get("current_budget", 0))
        original_budget += float(p.get("approved_budget", 0))
    return {
        "total_projects": len(projects),
        "total_budget_php": total_budget,
        "original_budget_php": original_budget,
        "budget_increase_php": total_budget - original_budget,
        "alert_counts": alert_counts,
        "flag_counts": flag_counts,
        "by_agency": [{"agency": k, "budget": v} for k, v in sorted(by_agency.items(), key=lambda x: -x[1])],
        "by_muni": by_muni,
        "status_counts": status_counts,
    }


# ---------- Public (no auth) ----------
@api.get("/public/projects")
async def public_projects(response: Response, limit: int = 500, offset: int = 0,
                          municipality: Optional[str] = None, q: Optional[str] = None,
                          department: Optional[str] = None, alert_level: Optional[str] = None):
    query: dict = {"published": True}
    if municipality: query["municipality"] = municipality
    if department: query["department"] = department
    if q: query["title"] = {"$regex": _safe_regex(q), "$options": "i"}
    if alert_level:
        matching = [f["project_id"] async for f in db.project_flags.find({"alert_level": alert_level}, {"project_id": 1})]
        query["id"] = {"$in": matching}
    total = await db.projects.count_documents(query)
    projects = await db.projects.find(query, {"_id": 0}).skip(offset).limit(min(limit, 2000)).to_list(2000)
    ids = [p["id"] for p in projects]
    flags_map = {f["project_id"]: f async for f in db.project_flags.find({"project_id": {"$in": ids}}, {"_id": 0})}
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return [{**p, "flags": flags_map.get(p["id"], {})} for p in projects]


@api.get("/public/departments")
async def public_departments():
    """Per-department counts + budget + alert breakdown for public tabs."""
    projects = await db.projects.find({"published": True}, {"_id": 0}).to_list(20000)
    flags = await db.project_flags.find({}, {"_id": 0}).to_list(20000)
    fby = {f["project_id"]: f for f in flags}
    dep = {}
    for p in projects:
        d = p.get("department") or "Other"
        b = dep.setdefault(d, {
            "department": d, "count": 0,
            "total_budget": 0.0, "original_budget": 0.0,
            "alert_counts": {"green": 0, "yellow": 0, "orange": 0, "red": 0},
        })
        b["count"] += 1
        b["total_budget"] += float(p.get("current_budget", 0))
        b["original_budget"] += float(p.get("approved_budget", 0))
        lv = fby.get(p["id"], {}).get("alert_level", "green")
        b["alert_counts"][lv] = b["alert_counts"].get(lv, 0) + 1
    for b in dep.values():
        b["budget_increase"] = b["total_budget"] - b["original_budget"]
    order = {"DILG": 0, "DepEd": 1, "DOH": 2, "DPWH": 3}
    return sorted(dep.values(), key=lambda x: order.get(x["department"], 99))


@api.get("/public/projects/{pid}")
async def public_project(pid: str):
    p = await db.projects.find_one({"id": pid, "published": True}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    f = await db.project_flags.find_one({"project_id": pid}, {"_id": 0}) or {}
    return {**p, "flags": f}


@api.get("/public/overview")
async def public_overview():
    projects = await db.projects.find({"published": True}, {"_id": 0}).to_list(20000)
    flags = await db.project_flags.find({}, {"_id": 0}).to_list(20000)
    by_id = {f["project_id"]: f for f in flags}
    alert_counts = {"green": 0, "yellow": 0, "orange": 0, "red": 0}
    total_budget = 0.0
    original_budget = 0.0
    by_agency = {}
    for p in projects:
        al = by_id.get(p["id"], {}).get("alert_level", "green")
        alert_counts[al] += 1
        total_budget += float(p.get("current_budget", 0))
        original_budget += float(p.get("approved_budget", 0))
        by_agency[p["agency"]] = by_agency.get(p["agency"], 0) + float(p.get("current_budget", 0))
    return {
        "total_projects": len(projects),
        "total_budget_php": total_budget,
        "original_budget_php": original_budget,
        "budget_increase_php": total_budget - original_budget,
        "alert_counts": alert_counts,
        "by_agency": [{"agency": k, "budget": v} for k, v in sorted(by_agency.items(), key=lambda x: -x[1])],
    }


@api.get("/analytics/monitoring-units")
async def analytics_monitoring_units(office_code: Optional[str] = None,
                                     user: dict = Depends(get_current_user)):
    """Group projects by monitoring unit type + specific unit value, per office."""
    q = {"office_code": office_code} if office_code else {}
    projects = await db.projects.find(q, {"_id": 0}).to_list(20000)
    flags = await db.project_flags.find({}, {"_id": 0}).to_list(20000)
    fby = {f["project_id"]: f for f in flags}
    out = {}
    for p in projects:
        oc = p.get("office_code") or "OTHER"
        ut = p.get("monitoring_unit_type") or "Monitoring Unit"
        uv = p.get("monitoring_unit") or "General"
        key = (oc, ut, uv)
        b = out.setdefault(key, {
            "office_code": oc,
            "monitoring_unit_type": ut,
            "monitoring_unit": uv,
            "count": 0,
            "total_budget": 0.0,
            "alert_counts": {"green": 0, "yellow": 0, "orange": 0, "red": 0},
        })
        b["count"] += 1
        b["total_budget"] += float(p.get("current_budget", 0))
        lv = fby.get(p["id"], {}).get("alert_level", "green")
        b["alert_counts"][lv] = b["alert_counts"].get(lv, 0) + 1
    rows = sorted(out.values(),
                  key=lambda x: -(x["alert_counts"]["red"] * 100 + x["alert_counts"]["orange"] * 10))
    return rows


# ---------- Public Complaints ----------
class ComplaintCreate(BaseModel):
    project_id: Optional[str] = None
    category: str  # "Financial" | "Delay" | "Quality" | "Missing progress" | "Other"
    title: str
    description: str
    submitter_name: Optional[str] = None
    submitter_email: Optional[str] = None
    submitter_contact: Optional[str] = None
    anonymous: bool = False


@api.post("/public/complaints")
async def submit_complaint(body: ComplaintCreate, request: Request):
    if len(body.title.strip()) < 5:
        raise HTTPException(400, "Title must be at least 5 characters.")
    if len(body.description.strip()) < 20:
        raise HTTPException(400, "Please provide at least 20 characters of description.")
    # Reject payloads that are unreasonably large (defense-in-depth vs 10k Pydantic)
    if len(body.title) > 300 or len(body.description) > 5000:
        raise HTTPException(400, "Content exceeds allowed size.")
    # Rate limit spam / abuse: 3 per IP per hour, 10 per IP per day
    ip = _client_ip(request)
    _rate_limit(f"complaint-hr:{ip}", 3, 3600)
    _rate_limit(f"complaint-day:{ip}", 10, 86400)
    entry = {
        "id": gen_id(),
        "created_at": now_utc().isoformat(),
        "project_id": body.project_id,
        "category": body.category,
        "title": body.title.strip(),
        "description": body.description.strip(),
        "submitter_name": None if body.anonymous else (body.submitter_name or None),
        "submitter_email": None if body.anonymous else (body.submitter_email or None),
        "submitter_contact": None if body.anonymous else (body.submitter_contact or None),
        "anonymous": bool(body.anonymous),
        "status": "new",  # new | under_review | resolved | dismissed
        "reviewer_notes": "",
        "reviewer_email": None,
        "decided_at": None,
        "ip_hint": (request.client.host if request.client else "unknown")[:32],
    }
    # Auto-link project reference if given
    if body.project_id:
        p = await db.projects.find_one({"id": body.project_id}, {"_id": 0, "title": 1, "agency": 1})
        if p:
            entry["project_title"] = p.get("title")
            entry["project_agency"] = p.get("agency")
    await db.complaints.insert_one(entry)
    await _log_audit("COMPLAINT_FILED", project_id=body.project_id,
                     note=f"Public complaint: {body.category} — {body.title[:80]}")
    await _notify_reviewers(
        title=f"New complaint: {body.title[:80]}",
        body=f"[{body.category}] {body.description[:140]}",
        link="/console/complaints",
        kind="complaint",
        project_id=body.project_id,
    )
    return {"ok": True, "id": entry["id"]}


@api.get("/complaints")
async def list_complaints(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"status": status} if status else {}
    return await db.complaints.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


class ComplaintDecision(BaseModel):
    status: str  # under_review | resolved | dismissed
    notes: Optional[str] = ""


@api.patch("/complaints/{cid}")
async def decide_complaint(cid: str, body: ComplaintDecision, user: dict = Depends(get_current_user)):
    if body.status not in ("under_review", "resolved", "dismissed", "new"):
        raise HTTPException(400, "Invalid status.")
    c = await db.complaints.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Complaint not found")
    await db.complaints.update_one(
        {"id": cid},
        {"$set": {
            "status": body.status,
            "reviewer_notes": body.notes or "",
            "reviewer_email": user["email"],
            "decided_at": now_utc().isoformat(),
        }},
    )
    await _log_audit(f"COMPLAINT_{body.status.upper()}", actor=user,
                     project_id=c.get("project_id"),
                     note=body.notes or f"Complaint {cid[:8]}: {body.status}")
    return {"ok": True}


@api.get("/complaints/stats")
async def complaints_stats(user: dict = Depends(get_current_user)):
    counts = {"new": 0, "under_review": 0, "resolved": 0, "dismissed": 0}
    async for c in db.complaints.find({}, {"status": 1}):
        counts[c.get("status", "new")] = counts.get(c.get("status", "new"), 0) + 1
    return counts


# ---------- Notifications API ----------
@api.get("/notifications")
async def list_notifications(limit: int = 50, unread_only: bool = False,
                             user: dict = Depends(get_current_user)):
    q: dict = {"user_id": user["id"]}
    if unread_only:
        q["read"] = False
    items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))
    return items


@api.get("/notifications/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    n = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"count": n}


@api.post("/notifications/{nid}/read")
async def mark_read(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        {"id": nid, "user_id": user["id"]},
        {"$set": {"read": True}},
    )
    return {"ok": True}


@api.post("/notifications/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    r = await db.notifications.update_many(
        {"user_id": user["id"], "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True, "updated": r.modified_count}


# ---------- Entity Watchlist ----------
@api.get("/watchlist")
async def get_watchlist(user: dict = Depends(get_current_user)):
    items = await db.entity_watchlist.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("starred_at", -1).to_list(500)
    return items


@api.get("/watchlist/digest")
async def watchlist_digest(since_hours: int = 24, user: dict = Depends(get_current_user)):
    """Per-watched-entity summary of recent activity: new red/orange alerts,
    new complaints, new change requests, new AI reviews.
    Returns entities the current user has starred plus their tallies in the window."""
    since_hours = max(1, min(since_hours, 24 * 30))
    cutoff = (now_utc() - timedelta(hours=since_hours)).isoformat()

    starred = await db.entity_watchlist.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("starred_at", -1).to_list(500)
    if not starred:
        return {"since_hours": since_hours, "cutoff": cutoff, "entities": []}

    names = [w["entity_name"] for w in starred]

    # Project IDs grouped by contractor
    proj_by_entity: dict = {n: [] for n in names}
    proj_meta: dict = {}
    async for p in db.projects.find({"contractor": {"$in": names}}, {"_id": 0, "id": 1, "contractor": 1, "title": 1}):
        proj_by_entity.setdefault(p["contractor"], []).append(p["id"])
        proj_meta[p["id"]] = p

    starred_at_by_name = {w["entity_name"]: w.get("starred_at") for w in starred}

    entities = []
    for name in names:
        pids = proj_by_entity.get(name, [])
        if not pids:
            entities.append({
                "entity_name": name,
                "starred_at": starred_at_by_name.get(name),
                "project_count": 0,
                "new_red": 0, "new_orange": 0,
                "new_complaints": 0, "new_change_requests": 0, "new_ai_reviews": 0,
                "total": 0,
                "highlights": [],
            })
            continue

        # New red / orange alerts computed in window
        new_red = await db.project_flags.count_documents({
            "project_id": {"$in": pids},
            "alert_level": "red",
            "computed_at": {"$gte": cutoff},
        })
        new_orange = await db.project_flags.count_documents({
            "project_id": {"$in": pids},
            "alert_level": "orange",
            "computed_at": {"$gte": cutoff},
        })
        new_complaints = await db.complaints.count_documents({
            "project_id": {"$in": pids},
            "created_at": {"$gte": cutoff},
        })
        new_change_requests = await db.change_requests.count_documents({
            "project_id": {"$in": pids},
            "requested_at": {"$gte": cutoff},
        })
        new_ai_reviews = await db.ai_reviews.count_documents({
            "project_id": {"$in": pids},
            "created_at": {"$gte": cutoff},
        })

        # Highlights: up to 3 most recent items across streams
        highlights = []
        async for c in db.complaints.find(
            {"project_id": {"$in": pids}, "created_at": {"$gte": cutoff}},
            {"_id": 0, "id": 1, "title": 1, "project_id": 1, "created_at": 1, "category": 1},
        ).sort("created_at", -1).limit(3):
            highlights.append({
                "kind": "complaint",
                "text": f"[{c.get('category', '—')}] {c.get('title', '')[:90]}",
                "at": c.get("created_at"),
                "project_id": c.get("project_id"),
                "link": "/console/complaints",
            })
        async for cr in db.change_requests.find(
            {"project_id": {"$in": pids}, "requested_at": {"$gte": cutoff}},
            {"_id": 0, "id": 1, "field": 1, "project_id": 1, "requested_at": 1, "ai_risk": 1, "status": 1},
        ).sort("requested_at", -1).limit(3):
            title = (proj_meta.get(cr.get("project_id"), {}).get("title") or "")[:70]
            highlights.append({
                "kind": "change_request",
                "text": f"Edit `{cr.get('field')}` on {title} · {cr.get('status')} · AI risk: {cr.get('ai_risk', '—')}",
                "at": cr.get("requested_at"),
                "project_id": cr.get("project_id"),
                "link": "/console/requests",
            })
        async for r in db.ai_reviews.find(
            {"project_id": {"$in": pids}, "created_at": {"$gte": cutoff}},
            {"_id": 0, "id": 1, "project_id": 1, "created_at": 1, "risk": 1, "model": 1},
        ).sort("created_at", -1).limit(3):
            title = (proj_meta.get(r.get("project_id"), {}).get("title") or "")[:70]
            highlights.append({
                "kind": "ai_review",
                "text": f"AI advisory ({r.get('risk', '—')} risk) on {title}",
                "at": r.get("created_at"),
                "project_id": r.get("project_id"),
                "link": f"/console/projects/{r.get('project_id')}",
            })
        highlights.sort(key=lambda h: h.get("at") or "", reverse=True)
        highlights = highlights[:4]

        total = new_red + new_orange + new_complaints + new_change_requests + new_ai_reviews
        entities.append({
            "entity_name": name,
            "starred_at": starred_at_by_name.get(name),
            "project_count": len(pids),
            "new_red": new_red,
            "new_orange": new_orange,
            "new_complaints": new_complaints,
            "new_change_requests": new_change_requests,
            "new_ai_reviews": new_ai_reviews,
            "total": total,
            "highlights": highlights,
        })

    entities.sort(key=lambda e: (-e["total"], -(e["new_red"] * 10 + e["new_complaints"] * 5)))
    return {"since_hours": since_hours, "cutoff": cutoff, "entities": entities}


@api.post("/watchlist/{name}")
async def toggle_watchlist(name: str, user: dict = Depends(get_current_user)):
    from urllib.parse import unquote
    key = unquote(name).strip()
    if not key:
        raise HTTPException(400, "Invalid entity name")
    existing = await db.entity_watchlist.find_one({"user_id": user["id"], "entity_name": key})
    if existing:
        await db.entity_watchlist.delete_one({"user_id": user["id"], "entity_name": key})
        return {"watched": False, "entity_name": key}
    await db.entity_watchlist.insert_one({
        "id": gen_id(),
        "user_id": user["id"],
        "entity_name": key,
        "starred_at": now_utc().isoformat(),
    })
    return {"watched": True, "entity_name": key}


# ---------- Entity Traceability ----------
def _entity_key(name: str) -> str:
    return (name or "—").strip()


@api.get("/entities")
async def list_entities(user: dict = Depends(get_current_user)):
    """Aggregate contractor / implementing-entity stats across the whole portfolio."""
    projects = await db.projects.find({}, {"_id": 0}).to_list(20000)
    flags_map = {f["project_id"]: f async for f in db.project_flags.find({}, {"_id": 0})}

    ALERT_WEIGHT = {"green": 1, "yellow": 2, "orange": 3, "red": 4}
    buckets: dict = {}
    for p in projects:
        key = _entity_key(p.get("contractor"))
        b = buckets.setdefault(key, {
            "name": key,
            "count": 0,
            "budget": 0.0,
            "approved": 0.0,
            "disbursed": 0.0,
            "agencies": set(),
            "municipalities": set(),
            "project_types": set(),
            "red": 0, "orange": 0, "yellow": 0, "green": 0,
            "flag_counts": {"F1": 0, "F2": 0, "F3": 0, "F4": 0, "F5": 0, "F6": 0},
            "alert_weight_sum": 0,
            "first_seen": None,
            "last_seen": None,
        })
        b["count"] += 1
        b["budget"] += float(p.get("current_budget") or 0)
        b["approved"] += float(p.get("approved_budget") or 0)
        b["disbursed"] += float(p.get("disbursed_amount") or 0)
        b["agencies"].add(p.get("agency") or "—")
        b["municipalities"].add(p.get("municipality") or "—")
        b["project_types"].add(p.get("project_type") or "—")
        f = flags_map.get(p["id"], {})
        lvl = (f.get("alert_level") or "green").lower()
        b[lvl] = b.get(lvl, 0) + 1
        b["alert_weight_sum"] += ALERT_WEIGHT.get(lvl, 1)
        for k in ("F1", "F2", "F3", "F4", "F5", "F6"):
            if f.get(k):
                b["flag_counts"][k] += 1
        sd = p.get("start_date")
        ed = p.get("start_date") or p.get("end_date")
        if sd:
            s = str(sd)
            if b["first_seen"] is None or s < b["first_seen"]:
                b["first_seen"] = s
            if b["last_seen"] is None or s > b["last_seen"]:
                b["last_seen"] = s

    # Pull current user's watchlist so we can pin watched entities
    watched = {
        w["entity_name"]
        async for w in db.entity_watchlist.find({"user_id": user["id"]}, {"entity_name": 1})
    }

    out = []
    for b in buckets.values():
        util = (b["disbursed"] / b["budget"] * 100.0) if b["budget"] else 0.0
        avg_alert = (b["alert_weight_sum"] / b["count"]) if b["count"] else 1.0
        out.append({
            "name": b["name"],
            "count": b["count"],
            "budget": round(b["budget"], 2),
            "approved": round(b["approved"], 2),
            "disbursed": round(b["disbursed"], 2),
            "utilization_pct": round(util, 1),
            "avg_alert": round(avg_alert, 2),
            "agencies_count": len(b["agencies"]),
            "agencies": sorted(b["agencies"]),
            "municipalities_count": len(b["municipalities"]),
            "municipalities": sorted(b["municipalities"])[:8],
            "project_types": sorted(b["project_types"]),
            "red": b["red"], "orange": b["orange"],
            "yellow": b["yellow"], "green": b["green"],
            "flag_counts": b["flag_counts"],
            "first_seen": b["first_seen"],
            "last_seen": b["last_seen"],
            "watched": b["name"] in watched,
        })
    # Watched entities pinned to top, then by risk severity
    out.sort(key=lambda x: (0 if x["watched"] else 1,
                            -x["red"] * 100 - x["orange"] * 10 - x["count"]))
    return out


@api.get("/entities/{name}")
async def entity_detail(name: str, user: dict = Depends(get_current_user)):
    """Deep detail for one contractor / entity: all projects + reviews + complaints + change reqs."""
    from urllib.parse import unquote
    key = _entity_key(unquote(name))
    projects = await db.projects.find({"contractor": key}, {"_id": 0}).to_list(5000)
    if not projects:
        raise HTTPException(404, "Entity has no projects")
    ids = [p["id"] for p in projects]
    flags_map = {f["project_id"]: f async for f in db.project_flags.find({"project_id": {"$in": ids}}, {"_id": 0})}

    # Attach flags
    for p in projects:
        p["flags"] = flags_map.get(p["id"], {})

    # Related documents
    ai_reviews = await db.ai_reviews.find(
        {"project_id": {"$in": ids}}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    complaints = await db.complaints.find(
        {"project_id": {"$in": ids}}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    change_requests = await db.change_requests.find(
        {"project_id": {"$in": ids}}, {"_id": 0}
    ).sort("requested_at", -1).to_list(500)

    # Aggregates
    ALERT_WEIGHT = {"green": 1, "yellow": 2, "orange": 3, "red": 4}
    agg = {
        "count": len(projects),
        "budget": 0.0, "approved": 0.0, "disbursed": 0.0,
        "alert_counts": {"green": 0, "yellow": 0, "orange": 0, "red": 0},
        "flag_counts": {"F1": 0, "F2": 0, "F3": 0, "F4": 0, "F5": 0, "F6": 0},
        "agency_counts": {},
        "type_counts": {},
        "lgu_counts": {},
        "status_counts": {},
        "yearly": {},
    }
    for p in projects:
        agg["budget"] += float(p.get("current_budget") or 0)
        agg["approved"] += float(p.get("approved_budget") or 0)
        agg["disbursed"] += float(p.get("disbursed_amount") or 0)
        f = flags_map.get(p["id"], {})
        lvl = (f.get("alert_level") or "green").lower()
        agg["alert_counts"][lvl] = agg["alert_counts"].get(lvl, 0) + 1
        for k in ("F1", "F2", "F3", "F4", "F5", "F6"):
            if f.get(k):
                agg["flag_counts"][k] += 1
        ag = p.get("agency") or "—"
        agg["agency_counts"][ag] = agg["agency_counts"].get(ag, 0) + 1
        tp = p.get("project_type") or "—"
        agg["type_counts"][tp] = agg["type_counts"].get(tp, 0) + 1
        lg = p.get("municipality") or "—"
        agg["lgu_counts"][lg] = agg["lgu_counts"].get(lg, 0) + 1
        st = p.get("status") or "—"
        agg["status_counts"][st] = agg["status_counts"].get(st, 0) + 1
        sd = p.get("start_date")
        if sd:
            yr = str(sd)[:4]
            agg["yearly"][yr] = agg["yearly"].get(yr, 0) + 1

    agg["utilization_pct"] = round(
        (agg["disbursed"] / agg["budget"] * 100.0) if agg["budget"] else 0.0, 1
    )
    agg["avg_project_size"] = round(agg["budget"] / max(agg["count"], 1), 2)
    weight_sum = sum(ALERT_WEIGHT[lvl] * c for lvl, c in agg["alert_counts"].items())
    agg["avg_alert"] = round(weight_sum / max(agg["count"], 1), 2)
    agg["budget"] = round(agg["budget"], 2)
    agg["approved"] = round(agg["approved"], 2)
    agg["disbursed"] = round(agg["disbursed"], 2)

    watched = await db.entity_watchlist.find_one(
        {"user_id": user["id"], "entity_name": key}
    )
    return {
        "name": key,
        "watched": bool(watched),
        "aggregates": agg,
        "projects": projects,
        "ai_reviews": ai_reviews,
        "complaints": complaints,
        "change_requests": change_requests,
    }


# ---------- Health ----------
@api.get("/")
async def root():
    return {"service": "MONEYTRACE", "status": "ok"}


app.include_router(api)

# CORS — env-driven allowlist. Wildcard is REJECTED when credentials are allowed.
_cors_env = (os.environ.get("CORS_ORIGINS") or "").strip()
_default_origins = [
    "https://project-audit-hub-5.preview.emergentagent.com",
    "http://localhost:3000",
]
if _cors_env and _cors_env != "*":
    _cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip() and o.strip() != "*"]
else:
    _cors_origins = _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-Total-Count"],
    max_age=600,
)
log.info(f"CORS origins locked to: {_cors_origins}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
