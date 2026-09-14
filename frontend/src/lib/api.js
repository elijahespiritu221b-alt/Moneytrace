import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API = `${BASE}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("mt_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export const FLAG_INFO = {
  F1: { code: "F1", name: "Budget Increase", color: "#F59E0B",
        tooltip: "Current budget exceeds approved by ≥ threshold %, with an absolute PHP floor to avoid tiny-project noise." },
  F2: { code: "F2", name: "Modifications", color: "#EC4899",
        tooltip: "Number of scope/schedule modifications exceeds the configured maximum." },
  F3: { code: "F3", name: "Payment Discrepancy", color: "#EF4444",
        tooltip: "Disbursed amount vs weighted verified progress diverges beyond tolerance %." },
  F4: { code: "F4", name: "Statistical Outlier", color: "#8B5CF6",
        tooltip: "Cost per unit deviates by |Z| ≥ threshold vs the project-type mean." },
  F5: { code: "F5", name: "Schedule Overdue", color: "#F97316",
        tooltip: "Project end date is overdue beyond the configured days without completion." },
  F6: { code: "F6", name: "Geo Pending", color: "#6366F1",
        tooltip: "GIS coordinate field verification has not been filed for this project." },
};

export const ALERT = {
  green:  { label: "Green",  bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/40", pin: "#10b981" },
  yellow: { label: "Yellow", bg: "bg-amber-500/15",   text: "text-amber-400",   border: "border-amber-500/40",   pin: "#f59e0b" },
  orange: { label: "Orange", bg: "bg-orange-500/15",  text: "text-orange-400",  border: "border-orange-500/40",  pin: "#f97316" },
  red:    { label: "Red",    bg: "bg-red-500/15",     text: "text-red-400",     border: "border-red-500/40",     pin: "#ef4444" },
};

export const fmtPHP = (n) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n || 0);

export const fmtDate = (s) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return s; }
};
