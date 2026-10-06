import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { Users, Search, Ban, RotateCcw, ShieldCheck, Smartphone } from "lucide-react";

export default function Citizens() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const load = () => api.get("/citizens").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const toggle = async (c) => {
    if (!window.confirm(`${c.banned ? "Reinstate" : "Suspend"} ${c.name}?`)) return;
    try {
      const { data } = await api.patch(`/citizens/${c.id}/ban`);
      toast.success(data.banned ? `${c.name} suspended` : `${c.name} reinstated`);
      setRows((xs) => xs.map((x) => (x.id === c.id ? { ...x, banned: data.banned } : x)));
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((c) =>
      (filter === "all" || (filter === "banned" ? c.banned : filter === "unverified" ? !c.phone_verified : !c.banned && c.phone_verified)) &&
      (!s || [c.name, c.email, c.phone].some((v) => (v || "").toLowerCase().includes(s))));
  }, [rows, q, filter]);

  const stats = {
    total: rows.length,
    verified: rows.filter((c) => c.phone_verified && !c.banned).length,
    unverified: rows.filter((c) => !c.phone_verified).length,
    banned: rows.filter((c) => c.banned).length,
    reports: rows.reduce((a, c) => a + (c.reports || 0), 0),
  };

  return (
    <ConsoleLayout>
      <div className="space-y-5" data-testid="citizens-page">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Users className="w-6 h-6 text-emerald-400" /> Registered Citizens</h1>
          <p className="text-slate-400 text-sm mt-1">Everyone who signed up on the public portal to file reports. Suspend accounts that abuse the system.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[["Total", stats.total, "all"], ["Active verified", stats.verified, "active"], ["Unverified", stats.unverified, "unverified"], ["Suspended", stats.banned, "banned"], ["Reports filed", stats.reports, null]].map(([l, v, f]) => (
            <button key={l} disabled={!f} onClick={() => f && setFilter(f)} data-testid={`citizens-stat-${l.toLowerCase().replace(/ /g, "-")}`}
              className={`text-left rounded-lg border p-4 bg-[#111827] transition-colors ${f && filter === f ? "border-emerald-500/60" : "border-slate-800"} ${f ? "hover:border-slate-600" : "cursor-default"}`}>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">{l}</div>
              <div className="font-mono text-2xl text-slate-100 mt-1">{v}</div>
            </button>
          ))}
        </div>

        <Card className="bg-[#111827] border-slate-800">
          <div className="p-4 border-b border-slate-800 flex items-center gap-3">
            <Search className="w-4 h-4 text-slate-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone…" className="bg-slate-900 border-slate-700 max-w-md" data-testid="citizens-search" />
            <span className="text-xs text-slate-500 ml-auto">{shown.length} shown</span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-2">Citizen</th>
                <th className="text-left px-4 py-2">Phone</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Reports</th>
                <th className="text-left px-4 py-2">Joined</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody data-testid="citizens-table">
              {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 italic">No citizens match.</td></tr>}
              {shown.map((c) => (
                <tr key={c.id} className={`border-b border-slate-800/60 ${c.banned ? "opacity-60" : ""}`} data-testid={`citizen-row-${c.id}`}>
                  <td className="px-4 py-3">
                    <div className="text-slate-100">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.email}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300"><Smartphone className="w-3 h-3 inline mr-1 text-slate-500" />{c.phone}</td>
                  <td className="px-4 py-3">
                    {c.banned ? <Pill cls="text-red-400 border-red-500/40 bg-red-500/10">Suspended</Pill>
                      : c.phone_verified ? <Pill cls="text-emerald-400 border-emerald-500/40 bg-emerald-500/10"><ShieldCheck className="w-3 h-3 inline mr-1" />Verified</Pill>
                      : <Pill cls="text-amber-400 border-amber-500/40 bg-amber-500/10">Unverified</Pill>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-200">{c.reports || 0}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 font-mono">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => toggle(c)} data-testid={`citizen-toggle-${c.id}`}
                      className={c.banned ? "text-emerald-400 hover:text-emerald-300" : "text-orange-400 hover:text-orange-300"}>
                      {c.banned ? <><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reinstate</> : <><Ban className="w-3.5 h-3.5 mr-1" /> Suspend</>}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </ConsoleLayout>
  );
}

function Pill({ cls, children }) {
  return <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest border ${cls}`}>{children}</span>;
}
