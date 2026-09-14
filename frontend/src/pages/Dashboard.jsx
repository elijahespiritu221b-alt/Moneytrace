import { useEffect, useState } from "react";
import { api, fmtPHP } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { AlertLevelChip } from "../components/AlertLevelChip";
import { FlagChip } from "../components/FlagChip";
import { Card } from "../components/ui/card";
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip as RTip, Legend } from "recharts";
import { TrendingUp, AlertTriangle, Landmark, Layers } from "lucide-react";

const ALERT_COLORS = { green: "#10b981", yellow: "#f59e0b", orange: "#f97316", red: "#ef4444" };

export default function Dashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/analytics/overview").then((r) => setData(r.data)); }, []);
  if (!data) return <ConsoleLayout><div className="text-slate-400">Loading dashboard…</div></ConsoleLayout>;

  const alertPie = Object.entries(data.alert_counts).map(([k, v]) => ({ name: k, value: v, color: ALERT_COLORS[k] }));
  const flagBar = Object.entries(data.flag_counts).map(([k, v]) => ({ flag: k, count: v }));
  const agencyBar = data.by_agency.slice(0, 6).map((x) => ({ agency: x.agency.split(" ").slice(0, 2).join(" "), budget: x.budget / 1_000_000 }));

  return (
    <ConsoleLayout>
      <div className="space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Command Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">Portfolio-wide screening across {data.total_projects} projects.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Layers} label="Total Projects" value={data.total_projects.toLocaleString()} testid="stat-projects" />
          <StatCard icon={Landmark} label="Original Budget" value={fmtPHP(data.original_budget_php || 0)} testid="stat-original" />
          <StatCard icon={Landmark} label="Current Budget" value={fmtPHP(data.total_budget_php)} testid="stat-budget" />
          <StatCard icon={TrendingUp} label="Total Increase" value={fmtPHP(data.budget_increase_php || 0)} tint="text-amber-400" testid="stat-increase" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={AlertTriangle} label="Red + Orange" value={data.alert_counts.red + data.alert_counts.orange} tint="text-red-400" testid="stat-critical" />
          <StatCard icon={TrendingUp} label="Green (Low Risk)" value={data.alert_counts.green.toLocaleString()} tint="text-emerald-400" testid="stat-green" />
          <StatCard icon={AlertTriangle} label="Yellow" value={data.alert_counts.yellow.toLocaleString()} tint="text-amber-400" testid="stat-yellow" />
          <StatCard icon={AlertTriangle} label="Orange" value={data.alert_counts.orange.toLocaleString()} tint="text-orange-400" testid="stat-orange" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-4 bg-[#111827] border-slate-800 lg:col-span-1">
            <h3 className="font-display text-sm uppercase tracking-widest text-slate-400 mb-3">Alert Distribution</h3>
            <div className="h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={alertPie} dataKey="value" nameKey="name" outerRadius={80} innerRadius={45}>
                    {alertPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <RTip contentStyle={{ background: "#1f2937", border: "1px solid #374151" }} />
                  <Legend wrapperStyle={{ fontSize: 11, textTransform: "uppercase" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center pt-2">
              {["green", "yellow", "orange", "red"].map((k) => (
                <div key={k} className="space-y-1">
                  <AlertLevelChip level={k} size="xs" />
                  <div className="font-mono text-lg text-slate-100">{data.alert_counts[k]}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 bg-[#111827] border-slate-800 lg:col-span-2">
            <h3 className="font-display text-sm uppercase tracking-widest text-slate-400 mb-3">Flag Frequency</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={flagBar}>
                  <XAxis dataKey="flag" stroke="#9ca3af" fontSize={11} />
                  <YAxis stroke="#9ca3af" fontSize={11} />
                  <RTip contentStyle={{ background: "#1f2937", border: "1px solid #374151" }} />
                  <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {["F1", "F2", "F3", "F4", "F5", "F6"].map((c) => <FlagChip key={c} code={c} />)}
            </div>
          </Card>
        </div>

        <Card className="p-4 bg-[#111827] border-slate-800">
          <h3 className="font-display text-sm uppercase tracking-widest text-slate-400 mb-3">Budget by Implementing Agency (PHP millions)</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={agencyBar} layout="vertical" margin={{ left: 40 }}>
                <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                <YAxis dataKey="agency" type="category" stroke="#9ca3af" fontSize={11} width={140} />
                <RTip contentStyle={{ background: "#1f2937", border: "1px solid #374151" }} />
                <Bar dataKey="budget" fill="#a78bfa" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 bg-[#111827] border-slate-800">
          <h3 className="font-display text-sm uppercase tracking-widest text-slate-400 mb-3">Municipality Alert Heatmap</h3>
          <MuniHeatmap data={data.by_muni} />
        </Card>
      </div>
    </ConsoleLayout>
  );
}

function StatCard({ icon: Icon, label, value, tint, testid }) {
  return (
    <Card className="p-4 bg-[#111827] border-slate-800" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400">{label}</div>
          <div className={`font-display text-2xl font-bold mt-1 ${tint || "text-slate-100"}`}>{value}</div>
        </div>
        <Icon className={`w-5 h-5 ${tint || "text-sky-400"}`} />
      </div>
    </Card>
  );
}

function MuniHeatmap({ data }) {
  const munis = new Set();
  Object.values(data).forEach((m) => Object.keys(m).forEach((k) => munis.add(k)));
  const rows = Array.from(munis).sort();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 text-xs uppercase tracking-widest">
            <th className="py-2 pr-4">Municipality</th>
            <th className="py-2 px-2 text-center">Green</th>
            <th className="py-2 px-2 text-center">Yellow</th>
            <th className="py-2 px-2 text-center">Orange</th>
            <th className="py-2 px-2 text-center">Red</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m} className="border-t border-slate-800">
              <td className="py-2 pr-4 text-slate-200">{m}</td>
              {["green", "yellow", "orange", "red"].map((k) => {
                const v = data[k][m] || 0;
                const intensity = Math.min(1, v / 4);
                return (
                  <td key={k} className="py-2 px-2 text-center">
                    <div className="inline-block px-3 py-1 rounded font-mono text-xs"
                         style={{ backgroundColor: ALERT_COLORS[k] + Math.floor(intensity * 128).toString(16).padStart(2, "0"),
                                  color: v > 0 ? "#fff" : "#64748b" }}>
                      {v}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
