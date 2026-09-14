import { FLAG_INFO } from "../lib/api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export function FlagChip({ code, active = true, size = "sm", testid }) {
  const info = FLAG_INFO[code];
  if (!info) return null;
  const styles = active
    ? { backgroundColor: info.color + "22", color: info.color, borderColor: info.color + "55" }
    : { backgroundColor: "transparent", color: "#4b5563", borderColor: "#374151" };
  const pad = size === "lg" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]";
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid={testid || `flag-chip-${code.toLowerCase()}`}
            className={`inline-flex items-center gap-1 rounded-md border font-bold uppercase tracking-wider ${pad}`}
            style={styles}
          >
            {info.code}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <div className="font-semibold mb-1">{info.code} — {info.name}</div>
          <div className="text-muted-foreground">{info.tooltip}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function FlagRow({ flags, size = "sm" }) {
  if (!flags) return null;
  const codes = ["F1", "F2", "F3", "F4", "F5", "F6"];
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((c) => flags[c] ? <FlagChip key={c} code={c} size={size} /> : null)}
      {!codes.some((c) => flags[c]) && <span className="text-xs text-muted-foreground">— No flags —</span>}
    </div>
  );
}
