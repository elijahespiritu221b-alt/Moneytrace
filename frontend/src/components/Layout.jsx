import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { Button } from "./ui/button";
import {
  LayoutDashboard, Building2, ChevronDown, ChevronRight,
  ClipboardList, Sparkles, ShieldCheck, AlertOctagon,
  DollarSign, CreditCard, CalendarClock, Clock,
  ScanSearch, Map, Users, Sliders, ScrollText, Megaphone,
  LogOut, Globe, GraduationCap, HardHat, Stethoscope,
} from "lucide-react";

export function ConsoleLayout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [agenciesOpen, setAgenciesOpen] = useState(true);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 grain-bg">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#0B0F17]/95 backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-sky-500 grid place-items-center font-bold text-slate-950">M</div>
            <div>
              <div className="font-display text-lg font-bold leading-none">MONEYTRACE</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400">CDO · Misamis Oriental</div>
            </div>
            <span className="hidden md:inline-flex ml-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-sky-500/15 text-sky-400 border border-sky-500/30">
              Reviewer Console
            </span>
          </div>
          <div className="flex items-center gap-3">
            <NavLink to="/public" className="text-xs text-slate-400 hover:text-sky-400 inline-flex items-center gap-1" data-testid="nav-public">
              <Globe className="w-3.5 h-3.5" /> Public Portal
            </NavLink>
            <div className="hidden md:flex flex-col items-end">
              <div className="text-xs text-slate-200">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> {user?.role}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={async () => { await logout(); nav("/login"); }} data-testid="btn-logout">
              <LogOut className="w-4 h-4 mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-4 md:px-6 py-4 md:py-6 grid grid-cols-12 gap-6">
        <aside className="hidden md:block col-span-3 lg:col-span-2">
          <nav className="sticky top-20 space-y-4 pr-1">
            <Section title="Main">
              <Item to="/console" icon={LayoutDashboard} label="Dashboard" testid="nav-dashboard" end />
            </Section>

            <Section title="Agencies">
              <button
                onClick={() => setAgenciesOpen((v) => !v)}
                data-testid="nav-agencies-toggle"
                className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-800/60"
              >
                <Building2 className="w-4 h-4" />
                <span className="flex-1 text-left">Agencies &amp; Districts</span>
                {agenciesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {agenciesOpen && (
                <div className="ml-2 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
                  <NavLink to="/console/offices" end
                    data-testid="nav-agencies-all"
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                        isActive ? "bg-sky-500/15 text-sky-400" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                      }`
                    }>
                    <Building2 className="w-3 h-3" /> All (15 offices)
                  </NavLink>
                  <SubItem to="/console/offices/DEPED/units" icon={GraduationCap} label="DepEd" testid="nav-sub-deped" />
                  <SubItem to="/console/offices/DPWH/units"  icon={HardHat}       label="DPWH"  testid="nav-sub-dpwh" />
                  <SubItem to="/console/offices/DOH/units"   icon={Stethoscope}   label="DOH"   testid="nav-sub-doh" />
                </div>
              )}
            </Section>

            <Section title="Requests">
              <Item to="/console/requests" icon={ClipboardList} label="Request Management" testid="nav-requests" />
              <Item to="/console/complaints" icon={Megaphone} label="Complaints" testid="nav-complaints" />
            </Section>

            <Section title="AI-Assisted Review">
              <Item to="/console/ai-review" icon={Sparkles} label="AI Review Queue" testid="nav-ai-review" />
              <Item to="/console/verification" icon={ShieldCheck} label="Human Verification" testid="nav-verification" />
              <Item to="/console/ai-exceptions" icon={AlertOctagon} label="AI Exceptions" testid="nav-ai-exceptions" />
            </Section>

            <Section title="Monitoring">
              <Item to="/console/monitoring/financial" icon={DollarSign} label="Financial Monitoring" testid="nav-mon-fin" />
              <Item to="/console/monitoring/payment" icon={CreditCard} label="Payment Monitoring" testid="nav-mon-pay" />
              <Item to="/console/monitoring/schedule" icon={CalendarClock} label="Schedule Monitoring" testid="nav-mon-sch" />
              <Item to="/console/monitoring/delayed" icon={Clock} label="Delayed Projects" testid="nav-mon-del" />
            </Section>

            <Section title="Analysis">
              <Item to={{ pathname: "/console/analysis/anomaly", search: "?flag=F4&title=Anomaly%20Screening" }} icon={ScanSearch} label="Anomaly Screening" testid="nav-analysis-anomaly" />
              <Item to="/console/analysis/map" icon={Map} label="Project Map" testid="nav-analysis-map" />
              <Item to="/console/analysis/entities" icon={Users} label="Entity Traceability" testid="nav-analysis-entities" />
            </Section>

            {user?.role === "admin" && (
              <Section title="Administration">
                <Item to="/console/rules" icon={Sliders} label="Rule Configuration" testid="nav-rules" />
                <Item to="/console/audit" icon={ScrollText} label="Audit Trail" testid="nav-audit" />
              </Section>
            )}
          </nav>
        </aside>
        <main className="col-span-12 md:col-span-9 lg:col-span-10 min-w-0">{children}</main>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Item({ to, icon: Icon, label, testid, end }) {
  return (
    <NavLink to={to} end={end} data-testid={testid}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
          isActive
            ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
            : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
        }`
      }>
      <Icon className="w-4 h-4" /> {label}
    </NavLink>
  );
}

function SubItem({ to, icon: Icon, label, testid }) {
  return (
    <NavLink to={to} data-testid={testid}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
          isActive ? "bg-sky-500/15 text-sky-400" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
        }`
      }>
      <Icon className="w-3 h-3" /> {label}
    </NavLink>
  );
}

export function PublicLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1400px] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-emerald-600 grid place-items-center font-bold text-white">M</div>
            <div>
              <div className="font-display text-lg font-bold leading-none">MONEYTRACE — Public Transparency</div>
              <div className="text-[11px] uppercase tracking-widest text-slate-500">Cagayan de Oro City · Misamis Oriental</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NavLink to="/public" className="text-sm text-slate-600 hover:text-emerald-700" data-testid="public-nav-home">Home</NavLink>
            <NavLink to="/login" className="text-sm text-slate-600 hover:text-emerald-700" data-testid="public-nav-login">Reviewer Login</NavLink>
          </div>
        </div>
        <div className="bg-amber-50 border-t border-amber-200 text-amber-900 text-sm px-6 py-2.5 text-center">
          <strong>NOTICE:</strong> Flagged indicators are automated screening markers derived from public records — not proof of financial wrongdoing.
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-8 md:py-12">{children}</main>
      <footer className="border-t border-slate-200 mt-16 py-6 text-center text-xs text-slate-500">
        MONEYTRACE Public Transparency Portal · Data compiled from public expenditure records.
      </footer>
    </div>
  );
}
