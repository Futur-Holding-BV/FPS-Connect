import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  useCreateGebouw,
  useCreateVerdieping,
  useCreateGebruiker,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Check,
  Building2,
  Layers,
  Users,
  Rocket,
  PartyPopper,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── LocalStorage sleutel ──────────────────────────────────────────────────────

const LS_SLEUTEL = "fps.welkom.afgerond";

export function isWelkomAfgerond(): boolean {
  return localStorage.getItem(LS_SLEUTEL) === "1";
}

function markeerAfgerond() {
  localStorage.setItem(LS_SLEUTEL, "1");
}

// ── Stap-definitie ────────────────────────────────────────────────────────────

type StapId = "welkom" | "gebouw" | "verdieping" | "teamlid" | "klaar";

interface StapDef {
  id: StapId;
  label: string;
  icon: React.ReactNode;
}

const STAPPEN: StapDef[] = [
  { id: "welkom",     label: "Welkom",            icon: <Rocket className="w-4 h-4" /> },
  { id: "gebouw",     label: "Eerste gebouw",      icon: <Building2 className="w-4 h-4" /> },
  { id: "verdieping", label: "Verdieping",         icon: <Layers className="w-4 h-4" /> },
  { id: "teamlid",    label: "Teamlid uitnodigen", icon: <Users className="w-4 h-4" /> },
  { id: "klaar",      label: "Klaar!",             icon: <PartyPopper className="w-4 h-4" /> },
];

const ROLLEN = [
  { waarde: "gebruiker",      label: "Gebruiker" },
  { waarde: "hoofdbeheerder", label: "Hoofdbeheerder" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function initialen(naam: string): string {
  return naam
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, 3);
}

// ── Wizard pagina ─────────────────────────────────────────────────────────────

export default function WelkomWizard() {
  const [, navigate] = useLocation();
  const { gebruiker } = useAuth();
  const queryClient = useQueryClient();

  const [stapIndex, setStapIndex] = useState(0);
  const huidigeStap = STAPPEN[stapIndex];

  const [gebouwId, setGebouwId] = useState<number | null>(null);

  // ── Gebouw-formulier ──
  const [gebouwNaam, setGebouwNaam] = useState("");
  const [gebouwAdres, setGebouwAdres] = useState("");
  const [gebouwStad, setGebouwStad] = useState("");
  const [gebouwPostcode, setGebouwPostcode] = useState("");
  const [gebouwFout, setGebouwFout] = useState<string | null>(null);

  // ── Verdieping-formulier ──
  const [verdiepingNaam, setVerdiepingNaam] = useState("Begane grond");
  const [verdiepingNiveau, setVerdiepingNiveau] = useState("0");
  const [verdiepingFout, setVerdiepingFout] = useState<string | null>(null);

  // ── Teamlid-formulier ──
  const [teamlidNaam, setTeamlidNaam] = useState("");
  const [teamlidEmail, setTeamlidEmail] = useState("");
  const [teamlidRol, setTeamlidRol] = useState("gebruiker");
  const [teamlidFout, setTeamlidFout] = useState<string | null>(null);

  const maakGebouw     = useCreateGebouw();
  const maakVerdieping = useCreateVerdieping();
  const maakGebruiker  = useCreateGebruiker();

  const bezig = maakGebouw.isPending || maakVerdieping.isPending || maakGebruiker.isPending;

  // ── Navigatie ──────────────────────────────────────────────────────────────

  function volgende() {
    setStapIndex((i) => Math.min(i + 1, STAPPEN.length - 1));
  }

  // ── Stap-acties ────────────────────────────────────────────────────────────

  async function bewaarGebouw() {
    setGebouwFout(null);
    if (!gebouwNaam.trim()) { setGebouwFout("Naam is verplicht."); return; }
    if (!gebouwAdres.trim()) { setGebouwFout("Adres is verplicht."); return; }
    try {
      const g = await maakGebouw.mutateAsync({
        data: {
          naam:     gebouwNaam.trim(),
          adres:    gebouwAdres.trim(),
          stad:     gebouwStad.trim()     || undefined,
          postcode: gebouwPostcode.trim() || undefined,
        },
      });
      setGebouwId(g.id);
      void queryClient.invalidateQueries({ queryKey: ["listGebouwen"] });
      volgende();
    } catch {
      setGebouwFout("Aanmaken mislukt. Controleer de gegevens en probeer opnieuw.");
    }
  }

  async function bewaarVerdieping() {
    setVerdiepingFout(null);
    if (!gebouwId) return;
    if (!verdiepingNaam.trim()) { setVerdiepingFout("Naam is verplicht."); return; }
    const niveauGetal = parseInt(verdiepingNiveau, 10);
    if (isNaN(niveauGetal)) { setVerdiepingFout("Niveau moet een getal zijn."); return; }
    try {
      await maakVerdieping.mutateAsync({
        id: gebouwId,
        data: { naam: verdiepingNaam.trim(), niveau: niveauGetal },
      });
      volgende();
    } catch {
      setVerdiepingFout("Aanmaken mislukt. Probeer opnieuw.");
    }
  }

  async function bewaarTeamlid() {
    setTeamlidFout(null);
    // Volledig overslaan als beide leeg zijn
    if (!teamlidNaam.trim() && !teamlidEmail.trim()) { volgende(); return; }
    if (!teamlidNaam.trim()) { setTeamlidFout("Naam is verplicht."); return; }
    if (!teamlidEmail.trim()) { setTeamlidFout("E-mailadres is verplicht."); return; }
    try {
      await maakGebruiker.mutateAsync({
        data: {
          naam:      teamlidNaam.trim(),
          initialen: initialen(teamlidNaam),
          rol:       teamlidRol,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          email:     teamlidEmail.trim(),
        } as any,
      });
      volgende();
    } catch {
      setTeamlidFout("Aanmaken mislukt. Controleer het e-mailadres.");
    }
  }

  function afronden() {
    markeerAfgerond();
    if (gebouwId) {
      navigate(`/gebouwen/${gebouwId}`);
    } else {
      navigate("/");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex bg-[#212631]">
      {/* Linkerpaneel — voortgang */}
      <aside className="w-64 shrink-0 bg-[#1a1f2b] flex flex-col py-8 px-6">
        <div className="mb-10">
          <img
            src="/logo-fps-connect.png"
            alt="FPS Connect"
            className="h-7 w-auto"
          />
        </div>

        <nav className="space-y-1 flex-1">
          {STAPPEN.map((s, i) => {
            const isActief   = i === stapIndex;
            const isGelukt   = i < stapIndex;
            const isToekomst = i > stapIndex;
            return (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                  isActief   && "bg-primary/15 text-primary",
                  isGelukt   && "text-white/50",
                  isToekomst && "text-white/25",
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-colors",
                    isActief   && "border-primary text-primary",
                    isGelukt   && "border-white/30 bg-primary/30 text-primary border-primary/50",
                    isToekomst && "border-white/15 text-white/25",
                  )}
                >
                  {isGelukt ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <span className="text-[10px] font-bold">{i + 1}</span>
                  )}
                </div>
                <span className="text-[13px] font-medium">{s.label}</span>
              </div>
            );
          })}
        </nav>

        <p className="text-[11px] text-white/25 mt-auto">
          FPS Connect — eerste inrichting
        </p>
      </aside>

      {/* Rechterpaneel — stapinhoud */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">

          {/* ── Stap 1: Welkom ── */}
          {huidigeStap.id === "welkom" && (
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center gap-2 text-primary text-sm font-semibold mb-3">
                  <Rocket className="w-4 h-4" />
                  <span>Aan de slag</span>
                </div>
                <h1 className="text-3xl font-bold text-white leading-tight">
                  Welkom bij FPS Connect
                  {gebruiker?.naam ? `, ${gebruiker.naam.split(" ")[0]}` : ""}!
                </h1>
                <p className="mt-3 text-white/60 text-base leading-relaxed">
                  In een paar stappen richt je het platform in voor jouw organisatie.
                  We lopen samen door de basisinstellingen: een gebouw toevoegen,
                  een verdieping aanmaken en optioneel een eerste teamlid uitnodigen.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl p-4 space-y-2.5">
                {STAPPEN.slice(1).map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3 text-white/70 text-sm">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-primary text-[10px] font-bold">{i + 1}</span>
                    </div>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>

              <Button
                size="lg"
                className="w-full gap-2"
                onClick={volgende}
              >
                Begin de inrichting
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* ── Stap 2: Eerste gebouw ── */}
          {huidigeStap.id === "gebouw" && (
            <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-6 text-slate-900 [color-scheme:light]">
              <div>
                <div className="inline-flex items-center gap-2 text-primary text-sm font-semibold mb-1">
                  <Building2 className="w-4 h-4" />
                  <span>Stap 1 van 3</span>
                </div>
                <h2 className="text-2xl font-bold text-foreground">Eerste gebouw aanmaken</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Voeg het eerste pand of project toe dat je wilt registreren.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="g-naam">
                    Naam <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="g-naam"
                    placeholder="bijv. Kantoorpand Stationsplein 1"
                    value={gebouwNaam}
                    onChange={(e) => setGebouwNaam(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void bewaarGebouw()}
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="g-adres">
                    Adres <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="g-adres"
                    placeholder="Straatnaam + huisnummer"
                    value={gebouwAdres}
                    onChange={(e) => setGebouwAdres(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="g-postcode">Postcode</Label>
                    <Input
                      id="g-postcode"
                      placeholder="1234 AB"
                      value={gebouwPostcode}
                      onChange={(e) => setGebouwPostcode(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="g-stad">Stad</Label>
                    <Input
                      id="g-stad"
                      placeholder="Amsterdam"
                      value={gebouwStad}
                      onChange={(e) => setGebouwStad(e.target.value)}
                    />
                  </div>
                </div>

                {gebouwFout && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{gebouwFout}</span>
                  </div>
                )}
              </div>

              <Button
                className="w-full gap-2"
                onClick={() => void bewaarGebouw()}
                disabled={bezig}
              >
                {maakGebouw.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Aanmaken&hellip;</>
                ) : (
                  <>Verder naar verdieping <ChevronRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          )}

          {/* ── Stap 3: Verdieping ── */}
          {huidigeStap.id === "verdieping" && (
            <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-6 text-slate-900 [color-scheme:light]">
              <div>
                <div className="inline-flex items-center gap-2 text-primary text-sm font-semibold mb-1">
                  <Layers className="w-4 h-4" />
                  <span>Stap 2 van 3</span>
                </div>
                <h2 className="text-2xl font-bold text-foreground">Eerste verdieping</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Voeg de begane grond of een andere bouwlaag toe aan{" "}
                  <span className="font-medium">{gebouwNaam}</span>.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="v-naam">
                    Naam bouwlaag <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="v-naam"
                    placeholder="bijv. Begane grond"
                    value={verdiepingNaam}
                    onChange={(e) => setVerdiepingNaam(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="v-niveau">Niveau</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={verdiepingNiveau}
                      onValueChange={setVerdiepingNiveau}
                    >
                      <SelectTrigger id="v-niveau" className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n === 0
                              ? "0 — Begane grond"
                              : n < 0
                              ? `${n} — Souterrain/kelder`
                              : `${n} — ${n}e verdieping`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {verdiepingFout && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{verdiepingFout}</span>
                  </div>
                )}
              </div>

              <Button
                className="w-full gap-2"
                onClick={() => void bewaarVerdieping()}
                disabled={bezig}
              >
                {maakVerdieping.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Aanmaken&hellip;</>
                ) : (
                  <>Verder <ChevronRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          )}

          {/* ── Stap 4: Teamlid uitnodigen (optioneel) ── */}
          {huidigeStap.id === "teamlid" && (
            <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-6 text-slate-900 [color-scheme:light]">
              <div>
                <div className="inline-flex items-center gap-2 text-primary text-sm font-semibold mb-1">
                  <Users className="w-4 h-4" />
                  <span>Stap 3 van 3 — optioneel</span>
                </div>
                <h2 className="text-2xl font-bold text-foreground">Teamlid uitnodigen</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Voeg een collega toe aan FPS Connect. Je kunt dit ook later doen via{" "}
                  <span className="font-medium">Gebruikers</span>.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="t-naam">Naam</Label>
                  <Input
                    id="t-naam"
                    placeholder="Voor- en achternaam"
                    value={teamlidNaam}
                    onChange={(e) => setTeamlidNaam(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="t-email">E-mailadres</Label>
                  <Input
                    id="t-email"
                    type="email"
                    placeholder="naam@bedrijf.nl"
                    value={teamlidEmail}
                    onChange={(e) => setTeamlidEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="t-rol">Rol</Label>
                  <Select value={teamlidRol} onValueChange={setTeamlidRol}>
                    <SelectTrigger id="t-rol">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLLEN.map((r) => (
                        <SelectItem key={r.waarde} value={r.waarde}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {teamlidFout && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{teamlidFout}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={volgende}
                  disabled={bezig}
                >
                  Overslaan
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={() => void bewaarTeamlid()}
                  disabled={bezig}
                >
                  {maakGebruiker.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Aanmaken&hellip;</>
                  ) : (
                    <>Toevoegen <ChevronRight className="w-4 h-4" /></>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── Stap 5: Klaar! ── */}
          {huidigeStap.id === "klaar" && (
            <div className="space-y-6 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/20 mx-auto">
                <PartyPopper className="w-9 h-9 text-primary" />
              </div>

              <div>
                <h2 className="text-3xl font-bold text-white">Alles klaar!</h2>
                <p className="mt-2 text-white/60 text-base">
                  Het platform is ingericht en klaar voor gebruik.
                </p>
              </div>

              {gebouwNaam && (
                <div className="bg-white/5 rounded-xl p-4 text-left space-y-2">
                  <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">
                    Aangemaakt
                  </p>
                  <div className="flex items-center gap-2 text-white/80 text-sm">
                    <Building2 className="w-4 h-4 text-primary shrink-0" />
                    <span>{gebouwNaam}</span>
                  </div>
                  {verdiepingNaam && (
                    <div className="flex items-center gap-2 text-white/80 text-sm">
                      <Layers className="w-4 h-4 text-primary shrink-0" />
                      <span>{verdiepingNaam}</span>
                    </div>
                  )}
                  {teamlidNaam && (
                    <div className="flex items-center gap-2 text-white/80 text-sm">
                      <Users className="w-4 h-4 text-primary shrink-0" />
                      <span>{teamlidNaam}</span>
                    </div>
                  )}
                </div>
              )}

              <Button size="lg" className="w-full gap-2" onClick={afronden}>
                Naar het platform
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
