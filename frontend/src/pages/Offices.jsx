import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtPHP } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { Card } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AlertLevelChip } from "../components/AlertLevelChip";
import { FlagChip } from "../components/FlagChip";
import { Building2, ChevronRight, AlertTriangle } from "lucide-react";

// Metadata for every office (12 DILG + 3 standalone departments)
const OFFICE_META = {
  // DILG
  BLGS:     { long: "Bureau of Local Government Supervision",     dept: "DILG",  tint: "from-sky-500/10 to-sky-500/0" },
  BLGD:     { long: "Bureau of Local Government Development",     dept: "DILG",  tint: "from-indigo-500/10 to-indigo-500/0" },
  NBOO:     { long: "National Barangay Operations Office",        dept: "DILG",  tint: "from-cyan-500/10 to-cyan-500/0" },
  OPDS:     { long: "Office of Project Development Services",     dept: "DILG",  tint: "from-teal-500/10 to-teal-500/0" },
  PNP:      { long: "Philippine National Police",                 dept: "DILG",  tint: "from-blue-500/10 to-blue-500/0" },
  BFP:      { long: "Bureau of Fire Protection",                  dept: "DILG",  tint: "from-orange-500/10 to-orange-500/0" },
  BJMP:     { long: "Bureau of Jail Management and Penology",     dept: "DILG",  tint: "from-slate-500/10 to-slate-500/0" },
  NAPOLCOM: { long: "National Police Commission",                 dept: "DILG",  tint: "from-violet-500/10 to-violet-500/0" },
  PPSC:     { long: "Philippine Public Safety College",           dept: "DILG",  tint: "from-emerald-500/10 to-emerald-500/0" },
  LGA:      { long: "Local Government Academy",                   dept: "DILG",  tint: "from-purple-500/10 to-purple-500/0" },
  NYC:      { long: "National Youth Commission",                  dept: "DILG",  tint: "from-pink-500/10 to-pink-500/0" },
  NCMF:     { long: "National Commission on Muslim Filipinos",    dept: "DILG",  tint: "from-amber-500/10 to-amber-500/0" },
  // Standalone departments
  DEPED:    { long: "Department of Education",                    dept: "DepEd", tint: "from-rose-500/10 to-rose-500/0" },
  DOH:      { long: "Department of Health",                       dept: "DOH",   tint: "from-red-500/10 to-red-500/0" },
  DPWH:     { long: "Department of Public Works and Highways",    dept: "DPWH",  tint: "from-yellow-500/10 to-yellow-500/0" },
};

const TABS = [
  { key: "all",   label: "All Agencies" },
  { key: "DILG",  label: "DILG (12 offices)" },
  { key: "DepEd", label: "DepEd" },
  { key: "DOH",   label: "DOH" },
  { key: "DPWH",  label: "DPWH" },
];

export default function Offices() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const nav = useNavigate();

  useEffect(() => {
    api.get("/analytics/by-office").then((r) => { setRows(r.data); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (tab === "all") return rows;
    return rows.filter((r) => (OFFICE_META[r.office_code]?.dept || "DILG") === tab);
  }, [rows, tab]);

  const dept_totals = useMemo(() => {
    const acc = { DILG: 0, DepEd: 0, DOH: 0, DPWH: 0 };
    rows.forEach((r) => {
      const d = OFFICE_META[r.office_code]?.dept || "DILG";
      acc[d] = (acc[d] || 0) + r.count;
    });
    return acc;
  }, [rows]);

  const openOffice = (agency) => nav(`/console/projects?agency=${encodeURIComponent(agency)}`);

  return (
    <ConsoleLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-sky-400" /> Agencies & Offices
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            15 offices across 4 departments — DILG (12 sub-offices), DepEd, DOH, DPWH · ranked by triage load.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-slate-800 border border-slate-700">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                data-testid={`dept-tab-${t.key}`}
                className="data-[state=active]:bg-sky-500 data-[state=active]:text-slate-950"
              >
                {t.label}
                {t.key !== "all" && dept_totals[t.key] !== undefined && (
                  <span className="ml-2 text-[10px] font-mono opacity-70">
                    ({dept_totals[t.key].toLocaleString()})
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading && <div className="text-slate-400">Loading office breakdown…</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r, idx) => {
            const meta = OFFICE_META[r.office_code] || { long: r.office_agency, tint: "from-slate-500/10 to-slate-500/0", dept: "—" };
            const critical = r.alert_counts.red + r.alert_counts.orange;
            return (
              <button
                key={r.office_code}
                onClick={() => openOffice(r.office_agency)}
                data-testid={`office-card-${r.office_code}`}
                className={`text-left group rounded-lg border border-slate-800 bg-gradient-to-br ${meta.tint} bg-[#111827] hover:border-sky-500/50 transition-colors p-5`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Rank #{idx + 1}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400 border border-sky-500/40 rounded px-1.5 py-0.5 font-mono">
                        {r.office_code}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 border border-slate-700 rounded px-1.5 py-0.5">
                        {meta.dept}
                      </span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-slate-100 mt-2 leading-tight">{meta.long}</h3>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-sky-400 mt-1 transition-colors" />
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Projects</div>
                    <div className="font-mono text-lg text-slate-100">{r.count.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Municipalities</div>
                    <div className="font-mono text-lg text-slate-100">{r.municipality_count}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Original Budget</div>
                    <div className="font-mono text-xs text-slate-300">{fmtPHP(r.original_budget || 0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Current Budget</div>
                    <div className="font-mono text-xs text-slate-100">{fmtPHP(r.total_budget)}</div>
                  </div>
                  <div className="col-span-2 flex items-center justify-between p-2 rounded bg-amber-500/10 border border-amber-500/30">
                    <span className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Total Increase</span>
                    <span className="font-mono text-xs text-amber-200">{fmtPHP(r.budget_increase || 0)}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-widest text-slate-500">Alert Distribution</span>
                    {critical > 0 && (
                      <span className="text-[10px] uppercase tracking-widest text-red-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {critical} to triage
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 h-2 rounded-full overflow-hidden bg-slate-900">
                    <Bar count={r.alert_counts.green} total={r.count} color="#10b981" />
                    <Bar count={r.alert_counts.yellow} total={r.count} color="#f59e0b" />
                    <Bar count={r.alert_counts.orange} total={r.count} color="#f97316" />
                    <Bar count={r.alert_counts.red} total={r.count} color="#ef4444" />
                  </div>
                  <div className="grid grid-cols-4 gap-1 mt-2">
                    {["green", "yellow", "orange", "red"].map((k) => (
                      <div key={k} className="text-center">
                        <AlertLevelChip level={k} size="xs" />
                        <div className="font-mono text-xs text-slate-200 mt-1">{r.alert_counts[k]}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1">
                  {["F1", "F2", "F3", "F4", "F5", "F6"].map((c) => (
                    <div key={c} className="flex items-center gap-1">
                      <FlagChip code={c} active={r.flag_counts[c] > 0} />
                      <span className="text-[10px] font-mono text-slate-500">{r.flag_counts[c]}</span>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ConsoleLayout>
  );
}

function Bar({ count, total, color }) {
  const pct = total ? (count / total) * 100 : 0;
  if (!pct) return null;
  return <div style={{ width: `${pct}%`, backgroundColor: color, height: "100%" }} />;
}
