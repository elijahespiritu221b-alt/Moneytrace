"""PDF case memo generator for MONEYTRACE projects."""
from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
)


FLAG_META = {
    "F1": "Budget Increase",
    "F2": "Modifications",
    "F3": "Payment Discrepancy",
    "F4": "Statistical Outlier",
    "F5": "Schedule Overdue",
    "F6": "Geo Pending",
}

ALERT_COLORS = {
    "green":  colors.HexColor("#059669"),
    "yellow": colors.HexColor("#d97706"),
    "orange": colors.HexColor("#ea580c"),
    "red":    colors.HexColor("#dc2626"),
}

SLATE_900 = colors.HexColor("#0f172a")
SLATE_700 = colors.HexColor("#334155")
SLATE_500 = colors.HexColor("#64748b")
SLATE_300 = colors.HexColor("#cbd5e1")
SLATE_100 = colors.HexColor("#f1f5f9")
SLATE_50  = colors.HexColor("#f8fafc")
SKY_600   = colors.HexColor("#0284c7")


def _php(n):
    try:
        return f"PHP {float(n or 0):,.2f}"
    except Exception:
        return "PHP 0.00"


def _dt(s):
    if not s:
        return "—"
    try:
        if isinstance(s, str):
            s = s.replace("Z", "+00:00")
            d = datetime.fromisoformat(s)
        else:
            d = s
        return d.strftime("%b %d, %Y")
    except Exception:
        return str(s)


def _dtfull(s):
    if not s:
        return "—"
    try:
        if isinstance(s, str):
            s = s.replace("Z", "+00:00")
            d = datetime.fromisoformat(s)
        else:
            d = s
        return d.strftime("%b %d, %Y · %H:%M UTC")
    except Exception:
        return str(s)


def _styles():
    ss = getSampleStyleSheet()
    return {
        "H1":       ParagraphStyle("H1", parent=ss["Heading1"], fontName="Helvetica-Bold",
                                   textColor=SLATE_900, fontSize=20, leading=24, spaceAfter=4),
        "SUBTITLE": ParagraphStyle("SUB", parent=ss["Normal"], fontName="Helvetica",
                                   textColor=SLATE_500, fontSize=10, leading=14, spaceAfter=14),
        "H2":       ParagraphStyle("H2", parent=ss["Heading2"], fontName="Helvetica-Bold",
                                   textColor=SLATE_900, fontSize=12, leading=15,
                                   spaceBefore=14, spaceAfter=6),
        "BODY":     ParagraphStyle("BODY", parent=ss["Normal"], fontName="Helvetica",
                                   textColor=SLATE_700, fontSize=9.5, leading=13),
        "SMALL":    ParagraphStyle("SM", parent=ss["Normal"], fontName="Helvetica",
                                   textColor=SLATE_500, fontSize=8, leading=11),
        "LABEL":    ParagraphStyle("LBL", parent=ss["Normal"], fontName="Helvetica-Bold",
                                   textColor=SLATE_500, fontSize=7.5, leading=10,
                                   letterSpacing=1),
        "VALUE":    ParagraphStyle("VAL", parent=ss["Normal"], fontName="Helvetica",
                                   textColor=SLATE_900, fontSize=10, leading=13),
        "DISCLAIM": ParagraphStyle("DIS", parent=ss["Normal"], fontName="Helvetica-Oblique",
                                   textColor=SLATE_500, fontSize=8, leading=11),
    }


def _kv_grid(pairs, styles, ncols=2, col_widths=None):
    """pairs: list of (label, value_str). Renders a grid table."""
    rows = []
    row = []
    for i, (lbl, val) in enumerate(pairs):
        cell = [
            Paragraph(lbl.upper(), styles["LABEL"]),
            Paragraph(str(val) if val is not None else "—", styles["VALUE"]),
        ]
        row.append(cell)
        if len(row) == ncols:
            rows.append(row)
            row = []
    if row:
        while len(row) < ncols:
            row.append([Paragraph("", styles["LABEL"])])
        rows.append(row)
    if not rows:
        return Spacer(1, 4)
    t = Table(rows, colWidths=col_widths or [3.4 * inch] * ncols, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SLATE_50),
        ("BOX",        (0, 0), (-1, -1), 0.5, SLATE_300),
        ("INNERGRID",  (0, 0), (-1, -1), 0.3, SLATE_300),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def _alert_banner(level, core_count, styles):
    color = ALERT_COLORS.get(level or "green", ALERT_COLORS["green"])
    label = (level or "green").upper()
    t = Table(
        [[Paragraph(f"<b>ALERT LEVEL: {label}</b>", ParagraphStyle(
            "AB", fontName="Helvetica-Bold", textColor=colors.white,
            fontSize=11, leading=14
        )),
          Paragraph(f"<b>Core count: {core_count}</b>", ParagraphStyle(
            "AB2", fontName="Helvetica-Bold", textColor=colors.white,
            fontSize=10, leading=14, alignment=2
        ))]],
        colWidths=[4.5 * inch, 2.3 * inch],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), color),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def _flags_section(flags, styles):
    story = [Paragraph("Screening Indicators", styles["H2"])]
    if not flags:
        story.append(Paragraph("No flag record available.", styles["BODY"]))
        return story
    codes = ["F1", "F2", "F3", "F4", "F5", "F6"]
    triggered = [c for c in codes if flags.get(c)]
    if not triggered:
        story.append(Paragraph("No screening indicators triggered on this project.", styles["BODY"]))
        return story
    for c in triggered:
        header = f"<b>{c} — {FLAG_META[c]}</b>"
        detail = flags.get(f"{c}_detail", "") or ""
        cell = [
            Paragraph(header, ParagraphStyle("FH", fontName="Helvetica-Bold",
                                             textColor=SLATE_900, fontSize=10, leading=13)),
            Paragraph(detail, styles["BODY"]),
        ]
        t = Table([[cell]], colWidths=[6.8 * inch])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), SLATE_50),
            ("BOX",           (0, 0), (-1, -1), 0.5, SLATE_300),
            ("LINEBEFORE",    (0, 0), (0, -1), 3, colors.HexColor("#f59e0b")),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 4))
    return story


def _table_block(headers, rows, col_widths, styles, empty_msg="— No records —"):
    if not rows:
        return Paragraph(empty_msg, styles["SMALL"])
    data = [[Paragraph(f"<b>{h}</b>", ParagraphStyle(
        "TH", fontName="Helvetica-Bold", textColor=colors.white,
        fontSize=8, leading=10, letterSpacing=0.5
    )) for h in headers]]
    for r in rows:
        data.append([Paragraph(str(c) if c is not None else "—", styles["SMALL"]) for c in r])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), SLATE_900),
        ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, SLATE_50]),
        ("BOX",           (0, 0), (-1, -1), 0.5, SLATE_300),
        ("INNERGRID",     (0, 0), (-1, -1), 0.25, SLATE_300),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _header_footer(canvas, doc):
    canvas.saveState()
    # Header
    canvas.setFillColor(SLATE_900)
    canvas.rect(0, LETTER[1] - 0.5 * inch, LETTER[0], 0.5 * inch, fill=1, stroke=0)
    canvas.setFillColor(SKY_600)
    canvas.rect(0.5 * inch, LETTER[1] - 0.35 * inch, 0.2 * inch, 0.2 * inch, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 11)
    canvas.drawString(0.8 * inch, LETTER[1] - 0.28 * inch, "MONEYTRACE")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(SLATE_300)
    canvas.drawString(0.8 * inch, LETTER[1] - 0.42 * inch,
                      "CDO · Misamis Oriental · Public Expenditure Screening")
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(LETTER[0] - 0.5 * inch, LETTER[1] - 0.32 * inch,
                           f"Case Memo · {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    # Footer
    canvas.setFillColor(SLATE_500)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(0.5 * inch, 0.35 * inch,
                      "Flags are automated screening indicators — not proof of financial wrongdoing.")
    canvas.drawRightString(LETTER[0] - 0.5 * inch, 0.35 * inch, f"Page {doc.page}")
    canvas.restoreState()


def render_case_memo(project: dict, flags: dict, audit: list, ai_reviews: list) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=LETTER,
        topMargin=0.75 * inch, bottomMargin=0.6 * inch,
        leftMargin=0.5 * inch, rightMargin=0.5 * inch,
        title=f"Case Memo — {project.get('title', 'Project')}",
        author="MONEYTRACE",
    )
    S = _styles()
    story = []

    # Title
    story.append(Paragraph(project.get("title", "Untitled Project"), S["H1"]))
    story.append(Paragraph(
        f"{project.get('agency', '—')} · {project.get('municipality', '—')} · {project.get('project_type', '—')} · {project.get('status', '—')}",
        S["SUBTITLE"]
    ))

    # Alert banner
    story.append(_alert_banner(flags.get("alert_level"), flags.get("core_count", 0), S))
    story.append(Spacer(1, 12))

    # Identification
    story.append(Paragraph("Project Identification", S["H2"]))
    story.append(_kv_grid([
        ("Project ID", project.get("id", "—")),
        ("Implementing Agency", project.get("agency", "—")),
        ("Municipality", project.get("municipality", "—")),
        ("Project Type", project.get("project_type", "—")),
        ("Status", project.get("status", "—")),
        ("Contractor", project.get("contractor", "—")),
        ("Published", "Yes" if project.get("published") else "No"),
        ("Geo Verified", "Yes" if project.get("geo_verified") else "No — F6 pending"),
    ], S))

    # Financials
    story.append(Paragraph("Financial Overview", S["H2"]))
    approved = float(project.get("approved_budget") or 0)
    current = float(project.get("current_budget") or 0)
    disbursed = float(project.get("disbursed_amount") or 0)
    delta = current - approved
    delta_pct = (delta / approved * 100) if approved else 0
    story.append(_kv_grid([
        ("Approved Budget", _php(approved)),
        ("Current Budget", _php(current)),
        ("Budget Delta", f"{_php(delta)}  ({delta_pct:+.1f}%)"),
        ("Disbursed Amount", _php(disbursed)),
        ("Cost per Unit", f"{_php(project.get('cost_per_unit'))} {project.get('unit_metric') or ''}"),
        ("Unit Metric", project.get("unit_metric", "—")),
    ], S))

    # Schedule + location
    story.append(Paragraph("Schedule & Location", S["H2"]))
    loc = project.get("location") or {}
    story.append(_kv_grid([
        ("Start Date", _dt(project.get("start_date"))),
        ("Planned End Date", _dt(project.get("end_date"))),
        ("Actual End Date", _dt(project.get("actual_end_date"))),
        ("Coordinates", f"{loc.get('lat', '—'):.4f}, {loc.get('lng', '—'):.4f}"
         if isinstance(loc.get("lat"), (int, float)) else "—"),
        ("Address", loc.get("address", "—")),
        ("Description", project.get("description") or "—"),
    ], S))

    # Flags
    story.extend(_flags_section(flags or {}, S))

    # Modifications
    story.append(Paragraph("Modifications", S["H2"]))
    mods = project.get("modifications") or []
    mod_rows = [(_dt(m.get("date")), m.get("reason", "—"), _php(m.get("delta_amount", 0))) for m in mods]
    story.append(_table_block(
        ["Date", "Reason", "Delta Amount"], mod_rows,
        [1.1 * inch, 4.4 * inch, 1.3 * inch], S,
        empty_msg=f"— No modifications recorded — (threshold check: {len(mods)} of max {flags.get('F2_max', '—') if isinstance(flags, dict) else '—'})",
    ))

    # Payments
    story.append(Paragraph("Payments", S["H2"]))
    pays = project.get("payments") or []
    pay_rows = [
        (_dt(p.get("date")), p.get("milestone", "—"), _php(p.get("amount", 0)),
         f"{float(p.get('verified_progress_pct', 0) or 0):.0f}%")
        for p in pays
    ]
    story.append(_table_block(
        ["Date", "Milestone", "Amount", "Verified %"], pay_rows,
        [1.0 * inch, 3.2 * inch, 1.6 * inch, 1.0 * inch], S,
    ))

    # AI advisory (latest)
    latest_ai = ai_reviews[0] if ai_reviews else None
    if latest_ai:
        story.append(Paragraph("Claude AI Advisory (latest)", S["H2"]))
        story.append(Paragraph(
            f"<font color='#64748b'>Model: {latest_ai.get('model', '—')} · Prompt: {latest_ai.get('prompt_version', '—')} · Generated {_dtfull(latest_ai.get('created_at'))}</font>",
            S["SMALL"]
        ))
        story.append(Spacer(1, 4))
        content = (latest_ai.get("content") or "").replace("\n", "<br/>")
        adv = Table(
            [[Paragraph(content, S["BODY"])]],
            colWidths=[6.8 * inch],
        )
        adv.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor("#faf5ff")),
            ("BOX",           (0, 0), (-1, -1), 0.5, colors.HexColor("#c084fc")),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("TOPPADDING",    (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(adv)
        story.append(Paragraph(
            "Advisory only — AI outputs are context and drafts. Humans decide.",
            S["DISCLAIM"]
        ))

    # Audit trail
    story.append(PageBreak())
    story.append(Paragraph("Audit Trail (Append-Only)", S["H2"]))
    audit_rows = [
        (_dtfull(a.get("timestamp")),
         (a.get("actor_email") or "system") + f" / {a.get('actor_role') or '—'}",
         a.get("action", "—"),
         a.get("note", "") or "—")
        for a in audit
    ]
    story.append(_table_block(
        ["Timestamp", "Actor / Role", "Action", "Note"],
        audit_rows,
        [1.5 * inch, 2.0 * inch, 1.4 * inch, 1.9 * inch],
        S,
        empty_msg="— No audit entries associated with this project —",
    ))

    # Footer note
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "This memo was generated from the MONEYTRACE screening system. "
        "All flag calculations follow the configured rule thresholds at the time of export. "
        "Screening indicators are not proof of financial wrongdoing and require human verification.",
        S["DISCLAIM"]
    ))

    doc.build(story, onFirstPage=_header_footer, onLaterPages=_header_footer)
    buf.seek(0)
    return buf.read()
