import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { Button } from "./ui/button";

export function FullscreenButton({ className = "" }) {
  const [on, setOn] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  return (
    <Button variant="ghost" size="sm" onClick={toggle} title={on ? "Exit fullscreen (Esc)" : "Fullscreen"}
      className={className} data-testid="fullscreen-toggle">
      {on ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
    </Button>
  );
}
