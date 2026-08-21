import { useState } from "react";
import { useLocation } from "wouter";
import {
  useCreateGebouw,
  useListCrmKlanten,
  type ErrorType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2, Plus } from "lucide-react";

type Velden = {
  naam: string;
  omschrijving: string;
  adres: string;
  postcode: string;
  stad: string;
  nieuweKlantNaam: string;
  nieuweKlantAdres: string;
  nieuweKlantPostcode: string;
  nieuweKlantStad: string;
};

const LEEG: Velden = {
  naam: "",
  omschrijving: "",
  adres: "",
  postcode: "",
  stad: "",
  nieuweKlantNaam: "",
  nieuweKlantAdres: "",
  nieuweKlantPostcode: "",
  nieuweKlantStad: "",
};

function metHoofdletters(waarde: string): string {
  return waarde.replace(
    /(^|[\s'-])([a-zà-ÿ])/g,
    (_match, voor: string, letter: string) => voor + letter.toUpperCase(),
  );
}

export function GebouwAanmakenDialog() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const maakGebouw = useCreateGebouw();
  const { data: klanten = [], isLoading: klantenLaden } = useListCrmKlanten();
  const [open, setOpen] = useState(false);
  const [velden, setVelden] = useState<Velden>(LEEG);
  const [klantKeuze, setKlantKeuze] = useState("");
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const gekozenKlant =
    klantKeuze && klantKeuze !== "nieuw"
      ? klanten.find((klant) => klant.id === Number(klantKeuze))
      : null;
  const gekozenKlantMistNaw =
    gekozenKlant != null &&
    (!gekozenKlant.naam?.trim() ||
      !gekozenKlant.adres?.trim() ||
      !gekozenKlant.postcode?.trim() ||
      !gekozenKlant.stad?.trim());

  function zet(key: keyof Velden, waarde: string) {
    setVelden((huidig) => ({ ...huidig, [key]: waarde }));
  }

  function herstel() {
    setVelden(LEEG);
    setKlantKeuze("");
    setFoutmelding(null);
  }

  async function bewaar() {
    setFoutmelding(null);
    if (
      !velden.naam.trim() ||
      !velden.omschrijving.trim() ||
      !velden.adres.trim() ||
      !velden.postcode.trim() ||
      !velden.stad.trim()
    ) {
      setFoutmelding(
        "Vul de project-/gebouwnaam, opdrachtomschrijving en het volledige gebouwadres in.",
      );
      return;
    }
    if (!klantKeuze) {
      setFoutmelding("Kies een bestaande opdrachtgever of maak een nieuwe aan.");
      return;
    }
    if (gekozenKlantMistNaw) {
      setFoutmelding(
        "De gekozen opdrachtgever mist NAW-gegevens. Vul de relatie eerst aan in CRM of maak hier een volledige nieuwe opdrachtgever aan.",
      );
      return;
    }
    if (
      klantKeuze === "nieuw" &&
      (!velden.nieuweKlantNaam.trim() ||
        !velden.nieuweKlantAdres.trim() ||
        !velden.nieuweKlantPostcode.trim() ||
        !velden.nieuweKlantStad.trim())
    ) {
      setFoutmelding(
        "Vul voor de nieuwe opdrachtgever naam, adres, postcode en plaats in.",
      );
      return;
    }

    try {
      const nieuwGebouw = await maakGebouw.mutateAsync({
        data: {
          naam: metHoofdletters(velden.naam.trim()),
          omschrijving: velden.omschrijving.trim(),
          adres: metHoofdletters(velden.adres.trim()),
          postcode: velden.postcode.trim().toUpperCase(),
          stad: metHoofdletters(velden.stad.trim()),
          ...(klantKeuze === "nieuw"
            ? {
                nieuwe_klant: {
                  naam: metHoofdletters(velden.nieuweKlantNaam.trim()),
                  adres: metHoofdletters(velden.nieuweKlantAdres.trim()),
                  postcode: velden.nieuweKlantPostcode.trim().toUpperCase(),
                  stad: metHoofdletters(velden.nieuweKlantStad.trim()),
                },
              }
            : { klant_id: Number(klantKeuze) }),
        },
      });
      await queryClient.invalidateQueries();
      herstel();
      setOpen(false);
      if (nieuwGebouw?.id != null) {
        setLocation(`/gebouwen/${nieuwGebouw.id}`);
      }
    } catch (err) {
      const fout = err as ErrorType<{ error?: string }>;
      setFoutmelding(fout.data?.error ?? "Project kon niet worden opgeslagen.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(volgendeOpen) => {
        setOpen(volgendeOpen);
        if (!volgendeOpen) herstel();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" /> Nieuw gebouw
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuw gebouw aanmaken</DialogTitle>
          <DialogDescription>
            Leg alleen de vier startgegevens vast. Aanvullende gegevens worden gevraagd
            in de processtap die ze nodig heeft.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="text-sm font-semibold">1. Opdrachtgever</p>
              <p className="text-xs text-muted-foreground">
                Kies de opdrachtgever uit CRM of maak de relatie hier aan.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-opdrachtgever">CRM-relatie *</Label>
              <Select value={klantKeuze} onValueChange={setKlantKeuze}>
                <SelectTrigger id="g-opdrachtgever" data-testid="select-project-opdrachtgever">
                  <SelectValue
                    placeholder={klantenLaden ? "Relaties laden..." : "Kies een opdrachtgever"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nieuw">Nieuwe opdrachtgever aanmaken…</SelectItem>
                  {klanten.map((klant) => (
                    <SelectItem key={klant.id} value={String(klant.id)}>
                      {klant.naam}
                      {klant.stad ? ` — ${klant.stad}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {klantKeuze === "nieuw" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-l-2 border-primary/20 pl-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="g-klant-naam">Naam opdrachtgever *</Label>
                  <Input
                    id="g-klant-naam"
                    value={velden.nieuweKlantNaam}
                    onChange={(e) => zet("nieuweKlantNaam", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="g-klant-adres">Adres *</Label>
                  <Input
                    id="g-klant-adres"
                    value={velden.nieuweKlantAdres}
                    onChange={(e) => zet("nieuweKlantAdres", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="g-klant-postcode">Postcode *</Label>
                  <Input
                    id="g-klant-postcode"
                    value={velden.nieuweKlantPostcode}
                    onChange={(e) => zet("nieuweKlantPostcode", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="g-klant-stad">Plaats *</Label>
                  <Input
                    id="g-klant-stad"
                    value={velden.nieuweKlantStad}
                    onChange={(e) => zet("nieuweKlantStad", e.target.value)}
                  />
                </div>
              </div>
            )}
            {gekozenKlantMistNaw && (
              <p className="text-xs font-medium text-destructive">
                Deze CRM-relatie mist naam, adres, postcode of plaats en kan nog niet
                als opdrachtgever worden gebruikt.
              </p>
            )}
          </section>

          <div className="space-y-1.5">
            <Label htmlFor="g-naam">2. Project-/gebouwnaam *</Label>
            <Input
              id="g-naam"
              value={velden.naam}
              onChange={(e) => zet("naam", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-omschrijving">3. Opdrachtomschrijving *</Label>
            <Textarea
              id="g-omschrijving"
              rows={4}
              value={velden.omschrijving}
              onChange={(e) => zet("omschrijving", e.target.value)}
            />
          </div>

          <section className="space-y-3">
            <p className="text-sm font-semibold">4. Gebouw-/projectadres</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="g-adres">Adres *</Label>
                <Input
                  id="g-adres"
                  value={velden.adres}
                  onChange={(e) => zet("adres", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-postcode">Postcode *</Label>
                <Input
                  id="g-postcode"
                  value={velden.postcode}
                  onChange={(e) => zet("postcode", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-stad">Plaats *</Label>
                <Input
                  id="g-stad"
                  value={velden.stad}
                  onChange={(e) => zet("stad", e.target.value)}
                />
              </div>
            </div>
          </section>
        </div>

        {foutmelding && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{foutmelding}</p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={maakGebouw.isPending}
          >
            Annuleren
          </Button>
          <Button onClick={bewaar} disabled={maakGebouw.isPending}>
            {maakGebouw.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opslaan...
              </>
            ) : (
              "Gebouw opslaan"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}