import { useEffect, useState } from "react";
import { api, fmtDate } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Inbox, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth-context";
import { Link } from "react-router-dom";

const RISK_COLOR = { high: "text-red-400 border-red-500/40 bg-red-500/10", medium: "text-amber-400 border-amber-500/40 bg-amber-500/10", low: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10", unknown: "text-slate-400 border-slate-700 bg-slate-800/50" };
const STATUS_COLOR = { pending: "text-amber-400", approved: "text-emerald-400", rejected: "text-red-400", returned: "text-orange-400" };

export default function ChangeRequests() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const load = () => api.get("/change-requests").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const decide = async (id, decision) => {
    try {
      await api.post(`/change-requests/${id}/decide`, { decision, note: "" });
      toast.success(`Request ${decision}d`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  return (
    <ConsoleLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Inbox className="w-6 h-6 text-sky-400" /> Change Requests</h1>
          <p className="text-slate-400 text-sm mt-1">Sensitive-edit queue. AI advisory attached — a second reviewer must decide.</p>
        </div>
        <div className="space-y-3">
          {items.length === 0 && <div className="text-slate-500 text-sm">No change requests yet.</div>}
          {items.map((cr) => (
            <Card key={cr.id} className="p-4 bg-[#111827] border-slate-800" data-testid={`cr-card-${cr.id}`}>
              <div className="flex justify-between items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-[11px] uppercase tracking-widest font-bold ${STATUS_COLOR[cr.status] || "text-slate-400"}`}>{cr.status}</span>
                    <span className="text-xs text-slate-500 font-mono">{fmtDate(cr.requested_at)}</span>
                    <span className="text-xs text-slate-400">by {cr.requested_by_email}</span>
                  </div>
                  <div className="text-sm text-slate-200">
                    Change <span className="font-mono text-sky-400">{cr.field}</span>{" "}
                    from <span className="font-mono text-slate-400">{String(cr.old_value)}</span> →{" "}
                    <span className="font-mono text-amber-400">{String(cr.new_value)}</span>
                  </div>
                  <Link to={`/console/projects/${cr.project_id}`} className="inline-block text-xs text-sky-400 hover:underline">
                    View project →
                  </Link>
                  <div className={`p-3 rounded-md border ${RISK_COLOR[cr.ai_risk] || RISK_COLOR.unknown}`}>
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold mb-1">
                      <Sparkles className="w-3.5 h-3.5" /> Claude Risk Note · {cr.ai_risk || "n/a"}
                    </div>
                    <div className="text-xs text-slate-300 whitespace-pre-wrap">{cr.ai_review}</div>
                  </div>
                </div>
                {cr.status === "pending" && cr.requested_by_email !== user?.email && (
                  <div className="flex flex-col gap-2 min-w-[140px]">
                    <Button onClick={() => decide(cr.id, "approve")} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950" data-testid={`cr-approve-${cr.id}`}>Approve</Button>
                    <Button onClick={() => decide(cr.id, "return")} variant="outline" className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10" data-testid={`cr-return-${cr.id}`}>Return</Button>
                    <Button onClick={() => decide(cr.id, "reject")} variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10" data-testid={`cr-reject-${cr.id}`}>Reject</Button>
                  </div>
                )}
                {cr.status !== "pending" && cr.decision_note && (
                  <div className="text-xs text-slate-500 italic max-w-xs">Note: {cr.decision_note}</div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </ConsoleLayout>
  );
}
