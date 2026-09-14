import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtPHP } from "../lib/api";
import { PublicLayout } from "../components/Layout";
import { AlertLevelChip } from "../components/AlertLevelChip";
import { FlagRow } from "../components/FlagChip";
import { ProjectMap } from "../components/ProjectMap";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Landmark, MapPin, TrendingUp, Search, Building2, Megaphone } from "lucide-react";
import { ComplaintForm } from "../components/ComplaintForm";

const DEPT_META = {
  DILG:  { long: "Department of the Interior and Local Government", accent: "border-sky-500 text-sky-700",       ring: "ring-sky-200" },
  DepEd: { long: "Department of Education",                        accent: "border-rose-500 text-rose-700",      ring: "ring-rose-200" },
  DOH:   { long: "Department of Health",                           accent: "border-red-500 text-red-700",        ring: "ring-red-200" },
  DPWH:  { long: "Department of Public Works and Highways",        accent: "border-amber-500 text-amber-700",    ring: "ring-amber-200" },
};

export default function PublicPortal() {
  const [tab, setTab] = useState("all");
  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [departments, setDepartments] = useState([]);
  const [overview, setOverview] = useState(null);
  const [q, setQ] = useState("");
  const [muni, setMuni] = useState("all");
  const [alert, setAlert] = useState("all");

  useEffect(() => {
    api.get("/public/overview").then((r) => setOverview(r.data));
    api.get("/public/departments").then((r) => setDepartments(r.data));
  }, []);

  useEffect(() => {
    const load = async () => {
      if (tab === "all") {
        // Balanced sample: 150 per department so the map is visually representative
        const depts = ["DILG", "DepEd", "DOH", "DPWH"];
        const commonParams = { limit: 150 };
        if (muni !== "all") commonParams.municipality = muni;
        if (alert !== "all") commonParams.alert_level = alert;
        if (q) commonParams.q = q;
        const responses = await Promise.all(
          depts.map((d) => api.get("/public/projects", { params: { ...commonParams, department: d } }))
        );
        const merged = responses.flatMap((r) => r.data);
        // Total across all agencies still comes from /public/overview
        const totalHeader = responses.reduce(
          (acc, r) => acc + parseInt(r.headers["x-total-count"] || 0), 0
        );
        setProjects(merged);
        setTotal(totalHeader);
      } else {
        const params = { limit: 500, department: tab };
        if (muni !== "all") params.municipality = muni;
        if (alert !== "all") params.alert_level = alert;
        if (q) params.q = q;
        const r = await api.get("/public/projects", { params });
        setProjects(r.data);
        setTotal(parseInt(r.headers["x-total-count"] || r.data.length));
      }
    };
    load();
  }, [tab, muni, q, alert]);

  const active = tab === "all" ? null : departments.find((d) => d.department === tab);
  const munis = useMemo(
    () => Array.from(new Set(projects.map((p) => p.municipality))).sort(),
    [projects]
  );

  return (
    <PublicLayout>
      <div className="space-y-8">
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
          <div className="lg:col-span-3 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs uppercase tracking-widest">
              Cagayan de Oro · Misamis Oriental
            </div>
            <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tight leading-tight text-slate-900">
              Public expenditure, screened by agency.
            </h1>
            <p className="text-slate-600 text-lg leading-relaxed max-w-2xl">
              Browse infrastructure and program spending across DILG, DepEd, DOH, and DPWH. Screening flags surface anomalies for reviewers to check — none of it is proof of wrongdoing.
            </p>
          </div>
          {overview && (
            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
              <PubStat icon={Landmark} label="Projects" value={overview.total_projects.toLocaleString()} />
              <PubStat label="Green" value={overview.alert_counts.green.toLocaleString()} color="text-emerald-600" />
              <PubStat label="Original Budget" value={fmtPHP(overview.original_budget_php || 0)} />
              <PubStat label="Current Budget" value={fmtPHP(overview.total_budget_php)} color="text-slate-900" />
              <PubStat label="Total Increase" value={fmtPHP(overview.budget_increase_php || 0)} color="text-amber-700" />
              <PubStat label="Alerts (Y/O/R)" value={(overview.alert_counts.yellow + overview.alert_counts.orange + overview.alert_counts.red).toLocaleString()} color="text-amber-700" />
            </div>
          )}
        </section>

        {/* Department tabs */}
        <section>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-white border border-slate-200 h-auto flex-wrap gap-1 p-1">
              <TabsTrigger value="all" data-testid="pub-tab-all" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white px-4 py-2">
                All Agencies
                <span className="ml-2 text-[10px] font-mono opacity-70">
                  ({overview?.total_projects?.toLocaleString() || "…"})
                </span>
              </TabsTrigger>
              {departments.map((d) => (
                <TabsTrigger
                  key={d.department}
                  value={d.department}
                  data-testid={`pub-tab-${d.department}`}
                  className="data-[state=active]:bg-slate-900 data-[state=active]:text-white px-4 py-2"
                >
                  {d.department}
                  <span className="ml-2 text-[10px] font-mono opacity-70">({d.count.toLocaleString()})</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {active && (
            <Card className={`mt-4 p-5 bg-white border-2 ${DEPT_META[active.department]?.accent || "border-slate-300"}`}>
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Now viewing
                  </div>
                  <h2 className="font-display text-2xl font-bold mt-1">
                    {DEPT_META[active.department]?.long || active.department}
                  </h2>
                </div>
                <div className="flex gap-6">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Projects</div>
                    <div className="font-mono text-xl font-bold text-slate-900">{active.count.toLocaleString()}</div>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">Original Budget</div>
                  <div className="font-mono text-sm font-bold text-slate-900 mt-1">{fmtPHP(active.original_budget || 0)}</div>
                </div>
                <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">Current Budget</div>
                  <div className="font-mono text-sm font-bold text-slate-900 mt-1">{fmtPHP(active.total_budget)}</div>
                </div>
                <div className="p-3 rounded-md bg-amber-50 border border-amber-200">
                  <div className="text-[10px] uppercase tracking-widest text-amber-700">Total Increase</div>
                  <div className="font-mono text-sm font-bold text-amber-800 mt-1">{fmtPHP(active.budget_increase || 0)}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-3">
                {["green", "yellow", "orange", "red"].map((k) => (
                  <div key={k} className="text-center p-3 rounded-md bg-slate-50 border border-slate-200">
                    <AlertLevelChip level={k} size="xs" />
                    <div className="font-mono text-lg font-bold text-slate-900 mt-1">{active.alert_counts[k].toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </section>

        {/* Filters */}
        <Card className="p-3 bg-white border-slate-200">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
              <Input placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" data-testid="public-search" />
            </div>
            <Select value={muni} onValueChange={setMuni}>
              <SelectTrigger className="w-[220px]" data-testid="public-filter-muni"><SelectValue placeholder="All municipalities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All municipalities</SelectItem>
                {munis.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={alert} onValueChange={setAlert}>
              <SelectTrigger className="w-[180px]" data-testid="public-filter-alert"><SelectValue placeholder="All alert levels" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All alert levels</SelectItem>
                <SelectItem value="green">Green</SelectItem>
                <SelectItem value="yellow">Yellow</SelectItem>
                <SelectItem value="orange">Orange</SelectItem>
                <SelectItem value="red">Red</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <section>
          <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                Map showing
              </span>
              {tab === "all" ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-bold uppercase tracking-widest">
                  All Agencies
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-white text-xs font-bold uppercase tracking-widest"
                  style={{ backgroundColor: { DILG: "#0ea5e9", DepEd: "#f43f5e", DOH: "#dc2626", DPWH: "#f59e0b" }[tab] || "#334155" }}
                >
                  {DEPT_META[tab]?.long || tab} — only
                </span>
              )}
              <span className="text-xs text-slate-500">
                · {Math.min(projects.length, 600)} of {total.toLocaleString()} pins
              </span>
            </div>
            {tab === "all" && (
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                <span>Pin color:</span>
                <LegendDot color="#0ea5e9" label="DILG" />
                <LegendDot color="#f43f5e" label="DepEd" />
                <LegendDot color="#dc2626" label="DOH" />
                <LegendDot color="#f59e0b" label="DPWH" />
              </div>
            )}
            {tab !== "all" && (
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                <span>Pin color:</span>
                <LegendDot color="#10b981" label="Green" />
                <LegendDot color="#f59e0b" label="Yellow" />
                <LegendDot color="#f97316" label="Orange" />
                <LegendDot color="#ef4444" label="Red" />
              </div>
            )}
          </div>
          <Card className="p-2 bg-white border-slate-200 overflow-hidden">
            <ProjectMap
              projects={projects}
              publicMode
              height="450px"
              maxPins={600}
              colorMode={tab === "all" ? "department" : "alert"}
            />
          </Card>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Showing <b>{Math.min(projects.length, 60)}</b> project cards below
            {tab !== "all" && <> — only <b>{tab}</b> projects</>}
            {" "}· use search &amp; filters to narrow further
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.slice(0, 60).map((p) => (
            <Link key={p.id} to={`/public/project/${p.id}`} data-testid={`public-project-${p.id}`} className="group">
              <Card className="p-4 bg-white border-slate-200 hover:border-emerald-500 transition-colors h-full">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <AlertLevelChip level={p.flags?.alert_level || "green"} size="xs" />
                  <div className="flex gap-1 items-center">
                    {p.department && (
                      <span className="text-[9px] uppercase tracking-widest text-slate-500 border border-slate-200 rounded px-1.5 py-0.5 font-mono">
                        {p.department}
                      </span>
                    )}
                    <span className="text-[10px] uppercase tracking-widest text-slate-400">{p.project_type}</span>
                  </div>
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

        {/* Complaint / Report section */}
        <section id="report" className="pt-6 border-t-2 border-slate-200">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-amber-700 font-bold px-2 py-0.5 rounded bg-amber-100 border border-amber-300 inline-flex items-center gap-1">
              <Megaphone className="w-3 h-3" /> Citizen Reporting
            </span>
          </div>
          <ComplaintForm />
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

function LegendDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
      <span className="text-slate-600">{label}</span>
    </span>
  );
}
