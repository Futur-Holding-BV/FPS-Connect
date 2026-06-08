import { useEffect, useRef } from "react";
import { createMuisGebeurtenissen } from "@workspace/api-client-react";

type Gebeurtenis = { pagina: string; type: string; x: number; y: number };

export function HeatmapTracker() {
  const buffer = useRef<Gebeurtenis[]>([]);
  const laatsteMove = useRef(0);

  useEffect(() => {
    function huidigePagina() {
      return window.location.pathname;
    }

    function voegToe(type: string, clientX: number, clientY: number) {
      const breedte = window.innerWidth || 1;
      const hoogte = window.innerHeight || 1;
      buffer.current.push({
        pagina: huidigePagina(),
        type,
        x: Math.round((clientX / breedte) * 1000) / 10,
        y: Math.round((clientY / hoogte) * 1000) / 10,
      });
      if (buffer.current.length >= 50) flush();
    }

    function onClick(e: MouseEvent) {
      voegToe("klik", e.clientX, e.clientY);
    }

    function onMove(e: MouseEvent) {
      const nu = Date.now();
      if (nu - laatsteMove.current < 500) return;
      laatsteMove.current = nu;
      voegToe("beweging", e.clientX, e.clientY);
    }

    function flush() {
      if (buffer.current.length === 0) return;
      const gebeurtenissen = buffer.current.splice(0, buffer.current.length);
      void createMuisGebeurtenissen({ gebeurtenissen }).catch(() => {
        // Tracking mag de app nooit blokkeren
      });
    }

    const interval = window.setInterval(flush, 10000);
    window.addEventListener("click", onClick);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("beforeunload", flush);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("click", onClick);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  return null;
}
