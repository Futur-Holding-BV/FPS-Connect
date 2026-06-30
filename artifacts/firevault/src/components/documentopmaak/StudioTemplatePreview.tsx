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

const FALLBACK_KLEUR = "#F23B0D";

function parseTemplate(json: string): StudioTemplateJson | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    // Defensief: verifieer verplichte top-level velden
    if (!obj.koptekst || typeof obj.koptekst !== "object") return null;
    if (!obj.kleurschema || typeof obj.kleurschema !== "object") return null;
    if (!Array.isArray(obj.secties)) return null;
    return parsed as StudioTemplateJson;
  } catch {
    return null;
  }
}

function geldige_logo_positie(v: unknown): "links" | "rechts" | "midden" {
  if (v === "rechts" || v === "midden") return v;
  return "links";
}

function geldige_sectie_type(v: unknown): "tekst" | "tabel" | "ondertekening" | "checklist" {
  if (v === "tabel" || v === "ondertekening" || v === "checklist") return v;
  return "tekst";
}

function normaliseerSectie(s: unknown): StudioTemplateSectie {
  const obj = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
  return {
    type:   geldige_sectie_type(obj.type),
    titel:  typeof obj.titel === "string" ? obj.titel : null,
    inhoud: typeof obj.inhoud === "string" ? obj.inhoud : "",
  };
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
                <td className="p-2 text-slate-500 italic">{sectie.inhoud || "—"}</td>
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

  // Defensieve normalisatie — ook geldige JSON kan losse velden missen bij LLM-output
  const koptekstObj = (tmpl.koptekst ?? {}) as Record<string, unknown>;
  const kleurObj    = (tmpl.kleurschema ?? {}) as Record<string, unknown>;
  const secties     = Array.isArray(tmpl.secties) ? tmpl.secties.map(normaliseerSectie) : [];
  const familie     = (tmpl.familie === "B" || tmpl.familie === "C") ? tmpl.familie : "A";
  const voettekst   = typeof tmpl.voettekst === "string" ? tmpl.voettekst : null;

  const primaireKleur = (typeof kleurObj.primair === "string" && kleurObj.primair) ? kleurObj.primair : FALLBACK_KLEUR;
  const tekstKleur    = (typeof kleurObj.tekst   === "string" && kleurObj.tekst)   ? kleurObj.tekst   : "#1a1a1a";
  const logoPositie   = geldige_logo_positie(koptekstObj.logo_positie);
  const koptitel      = typeof koptekstObj.titel   === "string" ? koptekstObj.titel   : "";
  const subinfo       = typeof koptekstObj.subinfo === "string" ? koptekstObj.subinfo : null;

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
        {logoPositie !== "rechts" && logoNode}
        <div className={logoPositie === "midden" ? "text-center flex-1" : "flex-1 px-4"}>
          <h1 className="text-lg font-bold" style={{ color: tekstKleur }}>
            {koptitel}
          </h1>
          {subinfo && (
            <p className="text-xs mt-0.5" style={{ color: primaireKleur }}>
              {subinfo}
            </p>
          )}
        </div>
        {logoPositie === "rechts" && logoNode}
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
