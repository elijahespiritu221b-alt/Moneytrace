import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, fmtPHP, fmtDate } from "../lib/api";
import { PublicLayout } from "../components/Layout";
import { AlertLevelChip } from "../components/AlertLevelChip";
import { FlagChip, FlagRow } from "../components/FlagChip";
import { Card } from "../components/ui/card";
import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
import { ArrowLeft, MapPin, Building2 } from "lucide-react";

export default function PublicProjectDetail() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  useEffect(() => { api.get(`/public/projects/${id}`).then((r) => setP(r.data)); }, [id]);
  if (!p) return <PublicLayout><div className="text-slate-500">Loading…</div></PublicLayout>;
  const f = p.flags || {};

  return (
    <PublicLayout>
      <div className="space-y-6">
        <Link to="/public" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-emerald-700" data-testid="public-back">
          <ArrowLeft className="w-4 h-4" /> Back to portal
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-slate-900 max-w-3xl">{p.title}</h1>
            <div className="mt-2 text-sm text-slate-600 flex flex-wrap items-center gap-2">
              <Building2 className="w-4 h-4" /> {p.agency}
              <span>·</span>
              <MapPin className="w-4 h-4" /> {p.municipality}
              <span>·</span>
              {p.project_type}
              <span>·</span>
              {p.status}
            </div>
          </div>
          <AlertLevelChip level={f.alert_level || "green"} size="lg" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-5 bg-white border-slate-200">
            <h3 className="font-display text-sm uppercase tracking-widest text-slate-500 mb-3">Screening Indicators</h3>
            <FlagRow flags={f} size="lg" />
            <div className="mt-4 space-y-2">
              {["F1", "F2", "F3", "F4", "F5", "F6"].filter((c) => f[c]).map((c) => (
                <div key={c} className="flex gap-3 items-start p-3 rounded-md bg-slate-50 border border-slate-200">
                  <FlagChip code={c} size="lg" />
                  <div className="text-sm text-slate-700 flex-1">{f[`${c}_detail`]}</div>
                </div>
              ))}
              {!["F1", "F2", "F3", "F4", "F5", "F6"].some((c) => f[c]) && (
                <div className="text-sm text-slate-500">No screening indicators triggered.</div>
              )}
            </div>
            <p className="mt-4 text-xs text-slate-500 italic">Screening indicators are automated markers, not proof of wrongdoing.</p>
          </Card>

          <Card className="p-5 bg-white border-slate-200 grid grid-cols-2 gap-4">
            <PubKV label="Approved" value={fmtPHP(p.approved_budget)} />
            <PubKV label="Current" value={fmtPHP(p.current_budget)} />
            <PubKV label="Disbursed" value={fmtPHP(p.disbursed_amount)} />
            <PubKV label="Contractor" value={p.contractor} span2 />
            <PubKV label="Start" value={fmtDate(p.start_date)} />
            <PubKV label="End" value={fmtDate(p.end_date)} />
          </Card>
        </div>

        <Card className="p-2 bg-white border-slate-200 overflow-hidden">
          <MapContainer center={[p.location.lat, p.location.lng]} zoom={13} style={{ height: 320, borderRadius: 8 }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <CircleMarker center={[p.location.lat, p.location.lng]} radius={12} pathOptions={{ color: "#059669", fillOpacity: 0.6 }} />
          </MapContainer>
        </Card>
      </div>
    </PublicLayout>
  );
}

function PubKV({ label, value, span2 }) {
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="font-mono text-sm text-slate-900 mt-1">{value || "—"}</div>
    </div>
  );
}
