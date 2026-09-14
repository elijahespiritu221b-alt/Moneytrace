import { ALERT } from "../lib/api";

export function AlertLevelChip({ level = "green", size = "md", testid }) {
  const a = ALERT[level] || ALERT.green;
  const pad = size === "lg" ? "px-3 py-1.5 text-sm" : size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      data-testid={testid || `alert-chip-${level}`}
      className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider border ${a.bg} ${a.text} ${a.border} ${pad}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: a.pin }} />
      {a.label}
    </span>
  );
}
