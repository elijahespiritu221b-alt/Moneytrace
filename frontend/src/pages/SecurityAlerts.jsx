import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ConsoleLayout } from "../components/Layout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { MessageCircle, ShieldAlert, Trash2, Send, Power, Siren } from "lucide-react";

export default function SecurityAlerts() {
  const [status, setStatus] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [form, setForm] = useState({ name: "", title: "", phone: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [s, c, a] = await Promise.all([api.get("/security/status"), api.get("/security/contacts"), api.get("/security/alerts")]);
    setStatus(s.data); setContacts(c.data); setAlerts(a.data);
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post("/security/contacts", form); toast.success("Number registered"); setForm({ name: "", title: "", phone: "" }); load(); }
    catch (err) { toast.error(err.response?.data?.detail || err.message); }
    finally { setBusy(false); }
  };
  const del = async (id) => { await api.delete(`/security/contacts/${id}`); toast.success("Removed"); load(); };
  const toggle = async (id) => { await api.patch(`/security/contacts/${id}`); load(); };
  const test = async (id) => {
    const { data } = await api.post(`/security/contacts/${id}/test`);
    if (data.status === "sent") toast.success("Test message sent");
    else if (data.status === "not_configured") toast.warning("Twilio not configured — message logged only");
    else toast.error(data.error || "Send failed");
  };
  const simulate = async () => {
    setBusy(true);
    try { await api.post("/security/alerts/simulate"); toast.success("Simulated incident dispatched"); load(); }
    finally { setBusy(false); }
  };

  return (
    <ConsoleLayout>
      <div className="space-y-6 max-w-5xl" data-testid="security-alerts-page">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2"><ShieldAlert className="w-6 h-6 text-emerald-400" /> WhatsApp Security Alerts</h1>
          <p className="text-slate-400 text-sm mt-1">Officials registered here receive a WhatsApp message whenever a brute-force login, account lockout or API flood is detected.</p>
        </div>

        {status && (
          <div data-testid="whatsapp-status-banner"
            className={`rounded-md border px-4 py-3 text-sm flex items-center gap-3 ${status.whatsapp_configured ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200"}`}>
            <MessageCircle className="w-4 h-4 shrink-0" />
            {status.whatsapp_configured
              ? "Twilio WhatsApp is connected. Alerts are delivered live."
              : "Twilio WhatsApp is NOT configured. Incidents are still recorded below, but messages are only logged. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM in backend/.env."}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {status && Object.entries(status.rules).map(([k, v]) => (
            <Card key={k} className="p-4 bg-[#111827] border-slate-800">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">{k.replace(/_/g, " ")}</div>
              <div className="text-sm text-slate-200 mt-1 font-mono">{v}</div>
            </Card>
          ))}
        </div>

        <Card className="p-6 bg-[#111827] border-slate-800 space-y-4">
          <h2 className="text-lg font-semibold">Register an official's number</h2>
          <form onSubmit={add} className="grid md:grid-cols-4 gap-3">
            <Input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="contact-name-input" className="bg-slate-900 border-slate-700" />
            <Input placeholder="Position / office" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="contact-title-input" className="bg-slate-900 border-slate-700" />
            <Input required placeholder="+639171234567 or 09171234567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="contact-phone-input" className="bg-slate-900 border-slate-700" />
            <Button type="submit" disabled={busy} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold" data-testid="contact-add-button">Add number</Button>
          </form>
          <div className="divide-y divide-slate-800" data-testid="contacts-list">
            {contacts.length === 0 && <div className="text-sm text-slate-500 py-3">No numbers registered yet.</div>}
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-3" data-testid={`contact-row-${c.id}`}>
                <div className={`w-2 h-2 rounded-full ${c.enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-100">{c.name} <span className="text-slate-500">{c.title && `· ${c.title}`}</span></div>
                  <div className="text-xs font-mono text-slate-400">{c.phone}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => test(c.id)} data-testid={`contact-test-${c.id}`}><Send className="w-3.5 h-3.5 mr-1" /> Test</Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(c.id)} data-testid={`contact-toggle-${c.id}`}><Power className="w-3.5 h-3.5 mr-1" /> {c.enabled ? "Disable" : "Enable"}</Button>
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => del(c.id)} data-testid={`contact-delete-${c.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 bg-[#111827] border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent security incidents</h2>
            <Button size="sm" variant="outline" disabled={busy} onClick={simulate} className="border-slate-700 text-slate-200 hover:bg-slate-800" data-testid="simulate-alert-button">
              <Siren className="w-4 h-4 mr-1" /> Send test incident
            </Button>
          </div>
          <div className="space-y-2" data-testid="incidents-list">
            {alerts.length === 0 && <div className="text-sm text-slate-500">No incidents recorded.</div>}
            {alerts.map((a) => (
              <div key={a.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-3" data-testid={`incident-${a.id}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono uppercase tracking-widest text-red-400">{a.kind.replace(/_/g, " ")}</span>
                  <span className="text-slate-500">{new Date(a.created_at).toLocaleString()}</span>
                </div>
                <div className="text-sm text-slate-200 mt-1">{a.summary}</div>
                <div className="text-xs text-slate-400 mt-1 font-mono">{Object.entries(a.details || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>
                <div className="text-[11px] text-slate-500 mt-2">
                  {a.deliveries.length === 0 ? "No contacts registered at the time." :
                    a.deliveries.map((d) => `${d.name} (${d.status})`).join(", ")}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </ConsoleLayout>
  );
}
