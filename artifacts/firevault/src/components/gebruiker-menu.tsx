import { useState } from "react";
import { LogOut, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/auth-context";
import { ROL_INFO } from "@/context/rol-types";
import type { Rol } from "@/context/rol-types";
import { useWachtwoordWijzigen } from "@workspace/api-client-react";

export function GebruikerMenu() {
  const { gebruiker, uitloggen } = useAuth();
  const wachtwoordWijzigen = useWachtwoordWijzigen();

  const [wachtwoordOpen, setWachtwoordOpen] = useState(false);
  const [huidig, setHuidig]         = useState("");
  const [nieuw, setNieuw]           = useState("");
  const [bevestig, setBevestig]     = useState("");
  const [fout, setFout]             = useState<string | null>(null);
  const [gelukt, setGelukt]         = useState(false);

  if (!gebruiker) return null;

  const rol = gebruiker.rol as Rol;
  const rolLabel = ROL_INFO[rol]?.label ?? rol;
  const initialen = gebruiker.naam
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function resetDialoog() {
    setHuidig("");
    setNieuw("");
    setBevestig("");
    setFout(null);
    setGelukt(false);
  }

  async function verstuurWijziging(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    if (!huidig || !nieuw) {
      setFout("Alle velden zijn verplicht.");
      return;
    }
    if (nieuw.length < 8) {
      setFout("Nieuw wachtwoord moet minimaal 8 tekens bevatten.");
      return;
    }
    if (nieuw !== bevestig) {
      setFout("Nieuwe wachtwoorden komen niet overeen.");
      return;
    }
    try {
      await wachtwoordWijzigen.mutateAsync({
        data: { huidig_wachtwoord: huidig, nieuw_wachtwoord: nieuw },
      });
      setGelukt(true);
      setHuidig("");
      setNieuw("");
      setBevestig("");
    } catch (err: any) {
      setFout(err?.response?.data?.error ?? err?.message ?? "Onbekende fout");
    }
  }

  return (
    <>
      <div className="px-3 py-3 border-t">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <Avatar className="h-8 w-8 border border-primary/20 flex-shrink-0">
            {gebruiker.avatar_url && <AvatarImage src={gebruiker.avatar_url} alt={gebruiker.naam} />}
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initialen}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate leading-tight">{gebruiker.naam}</p>
            <p className="text-xs text-muted-foreground truncate">{rolLabel}</p>
          </div>
        </div>
        <div className="flex gap-1 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { resetDialoog(); setWachtwoordOpen(true); }}
            className="flex-1 gap-2 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:flex-none"
            title="Wachtwoord wijzigen"
          >
            <KeyRound className="h-4 w-4 flex-shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden truncate">Wachtwoord</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void uitloggen()}
            className="flex-1 gap-2 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:flex-none"
            title="Uitloggen"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">Uitloggen</span>
          </Button>
        </div>
      </div>

      <Dialog open={wachtwoordOpen} onOpenChange={(o) => { if (!o) { setWachtwoordOpen(false); resetDialoog(); } }}>
        <DialogContent className="max-w-sm" aria-describedby="wachtwoord-beschr">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Wachtwoord wijzigen
            </DialogTitle>
          </DialogHeader>
          <p id="wachtwoord-beschr" className="text-sm text-muted-foreground -mt-1">
            Stel een nieuw wachtwoord in voor uw account.
          </p>

          {gelukt ? (
            <div className="space-y-4">
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
                Wachtwoord succesvol gewijzigd.
              </div>
              <DialogFooter>
                <Button onClick={() => { setWachtwoordOpen(false); resetDialoog(); }}>
                  Sluiten
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={verstuurWijziging} className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="huidig-ww">Huidig wachtwoord</Label>
                <Input
                  id="huidig-ww"
                  type="password"
                  value={huidig}
                  onChange={(e) => setHuidig(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nieuw-ww">Nieuw wachtwoord</Label>
                <Input
                  id="nieuw-ww"
                  type="password"
                  value={nieuw}
                  onChange={(e) => setNieuw(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Minimaal 8 tekens"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bevestig-ww">Bevestig nieuw wachtwoord</Label>
                <Input
                  id="bevestig-ww"
                  type="password"
                  value={bevestig}
                  onChange={(e) => setBevestig(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              {fout && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {fout}
                </div>
              )}

              <DialogFooter className="gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => { setWachtwoordOpen(false); resetDialoog(); }}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={wachtwoordWijzigen.isPending}>
                  {wachtwoordWijzigen.isPending ? "Opslaan..." : "Wijzigen"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
