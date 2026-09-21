import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { ProjectMap } from "../components/ProjectMap";
import { Card } from "../components/ui/card";
import { Map as MapIcon } from "lucide-react";
import { AlertLevelChip } from "../components/AlertLevelChip";

export default function ProjectMapPage() {
  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.get("/projects", { params: { limit: 800 } }).then((r) => {
      setProjects(r.data);
      setTotal(parseInt(r.headers["x-total-count"] || r.data.length));
    });
  }, []);

  const alertCounts = projects.reduce((acc, p) => {
    const lv = p.flags?.alert_level || "green";
    acc[lv] = (acc[lv] || 0) + 1;
    return acc;
  }, { green: 0, yellow: 0, orange: 0, red: 0 });

  return (
    <ConsoleLayout>
      <div className="space-y-4">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold flex items-center gap-2">
              <MapIcon className="w-6 h-6 text-sky-400" /> Project Map
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {Math.min(projects.length, 800).toLocaleString()} of {total.toLocaleString()} projects — prioritised by alert severity
            </p>
          </div>
          <div className="flex gap-3">
            {["red", "orange", "yellow", "green"].map((k) => (
              <div key={k} className="text-center">
                <AlertLevelChip level={k} size="xs" />
                <div className="font-mono text-sm text-slate-100 mt-1">{alertCounts[k].toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
        <Card className="p-2 bg-[#111827] border-slate-800 overflow-hidden">
          <ProjectMap projects={projects} height="calc(100vh - 220px)" maxPins={800} />
        </Card>
      </div>
    </ConsoleLayout>
  );
}
