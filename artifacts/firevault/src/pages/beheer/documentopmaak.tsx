import React, { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  VoorbladA,
  InhoudspaginaA,
  HoofdstukpaginaA,
  VervolgpaginaB,
  ChecklistpaginaC,
  WerkmaatschappijInfo,
  DocumentMeta
} from "@/components/documentopmaak";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";

const WERKMAATSCHAPPIJEN: Record<string, WerkmaatschappijInfo> = {
  "fps-bouw": {
    naam: "FPS Bouw",
    logoUrl: "logo-fps.png",
    adres: "Nijverheidsstraat 12",
    postcodeWoonplaats: "7511 CH Enschede",
    telefoon: "053 - 123 45 67",
    email: "info@fps-bouw.nl",
    website: "www.fps-bouw.nl",
    kvk: "12345678"
  },
  "fps-brandpreventie": {
    naam: "FPS Brandpreventie",
    logoUrl: "logo-fps.png",
    adres: "Brandweerlaan 4",
    postcodeWoonplaats: "7553 AA Hengelo",
    telefoon: "074 - 987 65 43",
    email: "info@fps-brandpreventie.nl",
    website: "www.fps-brandpreventie.nl",
    kvk: "87654321"
  },
  "fps-onderhoud": {
    naam: "FPS Onderhoud",
    logoUrl: "logo-fps.png",
    adres: "Onderhoudsweg 8",
    postcodeWoonplaats: "7602 BB Almelo",
    telefoon: "0546 - 112 233",
    email: "info@fps-onderhoud.nl",
    website: "www.fps-onderhoud.nl",
    kvk: "56781234"
  },
  "fps-bouw-renovatie": {
    naam: "FPS Bouw en Renovatie",
    logoUrl: "logo-fps.png",
    adres: "Renovatieplein 1",
    postcodeWoonplaats: "7411 CC Deventer",
    telefoon: "0570 - 445 566",
    email: "info@fps-bouw-renovatie.nl",
    website: "www.fps-bouw-renovatie.nl",
    kvk: "34567812"
  }
};

const DUMMY_META_KLANT: DocumentMeta = {
  titel: "Opleverrapport Brandveiligheid",
  ondertitel: "Rapportage van gerealiseerde brandwerende voorzieningen conform Bouwbesluit",
  projectNaam: "Burg. Wallerstraat Oldenzaal — WBO Wonen",
  projectNummer: "PRJ-2025-042",
  klantNaam: "WBO Wonen",
  klantLogoUrl: "logo-fps-one.png",
  heroImageUrl: "project-foto.jpg",
  auteur: "J. de Vries",
  datum: "12 augustus 2026",
  versie: "1.0 (Definitief)",
  kenmerk: "RAP-001",
  paginaNummer: 1,
  totaalPaginas: 24,
};

const DUMMY_META_HRM: DocumentMeta = {
  titel: "Arbeidsovereenkomst Bepaalde Tijd",
  projectNaam: "N.v.t.",
  projectNummer: "",
  klantNaam: "Intern",
  auteur: "HR Afdeling",
  datum: "14 december 2025",
  versie: "Concept",
  kenmerk: "HR-2025-084",
  paginaNummer: 2,
  totaalPaginas: 4,
};

const DUMMY_META_OP: DocumentMeta = {
  titel: "Laatste Minuut Risico Analyse (LMRA)",
  projectNaam: "Burg. Wallerstraat Oldenzaal",
  projectNummer: "PRJ-2025-042",
  klantNaam: "WBO Wonen",
  auteur: "M. Pietersen",
  datum: "12 augustus 2026",
  versie: "1.0",
  kenmerk: "FRM-LMRA-01",
  paginaNummer: 1,
  totaalPaginas: 1,
};

type TemplateId = "A1" | "A2" | "A3" | "B1" | "C1";

export default function DocumentDesignSystem() {
  const { heeftNiveau } = useBevoegdheid();
  const [werkmijId, setWerkmijId] = useState<string>("fps-brandpreventie");
  const [templateId, setTemplateId] = useState<TemplateId>("A1");

  const mij = WERKMAATSCHAPPIJEN[werkmijId];

  if (!heeftNiveau("systeem", 1)) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-8">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 px-8 py-10 text-center max-w-md">
          <h1 className="text-lg font-bold text-slate-900 mb-2">Geen toegang</h1>
          <p className="text-sm text-slate-500">
            Documentopmaak is onderdeel van het systeembeheer. Vraag een beheerder om toegang tot de systeemmodule.
          </p>
        </div>
      </div>
    );
  }

  const renderTemplate = () => {
    switch (templateId) {
      case "A1": return <VoorbladA meta={DUMMY_META_KLANT} mij={mij} />;
      case "A2": return <InhoudspaginaA meta={{...DUMMY_META_KLANT, paginaNummer: 2}} mij={mij} />;
      case "A3": return <HoofdstukpaginaA meta={{...DUMMY_META_KLANT, paginaNummer: 8}} mij={mij} />;
      case "B1": return <VervolgpaginaB meta={DUMMY_META_HRM} mij={mij} />;
      case "C1": return <ChecklistpaginaC meta={DUMMY_META_OP} mij={mij} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center gap-6 shadow-sm z-10 sticky top-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Document Design System</h1>
          <p className="text-sm text-slate-500">Preview van de centrale documentmotor</p>
        </div>

        <div className="h-8 border-l border-slate-200"></div>

        <div className="flex items-center gap-4">
          <div className="w-64">
            <label className="text-xs font-semibold text-slate-600 block mb-1">Werkmaatschappij (Branding)</label>
            <Select value={werkmijId} onValueChange={setWerkmijId}>
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(WERKMAATSCHAPPIJEN).map(([id, w]) => (
                  <SelectItem key={id} value={id}>{w.naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-80">
            <label className="text-xs font-semibold text-slate-600 block mb-1">Template / Pagina</label>
            <Select value={templateId} onValueChange={(v) => setTemplateId(v as TemplateId)}>
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A1">Familie A - Voorblad Klantdocument</SelectItem>
                <SelectItem value="A2">Familie A - Inhoudspagina</SelectItem>
                <SelectItem value="A3">Familie A - Hoofdstukpagina</SelectItem>
                <SelectItem value="B1">Familie B - HRM Vervolgpagina</SelectItem>
                <SelectItem value="C1">Familie C - Operationele Checklist</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-[210mm] mx-auto">
          <div className="text-center text-sm text-slate-400 mb-4 tracking-widest uppercase font-semibold">A4 Print Preview</div>
          {renderTemplate()}
        </div>
      </div>
    </div>
  );
}
