import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetLeverancier, usePatchLeverancier, useDeleteLeverancier,
  useListLeverancierArtikelen, useAiInvullenOrganisatie,
} from "@workspace/api-client-react";
import type { Leverancier, LeverancierInput } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2, Phone, Mail, Globe, MapPin, FileText, CreditCard,
  User, Pencil, Trash2, ArrowLeft, Package, ShoppingCart, Sparkles, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function LeverancierDetailPagina() {
  const [, params] = useRoute("/leveranciers/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);
  const { toast } = useToast();
  const [bewerkOpen, setBewerkOpen] = useState(false);
  const [verwijderOpen, setVerwijderOpen] = useState(false);

  const { data: leverancier, refetch } = useGetLeverancier(id);
  const { data: artikelen = [] } = useListLeverancierArtikelen(id);
  const { mutate: patch, isPending } = usePatchLeverancier({
    mutation: {
      onSuccess: () => {
        toast({ title: "Leverancier bijgewerkt" });
        setBewerkOpen(false);
        void refetch();
      },
      onError: () => toast({ title: "Fout bij bijwerken", variant: "destructive" }),
    },
  });
  const { mutate: verwijder } = useDeleteLeverancier({
    mutation: {
      onSuccess: () => {
        toast({ title: "Leverancier verwijderd" });
        navigate("/leveranciers");
      },
    },
  });

  if (!leverancier) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>Leverancier niet gevonden</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Navigatie terug */}
      <Link href="/leveranciers">
        <button className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Leveranciers
        </button>
      </Link>

      {/* Koptekst */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{leverancier.naam}</h1>
            <Badge variant={leverancier.actief ? "default" : "secondary"}>
              {leverancier.actief ? "Actief" : "Inactief"}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {leverancier.code && <span>Code: {leverancier.code}</span>}
            {leverancier.categorie && <span>• {leverancier.categorie}</span>}
            {leverancier.bron === "import" && <span>• Geïmporteerd</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBewerkOpen(true)}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Bewerken
          </Button>

          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setVerwijderOpen(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="gegevens">
        <TabsList>
          <TabsTrigger value="gegevens">Gegevens</TabsTrigger>
          <TabsTrigger value="bank">Bankgegevens</TabsTrigger>
          <TabsTrigger value="artikelen">
            Artikelen {artikelen.length > 0 && <span className="ml-1 text-xs">({artikelen.length})</span>}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Gegevens ── */}
        <TabsContent value="gegevens" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4" />Adres
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {leverancier.adres && (
                  <p>{leverancier.adres} {leverancier.huisnummer}</p>
                )}
                {(leverancier.postcode || leverancier.stad) && (
                  <p>{[leverancier.postcode, leverancier.stad].filter(Boolean).join("  ")}</p>
                )}
                {leverancier.provincie && <p>{leverancier.provincie}</p>}
                <p className="text-muted-foreground">{leverancier.land}</p>
                {!leverancier.adres && !leverancier.stad && (
                  <p className="text-muted-foreground italic">Geen adres ingevuld</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4" />Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1.5">
                {leverancier.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a href={`mailto:${leverancier.email}`} className="hover:underline">{leverancier.email}</a>
                  </div>
                )}
                {leverancier.telefoon && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a href={`tel:${leverancier.telefoon}`} className="hover:underline">{leverancier.telefoon}</a>
                  </div>
                )}
                {leverancier.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a href={leverancier.website} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                      {leverancier.website}
                    </a>
                  </div>
                )}
                {!leverancier.email && !leverancier.telefoon && !leverancier.website && (
                  <p className="text-muted-foreground italic">Geen contactgegevens</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />Contactpersoon
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1.5">
                {leverancier.contactpersoon ? (
                  <>
                    <p className="font-medium">{leverancier.contactpersoon}</p>
                    {leverancier.contact_functie && <p className="text-muted-foreground">{leverancier.contact_functie}</p>}
                    {leverancier.contact_email && (
                      <div className="flex items-center gap-2 mt-1">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <a href={`mailto:${leverancier.contact_email}`} className="hover:underline">{leverancier.contact_email}</a>
                      </div>
                    )}
                    {leverancier.contact_telefoon && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>{leverancier.contact_telefoon}</span>
                      </div>
                    )}
                    {leverancier.contact_mobiel && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>{leverancier.contact_mobiel} (mobiel)</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground italic">Geen contactpersoon</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />Juridisch
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <InfoRij label="KvK-nummer" waarde={leverancier.kvk_nummer} />
                <InfoRij label="BTW-nummer" waarde={leverancier.btw_nummer} />
                <InfoRij label="Betalingstermijn" waarde={`${leverancier.betalingstermijn_dagen} dagen`} />
                {leverancier.kortingspercentage != null && (
                  <InfoRij label="Korting" waarde={`${leverancier.kortingspercentage}%`} />
                )}
                {leverancier.productcategorieen && (
                  <div className="pt-1">
                    <p className="text-muted-foreground text-xs mb-1">Productcategorieën</p>
                    <p>{leverancier.productcategorieen}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {leverancier.notities && (
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Notities</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="whitespace-pre-wrap">{leverancier.notities}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Tab: Bankgegevens ── */}
        <TabsContent value="bank" className="mt-4">
          <Card className="max-w-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="h-4 w-4" />Bankgegevens
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              <InfoRij label="IBAN" waarde={leverancier.iban} />
              <InfoRij label="BIC / SWIFT" waarde={leverancier.bic} />
              <InfoRij label="Bank" waarde={leverancier.bank_naam} />
              <InfoRij label="T.n.v." waarde={leverancier.t_nam_van} />
              {!leverancier.iban && !leverancier.bic && !leverancier.bank_naam && (
                <p className="text-muted-foreground italic">Geen bankgegevens ingevuld</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Artikelen ── */}
        <TabsContent value="artikelen" className="mt-4">
          {artikelen.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Geen artikelen gekoppeld aan deze leverancier</p>
              <p className="text-sm mt-1">
                <Link href="/artikelen" className="underline">Ga naar Artikelen</Link> om artikelen aan te koppelen.
              </p>
            </div>
          ) : (
            <div className="border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Code</th>
                    <th className="text-left px-4 py-2 font-medium">Naam</th>
                    <th className="text-left px-4 py-2 font-medium">Eenheid</th>
                    <th className="text-right px-4 py-2 font-medium">Inkoopprijs</th>
                  </tr>
                </thead>
                <tbody>
                  {artikelen.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="px-4 py-2 font-mono">{a.code ?? "—"}</td>
                      <td className="px-4 py-2">{a.naam}</td>
                      <td className="px-4 py-2 text-muted-foreground">{a.eenheid}</td>
                      <td className="px-4 py-2 text-right">
                        {a.inkoopprijs != null
                          ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(a.inkoopprijs)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Bewerken modal */}
      {bewerkOpen && (
        <BewerkModal
          leverancier={leverancier}
          onClose={() => setBewerkOpen(false)}
          onOpslaan={(data) => patch({ id, data: data as LeverancierInput })}
          isPending={isPending}
        />
      )}

      {/* Verwijderen bevestiging */}
      <Dialog open={verwijderOpen} onOpenChange={setVerwijderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leverancier verwijderen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Weet je zeker dat je <strong>{leverancier.naam}</strong> wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderOpen(false)}>Annuleren</Button>
            <Button variant="destructive" onClick={() => verwijder({ id })}>Verwijderen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRij({ label, waarde }: { label: string; waarde: string | null | undefined }) {
  if (!waarde) return null;
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{waarde}</span>
    </div>
  );
}

// ── Volledige bewerken-modal ───────────────────────────────────────────────────
function BewerkModal({
  leverancier, onClose, onOpslaan, isPending,
}: {
  leverancier: Leverancier;
  onClose: () => void;
  onOpslaan: (data: LeverancierInput) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    naam: leverancier.naam ?? "",
    code: leverancier.code ?? "",
    adres: leverancier.adres ?? "",
    huisnummer: leverancier.huisnummer ?? "",
    postcode: leverancier.postcode ?? "",
    stad: leverancier.stad ?? "",
    provincie: leverancier.provincie ?? "",
    land: leverancier.land ?? "Nederland",
    contactpersoon: leverancier.contactpersoon ?? "",
    contact_functie: leverancier.contact_functie ?? "",
    contact_email: leverancier.contact_email ?? "",
    contact_telefoon: leverancier.contact_telefoon ?? "",
    contact_mobiel: leverancier.contact_mobiel ?? "",
    email: leverancier.email ?? "",
    telefoon: leverancier.telefoon ?? "",
    website: leverancier.website ?? "",
    kvk_nummer: leverancier.kvk_nummer ?? "",
    btw_nummer: leverancier.btw_nummer ?? "",
    iban: leverancier.iban ?? "",
    bic: leverancier.bic ?? "",
    bank_naam: leverancier.bank_naam ?? "",
    t_nam_van: leverancier.t_nam_van ?? "",
    betalingstermijn_dagen: String(leverancier.betalingstermijn_dagen ?? 30),
    categorie: leverancier.categorie ?? "",
    productcategorieen: leverancier.productcategorieen ?? "",
    notities: leverancier.notities ?? "",
  });

  function veld(key: string) {
    return {
      value: form[key] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  const aiInvullen = useAiInvullenOrganisatie();
  const [aiBezig, setAiBezig] = useState(false);
  const [aiVoorstel, setAiVoorstel] = useState<Record<string, string> | null>(null);

  async function aiPrefill() {
    if (!form.naam.trim()) return;
    setAiBezig(true);
    setAiVoorstel(null);
    try {
      const result = await aiInvullen.mutateAsync({ data: { bedrijfsnaam: form.naam.trim() } });
      const v = result?.velden;
      if (v) {
        const voorstel: Record<string, string> = {};
        if (v.kvk) voorstel.kvk_nummer = v.kvk;
        if (v.btw) voorstel.btw_nummer = v.btw;
        if (v.adres) voorstel.adres = v.adres;
        if (v.postcode) voorstel.postcode = v.postcode;
        if (v.plaats) voorstel.stad = v.plaats;
        if (v.telefoon) voorstel.telefoon = v.telefoon;
        if (v.email) voorstel.email = v.email;
        if (v.website) voorstel.website = v.website;
        if (v.iban) voorstel.iban = v.iban;
        if (Object.keys(voorstel).length > 0) setAiVoorstel(voorstel);
      }
    } catch { /* silent */ }
    finally { setAiBezig(false); }
  }

  const veldLabels: Record<string, string> = {
    kvk_nummer: "KvK", btw_nummer: "BTW", adres: "Adres", postcode: "Postcode",
    stad: "Stad", telefoon: "Telefoon", email: "E-mail", website: "Website", iban: "IBAN",
  };

  function handleOpslaan() {
    const raw: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v !== "") {
        raw[k] = k === "betalingstermijn_dagen" ? parseInt(v) : v;
      }
    }
    onOpslaan(raw as unknown as LeverancierInput);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Leverancier bewerken</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* Identificatie */}
          <Sectie titel="Identificatie">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Naam *</Label>
                <div className="flex gap-2">
                  <Input {...veld("naam")} className="flex-1" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void aiPrefill()}
                    disabled={aiBezig || !form.naam.trim()}
                    className="shrink-0 gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    {aiBezig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    AI invullen
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Code / debiteursnummer</Label>
                <Input {...veld("code")} />
              </div>
              <div className="space-y-1">
                <Label>Categorie</Label>
                <Input {...veld("categorie")} />
              </div>
            </div>
          </Sectie>
          {aiVoorstel && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 text-sm">
              <p className="font-medium text-amber-800 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> AI-voorstel gevonden
              </p>
              <div className="space-y-0.5 text-amber-900">
                {Object.entries(aiVoorstel).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-amber-600 min-w-24 shrink-0">{veldLabels[k] ?? k}:</span>
                    <span className="break-all">{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-800 hover:bg-amber-100"
                  onClick={() => { setForm((p) => ({ ...p, ...aiVoorstel })); setAiVoorstel(null); }}
                >
                  Overnemen
                </Button>
                <Button size="sm" variant="ghost" className="text-amber-700" onClick={() => setAiVoorstel(null)}>
                  Negeren
                </Button>
              </div>
            </div>
          )}
          {/* Adres */}
          <Sectie titel="Adres">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Straat</Label>
                <Input {...veld("adres")} />
              </div>
              <div className="space-y-1">
                <Label>Huisnummer</Label>
                <Input {...veld("huisnummer")} />
              </div>
              <div className="space-y-1">
                <Label>Postcode</Label>
                <Input {...veld("postcode")} />
              </div>
              <div className="space-y-1">
                <Label>Stad</Label>
                <Input {...veld("stad")} />
              </div>
              <div className="space-y-1">
                <Label>Land</Label>
                <Input {...veld("land")} />
              </div>
            </div>
          </Sectie>
          {/* Contactgegevens */}
          <Sectie titel="Algemene contactgegevens">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input {...veld("email")} type="email" />
              </div>
              <div className="space-y-1">
                <Label>Telefoon</Label>
                <Input {...veld("telefoon")} type="tel" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Website</Label>
                <Input {...veld("website")} type="url" />
              </div>
            </div>
          </Sectie>
          {/* Contactpersoon */}
          <Sectie titel="Contactpersoon">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Naam</Label>
                <Input {...veld("contactpersoon")} />
              </div>
              <div className="space-y-1">
                <Label>Functie</Label>
                <Input {...veld("contact_functie")} />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input {...veld("contact_email")} type="email" />
              </div>
              <div className="space-y-1">
                <Label>Telefoon</Label>
                <Input {...veld("contact_telefoon")} type="tel" />
              </div>
              <div className="space-y-1">
                <Label>Mobiel</Label>
                <Input {...veld("contact_mobiel")} type="tel" />
              </div>
            </div>
          </Sectie>
          {/* Juridisch */}
          <Sectie titel="Juridisch / Fiscaal">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>KvK-nummer</Label>
                <Input {...veld("kvk_nummer")} />
              </div>
              <div className="space-y-1">
                <Label>BTW-nummer</Label>
                <Input {...veld("btw_nummer")} />
              </div>
              <div className="space-y-1">
                <Label>Betalingstermijn (dagen)</Label>
                <Input {...veld("betalingstermijn_dagen")} type="number" min={0} />
              </div>
            </div>
          </Sectie>
          {/* Bankgegevens */}
          <Sectie titel="Bankgegevens">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>IBAN</Label>
                <Input {...veld("iban")} />
              </div>
              <div className="space-y-1">
                <Label>BIC / SWIFT</Label>
                <Input {...veld("bic")} />
              </div>
              <div className="space-y-1">
                <Label>Banknaam</Label>
                <Input {...veld("bank_naam")} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>T.n.v.</Label>
                <Input {...veld("t_nam_van")} />
              </div>
            </div>
          </Sectie>
          {/* Notities */}
          <Sectie titel="Notities">
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              {...veld("notities")}
            />
          </Sectie>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={handleOpslaan} disabled={!form["naam"]?.trim() || isPending}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titel}</p>
        <Separator className="flex-1" />
      </div>
      {children}
    </div>
  );
}
