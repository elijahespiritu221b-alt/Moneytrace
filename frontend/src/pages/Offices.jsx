import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtPHP } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { Card } from "../components/ui/card";
import { AlertLevelChip } from "../components/AlertLevelChip";
import { FlagChip } from "../components/FlagChip";
import { Building2, ChevronRight, AlertTriangle } from "lucide-react";

// Full-name lookup for the 12 DILG offices
const OFFICE_META = {
  BLGS:     { long: "Bureau of Local Government Supervision",     tint: "from-sky-500/10 to-sky-500/0" },
  BLGD:     { long: "Bureau of Local Government Development",     tint: "from-indigo-500/10 to-indigo-500/0" },
  NBOO:     { long: "National Barangay Operations Office",        tint: "from-cyan-500/10 to-cyan-500/0" },
  OPDS:     { long: "Office of Project Development Services",     tint: "from-teal-500/10 to-teal-500/0" },
  PNP:      { long: "Philippine National Police",                 tint: "from-blue-500/10 to-blue-500/0" },
  BFP:      { long: "Bureau of Fire Protection",                  tint: "from-orange-500/10 to-orange-500/0" },
  BJMP:     { long: "Bureau of Jail Management and Penology",     tint: "from-slate-500/10 to-slate-500/0" },
  NAPOLCOM: { long: "National Police Commission",                 tint: "from-violet-500/10 to-violet-500/0" },
  PPSC:     { long: "Philippine Public Safety College",           tint: "from-emerald-500/10 to-emerald-500/0" },
  LGA:      { long: "Local Government Academy",                   tint: "from-purple-500/10 to-purple-500/0" },
  NYC:      { long: "National Youth Commission",                  tint: "from-pink-500/10 to-pink-500/0" },
  NCMF:     { long: "National Commission on Muslim Filipinos",    tint: "from-amber-500/10 to-amber-500/0" },
};

export default function Offices() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    api.get("/analytics/by-office").then((r) => { setRows(r.data); setLoading(false); });
  }, []);

  const openOffice = (agency) => {
    nav(`/console/projects?agency=${encodeURIComponent(agency)}`);
  };

  return (
    <ConsoleLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-sky-400" /> DILG Offices
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            12 Department of the Interior and Local Government offices — ranked by triage load (Red · Orange · Yellow).
          </p>
        </div>

        {loading && <div className="text-slate-400">Loading office breakdown…</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((r, idx) => {
            const meta = OFFICE_META[r.office_code] || { long: r.office_agency, tint: "from-slate-500/10 to-slate-500/0" };
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
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Rank #{idx + 1}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400 border border-sky-500/40 rounded px-1.5 py-0.5 font-mono">
                        {r.office_code}
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
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Current Budget</div>
                    <div className="font-mono text-sm text-slate-100">{fmtPHP(r.total_budget)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Disbursed</div>
                    <div className="font-mono text-sm text-slate-300">{fmtPHP(r.total_disbursed)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Municipalities</div>
                    <div className="font-mono text-sm text-slate-300">{r.municipality_count}</div>
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
