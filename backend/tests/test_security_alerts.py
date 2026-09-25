"""Backend tests for MONEYTRACE security-alerts feature + login/lockout flow."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://project-audit-hub-5.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "elijahespiritu221b@gmail.com"
ADMIN_PASS = "MoneyTrace2026!"
REVIEWER_EMAIL = "reviewer@moneytrace.gov.ph"
REVIEWER_PASS = "Reviewer2026!"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    return s, r


@pytest.fixture(scope="module")
def admin_session():
    s, r = _login(ADMIN_EMAIL, ADMIN_PASS)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    # cookie access_token must be set
    assert any(c.name == "access_token" for c in s.cookies), "access_token cookie not set"
    return s


@pytest.fixture(scope="module")
def reviewer_session():
    s, r = _login(REVIEWER_EMAIL, REVIEWER_PASS)
    assert r.status_code == 200, f"reviewer login failed: {r.status_code} {r.text}"
    return s


# ---------- Login / cookie auth ----------
class TestAuth:
    def test_login_sets_httponly_cookie(self, admin_session):
        # verify cookie flags via raw response
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        assert r.status_code == 200
        set_cookie = r.headers.get("set-cookie", "")
        assert "access_token=" in set_cookie
        assert "HttpOnly" in set_cookie

    def test_me_with_cookie(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json().get("role") == "admin"

    def test_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong-xyz"})
        assert r.status_code == 401


# ---------- Security endpoints (admin only) ----------
class TestSecurityAdmin:
    def test_status(self, admin_session):
        r = admin_session.get(f"{API}/security/status")
        assert r.status_code == 200
        j = r.json()
        assert j["whatsapp_configured"] is False
        assert "rules" in j and isinstance(j["rules"], dict)

    def test_status_reviewer_forbidden(self, reviewer_session):
        r = reviewer_session.get(f"{API}/security/status")
        assert r.status_code == 403

    def test_contacts_reviewer_forbidden(self, reviewer_session):
        r = reviewer_session.get(f"{API}/security/contacts")
        assert r.status_code == 403

    def test_contact_crud_full_flow(self, admin_session):
        unique_name = f"TEST_{uuid.uuid4().hex[:6]}"
        # invalid phone
        r_bad = admin_session.post(f"{API}/security/contacts",
                                   json={"name": unique_name, "title": "Chief", "phone": "abc"})
        assert r_bad.status_code == 400, r_bad.text

        # create with local PH mobile format -> normalized to +63...
        r = admin_session.post(f"{API}/security/contacts",
                               json={"name": unique_name, "title": "Chief", "phone": "09171234567"})
        assert r.status_code == 201, r.text
        contact = r.json()
        assert contact["phone"].startswith("+639"), contact
        cid = contact["id"]

        # duplicate → 409
        r_dup = admin_session.post(f"{API}/security/contacts",
                                   json={"name": unique_name, "title": "x", "phone": "09171234567"})
        assert r_dup.status_code == 409

        # list
        r_list = admin_session.get(f"{API}/security/contacts")
        assert r_list.status_code == 200
        assert any(c["id"] == cid for c in r_list.json())

        # patch toggles enabled
        r_pat = admin_session.patch(f"{API}/security/contacts/{cid}")
        assert r_pat.status_code == 200

        # test send -> not_configured
        r_test = admin_session.post(f"{API}/security/contacts/{cid}/test")
        assert r_test.status_code == 200
        assert r_test.json().get("status") == "not_configured"

        # delete
        r_del = admin_session.delete(f"{API}/security/contacts/{cid}")
        assert r_del.status_code == 200
        # repeat -> 404
        r_del2 = admin_session.delete(f"{API}/security/contacts/{cid}")
        assert r_del2.status_code == 404

    def test_simulate_alert_creates_incident(self, admin_session):
        # create one contact so we get a delivery entry
        name = f"TEST_{uuid.uuid4().hex[:6]}"
        phone = f"0917{uuid.uuid4().int % 10000000:07d}"
        r_c = admin_session.post(f"{API}/security/contacts",
                                 json={"name": name, "title": "Test", "phone": phone})
        assert r_c.status_code == 201, r_c.text
        cid = r_c.json()["id"]
        try:
            r = admin_session.post(f"{API}/security/alerts/simulate")
            assert r.status_code == 200, r.text
            inc = r.json()
            assert inc.get("kind")
            assert isinstance(inc.get("deliveries"), list)
            # at least one delivery matches our contact
            assert any(d.get("contact_id") == cid for d in inc["deliveries"])

            r_list = admin_session.get(f"{API}/security/alerts")
            assert r_list.status_code == 200
            assert any(a["id"] == inc["id"] for a in r_list.json())
        finally:
            admin_session.delete(f"{API}/security/contacts/{cid}")


# ---------- Account lockout after 5 failed logins ----------
class TestAccountLockout:
    def test_lockout_after_5_fails_and_alert(self, admin_session):
        victim = f"victim-test-{uuid.uuid4().hex[:6]}@x.com"
        # 5 wrong-password attempts → all 401
        for i in range(5):
            r = requests.post(f"{API}/auth/login", json={"email": victim, "password": "nope"})
            assert r.status_code == 401, f"attempt {i+1} got {r.status_code}"
        # 6th attempt → 429 locked
        r6 = requests.post(f"{API}/auth/login", json={"email": victim, "password": "nope"})
        assert r6.status_code == 429, f"expected 429, got {r6.status_code} {r6.text}"
        assert "locked" in r6.text.lower()

        # incident visible in admin alerts list
        r_alerts = admin_session.get(f"{API}/security/alerts")
        assert r_alerts.status_code == 200
        kinds = [a["kind"] for a in r_alerts.json()]
        assert "account_lockout" in kinds, f"account_lockout not in {kinds}"
