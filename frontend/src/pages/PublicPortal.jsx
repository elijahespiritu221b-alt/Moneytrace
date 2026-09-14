import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmtPHP, ALERT } from "../lib/api";
import { PublicLayout } from "../components/Layout";
import { AlertLevelChip } from "../components/AlertLevelChip";
import { FlagRow } from "../components/FlagChip";
import { ProjectMap } from "../components/ProjectMap";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Landmark, MapPin, TrendingUp, Search } from "lucide-react";

export default function PublicPortal() {
  const [projects, setProjects] = useState([]);
  const [overview, setOverview] = useState(null);
  const [q, setQ] = useState("");
  const [muni, setMuni] = useState("all");

  useEffect(() => {
    api.get("/public/projects").then((r) => setProjects(r.data));
    api.get("/public/overview").then((r) => setOverview(r.data));
  }, []);

  const filtered = useMemo(() => projects.filter((p) => {
    if (muni !== "all" && p.municipality !== muni) return false;
    if (q && !p.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [projects, q, muni]);

  const munis = Array.from(new Set(projects.map((p) => p.municipality))).sort();

  return (
    <PublicLayout>
      <div className="space-y-10">
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
          <div className="lg:col-span-3 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs uppercase tracking-widest">
              Cagayan de Oro · Misamis Oriental
            </div>
            <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tight leading-tight text-slate-900">
              Public expenditure, screened and mapped.
            </h1>
            <p className="text-slate-600 text-lg leading-relaxed max-w-2xl">
              Browse infrastructure projects funded with public money. Screening flags surface anomalies for reviewers to check — none of it is proof of wrongdoing.
            </p>
          </div>
          {overview && (
            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
              <PubStat icon={Landmark} label="Projects" value={overview.total_projects} />
              <PubStat icon={TrendingUp} label="Total Budget" value={fmtPHP(overview.total_budget_php)} span2 />
              <PubStat label="Green" value={overview.alert_counts.green} color="text-emerald-600" />
              <PubStat label="Alerts (Y/O/R)" value={overview.alert_counts.yellow + overview.alert_counts.orange + overview.alert_counts.red} color="text-amber-700" />
            </div>
          )}
        </section>

        <Card className="p-3 bg-white border-slate-200">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
              <Input placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" data-testid="public-search" />
            </div>
            <Select value={muni} onValueChange={setMuni}>
              <SelectTrigger className="w-[220px]" data-testid="public-filter-muni"><SelectValue placeholder="All municipalities" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All municipalities</SelectItem>{munis.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </Card>

        <section>
          <Card className="p-2 bg-white border-slate-200 overflow-hidden">
            <ProjectMap projects={filtered} publicMode height="450px" />
          </Card>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <Link key={p.id} to={`/public/project/${p.id}`} data-testid={`public-project-${p.id}`}
              className="group">
              <Card className="p-4 bg-white border-slate-200 hover:border-emerald-500 transition-colors h-full">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <AlertLevelChip level={p.flags?.alert_level || "green"} size="xs" />
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">{p.project_type}</div>
                </div>
                <h3 className="font-display text-lg font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">{p.title}</h3>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {p.municipality}</div>
                <div className="text-xs text-slate-500 mt-1">{p.agency}</div>
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="font-mono text-sm font-semibold text-slate-900">{fmtPHP(p.current_budget)}</div>
                  <FlagRow flags={p.flags} />
                </div>
              </Card>
            </Link>
          ))}
        </section>
      </div>
    </PublicLayout>
  );
}

function PubStat({ icon: Icon, label, value, color, span2 }) {
  return (
    <Card className={`p-4 bg-white border-slate-200 ${span2 ? "col-span-2" : ""}`}>
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`font-display text-2xl font-bold mt-1 ${color || "text-slate-900"}`}>{value}</div>
    </Card>
  );
}
