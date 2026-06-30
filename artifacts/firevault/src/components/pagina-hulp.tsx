import { useState } from "react";
import { Info, X, Settings2 } from "lucide-react";
import { useWeergave } from "@/context/weergave-context";
import { useRol } from "@/context/rol-context";
import { getPaginaHulpTekst, type PaginaSleutel } from "@/lib/pagina-hulp-teksten";

interface PaginaHulpProps {
  pagina: PaginaSleutel;
  aanvulling?: string;
}

const SESSIE_SLEUTEL = "fps.hulpDismissed";

function gelezenhDismissed(pagina: PaginaSleutel): boolean {
  try {
    const raw = sessionStorage.getItem(SESSIE_SLEUTEL);
    if (!raw) return false;
    const set: string[] = JSON.parse(raw);
    return set.includes(pagina);
  } catch {
    return false;
  }
}

function markeerDismissed(pagina: PaginaSleutel) {
  try {
    const raw = sessionStorage.getItem(SESSIE_SLEUTEL);
    const set: string[] = raw ? JSON.parse(raw) : [];
    if (!set.includes(pagina)) set.push(pagina);
    sessionStorage.setItem(SESSIE_SLEUTEL, JSON.stringify(set));
  } catch { /* negeer */ }
}

export function PaginaHulp({ pagina, aanvulling }: PaginaHulpProps) {
  const { voorkeuren, setToonPaginaHulp } = useWeergave();
  const { rol } = useRol();
  const [dismissed, setDismissed] = useState(() => gelezenhDismissed(pagina));

  if (!voorkeuren.toonPaginaHulp) return null;
  if (dismissed) return null;

  const tekst = getPaginaHulpTekst(pagina, rol);
  if (!tekst) return null;

  function sluit() {
    markeerDismissed(pagina);
    setDismissed(true);
  }

  function zettUit() {
    setToonPaginaHulp(false);
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 shadow-sm">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-relaxed">
          {tekst}
          {aanvulling && (
            <span className="ml-1 text-blue-700">{aanvulling}</span>
          )}
        </p>
        <button
          onClick={zettUit}
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
        >
          <Settings2 className="h-3 w-3" />
          Paginauitleg altijd verbergen (via Weergave-instellingen)
        </button>
      </div>
      <button
        onClick={sluit}
        title="Sluit uitleg voor deze pagina (deze sessie)"
        className="shrink-0 rounded p-0.5 text-blue-400 hover:bg-blue-100 hover:text-blue-700 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
