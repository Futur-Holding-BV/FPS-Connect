import { useState, useEffect } from "react";
import { useAiRollenVoorstel, useCreateProfiel } from "@workspace/api-client-react";
import { MODULES, MAX_NIVEAU } from "@workspace/permissies";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2, XCircle, Loader2, Sparkles, Save, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NIVEAU_STIJL: Record<number, { label: string; kleur: string }> = {
  0: { label: "Geen",     kleur: "bg-muted text-muted-foreground" },
  1: { label: "Lezen",    kleur: "bg-blue-100 text-blue-800" },
  2: { label: "Wijzigen", kleur: "bg-yellow-100 text-yellow-800" },
  3: { label: "Aanmaken", kleur: "bg-orange-100 text-orange-800" },
  4: { label: "Beheer",   kleur: "bg-red-100 text-red-800" },
};

const NIVEAU_KORT: Record<number, string> = {
  0: "—", 1: "L", 2: "W", 3: "A", 4: "B",
};

function NiveauBadge({ niveau, kort = false }: { niveau: number; kort?: boolean }) {
  const stijl = NIVEAU_STIJL[niveau] ?? NIVEAU_STIJL[0];
  if (kort) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded text-xs font-semibold w-6 h-5",
          niveau === 0 ? "text-muted-foreground" : stijl.kleur,
        )}
        title={stijl.label}
      >
        {NIVEAU_KORT[niveau] ?? "—"}
      </span>
    );
  }
  return (
    <Badge variant="outline" className={cn("text-xs font-medium border-0", stijl.kleur)}>
      {stijl.label}
    </Badge>
  );
}

type BewerkbareRol = {
  sleutel: string;
  naam: string;
  omschrijving: string | null;
  bevoegdheden: Record<string, number>;
  opnemen: boolean;
};

type OpslaanResultaat = { naam: string; ok: boolean; fout?: string };

// AI-voorstel dialoog: de AI stelt een set rollen (bevoegdheidsprofielen) met
// rechten voor; de hoofdbeheerder beoordeelt, past aan en slaat alleen de
// gekozen rollen op. Er wordt niets automatisch opgeslagen (AI stelt voor,
// mens bevestigt). Gedeeld tussen Rollen & Rechten en Bevoegdheidsprofielen.
export function AiVoorstelDialog({
  open,
  onOpenChange,
  onOpgeslagen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpgeslagen: () => void;
}) {
  const aiVoorstel = useAiRollenVoorstel();
  const createProfiel = useCreateProfiel();
  const [rollen, setRollen] = useState<BewerkbareRol[]>([]);
  const [resultaten, setResultaten] = useState<OpslaanResultaat[]>([]);
  const [opslaanBezig, setOpslaanBezig] = useState(false);

  const zichtbareModules = MODULES.filter(
    (m) => !["abonnementen", "systeem"].includes(m.id),
  );

  // Genereer eenmalig zodra de dialoog opent; wis oude staat bij (her)openen.
  useEffect(() => {
    if (!open) return;
    setRollen([]);
    setResultaten([]);
    aiVoorstel.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Neem het AI-resultaat over in bewerkbare state zodra het binnenkomt.
  useEffect(() => {
    if (aiVoorstel.isSuccess && aiVoorstel.data) {
      setRollen(
        aiVoorstel.data.voorstellen.map((v, i) => ({
          sleutel: `${i}-${v.naam}`,
          naam: v.naam,
          omschrijving: v.omschrijving ?? null,
          bevoegdheden: { ...(v.bevoegdheden as Record<string, number>) },
          opnemen: true,
        })),
      );
    }
  }, [aiVoorstel.isSuccess, aiVoorstel.data]);

  const wijzigNiveau = (sleutel: string, moduleId: string) => {
    setRollen((huidig) =>
      huidig.map((r) => {
        if (r.sleutel !== sleutel) return r;
        const nu = r.bevoegdheden[moduleId] ?? 0;
        const volgend = nu >= MAX_NIVEAU ? 0 : nu + 1;
        return { ...r, bevoegdheden: { ...r.bevoegdheden, [moduleId]: volgend } };
      }),
    );
  };

  const wijzigNaam = (sleutel: string, naam: string) => {
    setRollen((huidig) => huidig.map((r) => (r.sleutel === sleutel ? { ...r, naam } : r)));
  };

  const wisselOpnemen = (sleutel: string) => {
    setRollen((huidig) =>
      huidig.map((r) => (r.sleutel === sleutel ? { ...r, opnemen: !r.opnemen } : r)),
    );
  };

  const verwijder = (sleutel: string) => {
    setRollen((huidig) => huidig.filter((r) => r.sleutel !== sleutel));
  };

  const teOpslaan = rollen.filter((r) => r.opnemen && r.naam.trim().length > 0);

  const opslaan = async () => {
    setOpslaanBezig(true);
    const res: OpslaanResultaat[] = [];
    for (const r of teOpslaan) {
      const naam = r.naam.trim();
      try {
        await createProfiel.mutateAsync({ data: { naam, bevoegdheden: r.bevoegdheden } });
        res.push({ naam, ok: true });
      } catch (e) {
        const status = (e as { status?: number })?.status;
        res.push({ naam, ok: false, fout: status === 409 ? "Naam bestaat al" : "Opslaan mislukt" });
      }
    }
    setResultaten(res);
    setOpslaanBezig(false);
    if (res.some((r) => r.ok)) {
      onOpgeslagen();
      const gelukt = new Set(res.filter((r) => r.ok).map((r) => r.naam));
      setRollen((huidig) => huidig.filter((r) => !gelukt.has(r.naam.trim())));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            AI-voorstel rollen &amp; rechten
          </DialogTitle>
          <DialogDescription>
            De AI stelt een set rollen met rechten voor op basis van uw modules en functiehuis.
            Er wordt niets automatisch opgeslagen — beoordeel en pas aan, en sla alleen de rollen
            op die u wilt. Klik op een module om het niveau te wijzigen (— → L → W → A → B).
          </DialogDescription>
        </DialogHeader>

        {aiVoorstel.isPending && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mb-3 h-8 w-8 animate-spin" />
            <p className="text-sm">Bezig met het genereren van een voorstel…</p>
          </div>
        )}

        {aiVoorstel.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Het AI-voorstel kon niet worden opgehaald. Controleer of AI is geconfigureerd en
            probeer het opnieuw.
          </div>
        )}

        {!aiVoorstel.isPending && aiVoorstel.isSuccess && (
          <div className="space-y-4">
            {aiVoorstel.data?.toelichting && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{aiVoorstel.data.toelichting}</span>
              </div>
            )}

            {rollen.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Geen nieuwe rollen voorgesteld. Bestaande en standaardrollen worden niet opnieuw
                voorgesteld.
              </p>
            )}

            {rollen.map((r) => (
              <div
                key={r.sleutel}
                className={cn(
                  "space-y-2 rounded-lg border p-3",
                  r.opnemen ? "bg-background" : "bg-muted/30 opacity-70",
                )}
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={r.opnemen}
                    onCheckedChange={() => wisselOpnemen(r.sleutel)}
                    aria-label="Rol opnemen"
                  />
                  <Input
                    value={r.naam}
                    onChange={(e) => wijzigNaam(r.sleutel, e.target.value)}
                    className="h-8 max-w-xs font-medium"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-8 text-muted-foreground hover:text-red-600"
                    onClick={() => verwijder(r.sleutel)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {r.omschrijving && (
                  <p className="pl-6 text-xs text-muted-foreground">{r.omschrijving}</p>
                )}
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {zichtbareModules.map((m) => {
                    const niveau = r.bevoegdheden[m.id] ?? 0;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => wijzigNiveau(r.sleutel, m.id)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded border px-1.5 py-1 text-xs transition-colors hover:border-primary",
                          niveau === 0 && "opacity-50",
                        )}
                        title={`${m.label}: klik om het niveau te wijzigen`}
                      >
                        <span className="max-w-[90px] truncate">{m.label}</span>
                        <NiveauBadge niveau={niveau} kort />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {resultaten.length > 0 && (
              <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
                {resultaten.map((res, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {res.ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                    )}
                    <span>
                      {res.naam}
                      {res.fout ? ` — ${res.fout}` : " — opgeslagen"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Sluiten
          </Button>
          <Button
            onClick={opslaan}
            disabled={opslaanBezig || aiVoorstel.isPending || teOpslaan.length === 0}
          >
            {opslaanBezig ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {teOpslaan.length > 0 ? `${teOpslaan.length} rol(len) opslaan` : "Opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
