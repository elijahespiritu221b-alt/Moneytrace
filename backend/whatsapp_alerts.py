"""WhatsApp security alerts via Twilio. Falls back to logging when not configured."""
import os
import asyncio
import logging
import time
from typing import Optional

log = logging.getLogger("moneytrace.whatsapp")

_ALERT_COOLDOWN: dict[str, float] = {}
ALERT_COOLDOWN_SEC = 10 * 60


def is_configured() -> bool:
    return all(os.environ.get(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"))


def _send_sync(to: str, body: str) -> str:
    from twilio.rest import Client
    client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
    frm = os.environ["TWILIO_WHATSAPP_FROM"]
    if not frm.startswith("whatsapp:"):
        frm = f"whatsapp:{frm}"
    msg = client.messages.create(from_=frm, to=f"whatsapp:{to}", body=body)
    return msg.sid


async def send_whatsapp(to: str, body: str) -> dict:
    """Returns {status: sent|not_configured|failed, sid?, error?}."""
    if not is_configured():
        log.warning(f"[WhatsApp NOT CONFIGURED] to={to} body={body[:120]!r}")
        return {"status": "not_configured"}
    try:
        sid = await asyncio.to_thread(_send_sync, to, body)
        return {"status": "sent", "sid": sid}
    except Exception as e:
        log.error(f"WhatsApp send failed to {to}: {e}")
        return {"status": "failed", "error": str(e)[:300]}


def should_alert(key: str) -> bool:
    """Debounce: one alert per key per cooldown window."""
    now = time.time()
    last = _ALERT_COOLDOWN.get(key, 0)
    if now - last < ALERT_COOLDOWN_SEC:
        return False
    _ALERT_COOLDOWN[key] = now
    return True


async def dispatch_security_alert(db, kind: str, summary: str, details: dict,
                                  debounce_key: Optional[str] = None) -> Optional[dict]:
    """Record the incident and fan out WhatsApp to all enabled contacts."""
    from models import gen_id, now_utc
    if debounce_key and not should_alert(debounce_key):
        return None
    contacts = await db.alert_contacts.find({"enabled": True}, {"_id": 0}).to_list(200)
    lines = [f"🚨 MONEYTRACE SECURITY ALERT", f"Type: {kind.replace('_', ' ').upper()}", summary]
    for k, v in details.items():
        lines.append(f"{k}: {v}")
    lines.append(f"Time: {now_utc().strftime('%Y-%m-%d %H:%M UTC')}")
    body = "\n".join(lines)
    deliveries = []
    for c in contacts:
        res = await send_whatsapp(c["phone"], body)
        deliveries.append({"contact_id": c["id"], "name": c["name"], "phone": c["phone"], **res})
    incident = {
        "id": gen_id(), "kind": kind, "summary": summary, "details": details,
        "message": body, "deliveries": deliveries,
        "configured": is_configured(), "created_at": now_utc().isoformat(),
    }
    await db.security_alerts.insert_one(dict(incident))
    incident.pop("_id", None)
    return incident
