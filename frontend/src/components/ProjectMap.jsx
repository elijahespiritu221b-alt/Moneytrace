import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { Link } from "react-router-dom";
import { ALERT, fmtPHP } from "../lib/api";
import { AlertLevelChip } from "./AlertLevelChip";

const DEPT_COLORS = {
  DILG:  "#0ea5e9",   // sky
  DepEd: "#f43f5e",   // rose
  DOH:   "#dc2626",   // red
  DPWH:  "#f59e0b",   // amber
};

export function ProjectMap({
  projects = [],
  center = [8.55, 124.65],
  zoom = 9,
  publicMode = false,
  height = "600px",
  maxPins = 800,
  colorMode = "alert",  // "alert" | "department"
}) {
  const linkBase = publicMode ? "/public/project" : "/console/projects";
  const order = { red: 0, orange: 1, yellow: 2, green: 3 };
  const capped = projects.length > maxPins
    ? [...projects].sort((a, b) => (order[a.flags?.alert_level || "green"] - order[b.flags?.alert_level || "green"])).slice(0, maxPins)
    : projects;
  return (
    <MapContainer
      key={`${center[0]}-${center[1]}-${zoom}`}
      center={center}
      zoom={zoom}
      style={{ height, width: "100%", borderRadius: 12 }}
      preferCanvas={true}
      data-testid="project-leaflet-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {capped.map((p) => {
        const level = p.flags?.alert_level || "green";
        const c = colorMode === "department"
          ? (DEPT_COLORS[p.department] || "#94a3b8")
          : ALERT[level].pin;
        return (
          <CircleMarker
            key={p.id}
            center={[p.location?.lat || 8.5, p.location?.lng || 124.6]}
            radius={9}
            pathOptions={{ color: c, fillColor: c, fillOpacity: 0.85, weight: 2 }}
          >
            <Popup>
              <div className="text-xs space-y-1 min-w-[220px]">
                <div className="font-semibold text-sm">{p.title}</div>
                <div className="opacity-70">{p.department ? `${p.department} · ` : ""}{p.municipality} · {p.project_type}</div>
                <AlertLevelChip level={level} size="xs" />
                <div className="pt-1 font-mono">{fmtPHP(p.current_budget)}</div>
                <Link
                  to={`${linkBase}/${p.id}`}
                  className="inline-block pt-1 text-sky-400 hover:underline"
                  data-testid={`map-popup-link-${p.id}`}
                >
                  Open project →
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
