import { useState } from "react";
import { Link } from "wouter";
import { useListLeveranciers, useCreateLeverancier } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Building2, Phone, Mail, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LeveranciersPagina() {
  const [zoek, setZoek] = useState("");
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const { toast } = useToast();

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
            Maak een nieuwe leverancier aan of importeer via <Link href="/beheer/import" className="underline">Importeren</Link>.
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

  function reset() {
    setNaam(""); setCategorie(""); setEmail(""); setTelefoon(""); setStad("");
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
            <Input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bedrijfsnaam" autoFocus />
          </div>
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
