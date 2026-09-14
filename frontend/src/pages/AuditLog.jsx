import { useEffect, useState } from "react";
import { api, fmtDate } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { Card } from "../components/ui/card";
import { ScrollText } from "lucide-react";

const ACTION_COLORS = {
  LOGIN: "text-slate-400",
  SEED: "text-slate-400",
  FLAGS_RECOMPUTED: "text-sky-400",
  FLAG_TRIGGERED: "text-amber-400",
  VERIFICATION_FILED: "text-emerald-400",
  CHANGE_REQUESTED: "text-violet-400",
  APPROVED: "text-emerald-400",
  REJECTED: "text-red-400",
  RETURNED: "text-orange-400",
  RULE_UPDATED: "text-sky-400",
  PROJECT_EDIT: "text-amber-400",
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.get("/audit-logs").then((r) => setLogs(r.data)); }, []);
  return (
    <ConsoleLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2"><ScrollText className="w-6 h-6 text-sky-400" /> Audit Trail</h1>
          <p className="text-slate-400 text-sm mt-1">Append-only ledger. Every state change is captured with actor, timestamp, and before/after.</p>
        </div>
        <Card className="bg-[#111827] border-slate-800 overflow-hidden">
          <div className="overflow-x-auto max-h-[75vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#0F172A] z-10">
                <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-800">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Project</th>
                  <th className="py-2.5 px-3">Delta</th>
                  <th className="py-2.5 px-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-slate-800 hover:bg-slate-800/40" data-testid={`audit-row-${l.id}`}>
                    <td className="py-2 px-3 font-mono text-xs text-slate-400">{fmtDate(l.timestamp)}</td>
                    <td className="py-2 px-3 text-xs text-slate-300">{l.actor_email || "system"} <span className="text-slate-500">/ {l.actor_role || "—"}</span></td>
                    <td className={`py-2 px-3 font-mono text-xs font-bold ${ACTION_COLORS[l.action] || "text-slate-300"}`}>{l.action}</td>
                    <td className="py-2 px-3 font-mono text-[10px] text-slate-500">{l.project_id ? l.project_id.slice(0, 8) : "—"}</td>
                    <td className="py-2 px-3 text-xs text-slate-400 max-w-md truncate">
                      {l.before || l.after ? <code>{JSON.stringify({ before: l.before, after: l.after })}</code> : "—"}
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-400 max-w-md truncate">{l.note || "—"}</td>
                  </tr>
                ))}
                {logs.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-500">No audit entries yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </ConsoleLayout>
  );
}
