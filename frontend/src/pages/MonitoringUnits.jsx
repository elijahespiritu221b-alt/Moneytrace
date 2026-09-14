import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, fmtPHP } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { Card } from "../components/ui/card";
import { AlertLevelChip } from "../components/AlertLevelChip";
import { ArrowLeft, Building2, ChevronRight } from "lucide-react";

const OFFICE_LONG = {
  BLGS: "Bureau of Local Government Supervision", BLGD: "Bureau of Local Government Development",
  NBOO: "National Barangay Operations Office", OPDS: "Office of Project Development Services",
  PNP: "Philippine National Police", BFP: "Bureau of Fire Protection",
  BJMP: "Bureau of Jail Management and Penology", NAPOLCOM: "National Police Commission",
  PPSC: "Philippine Public Safety College", LGA: "Local Government Academy",
  NYC: "National Youth Commission", NCMF: "National Commission on Muslim Filipinos",
  DEPED: "Department of Education", DOH: "Department of Health",
  DPWH: "Department of Public Works and Highways",
};

export default function MonitoringUnits() {
  const { code } = useParams();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/analytics/monitoring-units", { params: { office_code: code } })
      .then((r) => { setRows(r.data); setLoading(false); });
  }, [code]);

  const unit_type_label = rows[0]?.monitoring_unit_type || "Monitoring Unit";
  const office_long = OFFICE_LONG[code] || code;
  const total_count = rows.reduce((s, r) => s + r.count, 0);
  const total_budget = rows.reduce((s, r) => s + r.total_budget, 0);
  const totals = rows.reduce((s, r) => {
    for (const k of ["green", "yellow", "orange", "red"]) s[k] += r.alert_counts[k];
    return s;
  }, { green: 0, yellow: 0, orange: 0, red: 0 });

  return (
    <ConsoleLayout>
      <div className="space-y-6">
        <div>
          <button onClick={() => nav("/console/offices")}
                  className="text-slate-400 hover:text-sky-400 text-xs uppercase tracking-widest flex items-center gap-1 mb-2"
                  data-testid="btn-back-offices">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Offices
          </button>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2 flex-wrap">
            <Building2 className="w-6 h-6 text-sky-400" />
            <span className="text-sky-400 font-mono">{code}</span>
            <span>· {office_long}</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            <span className="text-slate-200 font-semibold">{unit_type_label}</span> · organized per MONEYTRACE unit taxonomy
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatBox label="Units" value={rows.length} />
          <StatBox label="Projects" value={total_count.toLocaleString()} />
          <StatBox label="Budget" value={fmtPHP(total_budget)} span2 />
          <StatBox label="Green" value={totals.green} tint="text-emerald-400" />
          <StatBox label="Red+Orange" value={totals.red + totals.orange} tint="text-red-400" />
        </div>

        {loading && <div className="text-slate-400">Loading monitoring units…</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((r) => {
            const critical = r.alert_counts.red + r.alert_counts.orange;
            return (
              <button
                key={r.monitoring_unit}
                onClick={() => nav(`/console/projects?agency=${encodeURIComponent(office_long)}`)}
                data-testid={`unit-${r.monitoring_unit}`}
                className="text-left group rounded-lg border border-slate-800 bg-[#111827] hover:border-sky-500/50 transition-colors p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">{r.monitoring_unit_type}</div>
                    <div className="font-display text-lg font-semibold text-slate-100 mt-1 font-mono">{r.monitoring_unit}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-sky-400 mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Projects</div>
                    <div className="font-mono text-base text-slate-100">{r.count.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Budget</div>
                    <div className="font-mono text-xs text-slate-100">{fmtPHP(r.total_budget)}</div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between">
                  <div className="grid grid-cols-4 gap-1 flex-1">
                    {["green", "yellow", "orange", "red"].map((k) => (
                      <div key={k} className="text-center">
                        <AlertLevelChip level={k} size="xs" />
                        <div className="font-mono text-xs text-slate-200 mt-0.5">{r.alert_counts[k]}</div>
                      </div>
                    ))}
                  </div>
                  {critical > 0 && (
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-red-400 font-bold whitespace-nowrap">
                      {critical} to triage
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ConsoleLayout>
  );
}

function StatBox({ label, value, tint, span2 }) {
  return (
    <Card className={`p-3 bg-[#111827] border-slate-800 ${span2 ? "col-span-2" : ""}`}>
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`font-mono text-base font-bold mt-1 ${tint || "text-slate-100"}`}>{value}</div>
    </Card>
  );
}
