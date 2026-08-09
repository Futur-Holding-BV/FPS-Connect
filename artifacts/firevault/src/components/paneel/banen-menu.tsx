import { useState } from "react";
import { Columns3, Check, Trash2, Save, Bookmark } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  usePaneel,
  MAX_BENOEMDE_INDELINGEN,
  STANDAARD_TERUGVAL_PX,
  MIN_BAAN_PX,
  MIN_TERUGVAL_PX,
  MAX_TERUGVAL_PX,
} from "./paneel-context";

/**
 * PANEEL_01 — bediening in de topbar: paneelmodus aan/uit, 2/3/4 banen,
 * indelingen opslaan/laden/verwijderen (max 5), standaardindelingen en de
 * instelbare terugvalbreedte.
 */
export function BanenMenu() {
  const {
    paneelAan,
    indeling,
    benoemde,
    standaard,
    zetPaneelAan,
    zetAantalBanen,
    zetTerugvalBreedte,
    slaIndelingOp,
    laadIndeling,
    verwijderIndeling,
    maxBanenDiePassen,
  } = usePaneel();
  const { toast } = useToast();

  const [opslaanOpen, setOpslaanOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [terugvalOpen, setTerugvalOpen] = useState(false);
  const [terugvalPx, setTerugvalPx] = useState(String(indeling.terugvalBreedte));

  const aantal = indeling.banen.length;

  function bevestigOpslaan() {
    const res = slaIndelingOp(naam);
    if (!res.ok) {
      toast({
        title: "Indeling niet opgeslagen",
        description: res.reden,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Indeling opgeslagen",
      description: `"${naam.trim()}" is bewaard.`,
    });
    setNaam("");
    setOpslaanOpen(false);
  }

  function bevestigTerugval() {
    const px = Number.parseInt(terugvalPx, 10);
    if (!Number.isFinite(px) || px < MIN_TERUGVAL_PX || px > MAX_TERUGVAL_PX) {
      toast({
        title: "Ongeldige breedte",
        description: `Kies een waarde tussen ${MIN_TERUGVAL_PX} en ${MAX_TERUGVAL_PX} pixels.`,
        variant: "destructive",
      });
      return;
    }
    zetTerugvalBreedte(px);
    toast({
      title: "Terugvalbreedte ingesteld",
      description: `Onder ${px}px valt het scherm terug op één baan.`,
    });
    setTerugvalOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                aria-label="Banen"
              >
                <Columns3 className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Banen</TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuCheckboxItem
            checked={paneelAan}
            onCheckedChange={(v) => zetPaneelAan(!!v)}
          >
            Paneelmodus
          </DropdownMenuCheckboxItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Aantal banen</DropdownMenuLabel>
          {[2, 3, 4].map((n) => {
            // Sta N banen alleen toe als elke baan minstens MIN_BAAN_PX krijgt
            // in de werkelijk beschikbare ruimte (ná sidebar).
            const uitgeschakeld = n > maxBanenDiePassen;
            const item = (
              <DropdownMenuItem
                key={n}
                disabled={uitgeschakeld}
                onClick={() => {
                  zetAantalBanen(n);
                  if (!paneelAan) zetPaneelAan(true);
                }}
              >
                <span className="flex-1">{n} banen</span>
                {aantal === n && paneelAan && <Check className="h-4 w-4" />}
                {uitgeschakeld && (
                  <span className="text-[10px] text-muted-foreground">
                    past niet
                  </span>
                )}
              </DropdownMenuItem>
            );
            if (!uitgeschakeld) return item;
            return (
              <Tooltip key={n}>
                <TooltipTrigger asChild>
                  <div>{item}</div>
                </TooltipTrigger>
                <TooltipContent side="left">
                  Te weinig ruimte: elke baan heeft minstens {MIN_BAAN_PX}px
                  nodig. Maak het venster breder of klap de zijbalk in.
                </TooltipContent>
              </Tooltip>
            );
          })}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Standaardindelingen</DropdownMenuLabel>
          {standaard.map((s) => (
            <DropdownMenuItem key={s.naam} onClick={() => laadIndeling(s.naam)}>
              <Bookmark className="mr-2 h-4 w-4 text-muted-foreground" />
              {s.naam}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>
            Mijn indelingen ({benoemde.length}/{MAX_BENOEMDE_INDELINGEN})
          </DropdownMenuLabel>
          {benoemde.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Nog geen eigen indelingen.
            </div>
          )}
          {benoemde.map((b) => (
            <DropdownMenuSub key={b.naam}>
              <DropdownMenuSubTrigger>
                <span className="flex-1 truncate">{b.naam}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => laadIndeling(b.naam)}>
                  Laden
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    verwijderIndeling(b.naam);
                    toast({
                      title: "Indeling verwijderd",
                      description: `"${b.naam}" is verwijderd.`,
                    });
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Verwijderen
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
          <DropdownMenuItem
            onClick={() => {
              setNaam("");
              setOpslaanOpen(true);
            }}
          >
            <Save className="mr-2 h-4 w-4" />
            Huidige indeling opslaan als…
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setTerugvalPx(String(indeling.terugvalBreedte));
              setTerugvalOpen(true);
            }}
          >
            Terugvalbreedte instellen…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Opslaan-als dialoog */}
      <Dialog open={opslaanOpen} onOpenChange={setOpslaanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Indeling opslaan</DialogTitle>
            <DialogDescription>
              Bewaar de huidige banen onder een naam. Maximaal{" "}
              {MAX_BENOEMDE_INDELINGEN} eigen indelingen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="paneel-naam">Naam</Label>
            <Input
              id="paneel-naam"
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              placeholder="Bijv. Weekafsluiting"
              onKeyDown={(e) => {
                if (e.key === "Enter") bevestigOpslaan();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpslaanOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={bevestigOpslaan}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Opslaan
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terugvalbreedte dialoog */}
      <Dialog open={terugvalOpen} onOpenChange={setTerugvalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terugvalbreedte</DialogTitle>
            <DialogDescription>
              Onder deze vensterbreedte valt het scherm terug op één baan
              (gewone weergave). Standaard {STANDAARD_TERUGVAL_PX}px.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="paneel-terugval">Breedte in pixels</Label>
            <Input
              id="paneel-terugval"
              type="number"
              value={terugvalPx}
              onChange={(e) => setTerugvalPx(e.target.value)}
              min={MIN_TERUGVAL_PX}
              max={MAX_TERUGVAL_PX}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setTerugvalOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={bevestigTerugval}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Toepassen
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
