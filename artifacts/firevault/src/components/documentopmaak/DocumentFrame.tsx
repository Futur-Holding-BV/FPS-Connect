import React from "react";
import { cn } from "@/lib/utils";
import { DocumentMeta, WerkmaatschappijInfo } from "./types";

// Centrale URL-resolver: absolute URL's (http/https/data/blob) en root-paden
// (bv. /api/storage/...) blijven ongewijzigd; kale bestandsnamen krijgen het
// app-basispad. Zo kan branding later uit `werkgevers` (storage-URL's) komen
// zonder de componenten te herschrijven.
export function resolveAssetUrl(path?: string): string {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/.test(path) || path.startsWith("/")) return path;
  return `${import.meta.env.BASE_URL}${path}`;
}

interface DocumentFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  // Full-bleed pagina's (omslag/hoofdstuk met randloze beelden) clippen overflow;
  // inhoudspagina's niet, zodat dynamische tekst niet wordt afgekapt.
  bleed?: boolean;
  // Pagina-einde bij printen; zet uit op de laatste pagina om een lege
  // slotpagina te voorkomen.
  paginaEinde?: boolean;
}

export function DocumentFrame({ children, className, bleed = false, paginaEinde = true, ...props }: DocumentFrameProps) {
  return (
    <div
      className={cn(
        "w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 shadow-2xl mx-auto relative flex flex-col",
        bleed && "overflow-hidden",
        "print:shadow-none print:m-0 print:w-[210mm] print:min-h-[297mm] print:max-w-none print:h-auto",
        paginaEinde && "print:break-after-page",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Marges komen uit AI-geëxtraheerde huisstijlwaarden; clampen voorkomt dat een
// onzinnige waarde de voettekst van de pagina duwt of lege print-pagina's geeft.
function clampMarge(mm?: number, min = 5, max = 40): number | undefined {
  if (mm === undefined || mm === null || Number.isNaN(mm)) return undefined;
  return Math.min(max, Math.max(min, mm));
}

export function DocumentVoet({ meta, mij }: { meta: DocumentMeta; mij: WerkmaatschappijInfo }) {
  const margeOnder = clampMarge(mij.margeOnder);
  const margeLinks = clampMarge(mij.margeLinks);
  const margeRechts = clampMarge(mij.margeRechts);
  const voettekstRegel = [mij.voettekst, mij.iban ? `IBAN: ${mij.iban}` : null].filter(Boolean).join(" · ");
  const uitlijnKlasse =
    mij.voettekstPositie === "midden" ? "text-center" : mij.voettekstPositie === "rechts" ? "text-right" : "text-left";

  return (
    <div
      className="mt-auto pt-8 pb-12 px-16 flex flex-col gap-1.5 text-[10px] text-slate-500 font-medium"
      style={{
        paddingBottom: margeOnder !== undefined ? `${margeOnder}mm` : undefined,
        paddingLeft: margeLinks !== undefined ? `${margeLinks}mm` : undefined,
        paddingRight: margeRechts !== undefined ? `${margeRechts}mm` : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          {meta.versie && <span>Versie {meta.versie}</span>}
          <span>{meta.datum}</span>
          <span>{meta.kenmerk || meta.projectNummer}</span>
        </div>
        <div>
          Pagina {meta.paginaNummer || 1} {meta.totaalPaginas ? `van ${meta.totaalPaginas}` : ''}
        </div>
      </div>
      {voettekstRegel && <div className={cn("text-[9px] text-slate-400", uitlijnKlasse)}>{voettekstRegel}</div>}
    </div>
  );
}
