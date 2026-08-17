import { useState, useEffect, useRef } from "react";
import { Loader2, ShieldCheck, Eye, EyeOff, CheckCircle, AlertTriangle, Copy, Smartphone, QrCode } from "lucide-react";
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const api = (pad: string, opties?: RequestInit) =>
  fetch(`${BASE}/api${pad}`, { credentials: "include", ...opties });

const TALEN = [
  { code: "nl", label: "Nederlands" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
  { code: "tr", label: "Türkçe" },
];

type Stap = "laden" | "fout" | "verlopen" | "al_actief" | "gegevens" | "tweeStap" | "klaar";

interface GebruikerInfo {
  id: number;
  naam: string;
  email: string;
}

interface Props {
  token: string;
}

export default function ActivatiePagina({ token }: Props) {
  const [stap, setStap] = useState<Stap>("laden");
  const [gebruiker, setGebruiker] = useState<GebruikerInfo | null>(null);
  const [foutmelding, setFoutmelding] = useState("");

  const [wachtwoord, setWachtwoord] = useState("");
  const [bevestig, setBevestig] = useState("");
  const [taal, setTaal] = useState("nl");
  const [toonWw, setToonWw] = useState(false);
  const [toonBev, setToonBev] = useState(false);
  const [bezig, setBezig] = useState(false);
  const wachtwoordRef = useRef<HTMLInputElement>(null);
  const bevestigRef = useRef<HTMLInputElement>(null);

  const [qrCode, setQrCode] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [secretGekopieerd, setSecretGekopieerd] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpFout, setOtpFout] = useState("");

  const [pwaUrl, setPwaUrl] = useState<string | null>(null);
  const [pwaQrFout, setPwaQrFout] = useState(false);

  useEffect(() => {
    api(`/uitnodiging/${token}`)
      .then(async (r) => {
        if (r.status === 409) { setStap("al_actief"); return; }
        if (r.status === 410) { setStap("verlopen"); return; }
        if (!r.ok) { setStap("fout"); return; }
        const data = await r.json();
        setGebruiker(data);
        setStap("gegevens");
      })
      .catch(() => setStap("fout"));
  }, [token]);

  async function activeer() {
    setFoutmelding("");
    // Lees de werkelijke veldwaarden uit zodat browser-autofill (met name
    // Firefox, dat geen change-event vuurt) altijd wordt meegenomen.
    const wachtwoordWaarde = wachtwoordRef.current?.value ?? wachtwoord;
    const bevestigWaarde = bevestigRef.current?.value ?? bevestig;
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
      const r = await api(`/uitnodiging/${token}/activeren`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wachtwoord: wachtwoordWaarde, taal }),
      });
      const data = await r.json();
      if (!r.ok) { setFoutmelding(data.error ?? "Er is een fout opgetreden."); return; }
      if (data.status === "setup_2fa") {
        const qrRes = await api("/auth/2fa/setup", { method: "POST" });
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          setQrCode(qrData.qr_code);
          setTotpSecret(qrData.secret ?? "");
          setOtpauthUrl(qrData.otpauth_url ?? "");
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
      // Haal de PWA-installatielink op zodat we hem op de afrondpagina kunnen tonen.
      // De gebruiker is nu ingelogd, dus de sessie is beschikbaar.
      api("/auth/pwa-url")
        .then((res) => res.json())
        .then((d) => { if (d.url) setPwaUrl(d.url); })
        .catch(() => {});
      setStap("klaar");
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
          <p className="text-zinc-400 text-sm">Beheer- en inspectieplatform</p>
        </div>

        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
          {stap === "laden" && (
            <div className="p-10 flex flex-col items-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-zinc-600 text-sm">Uitnodiging controleren...</p>
            </div>
          )}

          {stap === "fout" && (
            <div className="p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
              <h2 className="font-semibold text-zinc-900 mb-1">Uitnodiging niet gevonden</h2>
              <p className="text-zinc-500 text-sm">
                Deze activatielink is ongeldig. Vraag uw beheerder om een nieuwe uitnodiging.
              </p>
            </div>
          )}

          {stap === "verlopen" && (
            <div className="p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
              <h2 className="font-semibold text-zinc-900 mb-1">Uitnodiging verlopen</h2>
              <p className="text-zinc-500 text-sm">
                Deze activatielink is verlopen (geldig voor 7 dagen). Vraag uw beheerder om een nieuwe uitnodiging.
              </p>
            </div>
          )}

          {stap === "al_actief" && (
            <div className="p-8 text-center">
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <h2 className="font-semibold text-zinc-900 mb-1">Account al in gebruik</h2>
              <p className="text-zinc-500 text-sm mb-4">
                Dit account is al in gebruik — log gewoon in via de inlogpagina. Deze
                activatielink is niet meer nodig.
              </p>
              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                onClick={() => { window.location.href = BASE + "/"; }}
              >
                Naar inlogpagina
              </Button>
            </div>
          )}

          {stap === "gegevens" && gebruiker && (
            <div className="p-8">
              <h2 className="font-semibold text-zinc-900 text-xl mb-1">
                Welkom, {gebruiker.naam}
              </h2>
              <p className="text-zinc-500 text-sm mb-6">
                Stel uw wachtwoord en taalvoorkeur in om uw account te activeren.
              </p>
              <div className="space-y-4">
                <div>
                  <Label className="text-zinc-700 text-sm font-medium">E-mailadres</Label>
                  <Input
                    value={gebruiker.email}
                    disabled
                    className="mt-1 bg-zinc-50 text-zinc-500"
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
                <div>
                  <Label className="text-zinc-700 text-sm font-medium">Voorkeurstaal</Label>
                  <Select value={taal} onValueChange={setTaal}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TALEN.map((t) => (
                        <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {foutmelding && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                    {foutmelding}
                  </p>
                )}
                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-white mt-2"
                  onClick={activeer}
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
              {totpSecret && (
                <div className="mb-5 space-y-1.5">
                  <p className="text-center text-xs font-medium text-zinc-400">
                    Kunt u niet scannen (bijv. op deze telefoon)? Voer de sleutel handmatig in:
                  </p>
                  <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                    <code className="min-w-0 flex-1 break-all font-mono text-sm text-zinc-700">{totpSecret}</code>
                    <button
                      type="button"
                      title="Sleutel kopiëren"
                      aria-label="Sleutel kopiëren"
                      className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700"
                      onClick={() => {
                        navigator.clipboard.writeText(totpSecret).then(() => {
                          setSecretGekopieerd(true);
                          setTimeout(() => setSecretGekopieerd(false), 2000);
                        }).catch(() => {});
                      }}
                    >
                      {secretGekopieerd ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  {secretGekopieerd && (
                    <p className="text-center text-xs text-green-600">Gekopieerd — plak de sleutel in uw authenticator-app.</p>
                  )}
                  {otpauthUrl && navigator.maxTouchPoints > 0 && (
                    <a
                      href={otpauthUrl}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100"
                    >
                      <Smartphone className="h-4 w-4 shrink-0" />
                      Direct openen in uw authenticator-app
                    </a>
                  )}
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
                  Account activeren
                </Button>
              </div>
            </div>
          )}

          {stap === "klaar" && (
            <div className="p-8">
              <div className="text-center mb-6">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <h2 className="font-semibold text-zinc-900 text-xl mb-2">Account geactiveerd</h2>
                <p className="text-zinc-500 text-sm">
                  Uw account is actief. U kunt nu inloggen op FPS Connect.
                </p>
              </div>

              {/* App-installatie sectie */}
              <div className="border border-zinc-100 rounded-lg bg-zinc-50 p-4 mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Smartphone className="h-4 w-4 text-zinc-600 shrink-0" />
                  <p className="font-semibold text-sm text-zinc-800">FPS Connect ook op uw telefoon</p>
                </div>
                <p className="text-xs text-zinc-500 mb-3">
                  Installeer FPS Connect als app op uw smartphone voor snelle toegang, ook onderweg.
                </p>

                {/* QR-code (indien beschikbaar) */}
                {pwaUrl && !pwaQrFout && (
                  <div className="flex justify-center mb-3">
                    <img
                      src={`${BASE}/api/auth/pwa-qr`}
                      alt="QR-code om FPS Connect te openen"
                      className="w-32 h-32 border border-zinc-200 rounded-lg bg-white"
                      onError={() => setPwaQrFout(true)}
                    />
                  </div>
                )}

                <div className="space-y-3 text-xs text-zinc-600">
                  <div>
                    <p className="font-semibold text-zinc-700 mb-1">iPhone / iPad (Safari)</p>
                    <ol className="list-decimal list-inside space-y-0.5">
                      <li>Open de link hieronder in <strong>Safari</strong></li>
                      <li>Tik op het deelicoon onderaan het scherm</li>
                      <li>Kies <strong>&ldquo;Zet op beginscherm&rdquo;</strong> en bevestig</li>
                    </ol>
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-700 mb-1">Android (Chrome)</p>
                    <ol className="list-decimal list-inside space-y-0.5">
                      <li>Open de link hieronder in <strong>Chrome</strong></li>
                      <li>Tik op het menu (⋮) rechtsboven</li>
                      <li>Kies <strong>&ldquo;App installeren&rdquo;</strong> of &ldquo;Toevoegen aan beginscherm&rdquo;</li>
                    </ol>
                  </div>
                </div>

                {pwaUrl && (
                  <div className="mt-3 flex items-center gap-2 bg-white rounded border border-zinc-200 px-2.5 py-2">
                    <QrCode className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <span className="text-xs font-mono text-zinc-500 flex-1 truncate">{pwaUrl}</span>
                  </div>
                )}
              </div>

              <Button
                className="w-full bg-primary hover:bg-primary/90 text-white"
                onClick={() => { window.location.href = BASE + "/"; }}
              >
                Doorgaan naar FPS Connect
              </Button>
            </div>
          )}
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          FPS Connect &bull; Vragen? Neem contact op met uw beheerder.
        </p>
      </div>
    </div>
  );
}
