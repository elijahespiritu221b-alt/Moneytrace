"""Citizen accounts (public reporters) with phone OTP verification."""
import os
import re
import asyncio
import secrets
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr

from auth import hash_password, verify_password, _decode, _secret, JWT_ALG
from models import gen_id, now_utc
import jwt

log = logging.getLogger("moneytrace.citizen")
router = APIRouter(prefix="/api/citizen")

OTP_TTL_MIN = 10
OTP_MAX_ATTEMPTS = 5
COOKIE = "citizen_token"


def _db():
    from server import db
    return db


def _rl(key, limit, window):
    from server import _rate_limit
    _rate_limit(key, limit, window)


def _ip(request):
    from server import _client_ip
    return _client_ip(request)


def norm_phone(p: str) -> str:
    p = re.sub(r"[\s\-()]", "", p or "")
    if p.startswith("09") and len(p) == 11:
        p = "+63" + p[1:]
    if p.startswith("63") and len(p) == 12:
        p = "+" + p
    if not re.fullmatch(r"\+[1-9]\d{7,14}", p):
        raise HTTPException(400, "Phone must be a valid mobile number, e.g. 09171234567")
    return p


def twilio_verify_configured() -> bool:
    return all(os.environ.get(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"))


def _twilio_client():
    from twilio.rest import Client
    return Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])


async def send_otp(phone: str) -> Optional[str]:
    """Returns dev code when Twilio Verify is not configured, else None."""
    db = _db()
    if twilio_verify_configured():
        def _send():
            _twilio_client().verify.v2.services(os.environ["TWILIO_VERIFY_SERVICE_SID"]).verifications.create(to=phone, channel="sms")
        try:
            await asyncio.to_thread(_send)
        except Exception as e:
            log.error(f"Twilio Verify send failed: {e}")
            raise HTTPException(502, "Could not send SMS code. Try again shortly.")
        return None
    code = f"{secrets.randbelow(1_000_000):06d}"
    await db.phone_otps.update_one(
        {"phone": phone},
        {"$set": {"phone": phone, "code_hash": hashlib.sha256(code.encode()).hexdigest(),
                  "expires_at": (now_utc() + timedelta(minutes=OTP_TTL_MIN)).isoformat(), "attempts": 0}},
        upsert=True,
    )
    log.warning(f"[DEV OTP] {phone} -> {code}")
    return code


async def check_otp(phone: str, code: str) -> bool:
    db = _db()
    if twilio_verify_configured():
        def _check():
            return _twilio_client().verify.v2.services(os.environ["TWILIO_VERIFY_SERVICE_SID"]).verification_checks.create(to=phone, code=code).status
        try:
            return (await asyncio.to_thread(_check)) == "approved"
        except Exception as e:
            log.error(f"Twilio Verify check failed: {e}")
            return False
    rec = await db.phone_otps.find_one({"phone": phone})
    if not rec:
        return False
    if datetime.fromisoformat(rec["expires_at"]) < now_utc():
        await db.phone_otps.delete_one({"phone": phone})
        return False
    if rec.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        await db.phone_otps.delete_one({"phone": phone})
        raise HTTPException(429, "Too many wrong codes. Request a new one.")
    ok = secrets.compare_digest(rec["code_hash"], hashlib.sha256(code.strip().encode()).hexdigest())
    if ok:
        await db.phone_otps.delete_one({"phone": phone})
    else:
        await db.phone_otps.update_one({"phone": phone}, {"$inc": {"attempts": 1}})
    return ok


def _token(cid: str) -> str:
    return jwt.encode({"sub": cid, "type": "citizen", "exp": datetime.now(timezone.utc) + timedelta(days=7)},
                      _secret(), algorithm=JWT_ALG)


def _set_cookie(response: Response, cid: str):
    response.set_cookie(key=COOKIE, value=_token(cid), httponly=True, secure=True,
                        samesite="none", max_age=7 * 86400, path="/")


def _public(c: dict) -> dict:
    return {k: c.get(k) for k in ("id", "name", "email", "phone", "phone_verified", "banned", "created_at")}


async def get_current_citizen(request: Request) -> dict:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Citizen sign-in required")
    payload = _decode(token)
    if payload.get("type") != "citizen":
        raise HTTPException(401, "Invalid token type")
    c = await _db().citizens.find_one({"id": payload["sub"]}, {"_id": 0})
    if not c:
        raise HTTPException(401, "Account not found")
    return c


async def require_verified_citizen(request: Request) -> dict:
    c = await get_current_citizen(request)
    if c.get("banned"):
        raise HTTPException(403, "This account has been suspended by an administrator.")
    if not c.get("phone_verified"):
        raise HTTPException(403, "Please verify your phone number before reporting.")
    return c


class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class CodeIn(BaseModel):
    code: str


@router.post("/register", status_code=201)
async def register(body: RegisterIn, request: Request, response: Response):
    db = _db()
    _rl(f"cit-reg:{_ip(request)}", 5, 3600)
    name = body.name.strip()
    if len(name) < 2 or len(name) > 80:
        raise HTTPException(400, "Please enter your full name.")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    email = body.email.lower().strip()
    phone = norm_phone(body.phone)
    if await db.citizens.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists.")
    if await db.citizens.find_one({"phone": phone}):
        raise HTTPException(409, "This phone number is already registered.")
    doc = {"id": gen_id(), "name": name, "email": email, "phone": phone,
           "password_hash": hash_password(body.password), "phone_verified": False,
           "banned": False, "created_at": now_utc().isoformat(), "ip_hint": _ip(request)[:32]}
    await db.citizens.insert_one(dict(doc))
    dev_code = await send_otp(phone)
    _set_cookie(response, doc["id"])
    out = _public(doc)
    out["otp_mode"] = "sms" if dev_code is None else "dev"
    if dev_code:
        out["dev_code"] = dev_code
    return out


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response):
    db = _db()
    _rl(f"cit-login:{_ip(request)}", 20, 900)
    email = body.email.lower().strip()
    c = await db.citizens.find_one({"email": email})
    if not c or not verify_password(body.password, c["password_hash"]):
        raise HTTPException(401, "Invalid email or password.")
    _set_cookie(response, c["id"])
    return _public(c)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE, path="/", samesite="none", secure=True)
    return {"ok": True}


@router.get("/me")
async def me(c: dict = Depends(get_current_citizen)):
    return _public(c)


@router.post("/resend-otp")
async def resend(request: Request, c: dict = Depends(get_current_citizen)):
    if c.get("phone_verified"):
        return {"ok": True, "already_verified": True}
    _rl(f"cit-otp:{c['id']}", 3, 600)
    dev_code = await send_otp(c["phone"])
    out = {"ok": True, "otp_mode": "sms" if dev_code is None else "dev"}
    if dev_code:
        out["dev_code"] = dev_code
    return out


@router.post("/verify-phone")
async def verify_phone(body: CodeIn, c: dict = Depends(get_current_citizen)):
    if c.get("phone_verified"):
        return _public(c)
    if not await check_otp(c["phone"], body.code):
        raise HTTPException(400, "Incorrect or expired code.")
    await _db().citizens.update_one({"id": c["id"]}, {"$set": {"phone_verified": True, "verified_at": now_utc().isoformat()}})
    c["phone_verified"] = True
    return _public(c)
