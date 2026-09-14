import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, fmtPHP, fmtDate, ALERT } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { AlertLevelChip } from "../components/AlertLevelChip";
import { FlagRow, FlagChip } from "../components/FlagChip";
import { ProjectMap } from "../components/ProjectMap";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Search, Filter } from "lucide-react";

export default function Projects() {
  const nav = useNavigate();
  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: "", agency: "all", municipality: "all", project_type: "all", status: "all", alert_level: "all", flag: "all" });

  const load = async () => {
    setLoading(true);
    const params = { limit: 500 };
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== "all") params[k] = v; });
    const res = await api.get("/projects", { params });
    setProjects(res.data);
    setTotal(parseInt(res.headers["x-total-count"] || res.data.length));
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters]);

  const options = useMemo(() => {
    const set = (k) => Array.from(new Set(projects.map((p) => p[k]))).sort();
    return { agencies: set("agency"), munis: set("municipality"), types: set("project_type"), statuses: set("status") };
  }, [projects]);

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const flagToggle = (code) => set("flag", filters.flag === code ? "all" : code);

  return (
    <ConsoleLayout>
      <div className="space-y-4">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Projects</h1>
            <p className="text-slate-400 text-sm mt-1">
              Showing <span className="text-slate-100 font-mono">{projects.length}</span> of{" "}
              <span className="text-slate-100 font-mono">{total.toLocaleString()}</span> records
              {total > projects.length && <span className="text-amber-400"> · use filters to narrow further</span>}
            </p>
          </div>
        </div>

        <Card className="p-3 bg-[#111827] border-slate-800 sticky top-14 z-20">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
              <Input placeholder="Search title…" value={filters.q} onChange={(e) => set("q", e.target.value)}
                className="pl-8 bg-slate-900 border-slate-700 text-slate-100" data-testid="filter-search" />
            </div>
            <FilterSelect testid="filter-agency" placeholder="Agency" value={filters.agency} onChange={(v) => set("agency", v)} opts={options.agencies} />
            <FilterSelect testid="filter-municipality" placeholder="Municipality" value={filters.municipality} onChange={(v) => set("municipality", v)} opts={options.munis} />
            <FilterSelect testid="filter-type" placeholder="Type" value={filters.project_type} onChange={(v) => set("project_type", v)} opts={options.types} />
            <FilterSelect testid="filter-status" placeholder="Status" value={filters.status} onChange={(v) => set("status", v)} opts={options.statuses} />
            <FilterSelect testid="filter-alert" placeholder="Alert Level" value={filters.alert_level} onChange={(v) => set("alert_level", v)} opts={["green", "yellow", "orange", "red"]} />
            <Button variant="ghost" size="sm" onClick={() => setFilters({ q: "", agency: "all", municipality: "all", project_type: "all", status: "all", alert_level: "all", flag: "all" })} data-testid="filter-clear">
              <Filter className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800 mt-2">
            <span className="text-[11px] uppercase tracking-widest text-slate-500 mr-2">Flags:</span>
            {["F1", "F2", "F3", "F4", "F5", "F6"].map((c) => (
              <button key={c} onClick={() => flagToggle(c)} data-testid={`filter-flag-${c.toLowerCase()}`}
                className={`transition-opacity ${filters.flag === c ? "" : "opacity-60"} hover:opacity-100`}>
                <FlagChip code={c} />
              </button>
            ))}
          </div>
        </Card>

        <div className="hidden lg:grid grid-cols-12 gap-4">
          <div className="col-span-8 min-w-0">
            <ProjectTable projects={projects} onOpen={(id) => nav(`/console/projects/${id}`)} loading={loading} />
          </div>
          <div className="col-span-4">
            <div className="sticky top-40">
              <ProjectMap projects={projects} height="calc(100vh - 220px)" />
            </div>
          </div>
        </div>

        <div className="lg:hidden">
          <Tabs defaultValue="list">
            <TabsList className="grid w-full grid-cols-2 bg-slate-800">
              <TabsTrigger value="list" data-testid="mobile-tab-list">List</TabsTrigger>
              <TabsTrigger value="map" data-testid="mobile-tab-map">Map</TabsTrigger>
            </TabsList>
            <TabsContent value="list"><ProjectTable projects={projects} onOpen={(id) => nav(`/console/projects/${id}`)} loading={loading} /></TabsContent>
            <TabsContent value="map"><ProjectMap projects={projects} height="70vh" /></TabsContent>
          </Tabs>
        </div>
      </div>
    </ConsoleLayout>
  );
}

function FilterSelect({ value, onChange, opts, placeholder, testid }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px] bg-slate-900 border-slate-700 text-slate-100 text-xs" data-testid={testid}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-slate-900 border-slate-700 text-slate-100 max-h-[300px]">
        <SelectItem value="all">All {placeholder.toLowerCase()}</SelectItem>
        {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ProjectTable({ projects, onOpen, loading }) {
  return (
    <Card className="bg-[#111827] border-slate-800 overflow-hidden">
      <div className="overflow-x-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#0F172A] z-10 border-b border-slate-800">
            <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400">
              <th className="py-2.5 px-3">Alert</th>
              <th className="py-2.5 px-3">Project</th>
              <th className="py-2.5 px-3">Agency</th>
              <th className="py-2.5 px-3">Municipality</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3 text-right">Budget</th>
              <th className="py-2.5 px-3">Flags</th>
              <th className="py-2.5 px-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="py-8 text-center text-slate-500">Loading…</td></tr>}
            {!loading && projects.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-slate-500">No projects match filters.</td></tr>}
            {projects.map((p) => (
              <tr key={p.id} onClick={() => onOpen(p.id)}
                className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer transition-colors"
                data-testid={`project-row-${p.id}`}>
                <td className="py-2.5 px-3"><AlertLevelChip level={p.flags?.alert_level || "green"} size="xs" /></td>
                <td className="py-2.5 px-3 font-medium text-slate-100 max-w-xs truncate">{p.title}</td>
                <td className="py-2.5 px-3 text-slate-300 text-xs max-w-[180px] truncate">{p.agency}</td>
                <td className="py-2.5 px-3 text-slate-300 text-xs">{p.municipality}</td>
                <td className="py-2.5 px-3 text-slate-400 text-xs">{p.project_type}</td>
                <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-200">{fmtPHP(p.current_budget)}</td>
                <td className="py-2.5 px-3"><FlagRow flags={p.flags} /></td>
                <td className="py-2.5 px-3 text-slate-300 text-xs">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
