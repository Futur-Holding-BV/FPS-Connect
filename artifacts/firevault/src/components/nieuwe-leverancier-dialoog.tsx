// NP_INKOOP_01 — herbruikbare "nieuwe leverancier"-dialoog.
// Schrijft in het bestaande LEVERANCIERS-register (hetzelfde register als de
// pagina onder Instellingen → Leveranciers; niet in CRM-relaties). De
// factuurstroom-naambrug (leveranciers ↔ crm_klanten) blijft daarmee werken;
// er ontstaat bewust géén derde register.
import { useState } from "react";
import { useCreateLeverancier } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export function NieuweLeverancierDialoog({
  open,
  onOpenChange,
  onAangemaakt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAangemaakt?: (leverancier: { id: number; naam: string }) => void;
}) {
  const { toast } = useToast();
  const [naam, setNaam] = useState("");
  const [stad, setStad] = useState("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");

  const { mutate: maakAan, isPending } = useCreateLeverancier({
    mutation: {
      onSuccess: (lev) => {
        toast({ title: `Leverancier "${lev.naam}" toegevoegd aan het leveranciersregister` });
        onAangemaakt?.({ id: lev.id, naam: lev.naam });
        setNaam(""); setStad(""); setEmail(""); setTelefoon("");
        onOpenChange(false);
      },
      onError: () => toast({ title: "Leverancier aanmaken mislukt", variant: "destructive" }),
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuwe leverancier</DialogTitle>
          <DialogDescription>
            Wordt opgeslagen in het leveranciersregister (ook te beheren via Instellingen → Leveranciers).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="nl-naam">Naam *</Label>
            <Input id="nl-naam" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijv. Bouwmaat" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nl-stad">Plaats</Label>
            <Input id="nl-stad" value={stad} onChange={(e) => setStad(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="nl-email">E-mail</Label>
              <Input id="nl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nl-tel">Telefoon</Label>
              <Input id="nl-tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button
            disabled={!naam.trim() || isPending}
            onClick={() => maakAan({ data: { naam: naam.trim(), stad: stad.trim() || undefined, email: email.trim() || undefined, telefoon: telefoon.trim() || undefined } })}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Toevoegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
