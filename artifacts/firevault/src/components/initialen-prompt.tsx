// NOTITIE_01 — eenmalige vraag bij eerste keer inloggen: "kloppen je initialen?"
// Zolang de gebruiker niets instelt, worden initialen afgeleid uit de naam.
import { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useUpdateMijnInitialen, getGetHuidigeGebruikerQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LS_SLEUTEL_PREFIX = "fps.initialen.gevraagd.";

const TUSSENVOEGSELS = new Set([
  "van", "de", "der", "den", "het", "ter", "ten", "te", "in", "op", "aan", "bij", "tot", "'t",
]);

export function leidInitialenAf(naam: string): string {
  const woorden = naam.trim().split(/\s+/).filter(Boolean);
  if (woorden.length === 0) return "?";
  if (woorden.length === 1) return woorden[0]!.slice(0, 2).toUpperCase();
  return woorden
    .map((w) => (TUSSENVOEGSELS.has(w.toLowerCase()) ? w[0]!.toLowerCase() : w[0]!.toUpperCase()))
    .join("");
}

export default function InitialenPrompt() {
  const { gebruiker } = useAuth();
  const queryClient = useQueryClient();
  const opslaan = useUpdateMijnInitialen();

  const moetVragen =
    !!gebruiker &&
    gebruiker.rol !== "klant" &&
    !(gebruiker.initialen ?? "").trim() &&
    localStorage.getItem(LS_SLEUTEL_PREFIX + gebruiker.id) !== "1";

  const [open, setOpen] = useState(true);
  const [waarde, setWaarde] = useState(() => (gebruiker ? leidInitialenAf(gebruiker.naam) : ""));

  if (!moetVragen || !open) return null;

  function sluitDefinitief() {
    if (gebruiker) localStorage.setItem(LS_SLEUTEL_PREFIX + gebruiker.id, "1");
    setOpen(false);
  }

  function bewaar() {
    const schoon = waarde.trim();
    if (schoon === "" || opslaan.isPending) return;
    opslaan.mutate(
      { data: { initialen: schoon } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getGetHuidigeGebruikerQueryKey() });
          sluitDefinitief();
        },
        onError: () => sluitDefinitief(),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) sluitDefinitief(); }}>
      <DialogContent className="sm:max-w-sm" data-testid="dialog-initialen">
        <DialogHeader>
          <DialogTitle>Je initialen</DialogTitle>
          <DialogDescription>
            Deze staan bij je aantekeningen. Klopt dit, of wil je iets anders?
          </DialogDescription>
        </DialogHeader>
        <Input
          value={waarde}
          onChange={(e) => setWaarde(e.target.value)}
          maxLength={6}
          className="w-28 text-center text-lg font-semibold"
          data-testid="input-initialen"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={sluitDefinitief} data-testid="button-initialen-later">
            Later
          </Button>
          <Button onClick={bewaar} disabled={waarde.trim() === "" || opslaan.isPending} data-testid="button-initialen-opslaan">
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
