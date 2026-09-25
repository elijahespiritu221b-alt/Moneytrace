# MONEYTRACE — Product Requirements Document

## Original Problem Statement
Rule-based public expenditure screening for Cagayan de Oro City & Misamis Oriental with an internal reviewer console and a read-only public transparency portal. Six flags F1–F6, alert levels Green/Yellow/Orange/Red, sensitive-edit workflow with human approval, append-only audit trail, Claude Sonnet 5 + Haiku 4.5 as advisory-only AI layer.

## Users
- **Admin** — manages rule thresholds, seeds data, sees everything (owner: elijahespiritu221b@gmail.com)
- **Reviewer** — triages flagged projects, records verifications, approves/rejects change requests
- **Public** — anonymous read-only access to `/public`

## Architecture
- **Backend**: FastAPI + Motor (MongoDB async), JWT auth (Bearer + httpOnly cookie), bcrypt hashing, Pydantic v2
- **Frontend**: React 19 + Tailwind + shadcn/ui + react-leaflet + recharts + sonner
- **AI**: Claude Sonnet 5 (deep review, change-request risk notes) + Claude Haiku 4.5 (short summaries) via `emergentintegrations` + `EMERGENT_LLM_KEY`
- **Env vars**: `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `REVIEWER_EMAIL`, `REVIEWER_PASSWORD`, `EMERGENT_LLM_KEY`, `MONGO_URL`, `DB_NAME`

## Implemented (Phase 1 — Initial MVP, Feb 2026)
- ✅ Auth: login/logout/me + JWT + bcrypt + admin & reviewer seeding
- ✅ Seed: 20 realistic CDO/MisOr projects (Macabalan bypass, CDO flood control, Carmen bridge, etc.) with modifications, payments, coordinates, statuses
- ✅ Flag engine F1–F6 with configurable thresholds (F1 with absolute floor, F3 with tolerance %, F4 grouped by project type)
- ✅ Alert-level scoring (Green/Yellow/Orange/Red from core count of F1+F2+F3+F4)
- ✅ Interactive Leaflet + OSM map with alert-colored markers and popups (console + public)
- ✅ Analytics dashboard: alert pie, flag frequency bars, agency budget bars, municipality heatmap
- ✅ Rule Configuration UI (admin only) with sliders + recompute-on-save
- ✅ Sensitive edit workflow: reviewer submits → Claude Sonnet 5 drafts risk note → second reviewer decides
- ✅ Append-only audit trail with LOGIN / SEED / VERIFICATION_FILED / RULE_UPDATED / FLAGS_RECOMPUTED / CHANGE_REQUESTED / APPROVED / REJECTED / RETURNED actions
- ✅ Public transparency portal: overview, map, filterable project cards, project detail with disclaimer banner
- ✅ AI advisory panel on project detail with Sonnet 5 (stored with model + prompt_version + timestamp)
- ✅ RBAC: reviewer blocked from rule-config, self-decide blocked, unauth blocked from console routes
- ✅ 34/35 backend integration tests pass

## Implemented (Phase 2 — Traceability & Seed Depth, Feb 2026)
- ✅ 100 seeded fake reviews (34 AI Reviews + 33 Public Complaints + 33 Change Requests) — contextual, referencing real F1–F6 flag details, mixed statuses/decisions, concentrated on top-25 contractors so entity profiles show meaningful traces (`/app/backend/seed_reviews.py`, wipe with `--wipe`, seed_tag: `seeded:v1`)
- ✅ Backend `GET /api/entities` — aggregates contractor stats across the 7,500-project portfolio (utilization %, avg alert weight, flag counts F1–F6, agencies, LGUs, first/last-seen dates)
- ✅ Backend `GET /api/entities/{name}` — full entity profile: aggregates + projects + AI reviews + complaints + change requests
- ✅ Entity Traceability table upgraded: KPI strip (entities/projects/budget/disbursed/red/orange), 12-column sortable table with Utilization bar, Avg-Alert pill, F1–F6 flag-mix chips, First/Last Seen, and CSV export
- ✅ New Entity Detail page (`/console/entities/:name`): KPIs, alert distribution bars, flag-mix cards, agency/type/LGU breakdown bars, yearly awards timeline, and 4 tabs (Projects · AI Reviews · Complaints · Change Requests) with rich cards linking back to project detail

## Implemented (Phase 3 — Notifications & Watchlist, Feb 2026)
- ✅ **Notification Center**: fan-out on new complaints, new change requests, and green→red alert transitions. New endpoints `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`. Bell icon in `ConsoleLayout` header with unread badge, dropdown panel, mark-all-read, per-item click routes to source (e.g. `/console/complaints`, `/console/requests`, `/console/projects/{id}`). Auto-polls every 25s. Requester is excluded from their own change-request notification.
- ✅ **Entity Watchlist**: `db.entity_watchlist` per-user starred contractors. Endpoints `GET /api/watchlist` and `POST /api/watchlist/{name}` (toggle). Star column added to Entity Traceability with per-row toggle + tinted watched rows; watched entities are pinned to the top regardless of user sort. Star button also on Entity Detail page next to the entity name. `/api/entities` and `/api/entities/{name}` now return `watched: bool` scoped to the current user.

## Implemented (Phase 4 — Security Hardening, Feb 2026)
- ✅ **CORS locked down**: env-driven allowlist (defaults: preview URL + `http://localhost:3000`). Wildcard is explicitly rejected because `allow_credentials=True` requires an origin allowlist. Methods and headers narrowed from `*` to the exact set used.
- ✅ **Security headers middleware** on every response: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (blocks geo/mic/camera/payments).
- ✅ **Login brute-force protection**: 5 attempts / IP / 15 min → HTTP 429. Per-email soft lockout: 5 failed attempts → 30-min lock (`db.login_lockouts`). Success clears state.
- ✅ **Public complaint spam guard**: 3 / IP / hour + 10 / IP / day → HTTP 429. Payload size cap (title ≤ 300, description ≤ 5000).
- ✅ **JWT hardening**: `?token=` query param removed from PDF memo endpoint (was leaking to logs/history/referrer). Cookie-only auth for all endpoints. `access_token` no longer returned in login response body. `localStorage.mt_token` removed from the frontend entirely (`auth-context.jsx`, `api.js`, `ProjectDetail.jsx`). Startup fail-fast if `JWT_SECRET < 32 chars`.
- ✅ **Field allowlists on write endpoints**: `PATCH /projects/{id}/direct` limited to `{description, status, geo_verified, published, monitoring_unit_type, monitoring_unit}`. `POST /change-requests` limited to `{current_budget, end_date, contractor, status, actual_end_date, cost_per_unit, unit_metric}`. Any other field returns 400.
- ✅ **ReDoS defense**: user-supplied `q=` on `/projects` and `/public/projects` is now `re.escape`'d and length-capped before being passed as `$regex`.
- ✅ **Coarse API throttle**: 240 requests / IP / minute across all `/api/*` as a background defense against generic API abuse.

## Implemented (Phase 5 — Login fix + WhatsApp Security Alerts, Sep 2026)
- ✅ **Login fix**: per-IP login throttle raised 5→30 attempts/15 min (shared NAT safe); stale `login_lockouts` cleared. Per-email 5-fail/30-min lock retained.
- ✅ **WhatsApp security alerts** (`backend/whatsapp_alerts.py`, Twilio): dispatched on `account_lockout`, `brute_force_ip`, `api_flood`; 10-min debounce per key; incidents stored in `db.security_alerts`. Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` — currently EMPTY so deliveries are `not_configured` (logged only).
- ✅ **Alert contacts** (admin): `GET/POST /api/security/contacts`, `PATCH/DELETE /{id}`, `POST /{id}/test`, `GET /api/security/status`, `GET /api/security/alerts`, `POST /api/security/alerts/simulate`. PH `09…` numbers normalized to `+63`.
- ✅ Admin page `/console/security` (sidebar "Security Alerts"). Tested: iteration_2.json 100% pass.

## Deferred (v2 backlog)
- Full role model: PM / Finance / Procurement / Inspector / Records officers
- Citizen reporting on public portal (needs captcha + AI pre-moderation + human review)
- Email / SMS notifications (Resend / SendGrid) — currently in-app only
- xlsx / csv admin upload flow (UI + parse pipeline)
- External agency data sync
- Multilingual public portal (Filipino / Bisaya)
- SSO (Google Workspace)
- PDF report exports
- Full-role notifications bell with unread counter (currently placeholder)

## Prioritized Backlog
- **P0**: xlsx admin upload UI, notifications bell wiring, prompt-versioning UI
- **P1**: citizen reporting with moderation, PDF exports, email notifications
- **P2**: multilingual, SSO, external syncs

## Test Credentials
See `/app/memory/test_credentials.md`.
