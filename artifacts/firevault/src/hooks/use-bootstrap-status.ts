import { useEffect, useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Vraagt éénmalig (per Gate-render waarbij enabled=true wordt) na of de
// eerste-installatie bootstrap nog beschikbaar is (gebruikerstabel leeg).
// Gebruikt om niet-ingelogde bezoekers op elk pad automatisch naar
// /first-install te sturen zolang er nog geen enkele gebruiker bestaat.
export function useBootstrapBeschikbaar(enabled: boolean): "laden" | boolean {
  const [status, setStatus] = useState<"laden" | boolean>("laden");

  useEffect(() => {
    if (!enabled) return;
    let actief = true;
    fetch(`${BASE}/api/installatie/status`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { bootstrap_beschikbaar: false }))
      .then((data) => {
        if (actief) setStatus(Boolean(data.bootstrap_beschikbaar));
      })
      .catch(() => {
        if (actief) setStatus(false);
      });
    return () => {
      actief = false;
    };
  }, [enabled]);

  return status;
}
