import { useState, useEffect, useRef } from "react";
import { Loader2, ShieldCheck, Eye, EyeOff, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const api = (pad: string, opties?: RequestInit) =>
  fetch(`${BASE}/api${pad}`, { credentials: "include", ...opties });

type Stap = "laden" | "niet_beschikbaar" | "fout" | "gegevens" | "tweeStap" | "klaar";

export default function InstallatiePagina() {
  const [stap, setStap] = useState<Stap>("laden");
  const [foutmelding, setFoutmelding] = useState("");

  const [naam, setNaam] = useState("");
  const [bedrijfsnaam, setBedrijfsnaam] = useState("");
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [bevestig, setBevestig] = useState("");
  const [toonWw, setToonWw] = useState(false);
  const [toonBev, setToonBev] = useState(false);
  const [bezig, setBezig] = useState(false);
  const naamRef = useRef<HTMLInputElement>(null);
  const bedrijfsnaamRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const wachtwoordRef = useRef<HTMLInputElement>(null);
  const bevestigRef = useRef<HTMLInputElement>(null);

  const [qrCode, setQrCode] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpFout, setOtpFout] = useState("");

  useEffect(() => {
    api("/installatie/status")
      .then(async (r) => {
        if (!r.ok) { setStap("fout"); return; }
        const data = await r.json();
        setStap(data.bootstrap_beschikbaar ? "gegevens" : "niet_beschikbaar");
      })
      .catch(() => setStap("fout"));
  }, []);

  async function installeer() {
    setFoutmelding("");
    // Lees de werkelijke veldwaarden uit zodat browser-autofill (met name
    // Firefox, dat geen change-event vuurt) altijd wordt meegenomen.
    const naamWaarde = naamRef.current?.value ?? naam;
    const bedrijfsnaamWaarde = bedrijfsnaamRef.current?.value ?? bedrijfsnaam;
    const emailWaarde = emailRef.current?.value ?? email;
    const wachtwoordWaarde = wachtwoordRef.current?.value ?? wachtwoord;
    const bevestigWaarde = bevestigRef.current?.value ?? bevestig;
    if (!naamWaarde.trim() || !bedrijfsnaamWaarde.trim() || !emailWaarde.trim()) {
      setFoutmelding("Vul alle velden in.");
      return;
    }
    if (wachtwoordWaarde.length < 8) {
      setFoutmelding("Wachtwoord moet minimaal 8 tekens bevatten.");
      return;
    }
    if (wachtwoordWaarde !== bevestigWaarde) {
      setFoutmelding("Wachtwoorden komen niet overeen.");
      return;
    }
    setBezig(true);
    try {
      const r = await api("/installatie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          naam: naamWaarde,
          bedrijfsnaam: bedrijfsnaamWaarde,
          email: emailWaarde,
          wachtwoord: wachtwoordWaarde,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 403) { setStap("niet_beschikbaar"); return; }
        setFoutmelding(data.error ?? "Er is een fout opgetreden.");
        return;
      }
      if (data.status === "setup_2fa") {
        const qrRes = await api("/auth/2fa/setup", { method: "POST" });
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          setQrCode(qrData.qr_code);
          setStap("tweeStap");
        } else {
          setFoutmelding("Kon 2FA-setup niet starten. Probeer opnieuw.");
        }
      }
    } catch {
      setFoutmelding("Er is een netwerkfout opgetreden.");
    } finally {
      setBezig(false);
    }
  }

  async function bevestig2fa() {
    setOtpFout("");
    setBezig(true);
    try {
      const r = await api("/auth/2fa/activeren", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpCode }),
      });
      const data = await r.json();
      if (!r.ok) { setOtpFout(data.error ?? "Onjuiste code."); return; }
      setStap("klaar");
      setTimeout(() => {
        window.location.href = BASE + "/";
      }, 2500);
    } catch {
      setOtpFout("Er is een netwerkfout opgetreden.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <p className="text-white font-semibold text-lg">FPS Connect</p>
          <p className="text-zinc-400 text-sm">Eerste installatie</p>
        </div>

        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
          {stap === "laden" && (
            <div className="p-10 flex flex-col items-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-zinc-600 text-sm">Installatiestatus controleren...</p>
            </div>
          )}

          {stap === "fout" && (
            <div className="p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
              <h2 className="font-semibold text-zinc-900 mb-1">Er ging iets mis</h2>
              <p className="text-zinc-500 text-sm">
                De installatiestatus kon niet worden opgehaald. Probeer de pagina te vernieuwen.
              </p>
            </div>
          )}

          {stap === "niet_beschikbaar" && (
            <div className="p-8 text-center">
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <h2 className="font-semibold text-zinc-900 mb-1">Installatie al voltooid</h2>
              <p className="text-zinc-500 text-sm mb-4">
                Deze omgeving is al ingericht. U kunt inloggen via de inlogpagina.
              </p>
              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => { window.location.href = BASE + "/"; }}
              >
                Naar inlogpagina
              </Button>
            </div>
          )}

          {stap === "gegevens" && (
            <div className="p-8">
              <h2 className="font-semibold text-zinc-900 text-xl mb-1">
                Welkom bij FPS Connect
              </h2>
              <p className="text-zinc-500 text-sm mb-6">
                Deze omgeving is nog niet ingericht. Maak hieronder het eerste
                hoofdbeheerdersaccount aan.
              </p>
              <div className="space-y-4">
                <div>
                  <Label className="text-zinc-700 text-sm font-medium">Naam</Label>
                  <Input
                    name="naam"
                    ref={naamRef}
                    autoComplete="name"
                    defaultValue={naam}
                    onChange={(e) => setNaam(e.target.value)}
                    placeholder="Voor- en achternaam"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-zinc-700 text-sm font-medium">Bedrijfsnaam</Label>
                  <Input
                    name="bedrijfsnaam"
                    ref={bedrijfsnaamRef}
                    autoComplete="organization"
                    defaultValue={bedrijfsnaam}
                    onChange={(e) => setBedrijfsnaam(e.target.value)}
                    placeholder="Naam van uw bedrijf"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-zinc-700 text-sm font-medium">E-mailadres</Label>
                  <Input
                    name="email"
                    ref={emailRef}
                    type="email"
                    autoComplete="email"
                    defaultValue={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="naam@bedrijf.nl"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-zinc-700 text-sm font-medium">
                    Wachtwoord <span className="text-zinc-400 font-normal">(minimaal 8 tekens)</span>
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      name="nieuw-wachtwoord"
                      ref={wachtwoordRef}
                      type={toonWw ? "text" : "password"}
                      autoComplete="new-password"
                      defaultValue={wachtwoord}
                      onChange={(e) => setWachtwoord(e.target.value)}
                      placeholder="Kies een sterk wachtwoord"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      onClick={() => setToonWw((v) => !v)}
                    >
                      {toonWw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-700 text-sm font-medium">Wachtwoord bevestigen</Label>
                  <div className="relative mt-1">
                    <Input
                      name="bevestig-wachtwoord"
                      ref={bevestigRef}
                      type={toonBev ? "text" : "password"}
                      autoComplete="new-password"
                      defaultValue={bevestig}
                      onChange={(e) => setBevestig(e.target.value)}
                      placeholder="Herhaal uw wachtwoord"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      onClick={() => setToonBev((v) => !v)}
                    >
                      {toonBev ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {foutmelding && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                    {foutmelding}
                  </p>
                )}
                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-white mt-2"
                  onClick={installeer}
                  disabled={bezig}
                >
                  {bezig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Doorgaan naar tweestapsverificatie
                </Button>
              </div>
            </div>
          )}

          {stap === "tweeStap" && (
            <div className="p-8">
              <h2 className="font-semibold text-zinc-900 text-xl mb-1">
                Tweestapsverificatie instellen
              </h2>
              <p className="text-zinc-500 text-sm mb-5">
                Scan onderstaande QR-code met uw authenticator-app (zoals Google Authenticator of Microsoft Authenticator)
                en voer daarna de 6-cijferige code in.
              </p>
              {qrCode && (
                <div className="flex justify-center mb-5">
                  <img
                    src={qrCode}
                    alt="QR-code voor authenticator-app"
                    className="w-44 h-44 border border-zinc-200 rounded-lg"
                  />
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <Label className="text-zinc-700 text-sm font-medium">Verificatiecode</Label>
                  <Input
                    className="mt-1 tracking-widest text-center text-lg font-mono"
                    placeholder="123456"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => { if (e.key === "Enter") bevestig2fa(); }}
                  />
                </div>
                {otpFout && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                    {otpFout}
                  </p>
                )}
                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-white"
                  onClick={bevestig2fa}
                  disabled={bezig || otpCode.length < 6}
                >
                  {bezig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Installatie voltooien
                </Button>
              </div>
            </div>
          )}

          {stap === "klaar" && (
            <div className="p-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <h2 className="font-semibold text-zinc-900 text-xl mb-2">Installatie voltooid</h2>
              <p className="text-zinc-500 text-sm">
                Het hoofdbeheerdersaccount is aangemaakt. U wordt automatisch doorgestuurd...
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          FPS Connect &bull; Eerste-installatie bootstrap
        </p>
      </div>
    </div>
  );
}
