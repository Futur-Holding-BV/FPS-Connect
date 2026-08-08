import { useState } from "react";
import { Link } from "wouter";
import { useListLeveranciers, useCreateLeverancier, useAiInvullenOrganisatie } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Building2, Phone, Mail, MapPin, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PaginaHulp } from "@/components/pagina-hulp";

export default function LeveranciersPagina() {
  const [zoek, setZoek] = useState("");
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const { toast } = useToast();

  const { heeftNiveau } = useBevoegdheid();
  const { data: leveranciers = [], refetch } = useListLeveranciers({ zoek: zoek || undefined });
  const { mutate: maakAan, isPending } = useCreateLeverancier({
    mutation: {
      onSuccess: () => {
        toast({ title: "Leverancier aangemaakt" });
        setNieuwOpen(false);
        void refetch();
      },
      onError: () => toast({ title: "Fout bij aanmaken", variant: "destructive" }),
    },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PaginaHulp pagina="leveranciers" />
      {/* Kop */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Leveranciers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leveranciers.length} leverancier{leveranciers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setNieuwOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nieuwe leverancier
        </Button>
      </div>

      {/* Zoekbalk */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Zoek op naam..."
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
        />
      </div>

      {/* Kaarten grid */}
      {leveranciers.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Geen leveranciers gevonden</p>
          <p className="text-sm mt-1">
            Maak een nieuwe leverancier aan
            {heeftNiveau("crm", 4) && (
              <> of importeer via <Link href="/beheer/import" className="underline">Importeren</Link></>
            )}
            .
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {leveranciers.map((l) => (
            <Link key={l.id} href={`/leveranciers/${l.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{l.naam}</p>
                      {l.code && <p className="text-xs text-muted-foreground">{l.code}</p>}
                    </div>
                    <Badge variant={l.actief ? "default" : "secondary"} className="shrink-0 text-xs">
                      {l.actief ? "Actief" : "Inactief"}
                    </Badge>
                  </div>

                  <div className="space-y-1 text-sm text-muted-foreground">
                    {(l.stad || l.adres) && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {[l.adres, l.huisnummer, l.stad].filter(Boolean).join(" ")}
                        </span>
                      </div>
                    )}
                    {l.telefoon && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{l.telefoon}</span>
                      </div>
                    )}
                    {l.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{l.email}</span>
                      </div>
                    )}
                  </div>

                  {l.categorie && (
                    <Badge variant="outline" className="text-xs">
                      {l.categorie}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Nieuw leverancier modal */}
      <NieuweLeverancierModal
        open={nieuwOpen}
        onClose={() => setNieuwOpen(false)}
        onOpslaan={(data) => maakAan({ data })}
        isPending={isPending}
      />
    </div>
  );
}

function NieuweLeverancierModal({
  open, onClose, onOpslaan, isPending,
}: {
  open: boolean;
  onClose: () => void;
  onOpslaan: (data: { naam: string; categorie?: string; email?: string; telefoon?: string; stad?: string }) => void;
  isPending: boolean;
}) {
  const [naam, setNaam] = useState("");
  const [categorie, setCategorie] = useState("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [stad, setStad] = useState("");

  const aiInvullen = useAiInvullenOrganisatie();
  const [aiBezig, setAiBezig] = useState(false);
  const [aiVoorstel, setAiVoorstel] = useState<{ email?: string; telefoon?: string; stad?: string } | null>(null);

  async function aiPrefill() {
    if (!naam.trim()) return;
    setAiBezig(true);
    setAiVoorstel(null);
    try {
      const result = await aiInvullen.mutateAsync({ data: { bedrijfsnaam: naam.trim() } });
      const v = result?.velden;
      if (v) {
        const voorstel: { email?: string; telefoon?: string; stad?: string } = {};
        if (v.email) voorstel.email = v.email;
        if (v.telefoon) voorstel.telefoon = v.telefoon;
        if (v.plaats) voorstel.stad = v.plaats;
        if (Object.keys(voorstel).length > 0) setAiVoorstel(voorstel);
      }
    } catch { /* silent */ }
    finally { setAiBezig(false); }
  }

  function reset() {
    setNaam(""); setCategorie(""); setEmail(""); setTelefoon(""); setStad("");
    setAiVoorstel(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleOpslaan() {
    if (!naam.trim()) return;
    onOpslaan({
      naam: naam.trim(),
      ...(categorie ? { categorie } : {}),
      ...(email ? { email } : {}),
      ...(telefoon ? { telefoon } : {}),
      ...(stad ? { stad } : {}),
    });
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe leverancier</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Naam *</Label>
            <div className="flex gap-2">
              <Input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bedrijfsnaam" autoFocus className="flex-1" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void aiPrefill()}
                disabled={aiBezig || !naam.trim()}
                className="shrink-0 gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                {aiBezig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                AI
              </Button>
            </div>
          </div>
          {aiVoorstel && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 text-sm">
              <p className="font-medium text-amber-800 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> AI-voorstel</p>
              <div className="space-y-0.5 text-amber-900">
                {aiVoorstel.email && <div className="flex gap-2"><span className="text-amber-600 min-w-20">E-mail:</span><span>{aiVoorstel.email}</span></div>}
                {aiVoorstel.telefoon && <div className="flex gap-2"><span className="text-amber-600 min-w-20">Telefoon:</span><span>{aiVoorstel.telefoon}</span></div>}
                {aiVoorstel.stad && <div className="flex gap-2"><span className="text-amber-600 min-w-20">Stad:</span><span>{aiVoorstel.stad}</span></div>}
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100" onClick={() => {
                  if (aiVoorstel.email) setEmail(aiVoorstel.email);
                  if (aiVoorstel.telefoon) setTelefoon(aiVoorstel.telefoon);
                  if (aiVoorstel.stad) setStad(aiVoorstel.stad);
                  setAiVoorstel(null);
                }}>Overnemen</Button>
                <Button size="sm" variant="ghost" className="text-amber-700" onClick={() => setAiVoorstel(null)}>Negeren</Button>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label>Categorie</Label>
            <Input value={categorie} onChange={(e) => setCategorie(e.target.value)} placeholder="bijv. Branddeuren" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
            <div className="space-y-1">
              <Label>Telefoon</Label>
              <Input value={telefoon} onChange={(e) => setTelefoon(e.target.value)} type="tel" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Stad</Label>
            <Input value={stad} onChange={(e) => setStad(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Annuleren</Button>
          <Button onClick={handleOpslaan} disabled={!naam.trim() || isPending}>
            Aanmaken
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
