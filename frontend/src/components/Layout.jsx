import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { Button } from "./ui/button";
import { LayoutDashboard, ListTree, Map, Sliders, ScrollText, LogOut, ShieldCheck, Globe, Inbox, Building2 } from "lucide-react";

export function ConsoleLayout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const links = [
    { to: "/console", icon: LayoutDashboard, label: "Dashboard", testid: "nav-dashboard" },
    { to: "/console/offices", icon: Building2, label: "DILG Offices", testid: "nav-offices" },
    { to: "/console/projects", icon: ListTree, label: "Projects", testid: "nav-projects" },
    { to: "/console/requests", icon: Inbox, label: "Change Requests", testid: "nav-requests" },
    { to: "/console/audit", icon: ScrollText, label: "Audit Trail", testid: "nav-audit" },
  ];
  if (user?.role === "admin") {
    links.push({ to: "/console/rules", icon: Sliders, label: "Rule Config", testid: "nav-rules" });
  }
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
        <aside className="hidden md:block col-span-2">
          <nav className="sticky top-20 space-y-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/console"}
                data-testid={l.testid}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                  }`
                }
              >
                <l.icon className="w-4 h-4" /> {l.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="col-span-12 md:col-span-10 min-w-0">{children}</main>
      </div>
    </div>
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
