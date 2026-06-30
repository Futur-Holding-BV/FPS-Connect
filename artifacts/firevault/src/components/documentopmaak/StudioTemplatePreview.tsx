import React from "react";
import { DocumentFrame, resolveAssetUrl } from "./DocumentFrame";

export interface StudioTemplateSectie {
  type: "tekst" | "tabel" | "ondertekening" | "checklist";
  titel: string | null;
  inhoud: string;
}

export interface StudioTemplateJson {
  familie: "A" | "B" | "C";
  koptekst: {
    logo_positie: "links" | "rechts" | "midden";
    titel: string;
    subinfo: string | null;
  };
  kleurschema: {
    primair: string;
    secundair: string;
    tekst: string;
  };
  secties: StudioTemplateSectie[];
  voettekst: string | null;
}

interface Props {
  templateJson: string;
  logoUrl?: string | null;
  werkgeverNaam?: string;
}

function parseTemplate(json: string): StudioTemplateJson | null {
  try {
    return JSON.parse(json) as StudioTemplateJson;
  } catch {
    return null;
  }
}

function SectieBlok({ sectie, kleur }: { sectie: StudioTemplateSectie; kleur: string }) {
  return (
    <div className="mb-6">
      {sectie.titel && (
        <h3 className="text-sm font-bold mb-2 pb-1 border-b" style={{ borderColor: kleur, color: kleur }}>
          {sectie.titel}
        </h3>
      )}
      {sectie.type === "checklist" && (
        <div className="space-y-2">
          {sectie.inhoud.split("\n").filter(Boolean).map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
              <div className="w-4 h-4 border border-slate-400 rounded shrink-0" />
              <span>{r}</span>
            </div>
          ))}
          {sectie.inhoud.split("\n").filter(Boolean).length === 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-500 italic">{sectie.inhoud}</div>
          )}
        </div>
      )}
      {sectie.type === "ondertekening" && (
        <div className="grid grid-cols-2 gap-8 mt-4">
          <div>
            <div className="border-b border-slate-400 mb-1 h-8" />
            <p className="text-xs text-slate-500">Handtekening</p>
          </div>
          <div>
            <div className="border-b border-slate-400 mb-1 h-8" />
            <p className="text-xs text-slate-500">Datum</p>
          </div>
        </div>
      )}
      {sectie.type === "tabel" && (
        <div className="border border-slate-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: kleur + "20" }}>
                <th className="p-2 text-left font-semibold border-b border-slate-200">Omschrijving</th>
                <th className="p-2 text-right font-semibold border-b border-slate-200">Bedrag</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="p-2 text-slate-500 italic">{sectie.inhoud}</td>
                <td className="p-2 text-right text-slate-400">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {sectie.type === "tekst" && (
        <p className="text-xs text-slate-600 leading-relaxed">{sectie.inhoud}</p>
      )}
    </div>
  );
}

export default function StudioTemplatePreview({ templateJson, logoUrl, werkgeverNaam = "Werkmaatschappij" }: Props) {
  const tmpl = parseTemplate(templateJson);

  if (!tmpl) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-sm text-muted-foreground border border-dashed rounded-lg">
        Template JSON kon niet worden ingelezen
      </div>
    );
  }

  const { koptekst, kleurschema, secties, voettekst, familie } = tmpl;
  const primaireKleur = kleurschema.primair || "#F23B0D";
  const logoNode = logoUrl ? (
    <img src={resolveAssetUrl(logoUrl)} alt={werkgeverNaam} className="h-8 object-contain" />
  ) : (
    <div className="h-8 px-3 flex items-center bg-muted rounded text-xs font-bold text-muted-foreground">
      {werkgeverNaam.slice(0, 2).toUpperCase()}
    </div>
  );

  return (
    <DocumentFrame paginaEinde={false} className="text-[11px] scale-[0.85] origin-top">
      {/* Koptekst */}
      <div
        className="px-10 py-6 flex items-center justify-between"
        style={{ borderBottom: `3px solid ${primaireKleur}` }}
      >
        {koptekst.logo_positie !== "rechts" && logoNode}
        <div className={koptekst.logo_positie === "midden" ? "text-center flex-1" : "flex-1 px-4"}>
          <h1 className="text-lg font-bold" style={{ color: kleurschema.tekst ?? "#1a1a1a" }}>
            {koptekst.titel}
          </h1>
          {koptekst.subinfo && (
            <p className="text-xs mt-0.5" style={{ color: primaireKleur }}>
              {koptekst.subinfo}
            </p>
          )}
        </div>
        {koptekst.logo_positie === "rechts" && logoNode}
      </div>

      {/* Familie-badge */}
      <div className="px-10 pt-3 pb-1">
        <span
          className="inline-block text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
          style={{ backgroundColor: primaireKleur + "20", color: primaireKleur }}
        >
          Familie {familie} — {familie === "A" ? "Klantdocument" : familie === "B" ? "HRM/Juridisch" : "Operationeel"}
        </span>
      </div>

      {/* Secties */}
      <div className="px-10 py-6 flex-1">
        {secties.map((s, i) => (
          <SectieBlok key={i} sectie={s} kleur={primaireKleur} />
        ))}
        {secties.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Geen secties gedefinieerd</p>
        )}
      </div>

      {/* Voettekst */}
      {voettekst && (
        <div
          className="px-10 py-4 text-[9px] text-slate-500 border-t mt-auto"
          style={{ borderColor: primaireKleur + "40" }}
        >
          {voettekst}
        </div>
      )}
    </DocumentFrame>
  );
}
