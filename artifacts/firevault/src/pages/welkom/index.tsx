import logoFpsSchild from "@/assets/logo-fps-schild.png";
import { useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Layers,
  MapPin,
  ClipboardCheck,
  FileText,
  Users,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

// ── LocalStorage sleutel ──────────────────────────────────────────────────────

const LS_SLEUTEL = "fps.welkom.afgerond";

export function isWelkomAfgerond(): boolean {
  return localStorage.getItem(LS_SLEUTEL) === "1";
}

function markeerAfgerond() {
  localStorage.setItem(LS_SLEUTEL, "1");
}

// ── Processtappen ─────────────────────────────────────────────────────────────

const STAPPEN = [
  {
    icoon: Building2,
    titel: "Gebouw registreren",
    uitleg:
      "Voeg een pand of project toe met naam, adres en contactgegevens. Elk gebouw krijgt zijn eigen dossier binnen het platform.",
  },
  {
    icoon: Layers,
    titel: "Verdiepingen instellen",
    uitleg:
      "Stel de bouwlagen in (begane grond, verdiepingen, souterrains) en upload de plattegrond per bouwlaag als PDF.",
  },
  {
    icoon: MapPin,
    titel: "Spots registreren",
    uitleg:
      "Registreer alle brandwerende voorzieningen — doorvoeringen, branddeuren, brandkleppen, coatings en manchetten — per verdieping op de plattegrond.",
  },
  {
    icoon: ClipboardCheck,
    titel: "Inspecties & onderhoud bijhouden",
    uitleg:
      "Leg inspecties (oplevering, periodiek, jaarlijks, herstel) en werkorders vast. Wijs taken toe aan monteurs en volg de status.",
  },
  {
    icoon: FileText,
    titel: "Opleverrapport genereren",
    uitleg:
      "Stel een officieel opleverrapport samen met voorblad, plattegronden, spotdetails, foto's en bijlagen. Sla het op als definitief dossier.",
  },
  {
    icoon: Users,
    titel: "Team beheren",
    uitleg:
      "Nodig collega's, monteurs en controleurs uit via Gebruikers. Stel per persoon de rol en bevoegdheden in.",
  },
];

// ── Welkomscherm ──────────────────────────────────────────────────────────────

export default function WelkomScherm() {
  const [, navigate] = useLocation();
  const { gebruiker } = useAuth();

  function naarPlatform() {
    markeerAfgerond();
    navigate("/");
  }

  return (
    <div className="min-h-screen flex bg-[#212631]">

      {/* Linkerpaneel */}
      <aside className="w-64 shrink-0 bg-[#1a1f2b] flex flex-col py-8 px-6">
        <div className="mb-10 flex items-center gap-2.5">
          <img
            src={logoFpsSchild}
            alt="FPS Connect"
            className="h-9 w-auto shrink-0"
          />
          <span className="text-lg font-bold tracking-tight text-white">
            FPS <span className="font-semibold text-white/60">Connect</span>
          </span>
        </div>

        <div className="flex-1 space-y-1">
          {STAPPEN.map((s, i) => {
            const Icoon = s.icoon;
            return (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/40"
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border border-white/15">
                  <span className="text-[10px] font-bold">{i + 1}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icoon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[13px] font-medium leading-tight">{s.titel}</span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-white/25 mt-auto">FPS Connect</p>
      </aside>

      {/* Hoofdpaneel */}
      <main className="flex-1 overflow-y-auto p-10">
        <div className="max-w-2xl mx-auto">

          {/* Koptekst */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white leading-tight">
              Welkom bij FPS Connect
              {gebruiker?.naam ? `, ${gebruiker.naam.split(" ")[0]}` : ""}
            </h1>
            <p className="mt-3 text-white/60 text-base leading-relaxed">
              FPS Connect is het platform voor het registreren, beheren en inspecteren
              van brandwerende gebouwvoorzieningen. Hieronder zie je hoe het proces
              in stappen werkt.
            </p>
          </div>

          {/* Processtappen */}
          <div className="space-y-3 mb-8">
            {STAPPEN.map((s, i) => {
              const Icoon = s.icoon;
              return (
                <div
                  key={i}
                  className="bg-white/5 border border-white/10 rounded-xl p-5 flex gap-4"
                >
                  <div className="shrink-0 w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Icoon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-primary/70 uppercase tracking-wider">
                        Stap {i + 1}
                      </span>
                    </div>
                    <h3 className="text-white font-semibold text-base mb-1">{s.titel}</h3>
                    <p className="text-white/55 text-sm leading-relaxed">{s.uitleg}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Afsluiting */}
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-5 flex items-start gap-4 mb-8">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p className="text-white/70 text-sm leading-relaxed">
              Je kunt alle stappen in je eigen tempo doorlopen. Gebouwen, verdiepingen
              en gebruikers voeg je rechtstreeks toe via de navigatie in het platform.
              Er wordt nu niets aangemaakt.
            </p>
          </div>

          <Button size="lg" className="gap-2 w-full sm:w-auto" onClick={naarPlatform}>
            Naar het platform
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </main>
    </div>
  );
}
