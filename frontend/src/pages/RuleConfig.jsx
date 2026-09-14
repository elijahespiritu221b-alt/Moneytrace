import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Slider } from "../components/ui/slider";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { FLAG_INFO } from "../lib/api";
import { Sliders, RefreshCcw } from "lucide-react";

const FIELDS = [
  { key: "F1_pct", flag: "F1", label: "Budget Increase %", min: 5, max: 50, step: 1, suffix: "%" },
  { key: "F1_floor", flag: "F1", label: "Absolute Floor (PHP)", min: 0, max: 5_000_000, step: 100_000, suffix: "" },
  { key: "F2_max_mods", flag: "F2", label: "Max Modifications", min: 1, max: 15, step: 1, suffix: "" },
  { key: "F3_tolerance_pct", flag: "F3", label: "Payment Tolerance %", min: 0, max: 30, step: 1, suffix: "%" },
  { key: "F4_z_threshold", flag: "F4", label: "Z-Score Threshold", min: 1, max: 4, step: 0.1, suffix: "σ" },
  { key: "F5_days_overdue", flag: "F5", label: "Days Overdue", min: 15, max: 180, step: 5, suffix: " days" },
];

export default function RuleConfig() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/rule-config").then((r) => setCfg(r.data)); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        F1_pct: +cfg.F1_pct, F1_floor: +cfg.F1_floor, F2_max_mods: parseInt(cfg.F2_max_mods),
        F3_tolerance_pct: +cfg.F3_tolerance_pct, F4_z_threshold: +cfg.F4_z_threshold,
        F5_days_overdue: parseInt(cfg.F5_days_overdue),
      };
      const { data } = await api.put("/rule-config", body);
      toast.success(`Recomputed ${data.recomputed} projects`);
    } catch (e) {
      toast.error("Save failed: " + (e.response?.data?.detail || e.message));
    } finally { setSaving(false); }
  };

  const recompute = async () => {
    setSaving(true);
    try { const { data } = await api.post("/recompute-flags"); toast.success(`Recomputed ${data.recomputed} projects`); }
    finally { setSaving(false); }
  };

  if (!cfg) return <ConsoleLayout><div className="text-slate-400">Loading…</div></ConsoleLayout>;

  return (
    <ConsoleLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Sliders className="w-6 h-6 text-sky-400" /> Rule Configuration</h1>
          <p className="text-slate-400 text-sm mt-1">Adjust F1-F6 thresholds. Saving triggers a portfolio-wide recompute and audit entry.</p>
        </div>

        <Card className="p-6 bg-[#111827] border-slate-800 space-y-6">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-slate-200">
                  <span className="font-mono text-xs text-sky-400 mr-2">{f.flag}</span>
                  {f.label}
                </Label>
                <span className="font-mono text-sm text-slate-100">{Number(cfg[f.key]).toLocaleString()}{f.suffix}</span>
              </div>
              <Slider min={f.min} max={f.max} step={f.step}
                value={[+cfg[f.key]]}
                onValueChange={(v) => setCfg({ ...cfg, [f.key]: v[0] })}
                data-testid={`slider-${f.key}`} />
              <div className="text-xs text-slate-500">{FLAG_INFO[f.flag]?.tooltip}</div>
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <Button onClick={save} disabled={saving} className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold" data-testid="btn-save-rules">
              {saving ? "Saving…" : "Save & Recompute"}
            </Button>
            <Button onClick={recompute} disabled={saving} variant="outline" className="border-slate-700 text-slate-200 hover:bg-slate-800" data-testid="btn-recompute">
              <RefreshCcw className="w-4 h-4 mr-1" /> Recompute Only
            </Button>
          </div>
          <div className="text-[11px] text-slate-500 font-mono border-t border-slate-800 pt-3">
            Last updated: {cfg.updated_at} {cfg.updated_by && `by ${cfg.updated_by}`}
          </div>
        </Card>
      </div>
    </ConsoleLayout>
  );
}
