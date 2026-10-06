import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { PublicLayout } from "../components/Layout";
import { PhoneVerify } from "../components/PhoneVerify";
import { useCitizen, apiError } from "../lib/citizen-context";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { UserCheck, ShieldCheck } from "lucide-react";

export default function CitizenAuth() {
  const { citizen, ready, register, login, logout } = useCitizen();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const next = params.get("next") || "/public#report";
  const [mode, setMode] = useState(params.get("mode") === "login" ? "login" : "register");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (mode === "register") { const r = await register(form); setDevCode(r.dev_code || ""); toast.success("Account created — verify your phone"); }
      else { const r = await login(form.email, form.password); if (r.phone_verified) nav(next); }
    } catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); }
  };

  if (!ready) return <PublicLayout><div className="text-slate-500">Loading…</div></PublicLayout>;

  if (citizen && !citizen.phone_verified) {
    return <PublicLayout><div className="max-w-xl mx-auto"><PhoneVerify devCode={devCode} onDone={() => nav(next)} /></div></PublicLayout>;
  }

  if (citizen) {
    return (
      <PublicLayout>
        <Card className="max-w-xl mx-auto p-8 text-center bg-white border-slate-200" data-testid="citizen-signed-in">
          <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
          <h2 className="font-display text-2xl font-bold">You're signed in as {citizen.name}</h2>
          <p className="text-slate-600 mt-1 text-sm">{citizen.email} · {citizen.phone} · verified reporter</p>
          <div className="flex gap-3 justify-center mt-6">
            <Button asChild className="bg-amber-500 hover:bg-amber-400 text-slate-950"><Link to="/public#report" data-testid="go-report">File a report</Link></Button>
            <Button variant="outline" onClick={logout} data-testid="citizen-logout">Sign out</Button>
          </div>
        </Card>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-xl mx-auto space-y-4">
        <Card className="p-6 bg-white border-slate-200">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 grid place-items-center shrink-0"><UserCheck className="w-5 h-5 text-white" /></div>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900">{mode === "register" ? "Create a citizen account" : "Citizen sign in"}</h1>
              <p className="text-sm text-slate-600 mt-1">A verified mobile number is required to file reports. This keeps the portal free of fake submissions.</p>
            </div>
          </div>
          <div className="flex gap-1 p-1 bg-slate-100 rounded-md mb-5 w-fit">
            <button type="button" onClick={() => setMode("register")} data-testid="mode-register" className={`px-4 py-1.5 rounded text-sm ${mode === "register" ? "bg-white shadow font-semibold" : "text-slate-600"}`}>Sign up</button>
            <button type="button" onClick={() => setMode("login")} data-testid="mode-login" className={`px-4 py-1.5 rounded text-sm ${mode === "login" ? "bg-white shadow font-semibold" : "text-slate-600"}`}>Sign in</button>
          </div>
          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div><Label>Full name *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1" data-testid="cit-name" required /></div>
            )}
            <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" data-testid="cit-email" required /></div>
            {mode === "register" && (
              <div><Label>Mobile number *</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="09171234567" className="mt-1" data-testid="cit-phone" required />
                <div className="text-[11px] text-slate-500 mt-1">A 6-digit verification code will be sent to this number.</div></div>
            )}
            <div><Label>Password *</Label><Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="mt-1" data-testid="cit-password" minLength={8} required /></div>
            <Button type="submit" disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold" data-testid="cit-submit">
              {busy ? "Please wait…" : mode === "register" ? "Create account & send code" : "Sign in"}
            </Button>
          </form>
        </Card>
        <p className="text-xs text-slate-500 text-center">Reviewer or admin? <Link to="/login" className="text-emerald-700 underline">Console login</Link></p>
      </div>
    </PublicLayout>
  );
}
