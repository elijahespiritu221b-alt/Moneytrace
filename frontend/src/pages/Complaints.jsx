import { useEffect, useState } from "react";
import { api, fmtDate } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Megaphone, Mail, Phone, User as UserIcon, Building2, Trash2, Ban } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

const STATUS_COLOR = {
  new: "text-sky-400 border-sky-500/40 bg-sky-500/10",
  under_review: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  resolved: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  dismissed: "text-slate-400 border-slate-600 bg-slate-800/60",
};

const CATEGORY_COLOR = {
  Financial: "text-red-400 border-red-500/40 bg-red-500/10",
  Delay: "text-orange-400 border-orange-500/40 bg-orange-500/10",
  Quality: "text-violet-400 border-violet-500/40 bg-violet-500/10",
  "Missing progress": "text-amber-400 border-amber-500/40 bg-amber-500/10",
  Other: "text-slate-300 border-slate-600 bg-slate-800/60",
};

export default function Complaints() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ new: 0, under_review: 0, resolved: 0, dismissed: 0 });
  const [tab, setTab] = useState("new");
  const [notesMap, setNotesMap] = useState({});

  const load = async () => {
    const params = tab === "all" ? {} : { status: tab };
    const [{ data: list }, { data: s }] = await Promise.all([
      api.get("/complaints", { params }),
      api.get("/complaints/stats"),
    ]);
    setItems(list);
    setStats(s);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const decide = async (id, status) => {
    try {
      await api.patch(`/complaints/${id}`, { status, notes: notesMap[id] || "" });
      toast.success(`Complaint marked ${status.replace("_", " ")}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const ban = async (cid) => {
    if (!window.confirm("Toggle suspension for this reporter? Suspended citizens cannot file reports.")) return;
    try {
      const { data } = await api.patch(`/citizens/${cid}/ban`);
      toast.success(data.banned ? `${data.name} suspended` : `${data.name} reinstated`);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const remove = async (c) => {
    if (!window.confirm(`Permanently delete "${c.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/complaints/${c.id}`);
      toast.success("Complaint deleted");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <ConsoleLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-sky-400" /> Citizen Complaints
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Public reports submitted from the transparency portal. Triage, investigate, close.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-slate-800 border border-slate-700">
            <TabsTrigger value="new" data-testid="complaints-tab-new" className="data-[state=active]:bg-sky-500 data-[state=active]:text-slate-950">
              New <span className="ml-2 text-[10px] font-mono">({stats.new})</span>
            </TabsTrigger>
            <TabsTrigger value="under_review" data-testid="complaints-tab-review" className="data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950">
              Under Review <span className="ml-2 text-[10px] font-mono">({stats.under_review})</span>
            </TabsTrigger>
            <TabsTrigger value="resolved" data-testid="complaints-tab-resolved" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-slate-950">
              Resolved <span className="ml-2 text-[10px] font-mono">({stats.resolved})</span>
            </TabsTrigger>
            <TabsTrigger value="dismissed" data-testid="complaints-tab-dismissed" className="data-[state=active]:bg-slate-500 data-[state=active]:text-slate-950">
              Dismissed <span className="ml-2 text-[10px] font-mono">({stats.dismissed})</span>
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="complaints-tab-all" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">All</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-3">
          {items.length === 0 && <div className="text-slate-500 text-sm italic p-6 text-center border border-dashed border-slate-700 rounded-md">No complaints in this bucket yet.</div>}
          {items.map((c) => (
            <Card key={c.id} className="p-4 bg-[#111827] border-slate-800" data-testid={`complaint-${c.id}`}>
              <div className="flex justify-between items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest border ${STATUS_COLOR[c.status] || STATUS_COLOR.new}`}>
                      {c.status.replace("_", " ")}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest border ${CATEGORY_COLOR[c.category] || CATEGORY_COLOR.Other}`}>
                      {c.category}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{fmtDate(c.created_at)}</span>
                    {c.anonymous && !c.citizen_id
                      ? <span className="text-[10px] text-slate-500 uppercase tracking-widest">Anonymous</span>
                      : (
                        <>
                          <span className="text-xs text-slate-400 inline-flex items-center gap-1"><UserIcon className="w-3 h-3" />{c.submitter_name || "—"}</span>
                          {c.submitter_email && <span className="text-xs text-slate-500 inline-flex items-center gap-1"><Mail className="w-3 h-3" />{c.submitter_email}</span>}
                          {c.submitter_contact && <span className="text-xs text-slate-500 inline-flex items-center gap-1"><Phone className="w-3 h-3" />{c.submitter_contact}</span>}
                          {c.submitter_verified && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-widest" data-testid={`complaint-verified-${c.id}`}>Verified</span>}
                          {c.anonymous && <span className="text-[10px] text-slate-500 uppercase tracking-widest">hidden from public</span>}
                        </>
                      )}
                  </div>
                  <h3 className="font-display text-lg font-semibold text-slate-100">{c.title}</h3>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{c.description}</p>
                  {c.project_id && (
                    <Link to={`/console/projects/${c.project_id}`} className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline">
                      <Building2 className="w-3 h-3" /> {c.project_title || "Referenced project"} · {c.project_agency}
                    </Link>
                  )}
                  {c.reviewer_notes && (
                    <div className="text-xs italic text-slate-500 border-l-2 border-slate-700 pl-2">
                      Reviewer note: {c.reviewer_notes} — {c.reviewer_email}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 min-w-[180px]">
                {c.status !== "resolved" && c.status !== "dismissed" && (
                  <>
                    <Textarea
                      placeholder="Reviewer notes (optional)…"
                      value={notesMap[c.id] || ""}
                      onChange={(e) => setNotesMap({ ...notesMap, [c.id]: e.target.value })}
                      className="bg-slate-900 border-slate-700 text-slate-100 text-xs min-h-[60px]"
                      data-testid={`complaint-notes-${c.id}`}
                    />
                    {c.status === "new" && (
                      <Button onClick={() => decide(c.id, "under_review")} size="sm" className="bg-amber-500 hover:bg-amber-400 text-slate-950" data-testid={`complaint-review-${c.id}`}>
                        Start Review
                      </Button>
                    )}
                    <Button onClick={() => decide(c.id, "resolved")} size="sm" className="bg-emerald-500 hover:bg-emerald-400 text-slate-950" data-testid={`complaint-resolve-${c.id}`}>
                      Resolve
                    </Button>
                    <Button onClick={() => decide(c.id, "dismissed")} size="sm" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" data-testid={`complaint-dismiss-${c.id}`}>
                      Dismiss
                    </Button>
                  </>
                )}
                {user?.role === "admin" && (
                  <>
                    {c.citizen_id && (
                      <Button onClick={() => ban(c.citizen_id)} size="sm" variant="ghost" className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10" data-testid={`complaint-ban-${c.id}`}>
                        <Ban className="w-3.5 h-3.5 mr-1" /> Suspend reporter
                      </Button>
                    )}
                    <Button onClick={() => remove(c)} size="sm" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" data-testid={`complaint-delete-${c.id}`}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                    </Button>
                  </>
                )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </ConsoleLayout>
  );
}
