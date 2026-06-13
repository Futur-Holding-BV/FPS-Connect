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

export function DocumentVoet({ meta, mij }: { meta: DocumentMeta; mij: WerkmaatschappijInfo }) {
  return (
    <div className="mt-auto pt-8 pb-12 px-16 flex items-center justify-between text-[10px] text-slate-500 font-medium">
      <div className="flex items-center space-x-6">
        {meta.versie && <span>Versie {meta.versie}</span>}
        <span>{meta.datum}</span>
        <span>{meta.kenmerk || meta.projectNummer}</span>
      </div>
      <div>
        Pagina {meta.paginaNummer || 1} {meta.totaalPaginas ? `van ${meta.totaalPaginas}` : ''}
      </div>
    </div>
  );
}
