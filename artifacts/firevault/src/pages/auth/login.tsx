import { useState } from "react";
import { ShieldCheck, Loader2, KeyRound, ArrowLeft } from "lucide-react";
import {
  login,
  tweeFactorSetup,
  tweeFactorActiveren,
  tweeFactorVerify,
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

type Stap = "inloggen" | "setup" | "verify";

export default function LoginPagina() {
  const { herlaad } = useAuth();
  const [stap, setStap] = useState<Stap>("inloggen");
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [code, setCode] = useState("");
  const [setupData, setSetupData] = useState<TweeFactorSetup | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

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
      setFout("Onjuiste inloggegevens. Controleer uw e-mailadres en wachtwoord.");
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
      herlaad();
    } catch {
      setFout("Onjuiste of verlopen code. Probeer het opnieuw.");
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
          <h1 className="text-2xl font-bold text-white tracking-tight">FPS Brandpreventie</h1>
          <p className="text-sm text-slate-400">Beveiligd platform voor brandpreventie</p>
        </div>

        <Card className="shadow-xl border-slate-200">
          {stap === "inloggen" && (
            <>
              <CardHeader>
                <CardTitle>Inloggen</CardTitle>
                <CardDescription>
                  Voer uw e-mailadres en wachtwoord in om door te gaan.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={verstuurInloggen} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mailadres</Label>
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
                    <Label htmlFor="wachtwoord">Wachtwoord</Label>
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
                    Inloggen
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
                  Tweestapsverificatie instellen
                </CardTitle>
                <CardDescription>
                  Scan de QR-code met een authenticator-app (bijvoorbeeld Google
                  Authenticator of Microsoft Authenticator) en voer daarna de
                  6-cijferige code in.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <img
                    src={setupData.qr_code}
                    alt="QR-code voor tweestapsverificatie"
                    className="h-44 w-44 rounded-lg border bg-white p-2"
                  />
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">
                    Of voer deze sleutel handmatig in:
                  </p>
                  <code className="text-sm font-mono break-all">{setupData.secret}</code>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Label>Verificatiecode</Label>
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
                  Terug
                </Button>
              </CardContent>
            </>
          )}

          {stap === "verify" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  Verificatiecode
                </CardTitle>
                <CardDescription>
                  Voer de 6-cijferige code uit uw authenticator-app in.
                </CardDescription>
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
                  Terug
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
