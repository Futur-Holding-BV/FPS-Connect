import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, KeyRound, ArrowLeft, Eye, EyeOff, Globe, ChevronDown, Copy, Check, Smartphone } from "lucide-react";
import {
  login,
  tweeFactorSetup,
  tweeFactorActiveren,
  tweeFactorVerify,
  taalWijzigen,
  ApiError,
  type TweeFactorSetup,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/context/auth-context";
import { useTaal } from "@/context/taal-context";
import { useToast } from "@/hooks/use-toast";
import { TALEN } from "@/i18n/talen";

type Stap = "inloggen" | "setup" | "verify";

function TaalSelector({
  taal,
  zetTaal,
  onKeuze,
}: {
  taal: string;
  zetTaal: (code: string, persist?: boolean) => void;
  onKeuze: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const huidig = TALEN.find((t) => t.code === taal) ?? TALEN[0];

  useEffect(() => {
    function klik(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", klik);
    return () => document.removeEventListener("mousedown", klik);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 transition-all hover:border-white/20 hover:bg-white/8 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#F23B0D]/50"
        aria-label="Taal selecteren"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="text-base leading-none">{huidig.vlag}</span>
        <span className="hidden sm:inline">{huidig.naam}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Taal kiezen"
          className="absolute right-0 z-50 mt-1.5 min-w-[160px] rounded-xl border border-white/10 bg-[#111827]/95 py-1 shadow-xl backdrop-blur-xl"
        >
          {TALEN.map((item) => (
            <button
              key={item.code}
              role="option"
              aria-selected={taal === item.code}
              type="button"
              onClick={() => {
                zetTaal(item.code, true);
                onKeuze();
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-white/8 ${
                taal === item.code
                  ? "text-white bg-[#F23B0D]/15"
                  : "text-white/70"
              }`}
            >
              <span className="text-base leading-none">{item.vlag}</span>
              <span>{item.naam}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AchtergrondCanvas() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {/* Basis gradient */}
      <div className="absolute inset-0 bg-[#080d1a]" />

      {/* Subtiel grid */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Lichtaccent boven-rechts — primaire tint */}
      <div
        className="absolute -right-32 -top-32 h-[600px] w-[600px] animate-[fps-pulse_8s_ease-in-out_infinite] rounded-full opacity-[0.10]"
        style={{
          background:
            "radial-gradient(circle at center, #F23B0D 0%, #ff6b35 30%, transparent 70%)",
        }}
      />

      {/* Lichtaccent midden-links — koelblauw */}
      <div
        className="absolute -left-24 top-1/3 h-[480px] w-[480px] animate-[fps-pulse_11s_ease-in-out_infinite_2s] rounded-full opacity-[0.07]"
        style={{
          background:
            "radial-gradient(circle at center, #3b7bf5 0%, #1e40af 40%, transparent 70%)",
        }}
      />

      {/* Lichtaccent onder */}
      <div
        className="absolute bottom-0 left-1/2 h-[320px] w-[640px] -translate-x-1/2 opacity-[0.06]"
        style={{
          background:
            "radial-gradient(ellipse at top, #3b7bf5 0%, transparent 70%)",
        }}
      />

      {/* Architectuurlijnen — diagonale streep */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.04]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="fps-lines" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <line x1="0" y1="200" x2="200" y2="0" stroke="white" strokeWidth="0.5" />
            <line x1="-100" y1="200" x2="100" y2="0" stroke="white" strokeWidth="0.5" />
            <line x1="100" y1="200" x2="300" y2="0" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#fps-lines)" />
      </svg>
    </div>
  );
}

export default function LoginPagina() {
  const { herlaad } = useAuth();
  const { t } = useTranslation();
  const { taal, zetTaal } = useTaal();
  const { toast } = useToast();
  const [stap, setStap] = useState<Stap>("inloggen");
  const [gekopieerd, setGekopieerd] = useState(false);
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [code, setCode] = useState("");
  const [setupData, setSetupData] = useState<TweeFactorSetup | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [taalGekozen, setTaalGekozen] = useState(false);
  const [toonWachtwoord, setToonWachtwoord] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const wachtwoordRef = useRef<HTMLInputElement>(null);

  async function verstuurInloggen(e: React.FormEvent) {
    e.preventDefault();
    if (bezig) return;
    setFout(null);
    setBezig(true);
    try {
      // Lees de werkelijke veldwaarden uit bij verzenden. Browser-autofill
      // (met name Firefox) vult velden soms zonder een change-event te vuren,
      // waardoor de React-state leeg/verouderd blijft. Val terug op de state
      // wanneer de ref (nog) niet beschikbaar is.
      const emailWaarde = emailRef.current?.value ?? email;
      const wachtwoordWaarde = wachtwoordRef.current?.value ?? wachtwoord;
      const resultaat = await login({
        email: emailWaarde,
        wachtwoord: wachtwoordWaarde,
      });
      setCode("");
      if (resultaat.status === "ingelogd") {
        // 2FA-vrijgesteld serviceaccount (smoketest): sessie is al volledig.
        window.location.assign(import.meta.env.BASE_URL);
        return;
      }
      if (resultaat.status === "setup_2fa") {
        const data = await tweeFactorSetup();
        setSetupData(data);
        setStap("setup");
      } else {
        setStap("verify");
      }
    } catch (err) {
      setFout(inlogFoutMelding(err));
    } finally {
      setBezig(false);
    }
  }

  // Vertaalt een mislukte inlogpoging naar een begrijpelijke, onderscheidende
  // melding. Zonder dit onderscheid kreeg de gebruiker bij een tijdelijk
  // vergrendeld account (423) of te veel pogingen (429) dezelfde tekst als bij
  // een verkeerd wachtwoord (401), waardoor doorproberen het probleem verergerde.
  function inlogFoutMelding(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 423) return t("auth.foutVergrendeld");
      if (err.status === 429) return t("auth.foutTeVeelPogingen");
      if (err.status >= 500) return t("auth.foutServer");
    }
    return t("auth.foutInlog");
  }

  async function bevestigCode(huidigeCode: string) {
    if (bezig || huidigeCode.length !== 6) return;
    setFout(null);
    setBezig(true);
    try {
      const ingelogd =
        stap === "setup"
          ? await tweeFactorActiveren({ code: huidigeCode })
          : await tweeFactorVerify({ code: huidigeCode });
      if (ingelogd.nieuw_apparaat || ingelogd.nieuw_ip) {
        const signalen: string[] = [];
        if (ingelogd.nieuw_apparaat) signalen.push("een nieuw apparaat");
        if (ingelogd.nieuw_ip) signalen.push("een nieuw IP-adres");
        toast({
          title: "Nieuwe aanmelding gedetecteerd",
          description: `Je bent ingelogd vanaf ${signalen.join(" en ")}. Was jij dit niet? Neem contact op met je beheerder.`,
        });
      }
      if (taalGekozen) {
        try {
          await taalWijzigen({ taal });
        } catch {
          // Taalvoorkeur opslaan mag het inloggen niet blokkeren
        }
      }
      herlaad();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 423 || err.status === 429)) {
        setFout(inlogFoutMelding(err));
      } else {
        setFout(t("auth.foutCode"));
      }
      setCode("");
    } finally {
      setBezig(false);
    }
  }

  function naarInloggen() {
    setStap("inloggen");
    setCode("");
    setSetupData(null);
    setFout(null);
    setWachtwoord("");
    setBezig(false);
  }

  function wijzigCode(waarde: string) {
    setCode(waarde);
    if (waarde.length === 6) {
      void bevestigCode(waarde);
    }
  }

  return (
    <div className="fps-auth relative min-h-screen flex items-center justify-center p-4">
      <AchtergrondCanvas />

      {/* Taalkeuzebalk — rechtsbovenin */}
      {stap === "inloggen" && (
        <div className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6">
          <TaalSelector
            taal={taal}
            zetTaal={zetTaal}
            onKeuze={() => setTaalGekozen(true)}
          />
        </div>
      )}

      {/* Content */}
      <div
        className="relative z-10 w-full max-w-md animate-[fps-fadeup_0.5s_ease-out_both]"
      >
        {/* Logo + introductie */}
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src={`${import.meta.env.BASE_URL}logo-fps-one.png`}
            alt="FPS One"
            className="mb-5 h-14 w-auto drop-shadow-[0_0_24px_rgba(242,59,13,0.4)] object-contain"
          />
          <p className="text-sm font-medium tracking-wide text-white/40 uppercase">
            {t("auth.ondertitel")}
          </p>
        </div>

        {/* Glassmorphism kaart */}
        <div
          className="rounded-2xl border border-white/[0.09] bg-white/[0.05] shadow-[0_8px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
          style={{ WebkitBackdropFilter: "blur(24px)" }}
        >
          {stap === "inloggen" && (
            <div className="p-7 sm:p-8">
              <div className="mb-6">
                <h1 className="text-xl font-semibold text-white">
                  {t("auth.inloggenTitel")}
                </h1>
                <p className="mt-1 text-sm text-white/50">
                  {t("auth.inloggenUitleg")}
                </p>
              </div>

              <form onSubmit={verstuurInloggen} className="space-y-5">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-sm font-medium text-white/70"
                  >
                    {t("auth.email")}
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    ref={emailRef}
                    type="email"
                    autoComplete="username"
                    placeholder="naam@bedrijf.nl"
                    defaultValue={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="border-white/10 bg-white/[0.07] text-white placeholder:text-white/25 focus-visible:border-[#F23B0D]/60 focus-visible:ring-[#F23B0D]/20 focus-visible:ring-2 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="wachtwoord"
                    className="text-sm font-medium text-white/70"
                  >
                    {t("auth.wachtwoord")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="wachtwoord"
                      name="wachtwoord"
                      ref={wachtwoordRef}
                      type={toonWachtwoord ? "text" : "password"}
                      autoComplete="current-password"
                      defaultValue={wachtwoord}
                      onChange={(e) => setWachtwoord(e.target.value)}
                      className="border-white/10 bg-white/[0.07] pr-10 text-white placeholder:text-white/25 focus-visible:border-[#F23B0D]/60 focus-visible:ring-[#F23B0D]/20 focus-visible:ring-2 transition-all"
                      required
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setToonWachtwoord((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-white/60 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F23B0D]/50"
                      title={toonWachtwoord ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                      aria-label={toonWachtwoord ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                    >
                      {toonWachtwoord ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {fout && (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                  >
                    {fout}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={bezig}
                  className="group relative w-full overflow-hidden rounded-xl bg-[#F23B0D] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(242,59,13,0.35)] transition-all duration-150 hover:bg-[#d4330b] hover:shadow-[0_4px_20px_rgba(242,59,13,0.5)] active:translate-y-px active:shadow-[0_2px_8px_rgba(242,59,13,0.3)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  <span className="flex items-center justify-center gap-2">
                    {bezig && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("auth.inloggenKnop")}
                  </span>
                </button>

                <div className="text-center">
                  <a
                    href={`${import.meta.env.BASE_URL}wachtwoord-vergeten`}
                    className="text-sm text-white/35 transition-colors hover:text-white/60"
                  >
                    {t("auth.wachtwoordVergeten")}
                  </a>
                </div>
              </form>
            </div>
          )}

          {stap === "setup" && setupData && (
            <div className="p-7 sm:p-8 space-y-5">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F23B0D]/20">
                    <KeyRound className="h-4 w-4 text-[#F23B0D]" />
                  </div>
                  <h1 className="text-xl font-semibold text-white">
                    {t("auth.setupTitel")}
                  </h1>
                </div>
                <p className="mt-1 text-sm text-white/50">
                  {t("auth.setupUitleg")}
                </p>
              </div>

              <div className="flex justify-center">
                <div className="rounded-xl border border-white/10 bg-white p-2.5 shadow-lg">
                  <img
                    src={setupData.qr_code}
                    alt="QR-code voor authenticator"
                    className="h-44 w-44 rounded"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-center text-xs font-medium text-white/40">
                  {t("auth.handmatigeSleutelLabel")}
                </p>
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3">
                  <code className="min-w-0 flex-1 break-all font-mono text-sm text-white/80">
                    {setupData.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(setupData.secret).then(() => {
                        setGekopieerd(true);
                        setTimeout(() => setGekopieerd(false), 2000);
                      }).catch(() => {});
                    }}
                    title={t("auth.handmatigeSleutelKopieer")}
                    aria-label={t("auth.handmatigeSleutelKopieer")}
                    className="shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
                  >
                    {gekopieerd ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {gekopieerd && (
                  <p className="text-center text-xs text-green-400">
                    {t("auth.gekopieerd")}
                  </p>
                )}
                {navigator.maxTouchPoints > 0 && (
                  <a
                    href={`otpauth://totp/${encodeURIComponent("FPS Connect:" + email)}?secret=${encodeURIComponent(setupData.secret)}&issuer=${encodeURIComponent("FPS Connect")}`}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white/90"
                  >
                    <Smartphone className="h-4 w-4 shrink-0" />
                    {t("auth.openInAuthApp")}
                  </a>
                )}
              </div>

              <div className="flex flex-col items-center gap-2">
                <Label className="text-sm font-medium text-white/70">
                  {t("auth.verifyTitel")}
                </Label>
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={wijzigCode}
                  disabled={bezig}
                  autoFocus
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {fout && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-sm text-red-300"
                >
                  {fout}
                </p>
              )}

              {bezig && (
                <div className="flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-[#F23B0D]" />
                </div>
              )}

              <button
                type="button"
                onClick={naarInloggen}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/50 transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white/80"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("auth.terug")}
              </button>
            </div>
          )}

          {stap === "verify" && (
            <div className="p-7 sm:p-8 space-y-5">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F23B0D]/20">
                    <KeyRound className="h-4 w-4 text-[#F23B0D]" />
                  </div>
                  <h1 className="text-xl font-semibold text-white">
                    {t("auth.verifyTitel")}
                  </h1>
                </div>
                <p className="mt-1 text-sm text-white/50">
                  {t("auth.verifyUitleg")}
                </p>
              </div>

              <div className="flex flex-col items-center gap-2">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={wijzigCode}
                  disabled={bezig}
                  autoFocus
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {fout && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-sm text-red-300"
                >
                  {fout}
                </p>
              )}

              {bezig && (
                <div className="flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-[#F23B0D]" />
                </div>
              )}

              <button
                type="button"
                onClick={naarInloggen}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/50 transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white/80"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("auth.terug")}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-white/20">
          FPS Brandpreventie &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
