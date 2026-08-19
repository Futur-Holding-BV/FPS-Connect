// SENTRY_AAN_01: "Dit werkt niet" — op elke pagina bereikbaar voor élke
// ingelogde gebruiker (geen module-eis, dit is bewust laagdrempeliger dan de
// bug-meldknop). Legt pagina, tijdstip, gebruiker (server-side), laatste
// handeling en een vrij tekstveld vast; landt als actiepunt bij de
// hoofdbeheerder in de zijrand.
import { useState } from "react";
import { useLocation } from "wouter";
import { CircleAlert } from "lucide-react";
import { useMeldDitWerktNiet } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { leesLaatsteHandeling } from "@/lib/foutmonitoring";

export function DitWerktNietKnop() {
  const [open, setOpen] = useState(false);
  const [tekst, setTekst] = useState("");
  const [location] = useLocation();
  const { toast } = useToast();
  const melden = useMeldDitWerktNiet();

  async function verstuur() {
    if (!tekst.trim()) {
      toast({ title: "Beschrijf kort wat er niet werkt", variant: "destructive" });
      return;
    }
    const handeling = leesLaatsteHandeling();
    try {
      await melden.mutateAsync({
        data: {
          tekst: tekst.trim(),
          pagina: location,
          laatste_handeling: handeling ? `${handeling.tekst} (${new Date(handeling.op).toLocaleTimeString("nl-NL")})` : null,
        },
      });
      setOpen(false);
      setTekst("");
      toast({ title: "Melding vastgelegd", description: "Je melding staat als actiepunt bij de beheerder." });
    } catch {
      toast({ title: "Melding kon niet worden vastgelegd", description: "Probeer het opnieuw.", variant: "destructive" });
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring"
        title="Dit werkt niet — meld het direct"
        aria-label="Dit werkt niet"
        data-testid="knop-dit-werkt-niet"
      >
        <CircleAlert className="h-3.5 w-3.5" />
        <span>Dit werkt niet</span>
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTekst(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleAlert className="h-4 w-4 text-destructive" />
              Dit werkt niet
            </DialogTitle>
            <DialogDescription>
              Beschrijf kort wat er niet werkt. Pagina, tijdstip en je laatste handeling worden automatisch meegestuurd naar de beheerder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dwn-tekst">Wat werkt er niet?</Label>
              <Textarea
                id="dwn-tekst"
                value={tekst}
                onChange={(e) => setTekst(e.target.value)}
                placeholder="Bijv. 'De knop Opslaan doet niets' of 'De lijst blijft leeg'"
                rows={4}
                data-testid="veld-dwn-tekst"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Meegestuurd: pagina <span className="font-medium">{location.split("?")[0]}</span>
              {leesLaatsteHandeling() ? <> · laatste handeling <span className="font-medium">{leesLaatsteHandeling()!.tekst}</span></> : null}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Annuleren</Button>
              <Button size="sm" onClick={verstuur} disabled={melden.isPending} data-testid="knop-dwn-versturen">
                {melden.isPending ? "Bezig…" : "Versturen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
