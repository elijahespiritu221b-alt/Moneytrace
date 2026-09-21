import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtPHP } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Users, Search } from "lucide-react";

export default function EntityTraceability() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/projects", { params: { limit: 2000 } });
      const map = new Map();
      for (const p of data) {
        const name = p.contractor || "—";
        const b = map.get(name) || { name, count: 0, budget: 0, disbursed: 0, agencies: new Set(), red: 0, orange: 0 };
        b.count += 1;
        b.budget += +p.current_budget || 0;
        b.disbursed += +p.disbursed_amount || 0;
        b.agencies.add(p.agency);
        const lvl = p.flags?.alert_level;
        if (lvl === "red") b.red += 1;
        if (lvl === "orange") b.orange += 1;
        map.set(name, b);
      }
      const arr = [...map.values()]
        .map((r) => ({ ...r, agencies_count: r.agencies.size, agencies: [...r.agencies] }))
        .sort((a, b) => b.count - a.count);
      setRows(arr);
      setLoading(false);
    })();
  }, []);

  const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : rows;

  return (
    <ConsoleLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-sky-400" /> Entity Traceability
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Contractors and implementing entities ranked by project count. Click to filter Projects list to that entity.
          </p>
        </div>

        <Card className="p-3 bg-[#111827] border-slate-800">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
            <Input placeholder="Search entity / contractor…" value={q} onChange={(e) => setQ(e.target.value)}
                   className="pl-8 bg-slate-900 border-slate-700 text-slate-100" data-testid="entity-search" />
          </div>
        </Card>

        <Card className="bg-[#111827] border-slate-800 overflow-hidden">
          <div className="overflow-x-auto max-h-[75vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#0F172A] z-10">
                <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-800">
                  <th className="py-2.5 px-3">Entity / Contractor</th>
                  <th className="py-2.5 px-3 text-right">Projects</th>
                  <th className="py-2.5 px-3 text-right">Total Budget</th>
                  <th className="py-2.5 px-3 text-right">Disbursed</th>
                  <th className="py-2.5 px-3 text-center">Red</th>
                  <th className="py-2.5 px-3 text-center">Orange</th>
                  <th className="py-2.5 px-3">Agencies</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Loading…</td></tr>}
                {filtered.slice(0, 500).map((r, i) => (
                  <tr key={i}
                      className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer"
                      onClick={() => nav(`/console/projects?q=${encodeURIComponent(r.name)}`)}
                      data-testid={`entity-row-${i}`}>
                    <td className="py-2 px-3 text-slate-100 max-w-xs truncate">{r.name}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-100">{r.count}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-slate-200">{fmtPHP(r.budget)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-slate-400">{fmtPHP(r.disbursed)}</td>
                    <td className="py-2 px-3 text-center font-mono text-red-400">{r.red || "—"}</td>
                    <td className="py-2 px-3 text-center font-mono text-orange-400">{r.orange || "—"}</td>
                    <td className="py-2 px-3 text-xs text-slate-400 max-w-[300px] truncate">{r.agencies_count} · {r.agencies.slice(0, 2).join(", ")}{r.agencies_count > 2 ? ` +${r.agencies_count - 2}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-xs text-slate-500 text-center">Showing top 500 of {filtered.length.toLocaleString()} entities</p>
      </div>
    </ConsoleLayout>
  );
}
