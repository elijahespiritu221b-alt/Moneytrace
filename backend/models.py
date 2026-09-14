"""Pydantic models for MONEYTRACE."""
from datetime import datetime, timezone
from typing import List, Optional, Any
from pydantic import BaseModel, Field, EmailStr, ConfigDict
import uuid


def gen_id() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------- Users ----------
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str  # "admin" | "reviewer"


class UserCreate(UserBase):
    password: str


class UserOut(UserBase):
    id: str
    created_at: datetime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------- Projects ----------
class Location(BaseModel):
    lat: float
    lng: float
    address: Optional[str] = None


class Modification(BaseModel):
    date: datetime
    reason: str
    delta_amount: float = 0.0


class Payment(BaseModel):
    date: datetime
    milestone: str
    amount: float
    verified_progress_pct: float  # 0-100


class Project(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=gen_id)
    title: str
    agency: str
    municipality: str
    project_type: str  # "Roads" | "Bridges" | "Water" | "Buildings" | "Flood Control"
    status: str  # "Planning" | "Ongoing" | "Completed" | "On Hold"
    approved_budget: float
    current_budget: float
    disbursed_amount: float
    contractor: str
    start_date: datetime
    end_date: datetime
    actual_end_date: Optional[datetime] = None
    location: Location
    modifications: List[Modification] = Field(default_factory=list)
    payments: List[Payment] = Field(default_factory=list)
    geo_verified: bool = False
    published: bool = True
    cost_per_unit: Optional[float] = None  # for F4
    unit_metric: Optional[str] = None  # e.g. "PHP/km"
    description: Optional[str] = ""
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class ProjectFlags(BaseModel):
    project_id: str
    F1: bool = False
    F2: bool = False
    F3: bool = False
    F4: bool = False
    F5: bool = False
    F6: bool = False
    F1_detail: str = ""
    F2_detail: str = ""
    F3_detail: str = ""
    F4_detail: str = ""
    F5_detail: str = ""
    F6_detail: str = ""
    alert_level: str = "green"  # green|yellow|orange|red
    core_count: int = 0
    computed_at: datetime = Field(default_factory=now_utc)


# ---------- Rule Configuration ----------
class RuleConfig(BaseModel):
    id: str = "default"
    F1_pct: float = 20.0       # % budget increase threshold
    F1_floor: float = 500000.0  # PHP absolute floor
    F2_max_mods: int = 5
    F3_tolerance_pct: float = 5.0  # payment vs progress tolerance
    F4_z_threshold: float = 2.0
    F5_days_overdue: int = 90
    updated_at: datetime = Field(default_factory=now_utc)
    updated_by: Optional[str] = None


# ---------- Audit ----------
class AuditLog(BaseModel):
    id: str = Field(default_factory=gen_id)
    timestamp: datetime = Field(default_factory=now_utc)
    actor_id: Optional[str] = None
    actor_email: Optional[str] = None
    actor_role: Optional[str] = None
    action: str  # FLAG_TRIGGERED, VERIFICATION_FILED, CHANGE_REQUESTED, APPROVED, REJECTED, RULE_UPDATED, PUBLISHED, LOGIN, SEED
    project_id: Optional[str] = None
    before: Optional[Any] = None
    after: Optional[Any] = None
    note: str = ""


# ---------- Change Requests ----------
class ChangeRequest(BaseModel):
    id: str = Field(default_factory=gen_id)
    project_id: str
    field: str
    old_value: Any = None
    new_value: Any = None
    requested_by: str
    requested_by_email: str
    requested_at: datetime = Field(default_factory=now_utc)
    status: str = "pending"  # pending|approved|rejected
    ai_review: Optional[str] = None
    ai_risk: Optional[str] = None
    decided_by: Optional[str] = None
    decided_at: Optional[datetime] = None
    decision_note: Optional[str] = None


# ---------- Notifications ----------
class Notification(BaseModel):
    id: str = Field(default_factory=gen_id)
    user_id: str
    title: str
    body: str
    link: Optional[str] = None
    read: bool = False
    created_at: datetime = Field(default_factory=now_utc)
