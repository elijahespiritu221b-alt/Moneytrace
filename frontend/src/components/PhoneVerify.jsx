import { useState } from "react";
import { useCitizen, apiError } from "../lib/citizen-context";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";

export function PhoneVerify({ devCode, onDone }) {
  const { citizen, verify, resend } = useCitizen();
  const [code, setCode] = useState("");
  const [hint, setHint] = useState(devCode || "");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await verify(code); toast.success("Phone verified — you can now file reports."); onDone?.(); }
    catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); }
  };
  const again = async () => {
    try { const r = await resend(); setHint(r.dev_code || ""); toast.success(r.dev_code ? "New code generated" : "Code sent via SMS"); }
    catch (err) { toast.error(apiError(err)); }
  };

  return (
    <Card className="p-6 bg-white border-slate-200" data-testid="phone-verify-card">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-emerald-600 grid place-items-center shrink-0"><Smartphone className="w-5 h-5 text-white" /></div>
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">Verify your phone</h2>
          <p className="text-sm text-slate-600 mt-1">We sent a 6-digit code to <b>{citizen?.phone}</b>. Enter it below to activate reporting.</p>
        </div>
      </div>
      {hint && (
        <div className="mb-4 p-3 rounded-md bg-sky-50 border border-sky-200 text-xs text-sky-900" data-testid="otp-dev-hint">
          SMS delivery is not configured yet (demo mode). Your code is <b className="font-mono text-base">{hint}</b>.
        </div>
      )}
      <form onSubmit={submit} className="flex gap-3">
        <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" inputMode="numeric"
               className="font-mono text-lg tracking-widest max-w-[180px]" data-testid="otp-input" required />
        <Button type="submit" disabled={busy || code.length !== 6} className="bg-emerald-600 hover:bg-emerald-500 text-white" data-testid="otp-submit">Verify</Button>
        <Button type="button" variant="ghost" onClick={again} data-testid="otp-resend">Resend code</Button>
      </form>
    </Card>
  );
}
