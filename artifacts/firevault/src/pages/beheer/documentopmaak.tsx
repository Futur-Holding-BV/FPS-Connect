import React, { useState, useEffect, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  VoorbladA,
  InhoudspaginaA,
  HoofdstukpaginaA,
  VervolgpaginaB,
  ChecklistpaginaC,
  FactuurTemplateA,
  type WerkmaatschappijInfo,
  type DocumentMeta,
} from "@/components/documentopmaak";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { useListWerkgevers, useUpdateWerkgever, type Werkgever } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Loader2 } from "lucide-react";

function werkgeverNaarMij(w: Werkgever): WerkmaatschappijInfo {
  const logoUrl = w.logo_url
    ? (w.logo_url.startsWith("/") ? `/api/storage${w.logo_url}` : `/api/storage/objects/${w.logo_url}`)
    : "logo-fps.png";
  return {
    id: String(w.id),
    naam: w.naam,
    logoUrl,
    adres: w.adres ?? "",
    postcodeWoonplaats: [w.postcode, w.plaats].filter(Boolean).join(" "),
    telefoon: w.telefoon ?? "",
    email: w.email ?? "",
    website: w.website ?? "",
    kvk: w.kvk ?? "",
    btw: w.btw ?? "",
  };
}

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

type TemplateId = "A1" | "A2" | "A3" | "A4" | "B1" | "C1";

const LEGE_MIJ: WerkmaatschappijInfo = {
  naam: "",
  logoUrl: "logo-fps.png",
  adres: "",
  postcodeWoonplaats: "",
  telefoon: "",
  email: "",
  website: "",
  kvk: "",
};

export default function DocumentDesignSystem() {
  const { heeftNiveau } = useBevoegdheid();
  const [werkgeverId, setWerkgeverId] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<TemplateId>("A1");

  const { data: werkgevers = [], isLoading } = useListWerkgevers();
  const updateWerkgever = useUpdateWerkgever();
  const { uploadFile } = useUpload({ bestand_type: "algemeen" });
  const { toast } = useToast();
  const [uploadBezig, setUploadBezig] = useState(false);
  const handtekeningInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (werkgeverId !== null) return;
    if (werkgevers.length === 0) return;
    setWerkgeverId(werkgevers[0].id);
  }, [werkgevers, werkgeverId]);

  const geselecteerdeWerkgever = werkgevers.find((w) => w.id === werkgeverId) ?? null;
  const mij: WerkmaatschappijInfo = geselecteerdeWerkgever
    ? werkgeverNaarMij(geselecteerdeWerkgever)
    : LEGE_MIJ;

  if (!heeftNiveau("systeem", 1)) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-8">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 px-8 py-10 text-center max-w-md">
          <h1 data-paginatitel className="text-lg font-bold text-slate-900 mb-2">Geen toegang</h1>
          <p className="text-sm text-slate-500">
            Documentopmaak is onderdeel van het systeembeheer. Vraag een beheerder om toegang tot de systeemmodule.
          </p>
        </div>
      </div>
    );
  }

  async function handleHandtekeningUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!werkgeverId || !geselecteerdeWerkgever) return;
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    setUploadBezig(true);
    try {
      const res = await uploadFile(bestand);
      if (!res?.objectPath) throw new Error("Uploaden mislukt");
      await updateWerkgever.mutateAsync({
        id: werkgeverId,
        data: { naam: geselecteerdeWerkgever.naam, handtekening_url: res.objectPath },
      });
      toast({ title: "Handtekening opgeslagen", description: "De handtekening is bijgewerkt voor deze werkmaatschappij." });
      if (handtekeningInputRef.current) handtekeningInputRef.current.value = "";
    } catch {
      toast({ title: "Uploaden mislukt", variant: "destructive" });
    } finally {
      setUploadBezig(false);
    }
  }

  const renderTemplate = () => {
    switch (templateId) {
      case "A1": return <VoorbladA meta={DUMMY_META_KLANT} mij={mij} />;
      case "A2": return <InhoudspaginaA meta={{...DUMMY_META_KLANT, paginaNummer: 2}} mij={mij} />;
      case "A3": return <HoofdstukpaginaA meta={{...DUMMY_META_KLANT, paginaNummer: 8}} mij={mij} />;
      case "B1": return <VervolgpaginaB meta={DUMMY_META_HRM} mij={mij} />;
      case "A4": return (
        <FactuurTemplateA
          mij={{ ...mij, iban: mij.iban ?? "NL91 ABNA 0417 1643 00" }}
          factuur={{
            nummer: "FACT-2025-0042",
            datum: "12 augustus 2026",
            vervaldatum: "11 september 2026",
            referentie: "PO-2025-108",
            kenmerk: "FACT-2025-0042",
          }}
          debiteur={{
            naam: "WBO Wonen",
            tav: "Afd. Vastgoedbeheer",
            adres: "Burg. Wallerstraat 12",
            postcodeWoonplaats: "7575 AB Oldenzaal",
          }}
          regels={[
            { omschrijving: "Brandwerende voorzieningen — Fase 1", hoeveelheid: 1, eenheid: "opdracht", stukprijs: "4250.00", bedragExclBtw: "4250.00", btwPercentage: 21, btwBedrag: "892.50" },
            { omschrijving: "Coördinatie & projectbegeleiding", hoeveelheid: 8, eenheid: "uur", stukprijs: "95.00", bedragExclBtw: "760.00", btwPercentage: 21, btwBedrag: "159.60" },
            { omschrijving: "Materiaalkosten brandwerende manchetten", hoeveelheid: 24, eenheid: "st", stukprijs: "38.50", bedragExclBtw: "924.00", btwPercentage: 21, btwBedrag: "194.04" },
          ]}
          totalen={{ exclBtw: 5934.00, btwBedrag: 1246.14, inclBtw: 7180.14, btwPercentage: 21 }}
          betalingstermijn={30}
        />
      );
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
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 h-10">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laden...
              </div>
            ) : werkgevers.length === 0 ? (
              <div className="text-sm text-slate-400 h-10 flex items-center">
                Geen werkgevers gevonden
              </div>
            ) : (
              <Select
                value={werkgeverId != null ? String(werkgeverId) : ""}
                onValueChange={(v) => setWerkgeverId(Number(v))}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {werkgevers.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {geselecteerdeWerkgever && (
            <div className="text-xs text-slate-400 leading-relaxed hidden md:block">
              {[geselecteerdeWerkgever.adres, [geselecteerdeWerkgever.postcode, geselecteerdeWerkgever.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
              {geselecteerdeWerkgever.kvk && (
                <span className="ml-2 text-slate-300">KVK {geselecteerdeWerkgever.kvk}</span>
              )}
            </div>
          )}

          <div className="h-8 border-l border-slate-200"></div>

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
                <SelectItem value="A4">Familie A - Factuurtemplate</SelectItem>
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

          {geselecteerdeWerkgever && (
            <div className="mt-10 bg-white rounded-lg border border-slate-200 shadow-sm p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">Handtekening voor certificaat</h2>
              <p className="text-xs text-slate-500 mb-5">
                De handtekening verschijnt als digitale ondertekening op het garantiecertificaat bij opleverrapporten.
                Upload een transparante PNG-afbeelding (aanbevolen 400 x 150 px, zwarte lijn op transparante achtergrond).
              </p>
              <div className="flex items-start gap-8">
                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-2">Huidige handtekening</div>
                  {geselecteerdeWerkgever.handtekening_url ? (
                    <img
                      src={`/api/storage/${geselecteerdeWerkgever.handtekening_url}`}
                      alt="Handtekening"
                      className="h-16 max-w-[220px] object-contain border border-slate-200 rounded-md p-2 bg-white"
                    />
                  ) : (
                    <div className="h-16 w-52 border border-dashed border-slate-300 rounded-md flex items-center justify-center text-xs text-slate-400 bg-slate-50">
                      Nog niet ingesteld
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-2">Nieuwe handtekening uploaden</div>
                  <input
                    ref={handtekeningInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={handleHandtekeningUpload}
                    disabled={uploadBezig}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={uploadBezig}
                    onClick={() => handtekeningInputRef.current?.click()}
                    type="button"
                  >
                    {uploadBezig ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Uploaden...</>
                    ) : (
                      "Bestand kiezen (PNG / JPG)"
                    )}
                  </Button>
                  <div className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
                    Aanbevolen: transparante PNG, 400 x 150 px, zwarte lijn op wit of transparant
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
