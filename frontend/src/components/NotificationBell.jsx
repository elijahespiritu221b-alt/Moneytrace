import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Bell, MessageSquareWarning, GitPullRequestArrow, AlertOctagon, CheckCheck } from "lucide-react";

const KIND_ICON = {
  complaint: MessageSquareWarning,
  change_request: GitPullRequestArrow,
  red_alert: AlertOctagon,
  info: Bell,
};

const KIND_COLOR = {
  complaint: "text-amber-400",
  change_request: "text-orange-400",
  red_alert: "text-red-400",
  info: "text-sky-400",
};

function relTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const wrapRef = useRef(null);

  const refresh = async () => {
    try {
      const [{ data: c }, { data: list }] = await Promise.all([
        api.get("/notifications/unread-count"),
        api.get("/notifications", { params: { limit: 30 } }),
      ]);
      setCount(c.count || 0);
      setItems(list);
    } catch (e) { /* silent */ }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 25000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const openItem = async (n) => {
    setLoading(true);
    try {
      if (!n.read) await api.post(`/notifications/${n.id}/read`);
      if (n.link) nav(n.link);
      setOpen(false);
      refresh();
    } finally { setLoading(false); }
  };

  const markAll = async () => {
    setLoading(true);
    try {
      await api.post("/notifications/read-all");
      refresh();
    } finally { setLoading(false); }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => { setOpen((v) => !v); if (!open) refresh(); }}
        data-testid="notif-bell"
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white grid place-items-center leading-none"
            data-testid="notif-count"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[380px] max-h-[70vh] rounded-lg border border-slate-800 bg-[#0F172A] shadow-xl z-50 flex flex-col overflow-hidden"
          data-testid="notif-panel"
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800">
            <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-sky-400" /> Notifications
              {count > 0 && <span className="text-[10px] text-slate-500">({count} unread)</span>}
            </div>
            {items.some((n) => !n.read) && (
              <button
                onClick={markAll}
                disabled={loading}
                className="text-[10px] uppercase tracking-widest text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                data-testid="notif-mark-all"
              >
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <Bell className="w-6 h-6 mx-auto text-slate-700 mb-2" />
                No notifications yet.
              </div>
            ) : (
              items.map((n) => {
                const Icon = KIND_ICON[n.kind] || Bell;
                const color = KIND_COLOR[n.kind] || "text-slate-400";
                return (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    data-testid={`notif-item-${n.id}`}
                    className={`w-full text-left px-3 py-2.5 border-b border-slate-800 hover:bg-slate-800/60 transition-colors flex items-start gap-2.5 ${
                      n.read ? "opacity-60" : ""
                    }`}
                  >
                    <div className={`mt-0.5 shrink-0 ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                        <div className="text-xs text-slate-100 font-medium truncate">{n.title}</div>
                      </div>
                      {n.body && <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{n.body}</div>}
                      <div className="text-[10px] text-slate-500 mt-1 font-mono">{relTime(n.created_at)}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
