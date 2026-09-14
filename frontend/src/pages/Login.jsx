import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success(`Signed in as ${u.name}`);
      nav("/console");
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Sign-in failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-5 bg-[#0B0F17] text-slate-100">
      <div className="lg:col-span-3 relative overflow-hidden grain-bg hidden lg:flex flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-sky-500 grid place-items-center font-bold text-slate-950">M</div>
          <div>
            <div className="font-display text-xl font-bold">MONEYTRACE</div>
            <div className="text-xs uppercase tracking-widest text-slate-400">CDO · Misamis Oriental</div>
          </div>
        </div>
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs uppercase tracking-widest mb-6">
            <ShieldCheck className="w-3.5 h-3.5" /> Reviewer Console
          </div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tight leading-tight mb-4">
            Rule-based screening of public expenditure — with an audit trail you can defend.
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            F1–F6 flags, Green/Yellow/Orange/Red alert levels, and Claude-assisted advisory notes. All actions logged, all AI advisory, humans decide.
          </p>
        </div>
        <div className="flex gap-6 text-xs text-slate-500 uppercase tracking-widest">
          <span>Append-only audit</span>
          <span>·</span>
          <span>Rule-based flags</span>
          <span>·</span>
          <span>AI advisory only</span>
        </div>
      </div>
      <div className="lg:col-span-2 flex items-center justify-center p-6 lg:p-12 bg-[#111827] border-l border-slate-800">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" data-testid="login-form">
          <div>
            <h2 className="font-display text-2xl font-bold">Sign in</h2>
            <p className="text-sm text-slate-400 mt-1">Admin & Reviewer accounts only.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100" data-testid="login-email-input" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw" className="text-slate-300">Password</Label>
            <Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100" data-testid="login-password-input" />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold" data-testid="login-submit">
            {loading ? "Signing in…" : "Sign in"} <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
          <div className="text-xs text-slate-500 text-center">
            <Link to="/public" className="text-sky-400 hover:underline" data-testid="link-public-portal">View public transparency portal →</Link>
          </div>
          <div className="text-[11px] text-slate-600 border-t border-slate-800 pt-4 space-y-1 font-mono">
            <div>admin: elijahespiritu221b@gmail.com / MoneyTrace2026!</div>
            <div>reviewer: reviewer@moneytrace.gov.ph / Reviewer2026!</div>
          </div>
        </form>
      </div>
    </div>
  );
}
