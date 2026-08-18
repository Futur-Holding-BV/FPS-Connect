// ADMINISTRATIE_01 fase 1+2 — één scherm voor werkmaatschappijen:
// bedrijfsgegevens (vroeger apart scherm) en werkmaatschappij-beheer zijn
// samengevoegd (zelfde bron: werkgevers-tabel), aangevuld met bankrekeningen
// per werkmaatschappij (fase 2). Bankrekeningen muteren = Financieel niveau 4.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWerkgevers,
  useCreateWerkgever,
  useUpdateWerkgever,
  useListCaoOpties,
  useAiInvullenOrganisatie,
  useCreateWerkgeverBankrekening,
  useUpdateWerkgeverBankrekening,
  useDeleteWerkgeverBankrekening,
  getListWerkgeversQueryKey,
} from "@workspace/api-client-react";
import type { Werkgever, WerkgeverBankrekening } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, Building2, Pencil, Sparkles, Save, X, Landmark, AlertTriangle, Trash2,
} from "lucide-react";

// ── IBAN-controle (mod-97, zelfde regels als de server) ─────────────────────
function normaliseerIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}
function isGeldigIban(iban: string): boolean {
  const s = normaliseerIban(iban);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  if (s.startsWith("NL") && s.length !== 18) return false;
  const herschikt = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const ch of herschikt) {
    const waarde = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    rest = Number(`${rest}${waarde}`) % 97;
  }
  return rest === 1;
}

const DOEL_LABELS: Record<string, string> = {
  ontvangst: "Ontvangst",
  crediteuren: "Crediteuren",
  loon: "Loon",
  g_rekening: "G-rekening",
};
const ALLE_DOELEN = ["ontvangst", "crediteuren", "loon", "g_rekening"] as const;
// G-rekening is bewust optioneel (FPS heeft er geen, maar de keuze blijft).
const VERPLICHTE_DOELEN = ["ontvangst", "crediteuren", "loon"] as const;

const VELDLABELS: Record<string, string> = {
  adres: "Adres",
  postcode: "Postcode",
  plaats: "Plaats",
  kvk: "KVK-nummer",
  btw: "BTW-nummer",
  telefoon: "Telefoon",
  email: "E-mailadres",
  website: "Website",
};

type WgForm = Record<string, string> & { actief?: string };

function VeldRij({ label, waarde }: { label: string; waarde: string | null | undefined }) {
  return (
    <div className="flex items-start gap-4 py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground w-44 shrink-0">{label}</span>
      <span className="text-sm font-medium">{waarde || <span className="text-muted-foreground italic">Niet ingevuld</span>}</span>
    </div>
  );
}

// ── Bankrekeningen-sectie per werkmaatschappij ───────────────────────────────
function BankrekeningenSectie({ werkgever }: { werkgever: Werkgever }) {
  const { heeftNiveau } = useBevoegdheid();
  const magMuterenBank = heeftNiveau("financieel", 4);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const maakRekening = useCreateWerkgeverBankrekening();
  const wijzigRekening = useUpdateWerkgeverBankrekening();
  const verwijderRekening = useDeleteWerkgeverBankrekening();

  const rekeningen: WerkgeverBankrekening[] = werkgever.bankrekeningen ?? [];
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [iban, setIban] = useState("");
  const [tenaamstelling, setTenaamstelling] = useState("");
  const [doelen, setDoelen] = useState<string[]>([]);
  const [verwijderVraag, setVerwijderVraag] = useState<WerkgeverBankrekening | null>(null);

  const ontbrekendeDoelen = VERPLICHTE_DOELEN.filter(
    (d) => !rekeningen.some((r) => r.doelen.includes(d)),
  );

  function startNieuw() {
    setEditId(null);
    setIban("");
    setTenaamstelling(werkgever.naam);
    setDoelen([]);
    setOpen(true);
  }
  function startBewerken(r: WerkgeverBankrekening) {
    setEditId(r.id);
    setIban(r.iban);
    setTenaamstelling(r.tenaamstelling);
    setDoelen([...r.doelen]);
    setOpen(true);
  }

  async function opslaan() {
    const genorm = normaliseerIban(iban);
    if (!isGeldigIban(genorm)) {
      toast({ title: "Ongeldig IBAN", description: "Het controlegetal van dit IBAN klopt niet.", variant: "destructive" });
      return;
    }
    if (!tenaamstelling.trim()) {
      toast({ title: "Tenaamstelling is verplicht", variant: "destructive" });
      return;
    }
    if (doelen.length === 0) {
      toast({ title: "Kies minimaal één doel", variant: "destructive" });
      return;
    }
    const data = { iban: genorm, tenaamstelling: tenaamstelling.trim(), doelen: doelen as ("ontvangst" | "crediteuren" | "loon" | "g_rekening")[] };
    try {
      if (editId != null) {
        await wijzigRekening.mutateAsync({ id: werkgever.id, rekeningId: editId, data });
      } else {
        await maakRekening.mutateAsync({ id: werkgever.id, data });
      }
      await queryClient.invalidateQueries({ queryKey: getListWerkgeversQueryKey() });
      toast({ title: editId != null ? "Bankrekening bijgewerkt" : "Bankrekening toegevoegd", description: "De wijziging is gelogd en per mail gemeld." });
      setOpen(false);
    } catch (err) {
      const respons = (err as { response?: { status?: number; data?: { error?: string } } })?.response;
      toast({
        title: "Opslaan mislukt",
        description: respons?.data?.error ?? "Controleer de invoer en probeer opnieuw.",
        variant: "destructive",
      });
    }
  }

  async function verwijderen(r: WerkgeverBankrekening) {
    try {
      await verwijderRekening.mutateAsync({ id: werkgever.id, rekeningId: r.id });
      await queryClient.invalidateQueries({ queryKey: getListWerkgeversQueryKey() });
      toast({ title: "Bankrekening verwijderd", description: "De verwijdering is gelogd en per mail gemeld." });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    } finally {
      setVerwijderVraag(null);
    }
  }

  const bezig = maakRekening.isPending || wijzigRekening.isPending;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          Bankrekeningen
        </h3>
        {magMuterenBank && (
          <Button size="sm" variant="outline" onClick={startNieuw}>
            <Plus className="h-3.5 w-3.5" />
            Rekening toevoegen
          </Button>
        )}
      </div>

      {ontbrekendeDoelen.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Geen rekening ingesteld voor: <strong>{ontbrekendeDoelen.map((d) => DOEL_LABELS[d]).join(", ")}</strong>.
            Documenten en loonherkenning kunnen voor {werkgever.naam} pas het juiste nummer gebruiken als het doel is toegewezen.
          </span>
        </div>
      )}

      {rekeningen.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Nog geen bankrekeningen geregistreerd.
          {!magMuterenBank && " Toevoegen vereist Financieel niveau 4."}
        </p>
      ) : (
        <div className="space-y-2">
          {rekeningen.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium font-mono">{r.iban}</p>
                <p className="text-xs text-muted-foreground truncate">{r.tenaamstelling}</p>
              </div>
              <div className="flex flex-wrap gap-1 justify-end">
                {r.doelen.map((d) => (
                  <Badge key={d} variant="secondary" className="text-xs">{DOEL_LABELS[d] ?? d}</Badge>
                ))}
              </div>
              {magMuterenBank && (
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => startBewerken(r)} title="Bewerken">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setVerwijderVraag(r)} title="Verwijderen">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!magMuterenBank && rekeningen.length > 0 && (
        <p className="text-xs text-muted-foreground">Wijzigen van bankrekeningen vereist Financieel niveau 4.</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId != null ? "Bankrekening bewerken" : "Bankrekening toevoegen"}</DialogTitle>
            <DialogDescription>
              Elke wijziging wordt vastgelegd (wie/wanneer/wat) en per mail gemeld.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>IBAN *</Label>
              <Input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="NL00BANK0123456789" className="font-mono" />
              {iban.trim() !== "" && !isGeldigIban(iban) && (
                <p className="text-xs text-destructive">Dit IBAN is (nog) niet geldig.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Tenaamstelling *</Label>
              <Input value={tenaamstelling} onChange={(e) => setTenaamstelling(e.target.value)} placeholder="bijv. FPS Brandpreventie B.V." />
            </div>
            <div className="space-y-1.5">
              <Label>Doelen *</Label>
              <div className="space-y-2">
                {ALLE_DOELEN.map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={doelen.includes(d)}
                      onCheckedChange={(c) =>
                        setDoelen((prev) => (c === true ? [...prev, d] : prev.filter((x) => x !== d)))
                      }
                    />
                    {DOEL_LABELS[d]}
                    {d === "g_rekening" && <span className="text-xs text-muted-foreground">(optioneel — FPS gebruikt geen G-rekening)</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={() => void opslaan()} disabled={bezig}>
              {bezig ? <><Loader2 className="h-4 w-4 animate-spin" /> Bezig…</> : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={verwijderVraag != null} onOpenChange={(o) => { if (!o) setVerwijderVraag(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bankrekening verwijderen?</DialogTitle>
            <DialogDescription>
              {verwijderVraag ? `${verwijderVraag.iban} (${verwijderVraag.tenaamstelling}) wordt verwijderd bij ${werkgever.naam}. Dit wordt gelogd en per mail gemeld.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderVraag(null)}>Annuleren</Button>
            <Button variant="destructive" disabled={verwijderRekening.isPending} onClick={() => verwijderVraag && void verwijderen(verwijderVraag)}>
              {verwijderRekening.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Hoofdscherm ──────────────────────────────────────────────────────────────
export default function WerkmaatschappijPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("personeel", 2);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: werkgevers = [], isLoading } = useListWerkgevers();
  const { data: caoOpties = [] } = useListCaoOpties();
  const maakWerkgever = useCreateWerkgever();
  const wijzigWerkgever = useUpdateWerkgever();
  const aiInvullen = useAiInvullenOrganisatie();

  const [actieveTab, setActieveTab] = useState<string | null>(null);
  const [bewerken, setBewerken] = useState<number | null>(null);
  const [form, setForm] = useState<WgForm>({});
  const [aiBezig, setAiBezig] = useState(false);
  const [aiVoorstel, setAiVoorstel] = useState<Record<string, string | null> | null>(null);

  // Nieuwe werkmaatschappij (dialog)
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [nieuwNaam, setNieuwNaam] = useState("");
  const [nieuwCao, setNieuwCao] = useState("");

  function startBewerken(w: Werkgever) {
    setBewerken(w.id);
    setAiVoorstel(null);
    setForm({
      naam: w.naam ?? "",
      cao: w.cao ?? "",
      personeelsbeleid: w.personeelsbeleid ?? "",
      adres: w.adres ?? "",
      postcode: w.postcode ?? "",
      plaats: w.plaats ?? "",
      kvk: w.kvk ?? "",
      btw: w.btw ?? "",
      telefoon: w.telefoon ?? "",
      email: w.email ?? "",
      website: w.website ?? "",
      voettekst: w.voettekst ?? "",
      boekhouder_naam: w.boekhouder_naam ?? "",
      boekhouder_email: w.boekhouder_email ?? "",
      scab_email_adres: w.scab_email_adres ?? "",
      intern_contact_naam: w.intern_contact_naam ?? "",
      intern_contact_email: w.intern_contact_email ?? "",
      actief: w.actief ? "ja" : "nee",
    });
  }

  function annuleer() {
    setBewerken(null);
    setForm({});
    setAiVoorstel(null);
  }

  async function slaOp() {
    if (bewerken == null) return;
    if (!form.naam?.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      await wijzigWerkgever.mutateAsync({
        id: bewerken,
        data: {
          naam: form.naam.trim(),
          cao: form.cao || undefined,
          personeelsbeleid: form.personeelsbeleid || null,
          adres: form.adres || null,
          postcode: form.postcode || null,
          plaats: form.plaats || null,
          kvk: form.kvk || undefined,
          btw: form.btw || undefined,
          telefoon: form.telefoon || undefined,
          email: form.email || undefined,
          website: form.website || null,
          voettekst: form.voettekst || null,
          boekhouder_naam: form.boekhouder_naam || undefined,
          boekhouder_email: form.boekhouder_email || undefined,
          // Leegmaken moet expliciet null sturen: PATCH negeert undefined.
          scab_email_adres: (form.scab_email_adres ?? "").trim() || null,
          intern_contact_naam: form.intern_contact_naam || undefined,
          intern_contact_email: form.intern_contact_email || undefined,
          actief: form.actief !== "nee",
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListWerkgeversQueryKey() });
      toast({ title: "Werkmaatschappij opgeslagen" });
      annuleer();
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function aiPrefill(naam: string) {
    if (!naam.trim()) {
      toast({ title: "Vul eerst de naam in", variant: "destructive" });
      return;
    }
    setAiBezig(true);
    try {
      const result = await aiInvullen.mutateAsync({ data: { bedrijfsnaam: naam, sector: "brandpreventie en bouw" } });
      const velden = (result as { velden: Record<string, string | null> }).velden ?? {};
      const relevante = Object.fromEntries(Object.entries(velden).filter(([k, v]) => v && k in VELDLABELS));
      if (Object.keys(relevante).length === 0) {
        toast({ title: "AI heeft geen gegevens gevonden", description: "Probeer een volledigere bedrijfsnaam." });
      } else {
        setAiVoorstel(relevante);
        toast({ title: "AI heeft gegevens gevonden", description: "Controleer de suggesties en klik op Overnemen." });
      }
    } catch {
      toast({ title: "AI niet beschikbaar", variant: "destructive" });
    } finally {
      setAiBezig(false);
    }
  }

  function neemAiOver() {
    if (!aiVoorstel) return;
    setForm((prev) => {
      const nieuw = { ...prev };
      for (const [k, v] of Object.entries(aiVoorstel)) {
        if (v && k in nieuw) nieuw[k] = v;
      }
      return nieuw;
    });
    setAiVoorstel(null);
    toast({ title: "AI-suggesties overgenomen" });
  }

  async function maakNieuw() {
    if (!nieuwNaam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    if (!nieuwCao) {
      toast({ title: "CAO is verplicht", variant: "destructive" });
      return;
    }
    try {
      await maakWerkgever.mutateAsync({ data: { naam: nieuwNaam.trim(), cao: nieuwCao, actief: true } });
      await queryClient.invalidateQueries({ queryKey: getListWerkgeversQueryKey() });
      toast({ title: "Werkmaatschappij aangemaakt", description: "Vul de overige gegevens aan via Bewerken." });
      setNieuwOpen(false);
      setNieuwNaam("");
      setNieuwCao("");
    } catch {
      toast({ title: "Aanmaken mislukt", variant: "destructive" });
    }
  }

  function renderInhoud(w: Werkgever) {
    const inBewerking = bewerken === w.id;
    return (
      <div className="space-y-6">
        {aiVoorstel && inBewerking && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-amber-700 font-medium text-sm">
                <Sparkles className="h-3.5 w-3.5" />
                AI-suggesties gevonden
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAiVoorstel(null)}>Negeren</Button>
                <Button size="sm" className="h-7 text-xs" onClick={neemAiOver}>Overnemen</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-amber-800">
              {Object.entries(aiVoorstel).map(([k, v]) => (
                <div key={k} className="bg-amber-100 rounded px-2 py-1">
                  <span className="font-medium">{VELDLABELS[k] ?? k}:</span> <span className="break-all">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {magSchrijven && (
          <div className="flex justify-end gap-2">
            {inBewerking ? (
              <>
                <Button variant="outline" size="sm" onClick={annuleer}>
                  <X className="h-4 w-4" /> Annuleren
                </Button>
                <Button size="sm" variant="outline" disabled={aiBezig} onClick={() => void aiPrefill(form.naam || w.naam)}>
                  {aiBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI invullen
                </Button>
                <Button size="sm" onClick={() => void slaOp()} disabled={wijzigWerkgever.isPending}>
                  {wijzigWerkgever.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Opslaan
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => startBewerken(w)}>
                <Pencil className="h-4 w-4" /> Bewerken
              </Button>
            )}
          </div>
        )}

        {inBewerking ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-3">Algemene gegevens</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Bedrijfsnaam *</Label>
                  <Input value={form.naam ?? ""} onChange={(e) => setForm((p) => ({ ...p, naam: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>CAO *</Label>
                  <Select value={form.cao || undefined} onValueChange={(v) => setForm((p) => ({ ...p, cao: v }))}>
                    <SelectTrigger><SelectValue placeholder="Kies CAO" /></SelectTrigger>
                    <SelectContent>
                      {caoOpties.map((c) => (
                        <SelectItem key={c.naam} value={c.naam}>{c.naam}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>KVK-nummer</Label>
                  <Input value={form.kvk ?? ""} onChange={(e) => setForm((p) => ({ ...p, kvk: e.target.value }))} placeholder="12345678" />
                </div>
                <div className="space-y-1.5">
                  <Label>BTW-nummer</Label>
                  <Input value={form.btw ?? ""} onChange={(e) => setForm((p) => ({ ...p, btw: e.target.value }))} placeholder="NL999999999B01" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Personeelsbeleid</Label>
                  <Textarea rows={3} value={form.personeelsbeleid ?? ""} onChange={(e) => setForm((p) => ({ ...p, personeelsbeleid: e.target.value }))} placeholder="Toelichting op arbeidsvoorwaarden, beleid…" />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer md:col-span-2">
                  <Checkbox checked={form.actief !== "nee"} onCheckedChange={(c) => setForm((p) => ({ ...p, actief: c === true ? "ja" : "nee" }))} />
                  Actief
                </label>
              </div>
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3">Adresgegevens</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Straat en huisnummer</Label>
                  <Input value={form.adres ?? ""} onChange={(e) => setForm((p) => ({ ...p, adres: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Postcode</Label>
                  <Input value={form.postcode ?? ""} onChange={(e) => setForm((p) => ({ ...p, postcode: e.target.value }))} placeholder="1234 AB" />
                </div>
                <div className="space-y-1.5">
                  <Label>Plaats</Label>
                  <Input value={form.plaats ?? ""} onChange={(e) => setForm((p) => ({ ...p, plaats: e.target.value }))} />
                </div>
              </div>
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3">Contactgegevens</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Telefoonnummer</Label>
                  <Input value={form.telefoon ?? ""} onChange={(e) => setForm((p) => ({ ...p, telefoon: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mailadres</Label>
                  <Input type="email" value={form.email ?? ""} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Website</Label>
                  <Input value={form.website ?? ""} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} placeholder="https://..." />
                </div>
              </div>
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3">Boekhouder</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Naam boekhouder / accountant</Label>
                  <Input value={form.boekhouder_naam ?? ""} onChange={(e) => setForm((p) => ({ ...p, boekhouder_naam: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail boekhouder</Label>
                  <Input type="email" value={form.boekhouder_email ?? ""} onChange={(e) => setForm((p) => ({ ...p, boekhouder_email: e.target.value }))} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Aanleveradres loonverwerking</Label>
                  <Input type="email" value={form.scab_email_adres ?? ""} onChange={(e) => setForm((p) => ({ ...p, scab_email_adres: e.target.value }))} placeholder="Leeg = loonaanlevering gaat naar de boekhouder" />
                  <p className="text-xs text-muted-foreground">De maandelijkse loonaanlevering gaat naar dit adres; is het leeg, dan wordt het e-mailadres van de boekhouder gebruikt.</p>
                </div>
              </div>
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3">Intern aanspreekpunt</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Naam contactpersoon</Label>
                  <Input value={form.intern_contact_naam ?? ""} onChange={(e) => setForm((p) => ({ ...p, intern_contact_naam: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail contactpersoon</Label>
                  <Input type="email" value={form.intern_contact_email ?? ""} onChange={(e) => setForm((p) => ({ ...p, intern_contact_email: e.target.value }))} />
                </div>
              </div>
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold mb-3">Documenten</h3>
              <div className="space-y-1.5">
                <Label>Voettekst (op documenten)</Label>
                <Textarea rows={2} value={form.voettekst ?? ""} onChange={(e) => setForm((p) => ({ ...p, voettekst: e.target.value }))} placeholder="bijv. Ingeschreven bij KVK Oost-Nederland…" />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-3">Algemene gegevens</h3>
              <div className="space-y-0">
                <VeldRij label="Bedrijfsnaam" waarde={w.naam} />
                <VeldRij label="KVK-nummer" waarde={w.kvk} />
                <VeldRij label="BTW-nummer" waarde={w.btw} />
                <VeldRij label="CAO" waarde={w.cao} />
                <VeldRij label="Personeelsbeleid" waarde={w.personeelsbeleid} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Adres</h3>
              <div className="space-y-0">
                <VeldRij label="Straat" waarde={w.adres} />
                <VeldRij label="Postcode" waarde={w.postcode} />
                <VeldRij label="Plaats" waarde={w.plaats} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Contact</h3>
              <div className="space-y-0">
                <VeldRij label="Telefoon" waarde={w.telefoon} />
                <VeldRij label="E-mail" waarde={w.email} />
                <VeldRij label="Website" waarde={w.website} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Boekhouder</h3>
              <div className="space-y-0">
                <VeldRij label="Naam" waarde={w.boekhouder_naam} />
                <VeldRij label="E-mail" waarde={w.boekhouder_email} />
                <VeldRij label="Aanleveradres loonverwerking" waarde={w.scab_email_adres} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Intern aanspreekpunt</h3>
              <div className="space-y-0">
                <VeldRij label="Naam" waarde={w.intern_contact_naam} />
                <VeldRij label="E-mail" waarde={w.intern_contact_email} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Documenten</h3>
              <div className="space-y-0">
                <VeldRij label="Voettekst" waarde={w.voettekst} />
              </div>
            </div>
          </div>
        )}

        <Separator />
        <BankrekeningenSectie werkgever={w} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 data-paginatitel className="text-xl font-bold">Werkmaatschappijen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bedrijfsgegevens, contactinformatie en bankrekeningen per werkmaatschappij binnen de FPS Groep.
            Medewerkers, functies, verlofsoorten en documenten worden aan een werkmaatschappij gekoppeld.
          </p>
        </div>
        {magSchrijven && (
          <Button onClick={() => setNieuwOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4" />
            Nieuwe werkmaatschappij
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laden…
        </div>
      ) : werkgevers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium">Nog geen werkmaatschappijen</p>
            {magSchrijven && <p className="text-sm mt-1">Klik op "Nieuwe werkmaatschappij" om te beginnen.</p>}
          </CardContent>
        </Card>
      ) : (
        <Tabs value={actieveTab ?? String(werkgevers[0]?.id)} onValueChange={(v) => { setActieveTab(v); annuleer(); }}>
          <TabsList className="flex-wrap h-auto">
            {werkgevers.map((w) => (
              <TabsTrigger key={w.id} value={String(w.id)}>{w.naam}</TabsTrigger>
            ))}
          </TabsList>
          {werkgevers.map((w) => (
            <TabsContent key={w.id} value={String(w.id)}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    {w.naam}
                    <Badge variant={w.actief ? "outline" : "secondary"} className={w.actief ? "border-emerald-200 text-emerald-700 ml-2" : "ml-2"}>
                      {w.actief ? "actief" : "inactief"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>Stamgegevens, contactinformatie en bankrekeningen</CardDescription>
                </CardHeader>
                <CardContent>{renderInhoud(w)}</CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Dialog open={nieuwOpen} onOpenChange={setNieuwOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuwe werkmaatschappij</DialogTitle>
            <DialogDescription>
              Een werkmaatschappij binnen de FPS Groep met eigen CAO en personeelsbeleid.
              Overige gegevens vult u daarna aan via Bewerken.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input value={nieuwNaam} onChange={(e) => setNieuwNaam(e.target.value)} placeholder="bijv. FPS Brandpreventie B.V." />
            </div>
            <div className="space-y-1.5">
              <Label>CAO *</Label>
              <Select value={nieuwCao || undefined} onValueChange={setNieuwCao}>
                <SelectTrigger><SelectValue placeholder="Kies CAO" /></SelectTrigger>
                <SelectContent>
                  {caoOpties.map((c) => (
                    <SelectItem key={c.naam} value={c.naam}>{c.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNieuwOpen(false)}>Annuleren</Button>
            <Button onClick={() => void maakNieuw()} disabled={maakWerkgever.isPending}>
              {maakWerkgever.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Bezig…</> : "Aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
