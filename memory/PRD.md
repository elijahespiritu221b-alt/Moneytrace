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
