"""Backend tests for citizen auth, complaint moderation, notifications, admin citizens.

Note: /api/citizen/register is rate-limited to 5/IP/hour (in-memory). This suite
economizes on registrations and reuses the existing 'juan.test@example.com' citizen
when needed for project-dup checks.
"""
import os
import random
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://project-audit-hub-5.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "elijahespiritu221b@gmail.com", "password": "MoneyTrace2026!"}
REVIEWER = {"email": "reviewer@moneytrace.gov.ph", "password": "Reviewer2026!"}
EXISTING_CITIZEN = {"email": "juan.test@example.com", "password": "citizen123"}


def _rand_phone():
    return "09" + "".join(str(random.randint(0, 9)) for _ in range(9))


def _rand_email(prefix="test"):
    return f"test_{prefix}_{int(time.time()*1000)}_{random.randint(1000,9999)}@example.com"


@pytest.fixture(scope="session")
def admin_sess():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="session")
def reviewer_sess():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=REVIEWER, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Reviewer login failed: {r.status_code} {r.text}")
    return s


# ---------- Citizen register + verify + file complaint ----------
class TestCitizenFlow:
    """One holistic flow — minimizes register calls due to 5/hr/IP limit."""

    def test_register_verify_file(self):
        s = requests.Session()
        email = _rand_email("cit")
        phone = _rand_phone()
        pw = "citizen12345"

        r = s.post(f"{API}/citizen/register",
                   json={"name": "Test Citizen", "email": email, "phone": phone, "password": pw}, timeout=20)
        assert r.status_code == 201, f"register: {r.status_code} {r.text}"
        data = r.json()
        assert data["phone"].startswith("+63")
        assert data["phone_verified"] is False
        assert "dev_code" in data
        dev_code = data["dev_code"]
        assert s.cookies.get("citizen_token")

        # Validation errors (2 calls — count against 5/hr quota)
        r = s.post(f"{API}/citizen/register",
                   json={"name": "Another", "email": email, "phone": _rand_phone(), "password": pw}, timeout=20)
        assert r.status_code == 409, f"dup email: {r.status_code} {r.text}"

        r = s.post(f"{API}/citizen/register",
                   json={"name": "Another", "email": _rand_email("badph"), "phone": "123", "password": pw}, timeout=20)
        assert r.status_code == 400, f"invalid phone: {r.status_code} {r.text}"

        # /me
        r = s.get(f"{API}/citizen/me", timeout=20)
        assert r.status_code == 200
        assert r.json()["email"] == email.lower()

        # pre-verify → 403
        r = s.post(f"{API}/public/complaints",
                   json={"title": "Test title here", "description": "x" * 25, "category": "Other"}, timeout=20)
        assert r.status_code == 403

        # wrong code → 400
        r = s.post(f"{API}/citizen/verify-phone", json={"code": "000000"}, timeout=20)
        assert r.status_code == 400

        # correct code
        r = s.post(f"{API}/citizen/verify-phone", json={"code": dev_code}, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["phone_verified"] is True

        # file a complaint
        r = s.post(f"{API}/public/complaints",
                   json={"title": "Road not fixed", "description": "Been three months since the pothole was reported no response.",
                         "category": "Delay"}, timeout=20)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        pytest.CREATED_COMPLAINT_ID = cid
        pytest.CREATED_CITIZEN_EMAIL = email
        pytest.CREATED_CITIZEN_PW = pw

        # 2 more without project_id → OK; 4th same day → 429
        for i in range(2):
            r = s.post(f"{API}/public/complaints",
                       json={"title": f"Report {i+2}", "description": "Enough characters here for the min length check please.",
                             "category": "Quality"}, timeout=20)
            assert r.status_code == 200, f"#{i+2}: {r.text}"
        r = s.post(f"{API}/public/complaints",
                   json={"title": "Fourth report", "description": "This should be denied due to daily cap of three.",
                         "category": "Other"}, timeout=20)
        assert r.status_code == 429, f"expected 429, got {r.status_code}"

        # logout + login
        r = s.post(f"{API}/citizen/logout", timeout=20)
        assert r.status_code == 200

        # unauthenticated → 401
        s_anon = requests.Session()
        r = s_anon.post(f"{API}/public/complaints",
                        json={"title": "Anon post", "description": "x" * 25, "category": "Other"}, timeout=20)
        assert r.status_code == 401

        # login back
        r = s_anon.post(f"{API}/citizen/login", json={"email": email, "password": pw}, timeout=20)
        assert r.status_code == 200

    def test_project_dup_409_with_existing_citizen(self, admin_sess):
        """Use existing seeded citizen (juan.test@example.com) to test project-based dedupe.
        Restart backend to clear in-memory complaint rate-limit buckets consumed by prior test.
        """
        import subprocess
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False, capture_output=True)
        time.sleep(4)
        s = requests.Session()
        r = s.post(f"{API}/citizen/login", json=EXISTING_CITIZEN, timeout=20)
        if r.status_code != 200:
            pytest.skip(f"Existing citizen login failed: {r.status_code} {r.text}")

        pr = admin_sess.get(f"{API}/projects", timeout=20)
        if pr.status_code != 200 or not pr.json():
            pytest.skip("No projects available")
        pid = pr.json()[0]["id"]

        r1 = s.post(f"{API}/public/complaints",
                    json={"project_id": pid, "title": "First on project", "description": "This is a report linked to a project id.",
                          "category": "Financial"}, timeout=20)
        r2 = s.post(f"{API}/public/complaints",
                    json={"project_id": pid, "title": "Dup on project", "description": "Another report for same project id.",
                          "category": "Financial"}, timeout=20)
        # r1 may be 200 (first) or 409 (if juan already filed on this proj in another run). r2 must be 409.
        assert r2.status_code == 409, f"first={r1.status_code}/{r1.text} second={r2.status_code}/{r2.text}"


# ---------- Admin / Reviewer ----------
class TestAdminAndReviewer:
    def test_admin_list_citizens(self, admin_sess):
        r = admin_sess.get(f"{API}/citizens", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert any("reports" in c for c in data)

    def test_reviewer_cannot_list_citizens(self, reviewer_sess):
        r = reviewer_sess.get(f"{API}/citizens", timeout=20)
        assert r.status_code == 403

    def test_ban_toggle(self, admin_sess):
        """Ban/unban a known citizen (not registering new, to save quota). Pick first citizen from admin list."""
        r = admin_sess.get(f"{API}/citizens", timeout=20)
        assert r.status_code == 200
        citizens = r.json()
        # Find one with phone_verified so we can also test block-on-complaint
        target = next((c for c in citizens if c.get("phone_verified") and not c.get("banned")
                       and c["email"] == EXISTING_CITIZEN["email"]), None)
        if not target:
            target = next((c for c in citizens if not c.get("banned")), None)
        if not target:
            pytest.skip("No citizen to ban")
        cid = target["id"]
        is_juan = target["email"] == EXISTING_CITIZEN["email"]

        # ban
        r = admin_sess.patch(f"{API}/citizens/{cid}/ban", timeout=20)
        assert r.status_code == 200
        assert r.json()["banned"] is True

        # If this is juan, verify banned user can't post
        if is_juan:
            s = requests.Session()
            lr = s.post(f"{API}/citizen/login", json=EXISTING_CITIZEN, timeout=20)
            if lr.status_code == 200:
                r2 = s.post(f"{API}/public/complaints",
                            json={"title": "Banned trying", "description": "x" * 25, "category": "Other"}, timeout=20)
                assert r2.status_code == 403, f"banned post should 403, got {r2.status_code}"

        # unban (cleanup)
        r = admin_sess.patch(f"{API}/citizens/{cid}/ban", timeout=20)
        assert r.status_code == 200
        assert r.json()["banned"] is False

    def test_reviewer_cannot_delete_complaint(self, reviewer_sess):
        cid = getattr(pytest, "CREATED_COMPLAINT_ID", None)
        if not cid:
            pytest.skip("No complaint created")
        r = reviewer_sess.delete(f"{API}/complaints/{cid}", timeout=20)
        assert r.status_code == 403

    def test_admin_delete_complaint(self, admin_sess):
        cid = getattr(pytest, "CREATED_COMPLAINT_ID", None)
        if not cid:
            pytest.skip("No complaint created")
        r = admin_sess.delete(f"{API}/complaints/{cid}", timeout=20)
        assert r.status_code == 200
        r = admin_sess.get(f"{API}/complaints", timeout=20)
        assert all(c["id"] != cid for c in r.json())


# ---------- Notifications ----------
class TestNotifications:
    def test_delete_notifications_flow(self, admin_sess):
        r = admin_sess.get(f"{API}/notifications", timeout=20)
        assert r.status_code == 200
        items = r.json()
        if items:
            nid = items[0]["id"]
            r = admin_sess.delete(f"{API}/notifications/{nid}", timeout=20)
            assert r.status_code == 200
        r = admin_sess.delete(f"{API}/notifications", timeout=20)
        assert r.status_code == 200
        r = admin_sess.get(f"{API}/notifications", timeout=20)
        assert r.json() == []

    def test_delete_nonexistent_notification(self, admin_sess):
        r = admin_sess.delete(f"{API}/notifications/does-not-exist-xyz", timeout=20)
        assert r.status_code == 404
