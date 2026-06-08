import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Loader2, KeyRound, ArrowLeft } from "lucide-react";
import {
  login,
  tweeFactorSetup,
  tweeFactorActiveren,
  tweeFactorVerify,
  taalWijzigen,
  type TweeFactorSetup,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/context/auth-context";
import { useTaal } from "@/context/taal-context";
import { TALEN } from "@/i18n/talen";

type Stap = "inloggen" | "setup" | "verify";

export default function LoginPagina() {
  const { herlaad } = useAuth();
  const { t } = useTranslation();
  const { taal, zetTaal } = useTaal();
  const [stap, setStap] = useState<Stap>("inloggen");
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [code, setCode] = useState("");
  const [setupData, setSetupData] = useState<TweeFactorSetup | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [taalGekozen, setTaalGekozen] = useState(false);

  async function verstuurInloggen(e: React.FormEvent) {
    e.preventDefault();
    if (bezig) return;
    setFout(null);
    setBezig(true);
    try {
      const resultaat = await login({ email, wachtwoord });
      setCode("");
      if (resultaat.status === "setup_2fa") {
        const data = await tweeFactorSetup();
        setSetupData(data);
        setStap("setup");
      } else {
        setStap("verify");
      }
    } catch {
      setFout(t("auth.foutInlog"));
    } finally {
      setBezig(false);
    }
  }

  async function bevestigCode(huidigeCode: string) {
    if (bezig || huidigeCode.length !== 6) return;
    setFout(null);
    setBezig(true);
    try {
      if (stap === "setup") {
        await tweeFactorActiveren({ code: huidigeCode });
      } else {
        await tweeFactorVerify({ code: huidigeCode });
      }
      if (taalGekozen) {
        try {
          await taalWijzigen({ taal });
        } catch {
          // Taalvoorkeur opslaan mag het inloggen niet blokkeren
        }
      }
      herlaad();
    } catch {
      setFout(t("auth.foutCode"));
      setCode("");
      setBezig(false);
    }
  }

  function naarInloggen() {
    setStap("inloggen");
    setCode("");
    setSetupData(null);
    setFout(null);
    setWachtwoord("");
  }

  function wijzigCode(waarde: string) {
    setCode(waarde);
    if (waarde.length === 6) {
      void bevestigCode(waarde);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="bg-primary text-primary-foreground p-3 rounded-xl shadow-lg mb-3">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{t("app.naam")}</h1>
          <p className="text-sm text-slate-400">{t("auth.ondertitel")}</p>
        </div>

        {stap === "inloggen" && (
          <div className="mb-4">
            <p className="text-xs text-slate-400 text-center mb-2">{t("auth.taalKiezen")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {TALEN.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    zetTaal(item.code, true);
                    setTaalGekozen(true);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    taal === item.code
                      ? "border-primary bg-primary/15 text-white"
                      : "border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <span className="text-base leading-none">{item.vlag}</span>
                  <span>{item.naam}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Card className="shadow-xl border-slate-200">
          {stap === "inloggen" && (
            <>
              <CardHeader>
                <CardTitle>{t("auth.inloggenTitel")}</CardTitle>
                <CardDescription>{t("auth.inloggenUitleg")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={verstuurInloggen} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("auth.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="username"
                      placeholder="naam@bedrijf.nl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wachtwoord">{t("auth.wachtwoord")}</Label>
                    <Input
                      id="wachtwoord"
                      type="password"
                      autoComplete="current-password"
                      value={wachtwoord}
                      onChange={(e) => setWachtwoord(e.target.value)}
                      required
                    />
                  </div>
                  {fout && <p className="text-sm text-destructive">{fout}</p>}
                  <Button type="submit" className="w-full" disabled={bezig}>
                    {bezig && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("auth.inloggenKnop")}
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {stap === "setup" && setupData && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  {t("auth.setupTitel")}
                </CardTitle>
                <CardDescription>{t("auth.setupUitleg")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <img
                    src={setupData.qr_code}
                    alt="QR"
                    className="h-44 w-44 rounded-lg border bg-white p-2"
                  />
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <code className="text-sm font-mono break-all">{setupData.secret}</code>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Label>{t("auth.verifyTitel")}</Label>
                  <InputOTP maxLength={6} value={code} onChange={wijzigCode} disabled={bezig}>
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
                {fout && <p className="text-sm text-destructive text-center">{fout}</p>}
                {bezig && (
                  <div className="flex justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
                <Button variant="ghost" size="sm" className="w-full gap-2" onClick={naarInloggen}>
                  <ArrowLeft className="h-4 w-4" />
                  {t("auth.terug")}
                </Button>
              </CardContent>
            </>
          )}

          {stap === "verify" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  {t("auth.verifyTitel")}
                </CardTitle>
                <CardDescription>{t("auth.verifyUitleg")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col items-center gap-2">
                  <InputOTP maxLength={6} value={code} onChange={wijzigCode} disabled={bezig}>
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
                {fout && <p className="text-sm text-destructive text-center">{fout}</p>}
                {bezig && (
                  <div className="flex justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
                <Button variant="ghost" size="sm" className="w-full gap-2" onClick={naarInloggen}>
                  <ArrowLeft className="h-4 w-4" />
                  {t("auth.terug")}
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
