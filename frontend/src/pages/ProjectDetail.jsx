import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, fmtPHP, fmtDate, FLAG_INFO } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { AlertLevelChip } from "../components/AlertLevelChip";
import { FlagChip, FlagRow } from "../components/FlagChip";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Sparkles, ArrowLeft, MapPin, Calendar, Building2, ClipboardEdit, CheckCircle2, Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";

const SENSITIVE_FIELDS = ["current_budget", "contractor", "end_date", "status"];

export default function ProjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState(null);
  const [aiOutput, setAiOutput] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [reviews, setReviews] = useState([]);

  const load = async () => {
    const { data } = await api.get(`/projects/${id}`);
    setProject(data);
    api.get(`/ai/reviews/${id}`).then((r) => setReviews(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, [id]);

  const runAI = async () => {
    setAiLoading(true);
    try {
      const { data } = await api.post(`/ai/review/${id}`);
      setAiOutput(data);
      toast.success("Claude advisory generated");
      const r = await api.get(`/ai/reviews/${id}`); setReviews(r.data);
    } catch (e) {
      toast.error("AI review failed: " + (e.response?.data?.detail || e.message));
    } finally { setAiLoading(false); }
  };

  const verifyGeo = async () => {
    await api.post(`/projects/${id}/verify-geo`);
    toast.success("Geospatial verification filed");
    load();
  };

  const downloadMemo = () => {
    const token = localStorage.getItem("mt_token");
    const base = process.env.REACT_APP_BACKEND_URL;
    const url = `${base}/api/projects/${id}/memo.pdf?token=${encodeURIComponent(token || "")}`;
    window.open(url, "_blank");
    toast.success("PDF Case Memo generated");
  };

  if (!project) return <ConsoleLayout><div className="text-slate-400">Loading project…</div></ConsoleLayout>;
  const f = project.flags || {};

  return (
    <ConsoleLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <button onClick={() => nav(-1)} className="text-slate-400 hover:text-sky-400 text-xs uppercase tracking-widest flex items-center gap-1 mb-2" data-testid="btn-back">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight max-w-3xl">{project.title}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-slate-400">
              <Building2 className="w-4 h-4" /> {project.agency}
              <span className="text-slate-600">·</span>
              <MapPin className="w-4 h-4" /> {project.municipality}
              <span className="text-slate-600">·</span>
              {project.project_type}
              <span className="text-slate-600">·</span>
              <span className="text-slate-300">{project.status}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <AlertLevelChip level={f.alert_level || "green"} size="lg" />
            <div className="text-[11px] uppercase tracking-widest text-slate-500">Core count · {f.core_count || 0}</div>
            <Button onClick={downloadMemo} size="sm" className="mt-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700" data-testid="btn-download-memo">
              <FileDown className="w-4 h-4 mr-1.5" /> PDF Case Memo
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-4 bg-[#111827] border-slate-800">
              <h3 className="font-display text-sm uppercase tracking-widest text-slate-400 mb-3">Triggered Flags</h3>
              <FlagRow flags={f} size="lg" />
              <div className="mt-4 space-y-2">
                {["F1", "F2", "F3", "F4", "F5", "F6"].filter((c) => f[c]).map((c) => (
                  <div key={c} className="flex gap-3 items-start p-3 rounded-md bg-slate-800/50 border border-slate-800">
                    <FlagChip code={c} size="lg" />
                    <div className="text-sm text-slate-300 flex-1">{f[`${c}_detail`]}</div>
                  </div>
                ))}
                {!["F1", "F2", "F3", "F4", "F5", "F6"].some((c) => f[c]) && (
                  <div className="text-sm text-slate-500">No flags triggered on this project.</div>
                )}
              </div>
            </Card>

            <Tabs defaultValue="financials">
              <TabsList className="bg-slate-800 border border-slate-700">
                <TabsTrigger value="financials" data-testid="tab-financials">Financials</TabsTrigger>
                <TabsTrigger value="modifications" data-testid="tab-modifications">Modifications</TabsTrigger>
                <TabsTrigger value="payments" data-testid="tab-payments">Payments</TabsTrigger>
                <TabsTrigger value="location" data-testid="tab-location">Location</TabsTrigger>
              </TabsList>
              <TabsContent value="financials">
                <Card className="p-4 bg-[#111827] border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KV label="Approved" value={fmtPHP(project.approved_budget)} />
                  <KV label="Current" value={fmtPHP(project.current_budget)} tint={project.current_budget > project.approved_budget ? "text-amber-400" : ""} />
                  <KV label="Disbursed" value={fmtPHP(project.disbursed_amount)} />
                  <KV label="Cost/Unit" value={`${fmtPHP(project.cost_per_unit)} ${project.unit_metric || ""}`} />
                  <KV label="Contractor" value={project.contractor} />
                  <KV label="Start" value={fmtDate(project.start_date)} />
                  <KV label="End" value={fmtDate(project.end_date)} />
                  <KV label="Actual End" value={fmtDate(project.actual_end_date)} />
                </Card>
              </TabsContent>
              <TabsContent value="modifications">
                <Card className="p-4 bg-[#111827] border-slate-800">
                  {(project.modifications || []).length === 0 && <div className="text-sm text-slate-500">No modifications on record.</div>}
                  <div className="space-y-2">
                    {(project.modifications || []).map((m, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-800/50 text-sm">
                        <div><span className="text-slate-400 font-mono text-xs">{fmtDate(m.date)}</span> · {m.reason}</div>
                        <div className={`font-mono text-xs ${m.delta_amount >= 0 ? "text-amber-400" : "text-emerald-400"}`}>{fmtPHP(m.delta_amount)}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </TabsContent>
              <TabsContent value="payments">
                <Card className="p-4 bg-[#111827] border-slate-800">
                  {(project.payments || []).length === 0 && <div className="text-sm text-slate-500">No payments recorded.</div>}
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-widest text-slate-500">
                      <tr><th className="text-left py-2">Date</th><th className="text-left">Milestone</th><th className="text-right">Amount</th><th className="text-right">Verified %</th></tr>
                    </thead>
                    <tbody>
                      {(project.payments || []).map((p, i) => (
                        <tr key={i} className="border-t border-slate-800"><td className="py-2 font-mono text-xs">{fmtDate(p.date)}</td><td>{p.milestone}</td><td className="text-right font-mono text-xs">{fmtPHP(p.amount)}</td><td className="text-right font-mono text-xs">{p.verified_progress_pct.toFixed(0)}%</td></tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </TabsContent>
              <TabsContent value="location">
                <Card className="p-2 bg-[#111827] border-slate-800 overflow-hidden">
                  <MapContainer center={[project.location.lat, project.location.lng]} zoom={13} style={{ height: 320, borderRadius: 8 }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <CircleMarker center={[project.location.lat, project.location.lng]} radius={12} pathOptions={{ color: "#38bdf8", fillOpacity: 0.6 }} />
                  </MapContainer>
                </Card>
                {!project.geo_verified && (
                  <Button className="mt-3 bg-sky-500 hover:bg-sky-400 text-slate-950" onClick={verifyGeo} data-testid="btn-verify-geo">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> File Geospatial Verification
                  </Button>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <Card className="p-4 bg-gradient-to-br from-violet-500/10 to-sky-500/5 border border-violet-500/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-sm uppercase tracking-widest text-violet-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Claude AI Advisory
                </h3>
                <Button size="sm" onClick={runAI} disabled={aiLoading} className="bg-violet-500 hover:bg-violet-400 text-slate-950" data-testid="btn-ai-review">
                  {aiLoading ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Generating</> : "Generate Review"}
                </Button>
              </div>
              <p className="text-[11px] text-violet-300/60 mb-3">
                Advisory only. Sonnet 5 produces context and drafts — humans decide.
              </p>
              {aiOutput ? (
                <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{aiOutput.content}</pre>
              ) : reviews[0] ? (
                <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{reviews[0].content}</pre>
              ) : (
                <div className="text-xs text-slate-500 italic">No advisory generated yet.</div>
              )}
              {(aiOutput || reviews[0]) && (
                <div className="text-[10px] text-slate-500 uppercase tracking-widest pt-3 border-t border-violet-500/20 mt-3 font-mono">
                  model: {(aiOutput || reviews[0]).model} · prompt: {(aiOutput || reviews[0]).prompt_version}
                </div>
              )}
            </Card>

            <Card className="p-4 bg-[#111827] border-slate-800">
              <h3 className="font-display text-sm uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                <ClipboardEdit className="w-4 h-4" /> Sensitive Edit Workflow
              </h3>
              <SensitiveEditForm project={project} onDone={load} />
            </Card>
          </div>
        </div>
      </div>
    </ConsoleLayout>
  );
}

function KV({ label, value, tint }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`font-mono text-sm mt-1 ${tint || "text-slate-100"}`}>{value || "—"}</div>
    </div>
  );
}

function SensitiveEditForm({ project, onDone }) {
  const [field, setField] = useState(SENSITIVE_FIELDS[0]);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      let v = value;
      if (field === "current_budget") v = parseFloat(value);
      await api.post("/change-requests", { project_id: project.id, field, new_value: v });
      toast.success("Change request submitted for review");
      setOpen(false); setValue("");
      onDone();
    } catch (e) {
      toast.error("Failed: " + (e.response?.data?.detail || e.message));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-slate-500">
        Changes to guarded fields ({SENSITIVE_FIELDS.join(", ")}) require a second reviewer approval.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full border-slate-700 text-slate-200 hover:bg-slate-800" data-testid="btn-open-change-request">
            Request Sensitive Edit
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-[#0F172A] border-slate-700 text-slate-100">
          <DialogHeader><DialogTitle>New Change Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-400">Field</Label>
              <select value={field} onChange={(e) => setField(e.target.value)}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm" data-testid="cr-field-select">
                {SENSITIVE_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-slate-400">Current value</Label>
              <div className="mt-1 p-2 rounded bg-slate-800 text-slate-300 font-mono text-xs">{String(project[field])}</div>
            </div>
            <div>
              <Label className="text-slate-400">Proposed new value</Label>
              <Input value={value} onChange={(e) => setValue(e.target.value)}
                className="bg-slate-900 border-slate-700 text-slate-100 mt-1" data-testid="cr-new-value" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={submitting || !value} className="bg-sky-500 hover:bg-sky-400 text-slate-950" data-testid="cr-submit">
              {submitting ? "Submitting…" : "Submit for Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
