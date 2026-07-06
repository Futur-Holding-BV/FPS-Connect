import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Package, CheckCircle2, Plus, Wrench, Bug, ShieldCheck,
  AlertTriangle, Info, Sparkles,
} from "lucide-react";

interface KantoorRelease {
  id: number;
  versienummer: string;
  label: string;
  samenvatting: string | null;
  vrijgegevenOp: string | null;
  status: string;
  isActief: boolean;
  vrijgegevenDoorNaam: string | null;
}

interface UpdateNotes {
  toegevoegd: string | null;
  verbeterd: string | null;
  opgelost: string | null;
  beveiliging: string | null;
  bekendeProblemen: string | null;
  instructies: string | null;
}

// ── Notities-sectie ───────────────────────────────────────────────────────────

const SECTIES = [
  {
    key: "toegevoegd",
    label: "Toegevoegd",
    icoon: Plus,
    kleur: "text-green-600",
    achtergrond: "bg-green-50",
    rand: "border-green-200",
  },
  {
    key: "verbeterd",
    label: "Verbeterd",
    icoon: Wrench,
    kleur: "text-blue-600",
    achtergrond: "bg-blue-50",
    rand: "border-blue-200",
  },
  {
    key: "opgelost",
    label: "Opgelost",
    icoon: Bug,
    kleur: "text-purple-600",
    achtergrond: "bg-purple-50",
    rand: "border-purple-200",
  },
  {
    key: "beveiliging",
    label: "Beveiliging",
    icoon: ShieldCheck,
    kleur: "text-orange-600",
    achtergrond: "bg-orange-50",
    rand: "border-orange-200",
  },
  {
    key: "bekendeProblemen",
    label: "Bekende problemen",
    icoon: AlertTriangle,
    kleur: "text-amber-600",
    achtergrond: "bg-amber-50",
    rand: "border-amber-200",
  },
  {
    key: "instructies",
    label: "Instructies voor gebruikers",
    icoon: Info,
    kleur: "text-slate-600",
    achtergrond: "bg-slate-50",
    rand: "border-slate-200",
  },
];

function NotitieSectie({ value, label, icoon: Icoon, kleur, achtergrond, rand }: {
  value: string | null;
  label: string;
  icoon: React.ElementType;
  kleur: string;
  achtergrond: string;
  rand: string;
}) {
  if (!value?.trim()) return null;
  const regels = value.split("\n").filter(r => r.trim());
  if (regels.length === 0) return null;

  return (
    <div className={`rounded-lg border ${rand} ${achtergrond} px-4 py-3 space-y-2`}>
      <div className={`flex items-center gap-2 font-semibold text-sm ${kleur}`}>
        <Icoon className="h-4 w-4" />
        {label}
      </div>
      <ul className="space-y-1">
        {regels.map((r, i) => (
          <li key={i} className="text-sm flex gap-2">
            <span className="text-muted-foreground shrink-0 mt-0.5">•</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Hoofdcomponent ────────────────────────────────────────────────────────────

export default function ReleaseNotesPagina() {
  const [release, setRelease] = useState<KantoorRelease | null>(null);
  const [notes, setNotes] = useState<UpdateNotes | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState(false);

  useEffect(() => {
    const laad = async () => {
      setLaden(true);
      try {
        const resp = await fetch("/api/kantoor-release/actief", { credentials: "include" });
        if (!resp.ok) { setFout(true); return; }
        const data = await resp.json() as { release: KantoorRelease; notes: UpdateNotes | null };
        setRelease(data.release);
        setNotes(data.notes);
      } catch {
        setFout(true);
      } finally {
        setLaden(false);
      }
    };
    void laad();
  }, []);

  if (laden) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-center text-muted-foreground">
        Laden...
      </div>
    );
  }

  if (fout || !release) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
        <p className="text-muted-foreground">Geen actieve kantoorversie gevonden.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Kop */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Wat is nieuw in deze update?</h1>
          <p className="text-muted-foreground text-sm mt-1">FPS Connect — {release.label}</p>
        </div>
      </div>

      {/* Versie-card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">{release.label}</CardTitle>
                {release.vrijgegevenOp && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Vrijgegeven op {new Date(release.vrijgegevenOp).toLocaleDateString("nl-NL", {
                      weekday: "long", day: "numeric", month: "long", year: "numeric"
                    })}
                    {release.vrijgegevenDoorNaam && ` door ${release.vrijgegevenDoorNaam}`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge>v{release.versienummer}</Badge>
              <div className="flex items-center gap-1 text-xs text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Actieve kantoorversie
              </div>
            </div>
          </div>
        </CardHeader>
        {release.samenvatting && (
          <CardContent className="pt-0">
            <Separator className="mb-3" />
            <p className="text-sm leading-relaxed">{release.samenvatting}</p>
          </CardContent>
        )}
      </Card>

      {/* Releasenotes */}
      {notes ? (
        <div className="space-y-3">
          {SECTIES.map(s => (
            <NotitieSectie
              key={s.key}
              value={notes[s.key as keyof UpdateNotes]}
              label={s.label}
              icoon={s.icoon}
              kleur={s.kleur}
              achtergrond={s.achtergrond}
              rand={s.rand}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Geen gedetailleerde releasenotes beschikbaar voor deze versie.
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground text-center pt-2">
        FPS Connect — Platform voor brandpreventie — versie {release.versienummer}
      </div>
    </div>
  );
}
