import React, { useState, useEffect, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  VoorbladA,
  InhoudspaginaA,
  HoofdstukpaginaA,
  VervolgpaginaB,
  ChecklistpaginaC,
  type WerkmaatschappijInfo,
  type DocumentMeta,
} from "@/components/documentopmaak";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { useListWerkgevers, useUpdateWerkgever, type Werkgever } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Loader2, Upload, Palette } from "lucide-react";

function werkgeverNaarMij(w: Werkgever): WerkmaatschappijInfo {
  const logoUrl = w.logo_url
    ? (w.logo_url.startsWith("/") ? `/api/storage${w.logo_url}` : `/api/storage/objects/${w.logo_url}`)
    : "/logo-fps.png";
  return {
    id: String(w.id),
    naam: w.naam,
    logoUrl,
    primaireKleur: w.primaire_kleur ?? "#F23B0D",
    adres: w.adres ?? "",
    postcodeWoonplaats: [w.postcode, w.plaats].filter(Boolean).join(" "),
    telefoon: w.telefoon ?? "",
    email: w.email ?? "",
    website: w.website ?? "",
    kvk: w.kvk ?? "",
    btw: w.btw ?? "",
    voettekst: w.voettekst ?? undefined,
    iban: w.iban ?? undefined,
    voettekstPositie:
      w.voettekst_positie === "midden" || w.voettekst_positie === "rechts" || w.voettekst_positie === "links"
        ? w.voettekst_positie
        : undefined,
    margeOnder: w.marge_onder ?? undefined,
    margeLinks: w.marge_links ?? undefined,
    margeRechts: w.marge_rechts ?? undefined,
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

type TemplateId = "A1" | "A2" | "A3" | "B1" | "C1";

const LEGE_MIJ: WerkmaatschappijInfo = {
  naam: "",
  logoUrl: "logo-fps.png",
  primaireKleur: "#F23B0D",
  adres: "",
  postcodeWoonplaats: "",
  telefoon: "",
  email: "",
  website: "",
  kvk: "",
};

export default function DocumentopmaakOrganisatie() {
  const { heeftNiveau } = useBevoegdheid();
  const isHoofdbeheerder = heeftNiveau("beheer", 1);
  const [werkgeverId, setWerkgeverId] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<TemplateId>("A1");

  const { data: werkgevers = [], isLoading } = useListWerkgevers();
  const updateWerkgever = useUpdateWerkgever();
  const { uploadFile } = useUpload({ bestand_type: "algemeen" });
  const { toast } = useToast();

  const [uploadHandtekeningBezig, setUploadHandtekeningBezig] = useState(false);
  const [uploadLogoBezig, setUploadLogoBezig] = useState(false);
  const handtekeningInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (werkgeverId === null && werkgevers.length > 0) {
      setWerkgeverId(werkgevers[0].id);
    }
  }, [werkgevers, werkgeverId]);

  const geselecteerdeWerkgever = werkgevers.find((w) => w.id === werkgeverId) ?? null;
  const mij: WerkmaatschappijInfo = geselecteerdeWerkgever
    ? werkgeverNaarMij(geselecteerdeWerkgever)
    : LEGE_MIJ;

  if (!isHoofdbeheerder) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-8">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 px-8 py-10 text-center max-w-md">
          <h1 className="text-lg font-bold text-slate-900 mb-2">Geen toegang</h1>
          <p className="text-sm text-slate-500">
            Documentopmaak is beschikbaar voor hoofdbeheerders. Vraag een hoofdbeheerder om toegang.
          </p>
        </div>
      </div>
    );
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!werkgeverId || !geselecteerdeWerkgever) return;
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    setUploadLogoBezig(true);
    try {
      const res = await uploadFile(bestand);
      if (!res?.objectPath) throw new Error("Uploaden mislukt");
      await updateWerkgever.mutateAsync({
        id: werkgeverId,
        data: { naam: geselecteerdeWerkgever.naam, logo_url: res.objectPath },
      });
      toast({ title: "Logo opgeslagen", description: "Het huisstijllogo is bijgewerkt voor deze werkmaatschappij." });
      if (logoInputRef.current) logoInputRef.current.value = "";
    } catch {
      toast({ title: "Uploaden mislukt", variant: "destructive" });
    } finally {
      setUploadLogoBezig(false);
    }
  }

  async function handleHandtekeningUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!werkgeverId || !geselecteerdeWerkgever) return;
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    setUploadHandtekeningBezig(true);
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
      setUploadHandtekeningBezig(false);
    }
  }

  async function handleKleurWijzig(kleur: string) {
    if (!werkgeverId || !geselecteerdeWerkgever) return;
    try {
      await updateWerkgever.mutateAsync({
        id: werkgeverId,
        data: { naam: geselecteerdeWerkgever.naam, primaire_kleur: kleur },
      });
      toast({ title: "Merkkleur opgeslagen", description: `Primaire kleur ingesteld op ${kleur}.` });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  const brandStijl = {
    "--color-primary": mij.primaireKleur ?? "#F23B0D",
    "--color-primary-foreground": "#ffffff",
  } as React.CSSProperties;

  const renderTemplate = () => {
    switch (templateId) {
      case "A1": return <VoorbladA meta={DUMMY_META_KLANT} mij={mij} />;
      case "A2": return <InhoudspaginaA meta={{ ...DUMMY_META_KLANT, paginaNummer: 2 }} mij={mij} />;
      case "A3": return <HoofdstukpaginaA meta={{ ...DUMMY_META_KLANT, paginaNummer: 8 }} mij={mij} />;
      case "B1": return <VervolgpaginaB meta={DUMMY_META_HRM} mij={mij} />;
      case "C1": return <ChecklistpaginaC meta={DUMMY_META_OP} mij={mij} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Topbalk */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center gap-6 shadow-sm z-10 sticky top-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Documentopmaak</h1>
          <p className="text-sm text-slate-500">Huisstijl en documentsjablonen per werkmaatschappij</p>
        </div>

        <div className="h-8 border-l border-slate-200" />

        <div className="flex items-center gap-4 flex-wrap">
          {/* Werkmaatschappij-kiezer */}
          <div className="w-64">
            <label className="text-xs font-semibold text-slate-600 block mb-1">Werkmaatschappij</label>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 h-10">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laden...
              </div>
            ) : werkgevers.length === 0 ? (
              <div className="text-sm text-slate-400 h-10 flex items-center">Geen werkgevers gevonden</div>
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
              {geselecteerdeWerkgever.kvk && <span className="ml-2 text-slate-300">KVK {geselecteerdeWerkgever.kvk}</span>}
            </div>
          )}

          <div className="h-8 border-l border-slate-200" />

          {/* Template-kiezer */}
          <div className="w-80">
            <label className="text-xs font-semibold text-slate-600 block mb-1">Sjabloon / Pagina</label>
            <Select value={templateId} onValueChange={(v) => setTemplateId(v as TemplateId)}>
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A1">Familie A — Voorblad Klantdocument</SelectItem>
                <SelectItem value="A2">Familie A — Inhoudspagina</SelectItem>
                <SelectItem value="A3">Familie A — Hoofdstukpagina</SelectItem>
                <SelectItem value="B1">Familie B — HRM Vervolgpagina</SelectItem>
                <SelectItem value="C1">Familie C — Operationele Checklist</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Inhoud */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-[210mm] mx-auto space-y-8">

          {/* Huisstijl-instellingen per werkmaatschappij */}
          {geselecteerdeWerkgever && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-8">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 mb-0.5">
                  Huisstijl — {geselecteerdeWerkgever.naam}
                </h2>
                <p className="text-xs text-slate-500">
                  Logo, merkkleur en handtekening worden automatisch verwerkt in alle rapporten en documenten van deze werkmaatschappij.
                </p>
              </div>

              {/* Logo */}
              <div>
                <h3 className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wide">Huisstijllogo</h3>
                <div className="flex items-start gap-8">
                  <div>
                    <div className="text-xs text-slate-500 mb-2">Huidig logo</div>
                    {geselecteerdeWerkgever.logo_url ? (
                      <img
                        src={
                          geselecteerdeWerkgever.logo_url.startsWith("/")
                            ? `/api/storage${geselecteerdeWerkgever.logo_url}`
                            : `/api/storage/objects/${geselecteerdeWerkgever.logo_url}`
                        }
                        alt="Logo"
                        className="h-14 max-w-[200px] object-contain border border-slate-200 rounded-md p-2 bg-white"
                      />
                    ) : (
                      <div className="h-14 w-48 border border-dashed border-slate-300 rounded-md flex items-center justify-center text-xs text-slate-400 bg-slate-50">
                        Nog niet ingesteld
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-2">Nieuw logo uploaden</div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={uploadLogoBezig}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploadLogoBezig}
                      onClick={() => logoInputRef.current?.click()}
                      type="button"
                    >
                      {uploadLogoBezig ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Uploaden...</>
                      ) : (
                        <><Upload className="h-4 w-4 mr-1.5" />Bestand kiezen (PNG / SVG)</>
                      )}
                    </Button>
                    <div className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
                      Aanbevolen: transparante PNG of SVG, min. 300 px hoog, kleurlogo op transparante achtergrond.
                    </div>
                  </div>
                </div>
              </div>

              {/* Merkkleur */}
              <div>
                <h3 className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wide">Primaire merkkleur</h3>
                <div className="flex items-center gap-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-md border border-slate-200 shadow-inner"
                      style={{ backgroundColor: geselecteerdeWerkgever.primaire_kleur ?? "#F23B0D" }}
                    />
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Huidige kleur</div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {geselecteerdeWerkgever.primaire_kleur ?? "#F23B0D"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">Nieuwe kleur kiezen</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        defaultValue={geselecteerdeWerkgever.primaire_kleur ?? "#F23B0D"}
                        className="h-10 w-14 rounded border border-slate-200 cursor-pointer p-0.5 bg-white"
                        onChange={(e) => {
                          clearTimeout((window as Window & { _kleurTimer?: ReturnType<typeof setTimeout> })._kleurTimer);
                          (window as Window & { _kleurTimer?: ReturnType<typeof setTimeout> })._kleurTimer = setTimeout(() => {
                            void handleKleurWijzig(e.target.value);
                          }, 600);
                        }}
                      />
                      <span className="text-xs text-slate-400">
                        Kies een kleur — wordt na 0,6 seconde automatisch opgeslagen
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Palette className="h-4 w-4 text-slate-400" />
                    <span className="text-xs text-slate-500">
                      De merkkleur verschijnt als accentkleur op omslagen, hoofdstukpagina's en informatieblokken.
                    </span>
                  </div>
                </div>
              </div>

              {/* Handtekening */}
              <div>
                <h3 className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wide">Handtekening voor certificaat</h3>
                <div className="flex items-start gap-8">
                  <div>
                    <div className="text-xs text-slate-500 mb-2">Huidige handtekening</div>
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
                    <div className="text-xs text-slate-500 mb-2">Nieuwe handtekening uploaden</div>
                    <input
                      ref={handtekeningInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden"
                      onChange={handleHandtekeningUpload}
                      disabled={uploadHandtekeningBezig}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploadHandtekeningBezig}
                      onClick={() => handtekeningInputRef.current?.click()}
                      type="button"
                    >
                      {uploadHandtekeningBezig ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Uploaden...</>
                      ) : (
                        <><Upload className="h-4 w-4 mr-1.5" />Bestand kiezen (PNG / JPG)</>
                      )}
                    </Button>
                    <div className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
                      Aanbevolen: transparante PNG, 400 x 150 px, zwarte lijn op transparante achtergrond.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Template preview */}
          <div>
            <div className="text-center text-sm text-slate-400 mb-4 tracking-widest uppercase font-semibold">
              A4 Preview — {geselecteerdeWerkgever?.naam ?? "werkmaatschappij"}
            </div>
            <div style={brandStijl}>
              {renderTemplate()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
