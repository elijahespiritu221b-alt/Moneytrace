import { useState } from "react";
import { api } from "../lib/api";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { toast } from "sonner";
import { Megaphone, ShieldAlert, Check } from "lucide-react";

const CATEGORIES = ["Financial", "Delay", "Quality", "Missing progress", "Other"];

export function ComplaintForm({ projectId, projectTitle }) {
  const [form, setForm] = useState({
    category: "Delay",
    title: "",
    description: "",
    submitter_name: "",
    submitter_email: "",
    submitter_contact: "",
    anonymous: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.title.trim().length < 5) return toast.error("Title must be at least 5 characters.");
    if (form.description.trim().length < 20) return toast.error("Description must be at least 20 characters.");
    setSubmitting(true);
    try {
      await api.post("/public/complaints", { ...form, project_id: projectId || null });
      setSubmitted(true);
      toast.success("Thank you — your report has been received.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Submission failed.");
    } finally { setSubmitting(false); }
  };

  if (submitted) {
    return (
      <Card className="p-8 bg-emerald-50 border-2 border-emerald-500 text-center" data-testid="complaint-submitted">
        <div className="w-14 h-14 rounded-full bg-emerald-500 grid place-items-center mx-auto mb-4">
          <Check className="w-7 h-7 text-white" />
        </div>
        <h3 className="font-display text-2xl font-bold text-emerald-900">Report received</h3>
        <p className="text-emerald-800 mt-2 max-w-md mx-auto">
          A reviewer will look into your report. If you provided contact details you may receive an update — otherwise your report remains anonymous.
        </p>
        <Button onClick={() => { setSubmitted(false); setForm({ ...form, title: "", description: "" }); }}
                className="mt-6 bg-emerald-600 hover:bg-emerald-500 text-white" data-testid="complaint-submit-another">
          Submit another report
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-white border-slate-200" id="report">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-amber-500 grid place-items-center shrink-0">
          <Megaphone className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">Report an Issue</h2>
          <p className="text-sm text-slate-600 mt-1">
            Seen something concerning about a public project? Tell reviewers here.
            {projectTitle && <> This report will be attached to <b>{projectTitle}</b>.</>}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 mb-4">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          Reports go directly to human reviewers — no automatic decision is made. Please only submit genuine concerns and stick to facts you can support with evidence when asked.
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger className="mt-1" data-testid="complaint-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Report title *</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)}
                   placeholder="Short summary of your concern"
                   className="mt-1" data-testid="complaint-title" required />
          </div>
        </div>

        <div>
          <Label>Details *</Label>
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)}
                    placeholder="What did you see? When? Where? Why does it concern you?"
                    className="mt-1 min-h-[120px]" data-testid="complaint-description" required />
          <div className="text-[11px] text-slate-500 mt-1">{form.description.length} / min 20 characters</div>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-md border border-slate-200">
          <Checkbox id="anon" checked={form.anonymous} onCheckedChange={(v) => set("anonymous", !!v)} data-testid="complaint-anon" />
          <Label htmlFor="anon" className="cursor-pointer text-sm">Submit anonymously (skip contact fields)</Label>
        </div>

        {!form.anonymous && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Your name (optional)</Label>
              <Input value={form.submitter_name} onChange={(e) => set("submitter_name", e.target.value)}
                     className="mt-1" data-testid="complaint-name" />
            </div>
            <div>
              <Label>Email (optional)</Label>
              <Input type="email" value={form.submitter_email} onChange={(e) => set("submitter_email", e.target.value)}
                     className="mt-1" data-testid="complaint-email" />
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input value={form.submitter_contact} onChange={(e) => set("submitter_contact", e.target.value)}
                     className="mt-1" data-testid="complaint-phone" />
            </div>
          </div>
        )}

        <Button type="submit" disabled={submitting} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold" data-testid="complaint-submit">
          {submitting ? "Submitting…" : "Submit Report"}
        </Button>
      </form>
    </Card>
  );
}
