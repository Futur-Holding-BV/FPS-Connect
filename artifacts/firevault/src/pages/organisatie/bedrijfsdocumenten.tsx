import { useState, useRef, useCallback } from "react";
import {
  useListOrgBedrijfsdocumenten,
  useCreateOrgBedrijfsdocument,
  useUpdateOrgBedrijfsdocument,
  useDeleteOrgBedrijfsdocument,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Files,
  Plus,
  Pencil,
  Trash2,
  FileText,
  ShieldCheck,
  Award,
  BookMarked,
  FolderOpen,
  Upload,
  Sparkles,
  AlertTriangle,
  Check,
  Download,
} from "lucide-react";

const CATEGORIEEN: { waarde: string; label: string; icoon: typeof FileText }[] = [
  { waarde: "contract",          label: "Contract",          icoon: FileText    },
  { waarde: "vergunning",        label: "Vergunning",        icoon: ShieldCheck },
  { waarde: "certificaat",       label: "Certificaat",       icoon: Award       },
  { waarde: "kwaliteitshandboek",label: "Kwaliteitshandboek",icoon: BookMarked  },
  { waarde: "overig",            label: "Overig",            icoon: FolderOpen  },
];

const CATEGORIE_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIEEN.map((c) => [c.waarde, c.label])
);

const STATUS_KLEUREN: Record<string, string> = {
  actief:      "bg-green-100 text-green-700",
  verlopen:    "bg-red-100 text-red-700",
  ingetrokken: "bg-gray-100 text-gray-700",
};

const leegForm = {
  naam:         "",
  categorie:    "contract",
  omschrijving: "",
  uitgever:     "",
  referentie:   "",
  ingangsdatum: "",
  vervaldatum:  "",
  status:       "actief",
  opmerkingen:  "",
};

type AiVelden = Set<keyof typeof leegForm>;

type Bedrijfsdocument = {
  id: number;
  naam: string;
  categorie: string;
  omschrijving?: string | null;
  uitgever?: string | null;
  referentie?: string | null;
  ingangsdatum?: string | null;
  vervaldatum?: string | null;
  status: string;
  document_id?: number | null;
  opmerkingen?: string | null;
  bestand_hash?: string | null;
  bestand_pad?: string | null;
};

type Dubbeling = { id: number; naam: string };

function isVerlopen(datum: string | null | undefined): boolean {
  if (!datum) return false;
  return new Date(datum) < new Date();
}

const TOEGESTANE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
];

async function stuurCorrectie(aiVoorstel: string, gekozen: string, hash: string | null, tekstFragment: string | null) {
  try {
    await fetch("/api/organisatie/bedrijfsdocumenten/correctie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ai_voorstel: aiVoorstel, gekozen, hash, tekst_fragment: tekstFragment }),
    });
  } catch {
    // Stil falen — niet-kritieke achtergrondactie
  }
}

async function stuurVeldCorrectie(
  veldNaam: string,
  aiVoorstel: string,
  gekozen: string,
  hash: string | null,
  tekstFragment: string | null,
) {
  try {
    await fetch("/api/organisatie/bedrijfsdocumenten/veld-correctie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        veld_naam: veldNaam,
        ai_voorstel: aiVoorstel,
        gekozen,
        hash,
        tekst_fragment: tekstFragment,
      }),
    });
  } catch {
    // Stil falen — niet-kritieke achtergrondactie
  }
}

export default function BedrijfsdocumentenPagina() {
  const { data: documenten = [], isLoading } = useListOrgBedrijfsdocumenten();
  const createDoc = useCreateOrgBedrijfsdocument();
  const updateDoc = useUpdateOrgBedrijfsdocument();
  const deleteDoc = useDeleteOrgBedrijfsdocument();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialoogOpen, setDialoogOpen]           = useState(false);
  const [bewerkId, setBewerkId]                 = useState<number | null>(null);
  const [form, setForm]                         = useState({ ...leegForm });
  const [aiVelden, setAiVelden]                 = useState<AiVelden>(new Set());
  const [analyseBezig, setAnalyseBezig]         = useState(false);
  const [sleepActief, setSleepActief]           = useState(false);
  const [dubbeling, setDubbeling]               = useState<Dubbeling | null>(null);
  const [verwijderBevestiging, setVerwijderBevestiging] = useState<number | null>(null);
  const [actieveCat, setActieveCat]             = useState<string>("alle");
  const [bestaandBestandPad, setBestaandBestandPad] = useState<string | null>(null);
  const [vervangBestand, setVervangBestand]     = useState(false);

  const hashRef                = useRef<string | null>(null);
  const tekstFragmentRef       = useRef<string | null>(null);
  const aiVoorgesteldCat       = useRef<string | null>(null);
  const aiVoorgesteldeVelden   = useRef<Partial<Record<keyof typeof leegForm, string>>>({});
  const bestandPadRef          = useRef<string | null>(null);
  const bestandInputRef        = useRef<HTMLInputElement>(null);

  const aiActief = aiVelden.size > 0;

  const VELD_CORRECTIE_VELDEN: ReadonlyArray<keyof typeof leegForm> = [
    "naam", "uitgever", "referentie", "ingangsdatum", "vervaldatum", "omschrijving",
  ];

  const setFormVeld = (k: keyof typeof leegForm, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setAiVelden((prev) => {
      const nieuw = new Set(prev);
      nieuw.delete(k);
      return nieuw;
    });
    // aiVoorgesteldeVelden.current[k] blijft bewaard totdat onBlur de eindwaarde stuurt
  };

  // Correctie versturen bij verlaten veld (onBlur) — eindwaarde, niet tussenwaarde
  const handleVeldBlur = (k: keyof typeof leegForm, eindWaarde: string) => {
    if (!(VELD_CORRECTIE_VELDEN as ReadonlyArray<string>).includes(k)) return;
    const aiVoorstel = aiVoorgesteldeVelden.current[k] ?? null;
    if (aiVoorstel !== null && eindWaarde !== aiVoorstel) {
      void stuurVeldCorrectie(k, aiVoorstel, eindWaarde, hashRef.current, tekstFragmentRef.current);
      delete aiVoorgesteldeVelden.current[k];
    }
  };

  const kiesCategorieHandmatig = (waarde: string) => {
    const was = form.categorie;
    setFormVeld("categorie", waarde);
    // Als AI een voorstel had en de gebruiker kiest iets anders → stuur correctie
    if (aiVoorgesteldCat.current && aiVoorgesteldCat.current !== waarde) {
      stuurCorrectie(aiVoorgesteldCat.current, waarde, hashRef.current, tekstFragmentRef.current);
      aiVoorgesteldCat.current = null;
    }
    void was;
  };

  const resetDialoog = () => {
    setAiVelden(new Set());
    hashRef.current = null;
    tekstFragmentRef.current = null;
    aiVoorgesteldCat.current = null;
    bestandPadRef.current = null;
    aiVoorgesteldeVelden.current = {};
    setDubbeling(null);
    setBestaandBestandPad(null);
    setVervangBestand(false);
  };

  const openNieuw = (cat?: string) => {
    setBewerkId(null);
    setForm({ ...leegForm, categorie: cat ?? "contract" });
    resetDialoog();
    setDialoogOpen(true);
  };

  const openBewerken = (d: Bedrijfsdocument) => {
    setBewerkId(d.id);
    setForm({
      naam:         d.naam ?? "",
      categorie:    d.categorie ?? "overig",
      omschrijving: d.omschrijving ?? "",
      uitgever:     d.uitgever ?? "",
      referentie:   d.referentie ?? "",
      ingangsdatum: d.ingangsdatum ?? "",
      vervaldatum:  d.vervaldatum ?? "",
      status:       d.status ?? "actief",
      opmerkingen:  d.opmerkingen ?? "",
    });
    resetDialoog();
    hashRef.current = d.bestand_hash ?? null;
    setBestaandBestandPad(d.bestand_pad ?? null);
    setDialoogOpen(true);
  };

  const verwerkBestand = useCallback(async (bestand: File) => {
    if (!TOEGESTANE_TYPES.includes(bestand.type) && !bestand.name.endsWith(".pdf")) {
      toast({ title: "Bestandstype niet ondersteund", description: "Upload een PDF, Word-document of afbeelding.", variant: "destructive" });
      return;
    }
    setAnalyseBezig(true);
    setDubbeling(null);
    try {
      const formData = new FormData();
      formData.append("bestand", bestand);
      const resp = await fetch("/api/organisatie/bedrijfsdocumenten/analyseer", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!resp.ok) {
        const fout = await resp.json().catch(() => ({}));
        toast({ title: "Analyse mislukt", description: (fout as { error?: string }).error ?? "Onbekende fout", variant: "destructive" });
        return;
      }
      const data = await resp.json() as {
        naam: string;
        categorie: string;
        omschrijving: string | null;
        uitgever: string | null;
        referentie: string | null;
        ingangsdatum: string | null;
        vervaldatum: string | null;
        hash: string;
        bestand_pad: string | null;
        tekstFragment: string | null;
        dubbeling: Dubbeling | null;
      };

      hashRef.current          = data.hash;
      bestandPadRef.current    = data.bestand_pad ?? null;
      tekstFragmentRef.current = data.tekstFragment ?? null;
      aiVoorgesteldCat.current = data.categorie;
      aiVoorgesteldeVelden.current = {};

      const ingevuldeVelden = new Set<keyof typeof leegForm>();
      const updates: Partial<typeof leegForm> = {};

      if (data.naam)         { updates.naam         = data.naam;         ingevuldeVelden.add("naam");         aiVoorgesteldeVelden.current.naam         = data.naam;         }
      if (data.categorie)    { updates.categorie    = data.categorie;    ingevuldeVelden.add("categorie");    }
      if (data.omschrijving) { updates.omschrijving = data.omschrijving; ingevuldeVelden.add("omschrijving"); aiVoorgesteldeVelden.current.omschrijving = data.omschrijving; }
      if (data.uitgever)     { updates.uitgever     = data.uitgever;     ingevuldeVelden.add("uitgever");     aiVoorgesteldeVelden.current.uitgever     = data.uitgever;     }
      if (data.referentie)   { updates.referentie   = data.referentie;   ingevuldeVelden.add("referentie");   aiVoorgesteldeVelden.current.referentie   = data.referentie;   }
      if (data.ingangsdatum) { updates.ingangsdatum = data.ingangsdatum; ingevuldeVelden.add("ingangsdatum"); aiVoorgesteldeVelden.current.ingangsdatum = data.ingangsdatum; }
      if (data.vervaldatum)  { updates.vervaldatum  = data.vervaldatum;  ingevuldeVelden.add("vervaldatum");  aiVoorgesteldeVelden.current.vervaldatum  = data.vervaldatum;  }

      setForm((prev) => ({ ...prev, ...updates }));
      setAiVelden(ingevuldeVelden);
      if (data.dubbeling) setDubbeling(data.dubbeling);
    } catch {
      toast({ title: "Analyse mislukt", description: "Verbinding mislukt", variant: "destructive" });
    } finally {
      setAnalyseBezig(false);
    }
  }, [toast]);

  const slaOp = async (negeerDubbeling = false) => {
    if (dubbeling && !negeerDubbeling) return;
    if (!form.naam || !form.categorie) {
      toast({ title: "Naam en categorie zijn verplicht", variant: "destructive" });
      return;
    }
    const payload = {
      naam:         form.naam.trim(),
      categorie:    form.categorie,
      omschrijving: form.omschrijving || undefined,
      uitgever:     form.uitgever     || undefined,
      referentie:   form.referentie   || undefined,
      ingangsdatum: form.ingangsdatum || undefined,
      vervaldatum:  form.vervaldatum  || undefined,
      status:       form.status,
      opmerkingen:  form.opmerkingen  || undefined,
      bestand_hash: hashRef.current   ?? undefined,
      bestand_pad:  bestandPadRef.current ?? undefined,
    };
    try {
      if (bewerkId) {
        await updateDoc.mutateAsync({ id: bewerkId, data: payload });
        toast({ title: "Document bijgewerkt" });
      } else {
        await createDoc.mutateAsync({ data: payload });
        toast({ title: "Document geregistreerd" });
      }
      queryClient.invalidateQueries({ queryKey: ["listOrgBedrijfsdocumenten"] });
      setDialoogOpen(false);
      resetDialoog();
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  };

  const stapOverNaarBewerken = () => {
    if (!dubbeling) return;
    const bestaand = documenten.find((d) => d.id === dubbeling.id);
    if (bestaand) openBewerken(bestaand as Bedrijfsdocument);
  };

  const verwijder = async (id: number) => {
    try {
      await deleteDoc.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["listOrgBedrijfsdocumenten"] });
      setVerwijderBevestiging(null);
      toast({ title: "Document verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  };

  const gefilterdeDocumenten =
    actieveCat === "alle" ? documenten : documenten.filter((d) => d.categorie === actieveCat);
  void gefilterdeDocumenten;

  const aantalVerlopend = documenten.filter(
    (d) => d.vervaldatum && isVerlopen(d.vervaldatum) && d.status === "actief"
  ).length;

  const isAi = (k: keyof typeof leegForm) => aiVelden.has(k);
  const aiKlasse      = "bg-amber-50 border-amber-300 focus-visible:ring-amber-400";
  const aiLabelKlasse = "text-amber-700";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bedrijfsdocumenten</h1>
          <p className="text-muted-foreground mt-1">
            Contracten, vergunningen, certificaten en overige interne bedrijfsdocumenten.
          </p>
        </div>
        <Button onClick={() => openNieuw()}>
          <Plus className="h-4 w-4 mr-2" />
          Document registreren
        </Button>
      </div>

      {aantalVerlopend > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
          <p className="text-sm text-red-700">
            <span className="font-medium">
              {aantalVerlopend} {aantalVerlopend === 1 ? "document is verlopen" : "documenten zijn verlopen"}
            </span>{" "}
            — controleer de vervaldatums en vernieuw of pas de status aan.
          </p>
        </div>
      )}

      {documenten.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {CATEGORIEEN.map(({ waarde, label, icoon: Icoon }) => {
            const aantal = documenten.filter((d) => d.categorie === waarde).length;
            return (
              <button
                key={waarde}
                onClick={() => setActieveCat(actieveCat === waarde ? "alle" : waarde)}
                className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${actieveCat === waarde ? "border-primary bg-primary/5" : ""}`}
              >
                <Icoon className="h-4 w-4 text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold">{aantal}</p>
              </button>
            );
          })}
        </div>
      )}

      {documenten.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="p-4 rounded-full bg-muted">
              <Files className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Nog geen bedrijfsdocumenten geregistreerd</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Registreer contracten, vergunningen, certificaten en kwaliteitshandboeken.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => openNieuw()}>
              <Plus className="h-4 w-4 mr-1" />
              Eerste document toevoegen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(actieveCat === "alle" ? CATEGORIEEN : CATEGORIEEN.filter((c) => c.waarde === actieveCat)).map(
            ({ waarde, label, icoon: Icoon }) => {
              const docs = documenten.filter((d) => d.categorie === waarde);
              if (docs.length === 0 && actieveCat === "alle") return null;
              return (
                <Card key={waarde}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icoon className="h-4 w-4" />
                      {label}
                      <span className="text-sm font-normal text-muted-foreground">({docs.length})</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {docs.length === 0 ? (
                      <div className="flex items-center justify-between py-2">
                        <p className="text-sm text-muted-foreground italic">Geen documenten in deze categorie.</p>
                        <Button size="sm" variant="outline" onClick={() => openNieuw(waarde)}>
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Toevoegen
                        </Button>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {docs.map((d) => {
                          const verlopen = isVerlopen(d.vervaldatum) && d.status === "actief";
                          return (
                            <div key={d.id} className="py-3 flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{d.naam}</span>
                                  <Badge
                                    className={verlopen ? "bg-red-100 text-red-700" : (STATUS_KLEUREN[d.status] ?? "")}
                                    variant="outline"
                                  >
                                    {verlopen ? "Verlopen" : d.status}
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                                  {d.uitgever && <span className="text-xs text-muted-foreground">{d.uitgever}</span>}
                                  {d.referentie && <span className="text-xs text-muted-foreground">Ref. {d.referentie}</span>}
                                  {d.ingangsdatum && <span className="text-xs text-muted-foreground">Ingangsdatum: {d.ingangsdatum}</span>}
                                  {d.vervaldatum && (
                                    <span className={`text-xs ${verlopen ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                                      Verloopt: {d.vervaldatum}
                                    </span>
                                  )}
                                  {d.omschrijving && <span className="text-xs text-muted-foreground">{d.omschrijving}</span>}
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                {(d as Bedrijfsdocument).bestand_pad && (
                                  <a
                                    href={`/api/organisatie/bedrijfsdocumenten/${d.id}/download`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Bestand downloaden"
                                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openBewerken(d as Bedrijfsdocument)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setVerwijderBevestiging(d.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            }
          )}
        </div>
      )}

      {/* ── Registreer / bewerkdialoog ─────────────────────────────────────── */}
      <Dialog open={dialoogOpen} onOpenChange={(open) => { if (!open) { setDialoogOpen(false); resetDialoog(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{bewerkId ? "Document bewerken" : "Document registreren"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Uploadzone — bij nieuw document altijd, bij bewerken afhankelijk van bestand_pad */}
            {bewerkId && bestaandBestandPad && !vervangBestand ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground flex-1 truncate">Bestand gekoppeld</span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline shrink-0"
                  onClick={() => setVervangBestand(true)}
                >
                  Vervang bestand
                </button>
              </div>
            ) : (!bewerkId || !bestaandBestandPad || vervangBestand) && (
              <div
                className={`relative border-2 border-dashed rounded-lg p-5 text-center transition-colors cursor-pointer
                  ${sleepActief ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"}
                  ${analyseBezig ? "pointer-events-none opacity-70" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setSleepActief(true); }}
                onDragLeave={() => setSleepActief(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setSleepActief(false);
                  const bestand = e.dataTransfer.files[0];
                  if (bestand) verwerkBestand(bestand);
                }}
                onClick={() => bestandInputRef.current?.click()}
              >
                <input
                  ref={bestandInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                  className="sr-only"
                  onChange={(e) => {
                    const bestand = e.target.files?.[0];
                    if (bestand) verwerkBestand(bestand);
                    e.target.value = "";
                  }}
                />
                {analyseBezig ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">AI analyseert het bestand...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-medium">Sleep een bestand hierheen of klik om te kiezen</p>
                    <p className="text-xs text-muted-foreground">
                      {bewerkId ? "PDF, Word of afbeelding" : "PDF, Word of afbeelding — AI vult de velden automatisch in"}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Dubbeling-waarschuwing */}
            {dubbeling && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800">
                    Dit bestand bestaat al als <span className="font-medium">{dubbeling.naam}</span>. Wat wilt u doen?
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => setDubbeling(null)}>
                    Toch doorgaan
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={stapOverNaarBewerken}>
                    Bestaande bijwerken
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setDialoogOpen(false); resetDialoog(); }}>
                    Annuleren
                  </Button>
                </div>
              </div>
            )}

            {/* Categorie-kiezer — altijd zichtbaar, visueel palet na AI-analyse */}
            <div className="space-y-2">
              <Label className={isAi("categorie") ? aiLabelKlasse : ""}>
                {isAi("categorie") && <Sparkles className="inline h-3 w-3 mr-1" />}
                Categorie
                {aiActief && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    — klik op de juiste categorie als AI het mis heeft
                  </span>
                )}
              </Label>

              {aiActief ? (
                /* Visueel categorie-palet — alle opties klikbaar */
                <div className="grid grid-cols-5 gap-1.5">
                  {CATEGORIEEN.map(({ waarde, label, icoon: Icoon }) => {
                    const geselecteerd = form.categorie === waarde;
                    const wasAiVoorstel = aiVoorgesteldCat.current === waarde && geselecteerd;
                    return (
                      <button
                        key={waarde}
                        type="button"
                        onClick={() => kiesCategorieHandmatig(waarde)}
                        className={[
                          "flex flex-col items-center gap-1 rounded-lg border p-2 text-center text-xs transition-all",
                          geselecteerd
                            ? wasAiVoorstel
                              ? "border-amber-400 bg-amber-50 text-amber-700 ring-1 ring-amber-300"
                              : "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                            : "border-muted hover:border-muted-foreground/40 hover:bg-muted/40 text-muted-foreground",
                        ].join(" ")}
                        title={label}
                      >
                        <span className="relative">
                          <Icoon className="h-4 w-4" />
                          {geselecteerd && (
                            <Check className="absolute -top-1 -right-1 h-3 w-3" />
                          )}
                        </span>
                        <span className="leading-tight line-clamp-2">{label}</span>
                        {wasAiVoorstel && (
                          <span className="text-[9px] text-amber-600 leading-none">AI voorstel</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Gewone dropdown als er geen AI-analyse is */
                <Select value={form.categorie} onValueChange={(v) => setFormVeld("categorie", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIEEN.map(({ waarde, label }) => (
                      <SelectItem key={waarde} value={waarde}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label className={isAi("naam") ? aiLabelKlasse : ""}>
                  {isAi("naam") && <Sparkles className="inline h-3 w-3 mr-1" />}
                  Naam document
                </Label>
                <Input
                  value={form.naam}
                  onChange={(e) => setFormVeld("naam", e.target.value)}
                  onBlur={(e) => handleVeldBlur("naam", e.target.value)}
                  className={isAi("naam") ? aiKlasse : ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={isAi("uitgever") ? aiLabelKlasse : ""}>
                  {isAi("uitgever") && <Sparkles className="inline h-3 w-3 mr-1" />}
                  Uitgever / Instantie
                </Label>
                <Input
                  value={form.uitgever}
                  onChange={(e) => setFormVeld("uitgever", e.target.value)}
                  onBlur={(e) => handleVeldBlur("uitgever", e.target.value)}
                  className={isAi("uitgever") ? aiKlasse : ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={isAi("referentie") ? aiLabelKlasse : ""}>
                  {isAi("referentie") && <Sparkles className="inline h-3 w-3 mr-1" />}
                  Referentienummer
                </Label>
                <Input
                  value={form.referentie}
                  onChange={(e) => setFormVeld("referentie", e.target.value)}
                  onBlur={(e) => handleVeldBlur("referentie", e.target.value)}
                  className={isAi("referentie") ? aiKlasse : ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={isAi("ingangsdatum") ? aiLabelKlasse : ""}>
                  {isAi("ingangsdatum") && <Sparkles className="inline h-3 w-3 mr-1" />}
                  Ingangsdatum
                </Label>
                <Input
                  type="date"
                  value={form.ingangsdatum}
                  onChange={(e) => setFormVeld("ingangsdatum", e.target.value)}
                  onBlur={(e) => handleVeldBlur("ingangsdatum", e.target.value)}
                  className={isAi("ingangsdatum") ? aiKlasse : ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={isAi("vervaldatum") ? aiLabelKlasse : ""}>
                  {isAi("vervaldatum") && <Sparkles className="inline h-3 w-3 mr-1" />}
                  Vervaldatum
                </Label>
                <Input
                  type="date"
                  value={form.vervaldatum}
                  onChange={(e) => setFormVeld("vervaldatum", e.target.value)}
                  onBlur={(e) => handleVeldBlur("vervaldatum", e.target.value)}
                  className={isAi("vervaldatum") ? aiKlasse : ""}
                />
              </div>

              {/* Status — altijd gewone select (niet AI-ingevuld) */}
              <div className="space-y-1.5 md:col-span-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setFormVeld("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actief">Actief</SelectItem>
                    <SelectItem value="verlopen">Verlopen</SelectItem>
                    <SelectItem value="ingetrokken">Ingetrokken</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label className={isAi("omschrijving") ? aiLabelKlasse : ""}>
                  {isAi("omschrijving") && <Sparkles className="inline h-3 w-3 mr-1" />}
                  Omschrijving
                </Label>
                <Textarea
                  value={form.omschrijving}
                  onChange={(e) => setFormVeld("omschrijving", e.target.value)}
                  onBlur={(e) => handleVeldBlur("omschrijving", e.target.value)}
                  rows={2}
                  className={isAi("omschrijving") ? aiKlasse : ""}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialoogOpen(false); resetDialoog(); }}>Annuleren</Button>
            <Button
              onClick={() => slaOp(false)}
              disabled={createDoc.isPending || updateDoc.isPending || analyseBezig || !!dubbeling}
            >
              {(createDoc.isPending || updateDoc.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {bewerkId ? "Opslaan" : "Registreren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Verwijder-bevestiging ──────────────────────────────────────────── */}
      <Dialog open={verwijderBevestiging !== null} onOpenChange={() => setVerwijderBevestiging(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Document verwijderen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Weet u zeker dat u dit document wilt verwijderen uit de registratie?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderBevestiging(null)}>Annuleren</Button>
            <Button
              variant="destructive"
              onClick={() => verwijderBevestiging && verwijder(verwijderBevestiging)}
              disabled={deleteDoc.isPending}
            >
              Verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Hulpfunctie buiten de component — label voor een categorie-waarde
export { CATEGORIE_LABELS };
