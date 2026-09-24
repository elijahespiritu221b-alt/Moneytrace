import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtPHP, fmtDate, FLAG_INFO, ALERT } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Users, Search, Download, ArrowUpDown, ArrowUp, ArrowDown, Star } from "lucide-react";

const ALERT_LABELS = { 1: "Green", 2: "Yellow", 3: "Orange", 4: "Red" };

const COLS = [
  { key: "watched", label: "★", align: "center", sortable: false },
  { key: "name", label: "Entity / Contractor", align: "left" },
  { key: "count", label: "Projects", align: "right", fmt: (v) => v.toLocaleString() },
  { key: "budget", label: "Total Budget", align: "right", fmt: fmtPHP },
  { key: "disbursed", label: "Disbursed", align: "right", fmt: fmtPHP },
  { key: "utilization_pct", label: "Utilization", align: "right", fmt: (v) => `${v}%` },
  { key: "avg_alert", label: "Avg Alert", align: "center" },
  { key: "red", label: "Red", align: "center" },
  { key: "orange", label: "Orange", align: "center" },
  { key: "flag_mix", label: "Flag Mix", align: "left", sortable: false },
  { key: "agencies_count", label: "Agencies", align: "left" },
  { key: "first_seen", label: "First Seen", align: "left", fmt: fmtDate },
  { key: "last_seen", label: "Last Seen", align: "left", fmt: fmtDate },
];

export default function EntityTraceability() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("count");
  const [sortDir, setSortDir] = useState("desc");
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/entities");
        setRows(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const src = q ? rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : rows;
    const dir = sortDir === "asc" ? 1 : -1;
    // Watched entities are ALWAYS pinned to top, then user sort applies within groups
    return [...src].sort((a, b) => {
      if (!!b.watched !== !!a.watched) return b.watched ? 1 : -1;
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [rows, q, sortKey, sortDir]);

  const toggleWatch = async (e, name) => {
    e.stopPropagation();
    try {
      const { data } = await api.post(`/watchlist/${encodeURIComponent(name)}`);
      setRows((prev) => prev.map((r) => (r.name === name ? { ...r, watched: data.watched } : r)));
      toast.success(data.watched ? `Starred "${name}"` : `Removed "${name}"`);
    } catch (e) {
      toast.error("Failed to update watchlist");
    }
  };

  const totals = useMemo(() => {
    const t = { entities: filtered.length, projects: 0, budget: 0, disbursed: 0, red: 0, orange: 0 };
    for (const r of filtered) {
      t.projects += r.count; t.budget += r.budget; t.disbursed += r.disbursed;
      t.red += r.red; t.orange += r.orange;
    }
    return t;
  }, [filtered]);

  const toggleSort = (key) => {
    if (COLS.find((c) => c.key === key)?.sortable === false) return;
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const exportCSV = () => {
    const headers = ["Entity", "Projects", "Approved", "Current Budget", "Disbursed", "Utilization %",
                     "Avg Alert", "Green", "Yellow", "Orange", "Red",
                     "F1", "F2", "F3", "F4", "F5", "F6",
                     "Agencies Count", "Agencies", "Municipalities Count",
                     "First Seen", "Last Seen"];
    const lines = [headers.join(",")];
    for (const r of filtered) {
      const cells = [
        `"${r.name.replace(/"/g, '""')}"`,
        r.count, r.approved, r.budget, r.disbursed, r.utilization_pct,
        r.avg_alert, r.green, r.yellow, r.orange, r.red,
        r.flag_counts.F1, r.flag_counts.F2, r.flag_counts.F3,
        r.flag_counts.F4, r.flag_counts.F5, r.flag_counts.F6,
        r.agencies_count, `"${r.agencies.join("; ")}"`,
        r.municipalities_count,
        r.first_seen || "", r.last_seen || "",
      ];
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `moneytrace_entities_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <ConsoleLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-sky-400" /> Entity Traceability
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Contractors and implementing entities across the portfolio. Click any row for a full entity profile.
            </p>
          </div>
          <Button onClick={exportCSV} variant="outline"
                  className="bg-slate-900 border-slate-700 text-slate-100 hover:bg-slate-800"
                  data-testid="entity-export-csv">
            <Download className="w-4 h-4 mr-1.5" /> Export CSV
          </Button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <TotalCard label="Entities" value={totals.entities.toLocaleString()} tint="text-sky-300" />
          <TotalCard label="Projects" value={totals.projects.toLocaleString()} tint="text-slate-100" />
          <TotalCard label="Total Budget" value={fmtPHP(totals.budget)} tint="text-emerald-300" small />
          <TotalCard label="Disbursed" value={fmtPHP(totals.disbursed)} tint="text-emerald-400" small />
          <TotalCard label="Red Alerts" value={totals.red.toLocaleString()} tint="text-red-400" />
          <TotalCard label="Orange Alerts" value={totals.orange.toLocaleString()} tint="text-orange-400" />
        </div>

        <Card className="p-3 bg-[#111827] border-slate-800">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
            <Input placeholder="Search entity / contractor…" value={q} onChange={(e) => setQ(e.target.value)}
                   className="pl-8 bg-slate-900 border-slate-700 text-slate-100" data-testid="entity-search" />
          </div>
        </Card>

        <Card className="bg-[#111827] border-slate-800 overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm min-w-[1400px]">
              <thead className="sticky top-0 bg-[#0F172A] z-10">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-800">
                  {COLS.map((c) => (
                    <th key={c.key}
                        className={`py-2.5 px-3 whitespace-nowrap ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"} ${c.sortable === false ? "" : "cursor-pointer hover:text-slate-200"}`}
                        onClick={() => toggleSort(c.key)}
                        data-testid={`col-${c.key}`}>
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {c.sortable !== false && (
                          sortKey === c.key
                            ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
                            : <ArrowUpDown className="w-3 h-3 opacity-30" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={COLS.length} className="py-8 text-center text-slate-500">Loading…</td></tr>}
                {!loading && filtered.slice(0, 500).map((r, i) => (
                  <tr key={i}
                      className={`border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer ${r.watched ? "bg-amber-500/[0.03]" : ""}`}
                      onClick={() => nav(`/console/entities/${encodeURIComponent(r.name)}`)}
                      data-testid={`entity-row-${i}`}>
                    <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => toggleWatch(e, r.name)}
                              data-testid={`star-${i}`}
                              className="p-1 rounded hover:bg-slate-800/60 transition-colors"
                              title={r.watched ? "Remove from watchlist" : "Add to watchlist"}>
                        <Star className={`w-4 h-4 ${r.watched ? "fill-amber-400 text-amber-400" : "text-slate-600 hover:text-amber-300"}`} />
                      </button>
                    </td>
                    <td className="py-2 px-3 text-slate-100 max-w-xs truncate" title={r.name}>{r.name}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-100">{r.count}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-slate-200">{fmtPHP(r.budget)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-slate-400">{fmtPHP(r.disbursed)}</td>
                    <td className="py-2 px-3 text-right">
                      <UtilCell pct={r.utilization_pct} />
                    </td>
                    <td className="py-2 px-3 text-center">
                      <AvgAlertPill weight={r.avg_alert} />
                    </td>
                    <td className="py-2 px-3 text-center font-mono text-red-400">{r.red || "—"}</td>
                    <td className="py-2 px-3 text-center font-mono text-orange-400">{r.orange || "—"}</td>
                    <td className="py-2 px-3">
                      <div className="flex gap-1">
                        {Object.entries(r.flag_counts).map(([k, v]) =>
                          v > 0 ? (
                            <span key={k}
                                  className="text-[10px] font-mono px-1 rounded"
                                  style={{ backgroundColor: FLAG_INFO[k].color + "22", color: FLAG_INFO[k].color }}
                                  title={`${FLAG_INFO[k].name}: ${v} projects`}>
                              {k}·{v}
                            </span>
                          ) : null
                        )}
                        {Object.values(r.flag_counts).every((v) => v === 0) && (
                          <span className="text-[10px] text-slate-600">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-400 max-w-[240px] truncate">
                      {r.agencies_count} · {r.agencies.slice(0, 2).join(", ")}
                      {r.agencies_count > 2 ? ` +${r.agencies_count - 2}` : ""}
                    </td>
                    <td className="py-2 px-3 text-xs font-mono text-slate-400 whitespace-nowrap">{fmtDate(r.first_seen)}</td>
                    <td className="py-2 px-3 text-xs font-mono text-slate-400 whitespace-nowrap">{fmtDate(r.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-xs text-slate-500 text-center">
          Showing {Math.min(filtered.length, 500).toLocaleString()} of {filtered.length.toLocaleString()} entities
        </p>
      </div>
    </ConsoleLayout>
  );
}

function TotalCard({ label, value, tint, small }) {
  return (
    <Card className="p-3 bg-[#111827] border-slate-800">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`font-display font-bold mt-1 ${tint || "text-slate-100"} ${small ? "text-sm" : "text-lg"}`}>{value}</div>
    </Card>
  );
}

function UtilCell({ pct }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const color = clamped >= 90 ? "#10b981" : clamped >= 50 ? "#38bdf8" : clamped >= 20 ? "#f59e0b" : "#ef4444";
  return (
    <div className="inline-flex items-center gap-1.5 w-24 justify-end">
      <span className="font-mono text-xs text-slate-200 w-10 text-right">{pct}%</span>
      <div className="h-1.5 w-12 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${clamped}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function AvgAlertPill({ weight }) {
  const key = weight >= 3 ? "red" : weight >= 2.4 ? "orange" : weight >= 1.8 ? "yellow" : "green";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-widest ${ALERT[key].bg} ${ALERT[key].text} ${ALERT[key].border}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ALERT[key].pin }} />
      <span className="font-mono opacity-70">{weight.toFixed(1)}</span>
    </span>
  );
}
