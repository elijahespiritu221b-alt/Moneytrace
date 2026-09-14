"""Claude advisory service — Sonnet 5 for deep review, Haiku 4.5 for bulk summaries."""
import os
from emergentintegrations.llm.chat import LlmChat, UserMessage

PROMPT_VERSION = "v1.0"


def _key() -> str:
    return os.environ["EMERGENT_LLM_KEY"]


async def review_project_flags(project: dict, flags: dict) -> dict:
    """Deep advisory review using Claude Sonnet 5. Returns structured advisory dict."""
    system = (
        "You are an audit advisory assistant for the MONEYTRACE public expenditure screening system. "
        "You DO NOT approve or reject anything. You only produce context, summaries, and drafts for a human reviewer. "
        "Be concise, factual, cite the flag codes (F1-F6). Never claim wrongdoing — flags are screening indicators only. "
        "Always output in this exact markdown structure:\n"
        "### Risk Summary\n<one paragraph>\n\n"
        "### Why This Was Flagged\n- F#: reason\n\n"
        "### Suggested Audit Questions\n1. ...\n2. ...\n3. ...\n\n"
        "### Recommended Reviewer Action\n<one paragraph — advisory only>\n\n"
        "### Draft Reviewer Memo\n<3-5 sentence memo the reviewer can edit>"
    )
    triggered = [f"{k}: {flags.get(k + '_detail', '')}" for k in ("F1", "F2", "F3", "F4", "F5", "F6") if flags.get(k)]
    ctx = (
        f"Project: {project['title']}\n"
        f"Agency: {project['agency']} | Municipality: {project['municipality']} | Type: {project['project_type']}\n"
        f"Approved: PHP {project['approved_budget']:,.0f} | Current: PHP {project['current_budget']:,.0f} | Disbursed: PHP {project['disbursed_amount']:,.0f}\n"
        f"Status: {project['status']} | Modifications: {len(project.get('modifications', []))} | Payments: {len(project.get('payments', []))}\n"
        f"Alert level: {flags.get('alert_level', 'green').upper()} (core count {flags.get('core_count', 0)})\n\n"
        f"Triggered flags:\n" + ("\n".join(triggered) if triggered else "None")
    )
    chat = LlmChat(
        api_key=_key(),
        session_id=f"review-{project['id']}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-5")
    resp = await chat.send_message(UserMessage(text=ctx))
    return {
        "model": "claude-sonnet-5",
        "prompt_version": PROMPT_VERSION,
        "content": resp,
    }


async def summarize_project(project: dict, flags: dict) -> str:
    """Short summary using Claude Haiku 4.5."""
    triggered = [k for k in ("F1", "F2", "F3", "F4", "F5", "F6") if flags.get(k)]
    system = (
        "You are a concise civic audit summarizer. Produce ONE sentence (max 30 words) describing this project "
        "for a scannable list view. Neutral tone. Mention agency, budget, and any triggered flag codes. "
        "Never accuse; flags are screening indicators only."
    )
    ctx = (
        f"{project['title']} | {project['agency']} | {project['municipality']} | "
        f"Budget PHP {project['current_budget']:,.0f} | Status {project['status']} | "
        f"Flags: {', '.join(triggered) if triggered else 'none'}"
    )
    chat = LlmChat(
        api_key=_key(),
        session_id=f"sum-{project['id']}",
        system_message=system,
    ).with_model("anthropic", "claude-haiku-4-5-20251001")
    resp = await chat.send_message(UserMessage(text=ctx))
    return resp.strip()


async def review_change_request(project: dict, field: str, old_value, new_value) -> dict:
    """Advisory risk note for a sensitive edit."""
    system = (
        "You are an audit advisory assistant reviewing a proposed edit to a public expenditure record. "
        "You DO NOT approve or reject. Provide ONLY a short risk note (2-4 sentences) that helps a human verifier decide. "
        "Note whether the change looks routine, unusual, or high-risk, and what to cross-check."
    )
    ctx = (
        f"Project: {project['title']} ({project['agency']})\n"
        f"Field being changed: {field}\n"
        f"Old value: {old_value}\n"
        f"Proposed new value: {new_value}"
    )
    chat = LlmChat(
        api_key=_key(),
        session_id=f"cr-{project['id']}-{field}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-5")
    resp = await chat.send_message(UserMessage(text=ctx))
    # crude risk keyword extraction
    low = resp.lower()
    risk = "low"
    if any(w in low for w in ("high risk", "unusual", "suspicious", "significant")):
        risk = "high"
    elif any(w in low for w in ("moderate", "worth checking", "review recommended")):
        risk = "medium"
    return {
        "model": "claude-sonnet-5",
        "prompt_version": PROMPT_VERSION,
        "content": resp,
        "risk": risk,
    }
