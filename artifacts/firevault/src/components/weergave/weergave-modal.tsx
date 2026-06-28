import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Settings2, Sun, Moon, Monitor, RotateCcw, Type, Rows3, Layers } from "lucide-react";
import { SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  useWeergave, KLEUR_THEMAS,
  type Thema, type Kleurthema, type Lettergrootte, type Dichtheid,
} from "@/context/weergave-context";

// ═══════════════════════════════════════════════════════════
// Hulpcomponent: sectie met label
// ═══════════════════════════════════════════════════════════

function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titel}</p>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Hulpcomponent: knoppen-groep (single-select)
// ═══════════════════════════════════════════════════════════

interface OptieKnoppenProps<T extends string> {
  opties: { value: T; label: string; icoon?: React.ReactNode }[];
  gekozen: T;
  onKies: (v: T) => void;
}

function OptieKnoppen<T extends string>({ opties, gekozen, onKies }: OptieKnoppenProps<T>) {
  return (
    <div className="flex gap-2 flex-wrap">
      {opties.map(({ value, label, icoon }) => (
        <button
          key={value}
          onClick={() => onKies(value)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-all",
            gekozen === value
              ? "border-primary bg-primary/10 text-primary shadow-sm"
              : "border-border bg-background hover:border-primary/40 hover:bg-muted/60 text-foreground",
          )}
        >
          {icoon}
          {label}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Weergave-instellingen modal
// ═══════════════════════════════════════════════════════════

export function WeergaveModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const {
    voorkeuren,
    setThema, setKleurthema, setLettergrootte, setDichtheid, setHelderheid,
    resetAlles,
  } = useWeergave();

  const themaOpties: { value: Thema; label: string; icoon: React.ReactNode }[] = [
    { value: "licht",   label: "Licht",   icoon: <Sun  className="h-3.5 w-3.5" /> },
    { value: "donker",  label: "Donker",  icoon: <Moon className="h-3.5 w-3.5" /> },
    { value: "systeem", label: "Systeem", icoon: <Monitor className="h-3.5 w-3.5" /> },
  ];

  const letterOpties: { value: Lettergrootte; label: string }[] = [
    { value: "klein",        label: "Klein" },
    { value: "normaal",      label: "Normaal" },
    { value: "groot",        label: "Groot" },
    { value: "extra-groot",  label: "Extra groot" },
  ];

  const dichtheidOpties: { value: Dichtheid; label: string }[] = [
    { value: "compact", label: "Compact" },
    { value: "normaal", label: "Normaal" },
    { value: "ruim",    label: "Ruim" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full p-0 gap-0">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2.5">
            <Settings2 className="h-4 w-4 text-primary" />
            <span className="font-semibold">Weergave-instellingen</span>
          </div>
          <button
            onClick={resetAlles}
            title="Herstel standaardinstellingen"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Standaard
          </button>
        </div>

        {/* Inhoud */}
        <div className="p-5 space-y-6 overflow-y-auto max-h-[75vh]">

          {/* ── THEMA ── */}
          <Sectie titel="Thema">
            <OptieKnoppen opties={themaOpties} gekozen={voorkeuren.thema} onKies={setThema} />
          </Sectie>

          {/* ── KLEURTHEMA ── */}
          <Sectie titel="Kleurthema">
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(KLEUR_THEMAS) as [Kleurthema, typeof KLEUR_THEMAS[Kleurthema]][]).map(
                ([key, theme]) => {
                  const isGekozen = voorkeuren.kleurthema === key;
                  // Derive a preview color from primary HSL value
                  const [h, s, l] = theme.primary.split(" ");
                  const kleur = `hsl(${h}, ${s}, ${l})`;
                  return (
                    <button
                      key={key}
                      onClick={() => setKleurthema(key)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-all",
                        isGekozen
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border hover:border-primary/40 hover:bg-muted/40",
                      )}
                    >
                      <span
                        className="h-5 w-5 rounded-full shrink-0 ring-1 ring-black/10"
                        style={{ backgroundColor: kleur }}
                      />
                      <div>
                        <div className="font-medium leading-none">{theme.label}</div>
                        {isGekozen && (
                          <div className="text-[10px] text-primary mt-0.5">Actief</div>
                        )}
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </Sectie>

          {/* ── LETTERGROOTTE ── */}
          <Sectie titel="Lettergrootte">
            <div className="flex gap-2 flex-wrap items-end">
              {letterOpties.map(({ value, label }) => {
                const isGekozen = voorkeuren.lettergrootte === value;
                const schalen: Record<Lettergrootte, string> = {
                  klein: "text-xs", normaal: "text-sm", groot: "text-base", "extra-groot": "text-lg",
                };
                return (
                  <button
                    key={value}
                    onClick={() => setLettergrootte(value)}
                    className={cn(
                      "flex flex-col items-center gap-1 px-3 py-2 rounded-md border transition-all min-w-[64px]",
                      isGekozen
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40 hover:bg-muted/60",
                    )}
                  >
                    <Type className={cn("text-current", schalen[value])} />
                    <span className="text-[11px] font-medium">{label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Lettergrootte: {voorkeuren.lettergrootte === "klein" ? "13" : voorkeuren.lettergrootte === "normaal" ? "16" : voorkeuren.lettergrootte === "groot" ? "18" : "20"} px
            </p>
          </Sectie>

          {/* ── WEERGAVEDICHTHEID ── */}
          <Sectie titel="Weergavedichtheid">
            <OptieKnoppen opties={dichtheidOpties} gekozen={voorkeuren.dichtheid} onKies={setDichtheid} />
            <p className="text-xs text-muted-foreground">
              {voorkeuren.dichtheid === "compact"
                ? "Meer items per scherm, minder witruimte"
                : voorkeuren.dichtheid === "ruim"
                ? "Meer witruimte, makkelijker te lezen"
                : "Standaard balans tussen ruimte en overzicht"}
            </p>
          </Sectie>

          {/* ── HELDERHEID ── */}
          <Sectie titel={`Helderheid — ${voorkeuren.helderheid}%`}>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-6 shrink-0">50%</span>
              <Slider
                value={[voorkeuren.helderheid]}
                onValueChange={([v]) => setHelderheid(v)}
                min={50}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-8 shrink-0 text-right">100%</span>
            </div>
            {voorkeuren.helderheid < 80 && (
              <p className="text-xs text-amber-600">
                Lage helderheid kan tekst moeilijker leesbaar maken.
              </p>
            )}
          </Sectie>

          {/* ── LIVE VOORBEELD ── */}
          <Sectie titel="Voorbeeld">
            <div className="rounded-lg border p-3 space-y-1.5 bg-card">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-primary" />
                <span className="font-semibold text-sm">FPS Connect</span>
              </div>
              <p className="text-sm text-muted-foreground leading-snug">
                Dit is een voorbeeldtekst om de lettergrootte en helderheid te beoordelen.
              </p>
              <div className="flex gap-2 pt-0.5">
                <div className="h-6 px-2.5 rounded-md bg-primary text-primary-foreground text-xs flex items-center font-medium">
                  Opslaan
                </div>
                <div className="h-6 px-2.5 rounded-md border border-border text-xs flex items-center text-muted-foreground">
                  Annuleren
                </div>
              </div>
            </div>
          </Sectie>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// Weergaveknop — voor in SidebarFooter
// ═══════════════════════════════════════════════════════════

export function WeergaveKnop() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => setOpen(true)}
          title="Weergave-instellingen"
          className="text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" />
          <span>Weergave</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <WeergaveModal open={open} onOpenChange={setOpen} />
    </>
  );
}
