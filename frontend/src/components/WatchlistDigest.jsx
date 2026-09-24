import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtDate } from "../lib/api";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import {
  Star, AlertOctagon, Flame, MessageSquareWarning, GitPullRequestArrow,
  Sparkles, ChevronDown, ChevronUp, RefreshCw, CheckCircle2,
} from "lucide-react";

const WINDOWS = [
  { hours: 24, label: "24h" },
  { hours: 24 * 7, label: "7d" },
  { hours: 24 * 30, label: "30d" },
];

const KIND = {
  complaint: { Icon: MessageSquareWarning, color: "text-amber-400" },
  change_request: { Icon: GitPullRequestArrow, color: "text-orange-400" },
  ai_review: { Icon: Sparkles, color: "text-violet-400" },
};

function relTime(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function WatchlistDigest() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [collapsed, setCollapsed] = useState(false);
  const nav = useNavigate();

  const load = async (h = hours) => {
    setLoading(true);
    try {
      const { data } = await api.get("/watchlist/digest", { params: { since_hours: h } });
      setData(data);
    } catch (e) {
      setData({ entities: [] });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(hours); /* eslint-disable-next-line */ }, [hours]);

  const stats = useMemo(() => {
    const s = { total: 0, red: 0, orange: 0, complaints: 0, cr: 0, ai: 0, entities: 0 };
    if (!data?.entities) return s;
    for (const e of data.entities) {
      s.total += e.total;
      s.red += e.new_red;
      s.orange += e.new_orange;
      s.complaints += e.new_complaints;
      s.cr += e.new_change_requests;
      s.ai += e.new_ai_reviews;
      if (e.total > 0) s.entities += 1;
    }
    return s;
  }, [data]);

  if (!data) return null;

  // Not yet using watchlist → prompt
  if (data.entities.length === 0) {
    return (
      <Card className="p-4 bg-gradient-to-br from-amber-500/5 to-slate-900 border border-amber-500/20 flex items-center justify-between gap-3"
            data-testid="digest-empty">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500/15 grid place-items-center">
            <Star className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-sm text-slate-100">Your watchlist is empty.</div>
            <div className="text-xs text-slate-400">Star a contractor below to get a daily activity digest for it here.</div>
          </div>
        </div>
      </Card>
    );
  }

  const activeEntities = data.entities.filter((e) => e.total > 0);
  const quietEntities = data.entities.filter((e) => e.total === 0);

  return (
    <Card className="bg-gradient-to-br from-amber-500/5 via-[#111827] to-[#111827] border border-amber-500/25 overflow-hidden"
          data-testid="watchlist-digest">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-amber-500/15">
        <div className="flex items-center gap-2.5 min-w-0">
          <Star className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-100 flex items-center gap-2 flex-wrap">
              Watchlist Digest
              <span className="text-[10px] uppercase tracking-widest text-amber-300/80 font-mono">
                last {WINDOWS.find((w) => w.hours === hours)?.label}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {stats.total > 0
                ? `${stats.entities} of ${data.entities.length} watched entities have activity — ${stats.total} new events`
                : `All ${data.entities.length} watched entities are quiet.`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-md border border-slate-700 overflow-hidden">
            {WINDOWS.map((w) => (
              <button key={w.hours}
                      onClick={() => setHours(w.hours)}
                      data-testid={`digest-window-${w.label}`}
                      className={`px-2 py-1 text-[11px] uppercase tracking-widest transition-colors ${
                        w.hours === hours
                          ? "bg-amber-500/20 text-amber-300"
                          : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                      }`}>
                {w.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => load()}
                  data-testid="digest-refresh"
                  className="text-slate-400 hover:text-slate-100">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCollapsed((v) => !v)}
                  data-testid="digest-collapse"
                  className="text-slate-400 hover:text-slate-100">
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-0 border-b border-amber-500/10 bg-slate-950/30">
            <DigestStat label="Red alerts" value={stats.red} icon={AlertOctagon} tint="text-red-400" />
            <DigestStat label="Orange alerts" value={stats.orange} icon={Flame} tint="text-orange-400" />
            <DigestStat label="Complaints" value={stats.complaints} icon={MessageSquareWarning} tint="text-amber-400" />
            <DigestStat label="Change requests" value={stats.cr} icon={GitPullRequestArrow} tint="text-sky-400" />
            <DigestStat label="AI reviews" value={stats.ai} icon={Sparkles} tint="text-violet-400" />
          </div>

          <div className="divide-y divide-slate-800/60">
            {activeEntities.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                No new activity in the last {WINDOWS.find((w) => w.hours === hours)?.label} across your watchlist.
              </div>
            )}
            {activeEntities.map((e) => {
              const isOpen = expanded[e.entity_name];
              return (
                <div key={e.entity_name} className="p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <button onClick={() => nav(`/console/entities/${encodeURIComponent(e.entity_name)}`)}
                            data-testid={`digest-entity-${e.entity_name}`}
                            className="text-left flex items-center gap-2 min-w-0 group">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm text-slate-100 group-hover:text-amber-300 truncate">{e.entity_name}</div>
                        <div className="text-[10px] text-slate-500">
                          {e.project_count} project{e.project_count !== 1 ? "s" : ""} · starred {fmtDate(e.starred_at)}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {e.new_red > 0 && <Pill v={e.new_red} label="RED" c="text-red-400 bg-red-500/10 border-red-500/40" />}
                      {e.new_orange > 0 && <Pill v={e.new_orange} label="ORG" c="text-orange-400 bg-orange-500/10 border-orange-500/40" />}
                      {e.new_complaints > 0 && <Pill v={e.new_complaints} label="COMP" c="text-amber-400 bg-amber-500/10 border-amber-500/40" />}
                      {e.new_change_requests > 0 && <Pill v={e.new_change_requests} label="REQ" c="text-sky-400 bg-sky-500/10 border-sky-500/40" />}
                      {e.new_ai_reviews > 0 && <Pill v={e.new_ai_reviews} label="AI" c="text-violet-400 bg-violet-500/10 border-violet-500/40" />}
                      {e.highlights.length > 0 && (
                        <button onClick={() => setExpanded((s) => ({ ...s, [e.entity_name]: !s[e.entity_name] }))}
                                data-testid={`digest-toggle-${e.entity_name}`}
                                className="text-[10px] uppercase tracking-widest text-slate-400 hover:text-slate-100 px-1.5 py-1 rounded">
                          {isOpen ? "Hide" : "Details"}
                          {isOpen ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {isOpen && e.highlights.length > 0 && (
                    <ul className="mt-2 space-y-1.5 pl-6">
                      {e.highlights.map((h, i) => {
                        const K = KIND[h.kind] || KIND.ai_review;
                        return (
                          <li key={i}>
                            <button onClick={() => nav(h.link || `/console/entities/${encodeURIComponent(e.entity_name)}`)}
                                    className="w-full text-left flex items-start gap-2 text-xs text-slate-300 hover:text-slate-100 group">
                              <K.Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${K.color}`} />
                              <div className="flex-1 min-w-0">
                                <div className="truncate">{h.text}</div>
                                <div className="text-[10px] text-slate-500 font-mono">{relTime(h.at)}</div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}

            {quietEntities.length > 0 && activeEntities.length > 0 && (
              <div className="px-3 py-2 text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                Quiet:
                {quietEntities.slice(0, 6).map((e) => (
                  <button key={e.entity_name}
                          onClick={() => nav(`/console/entities/${encodeURIComponent(e.entity_name)}`)}
                          className="text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline">
                    {e.entity_name}
                  </button>
                )).reduce((acc, cur, i) => acc.length === 0 ? [cur] : [...acc, <span key={"s"+i} className="text-slate-700">·</span>, cur], [])}
                {quietEntities.length > 6 && <span className="text-slate-600">+{quietEntities.length - 6} more</span>}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function DigestStat({ label, value, icon: Icon, tint }) {
  return (
    <div className="p-3 border-r border-slate-800/60 last:border-r-0">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
        <Icon className={`w-3 h-3 ${tint}`} />
      </div>
      <div className={`font-display text-lg font-bold ${value > 0 ? tint : "text-slate-500"}`}>{value}</div>
    </div>
  );
}

function Pill({ v, label, c }) {
  return (
    <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border font-mono ${c}`}>
      {v} {label}
    </span>
  );
}
