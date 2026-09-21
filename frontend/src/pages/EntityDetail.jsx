import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, fmtPHP, fmtDate, ALERT, FLAG_INFO } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  ArrowLeft, Building2, MapPin, Layers, TrendingUp, ClipboardList,
  MessageSquareWarning, Sparkles, GitPullRequestArrow, Users,
} from "lucide-react";

const RISK_COLOR = {
  high: "text-red-400 bg-red-500/15 border-red-500/40",
  medium: "text-orange-400 bg-orange-500/15 border-orange-500/40",
  low: "text-emerald-400 bg-emerald-500/15 border-emerald-500/40",
  unknown: "text-slate-400 bg-slate-500/15 border-slate-500/40",
};

const CR_STATUS = {
  pending: "text-amber-400 bg-amber-500/10 border-amber-500/40",
  approved: "text-emerald-400 bg-emerald-500/10 border-emerald-500/40",
  rejected: "text-red-400 bg-red-500/10 border-red-500/40",
  returned: "text-slate-300 bg-slate-500/10 border-slate-500/40",
};

const COMP_STATUS = {
  new: "text-sky-400 bg-sky-500/10 border-sky-500/40",
  under_review: "text-amber-400 bg-amber-500/10 border-amber-500/40",
  resolved: "text-emerald-400 bg-emerald-500/10 border-emerald-500/40",
  dismissed: "text-slate-400 bg-slate-500/10 border-slate-500/40",
};

export default function EntityDetail() {
  const { name } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/entities/${encodeURIComponent(name)}`);
        setData(data);
      } catch (e) {
        setError(e.response?.data?.detail || "Failed to load entity");
      } finally {
        setLoading(false);
      }
    })();
  }, [name]);

  if (loading) return <ConsoleLayout><div className="text-slate-400 p-8">Loading entity profile…</div></ConsoleLayout>;
  if (error) return <ConsoleLayout><div className="text-red-400 p-8">{error}</div></ConsoleLayout>;
  if (!data) return null;

  const { aggregates: agg, projects, ai_reviews, complaints, change_requests } = data;
  const alertLevels = ["red", "orange", "yellow", "green"];

  return (
    <ConsoleLayout>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav("/console/analysis/entities")}
                  className="text-slate-400 hover:text-slate-100" data-testid="entity-back">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> Entity / Contractor
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-100 mt-0.5 leading-tight">
              {data.name}
            </h1>
            <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-400">
              <span>{agg.count.toLocaleString()} projects</span><span>·</span>
              <span>{Object.keys(agg.agency_counts).length} agencies</span><span>·</span>
              <span>{Object.keys(agg.lgu_counts).length} LGUs</span><span>·</span>
              <span>utilization {agg.utilization_pct}%</span>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Total Budget" value={fmtPHP(agg.budget)} icon={TrendingUp} tint="text-sky-300" />
          <KPI label="Disbursed" value={fmtPHP(agg.disbursed)} sub={`${agg.utilization_pct}% utilization`} icon={TrendingUp} tint="text-emerald-300" />
          <KPI label="Avg Project Size" value={fmtPHP(agg.avg_project_size)} icon={Layers} tint="text-violet-300" />
          <KPI label="Avg Alert" value={<AlertBadge weight={agg.avg_alert} />} icon={ClipboardList} tint="text-orange-300" />
        </div>

        {/* Alert + Flag breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-4 bg-[#111827] border-slate-800">
            <h3 className="text-[11px] uppercase tracking-widest text-slate-400 mb-3">Alert Distribution</h3>
            <div className="space-y-2">
              {alertLevels.map((lvl) => {
                const c = agg.alert_counts[lvl] || 0;
                const pct = agg.count ? (c / agg.count) * 100 : 0;
                return (
                  <div key={lvl}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={ALERT[lvl].text}>{ALERT[lvl].label}</span>
                      <span className="font-mono text-slate-400">{c} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: ALERT[lvl].pin }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-4 bg-[#111827] border-slate-800">
            <h3 className="text-[11px] uppercase tracking-widest text-slate-400 mb-3">Flag Mix (F1–F6)</h3>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(agg.flag_counts).map(([k, v]) => {
                const info = FLAG_INFO[k];
                const pct = agg.count ? (v / agg.count) * 100 : 0;
                return (
                  <div key={k} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: info.color }} />
                      <span className="text-[10px] uppercase tracking-widest text-slate-400">{k}</span>
                    </div>
                    <div className="font-mono text-lg text-slate-100 leading-none">{v}</div>
                    <div className="text-[10px] text-slate-500 mt-1">{pct.toFixed(0)}% of projects</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Distribution breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BreakdownCard title="Agencies" icon={Building2} data={agg.agency_counts} total={agg.count} />
          <BreakdownCard title="Project Types" icon={Layers} data={agg.type_counts} total={agg.count} />
          <BreakdownCard title="Top LGUs" icon={MapPin} data={agg.lgu_counts} total={agg.count} limit={8} />
        </div>

        {/* Yearly timeline */}
        {Object.keys(agg.yearly).length > 0 && (
          <Card className="p-4 bg-[#111827] border-slate-800">
            <h3 className="text-[11px] uppercase tracking-widest text-slate-400 mb-3">Awards Timeline (by start year)</h3>
            <YearlyBars data={agg.yearly} />
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="projects" className="space-y-3">
          <TabsList className="bg-[#111827] border border-slate-800">
            <TabsTrigger value="projects" className="data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-300">
              Projects ({projects.length})
            </TabsTrigger>
            <TabsTrigger value="ai" className="data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300">
              AI Reviews ({ai_reviews.length})
            </TabsTrigger>
            <TabsTrigger value="complaints" className="data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300">
              Complaints ({complaints.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-300">
              Change Requests ({change_requests.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects">
            <ProjectsTable projects={projects} onOpen={(id) => nav(`/console/projects/${id}`)} />
          </TabsContent>

          <TabsContent value="ai">
            <AIReviewsList items={ai_reviews} onOpen={(pid) => nav(`/console/projects/${pid}`)} />
          </TabsContent>

          <TabsContent value="complaints">
            <ComplaintsList items={complaints} onOpen={(pid) => pid && nav(`/console/projects/${pid}`)} />
          </TabsContent>

          <TabsContent value="requests">
            <ChangeRequestsList items={change_requests} onOpen={(pid) => nav(`/console/projects/${pid}`)} />
          </TabsContent>
        </Tabs>
      </div>
    </ConsoleLayout>
  );
}

function KPI({ label, value, sub, icon: Icon, tint }) {
  return (
    <Card className="p-4 bg-[#111827] border-slate-800">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
        {Icon && <Icon className={`w-3.5 h-3.5 ${tint || "text-slate-400"}`} />}
      </div>
      <div className={`font-display text-xl font-bold ${tint || "text-slate-100"}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
    </Card>
  );
}

function AlertBadge({ weight }) {
  const label = weight >= 3 ? "Orange+" : weight >= 2.4 ? "Orange" : weight >= 1.8 ? "Yellow" : "Green";
  const key = weight >= 3 ? "red" : weight >= 2.4 ? "orange" : weight >= 1.8 ? "yellow" : "green";
  return (
    <span className={`inline-flex items-center gap-2 px-2 py-1 rounded border text-xs ${ALERT[key].bg} ${ALERT[key].text} ${ALERT[key].border}`}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ALERT[key].pin }} />
      {label} <span className="font-mono opacity-60">({weight})</span>
    </span>
  );
}

function BreakdownCard({ title, icon: Icon, data, total, limit = 6 }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, limit);
  return (
    <Card className="p-4 bg-[#111827] border-slate-800">
      <h3 className="text-[11px] uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {title}
      </h3>
      <div className="space-y-1.5">
        {rows.map(([k, v]) => {
          const pct = total ? (v / total) * 100 : 0;
          return (
            <div key={k}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-slate-200 truncate pr-2" title={k}>{k}</span>
                <span className="font-mono text-slate-400">{v}</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500/70 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function YearlyBars({ data }) {
  const years = Object.keys(data).filter((y) => y && y !== "None").sort();
  if (years.length === 0) return <div className="text-xs text-slate-500">No dated projects.</div>;
  const max = Math.max(...years.map((y) => data[y]));
  return (
    <div className="flex items-end gap-2 h-28">
      {years.map((y) => {
        const h = max ? (data[y] / max) * 100 : 0;
        return (
          <div key={y} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="text-[10px] font-mono text-slate-400">{data[y]}</div>
            <div className="w-full bg-slate-800 rounded-t" style={{ height: `${h}%`, minHeight: 4, backgroundColor: "#38bdf8" }} />
            <div className="text-[10px] text-slate-500 font-mono">{y}</div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectsTable({ projects, onOpen }) {
  return (
    <Card className="bg-[#111827] border-slate-800 overflow-hidden">
      <div className="overflow-x-auto max-h-[65vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#0F172A] z-10">
            <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-800">
              <th className="py-2.5 px-3">Project</th>
              <th className="py-2.5 px-3">Agency</th>
              <th className="py-2.5 px-3">LGU</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Budget</th>
              <th className="py-2.5 px-3 text-right">Disbursed</th>
              <th className="py-2.5 px-3">Alert</th>
              <th className="py-2.5 px-3">Flags</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => {
              const lvl = (p.flags?.alert_level || "green").toLowerCase();
              const flags = ["F1", "F2", "F3", "F4", "F5", "F6"].filter((k) => p.flags?.[k]);
              return (
                <tr key={p.id} className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => onOpen(p.id)} data-testid={`entity-project-${i}`}>
                  <td className="py-2 px-3 text-slate-100 max-w-xs truncate" title={p.title}>{p.title}</td>
                  <td className="py-2 px-3 text-xs text-slate-300">{p.agency}</td>
                  <td className="py-2 px-3 text-xs text-slate-400">{p.municipality}</td>
                  <td className="py-2 px-3 text-xs text-slate-300">{p.status}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs text-slate-200">{fmtPHP(p.current_budget)}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs text-slate-400">{fmtPHP(p.disbursed_amount)}</td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${ALERT[lvl].bg} ${ALERT[lvl].text} ${ALERT[lvl].border}`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ALERT[lvl].pin }} />
                      {ALERT[lvl].label}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1 flex-wrap">
                      {flags.map((k) => (
                        <span key={k} className="text-[10px] font-mono px-1 rounded"
                              style={{ backgroundColor: FLAG_INFO[k].color + "22", color: FLAG_INFO[k].color }}>{k}</span>
                      ))}
                      {flags.length === 0 && <span className="text-[10px] text-slate-600">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AIReviewsList({ items, onOpen }) {
  if (items.length === 0) return <EmptyBlock icon={Sparkles} label="No AI reviews for this entity yet." />;
  return (
    <div className="space-y-3">
      {items.map((r) => (
        <Card key={r.id} className="p-4 bg-gradient-to-br from-violet-500/5 to-slate-900 border border-violet-500/30 cursor-pointer hover:border-violet-400/50"
              onClick={() => onOpen(r.project_id)} data-testid={`ai-review-${r.id}`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-violet-300/80 flex items-center gap-2">
                <Sparkles className="w-3 h-3" /> {r.model} · {r.prompt_version}
                {r.risk && (
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase ${RISK_COLOR[r.risk] || RISK_COLOR.unknown}`}>
                    {r.risk} risk
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-100 mt-1 truncate">{r.project_title || r.project_id}</div>
            </div>
            <div className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{fmtDate(r.created_at)}</div>
          </div>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed line-clamp-6">{r.content}</pre>
          {r.created_by && (
            <div className="text-[10px] text-slate-500 mt-2 font-mono border-t border-violet-500/20 pt-2">
              generated by {r.created_by}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function ComplaintsList({ items, onOpen }) {
  if (items.length === 0) return <EmptyBlock icon={MessageSquareWarning} label="No public complaints for this entity." />;
  return (
    <div className="space-y-2">
      {items.map((c) => (
        <Card key={c.id} className="p-3 bg-[#111827] border-slate-800 cursor-pointer hover:border-amber-500/40"
              onClick={() => onOpen(c.project_id)} data-testid={`complaint-${c.id}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${COMP_STATUS[c.status] || COMP_STATUS.new}`}>
                  {(c.status || "new").replace("_", " ")}
                </span>
                <span className="text-[10px] uppercase text-slate-500">{c.category}</span>
                <span className="text-[10px] text-slate-500">·</span>
                <span className="text-[10px] text-slate-500 font-mono">{fmtDate(c.created_at)}</span>
              </div>
              <div className="text-sm text-slate-100 mt-1">{c.title}</div>
              <div className="text-xs text-slate-400 mt-1 line-clamp-2">{c.description}</div>
              <div className="text-[10px] text-slate-500 mt-1">
                {c.anonymous ? "Anonymous" : (c.submitter_name || "Unnamed")} · {c.project_title || "no project"}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ChangeRequestsList({ items, onOpen }) {
  if (items.length === 0) return <EmptyBlock icon={GitPullRequestArrow} label="No change requests for this entity." />;
  return (
    <div className="space-y-2">
      {items.map((cr) => (
        <Card key={cr.id} className="p-3 bg-[#111827] border-slate-800 cursor-pointer hover:border-orange-500/40"
              onClick={() => onOpen(cr.project_id)} data-testid={`cr-${cr.id}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${CR_STATUS[cr.status] || CR_STATUS.pending}`}>
                  {cr.status}
                </span>
                {cr.ai_risk && (
                  <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${RISK_COLOR[cr.ai_risk] || RISK_COLOR.unknown}`}>
                    AI risk: {cr.ai_risk}
                  </span>
                )}
                <span className="text-[10px] text-slate-500 font-mono">{fmtDate(cr.requested_at)}</span>
              </div>
              <div className="text-sm text-slate-100 mt-1">
                Edit <span className="text-amber-300 font-mono">{cr.field}</span> on {cr.project_title || cr.project_id}
              </div>
              <div className="text-xs text-slate-400 mt-1 font-mono">
                <span className="text-slate-500">{String(cr.old_value)?.slice(0, 60)}</span>
                <span className="mx-1 text-slate-600">→</span>
                <span className="text-slate-200">{String(cr.new_value)?.slice(0, 60)}</span>
              </div>
              {cr.ai_review && <div className="text-xs text-slate-400 mt-1 line-clamp-2">{cr.ai_review}</div>}
              <div className="text-[10px] text-slate-500 mt-1">
                requested by {cr.requested_by_email}
                {cr.decided_by && ` · decided by ${cr.decided_by}`}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function EmptyBlock({ icon: Icon, label }) {
  return (
    <Card className="p-8 bg-[#111827] border-slate-800 text-center">
      <Icon className="w-8 h-8 mx-auto text-slate-600 mb-2" />
      <div className="text-sm text-slate-500">{label}</div>
    </Card>
  );
}
