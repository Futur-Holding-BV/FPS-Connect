import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ArrowLeft, KeyRound, CheckCircle, Eye, EyeOff } from "lucide-react";
import { wachtwoordReset } from "@workspace/api-client-react";
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
import { Link } from "wouter";

interface Props {
  token: string;
}

export default function WachtwoordResetPagina({ token }: Props) {
  const { t } = useTranslation();
  const [nieuwWachtwoord, setNieuwWachtwoord] = useState("");
  const [bevestig, setBevestig] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gelukt, setGelukt] = useState(false);
  const [toonNieuw, setToonNieuw] = useState(false);
  const [toonBevestig, setToonBevestig] = useState(false);
  const nieuwRef = useRef<HTMLInputElement>(null);
  const bevestigRef = useRef<HTMLInputElement>(null);

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (bezig) return;
    setFout(null);

    // Lees de werkelijke veldwaarden uit bij verzenden zodat browser-autofill
    // (met name Firefox, dat geen change-event vuurt) altijd wordt meegenomen.
    const nieuwWaarde = nieuwRef.current?.value ?? nieuwWachtwoord;
    const bevestigWaarde = bevestigRef.current?.value ?? bevestig;

    if (nieuwWaarde.length < 8) {
      setFout(t("auth.resetFoutMinimaal"));
      return;
    }
    if (nieuwWaarde !== bevestigWaarde) {
      setFout(t("auth.resetFoutOvereen"));
      return;
    }

    setBezig(true);
    try {
      await wachtwoordReset({ token, nieuw_wachtwoord: nieuwWaarde });
      setGelukt(true);
    } catch {
      setFout(t("auth.resetFoutToken"));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="bg-white rounded-2xl shadow-lg px-6 py-3 mb-4">
            <img src="/logo-fps-one.png" alt="FPS One" className="h-16 w-auto object-contain" />
          </div>
          <p className="text-sm text-slate-400">{t("auth.ondertitel")}</p>
        </div>

        <Card className="shadow-xl border-slate-200">
          {!gelukt ? (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  {t("auth.resetTitel")}
                </CardTitle>
                <CardDescription>{t("auth.resetUitleg")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={verstuur} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nieuw">{t("auth.resetNieuwWachtwoord")}</Label>
                    <div className="relative">
                      <Input
                        id="nieuw"
                        name="nieuw-wachtwoord"
                        ref={nieuwRef}
                        type={toonNieuw ? "text" : "password"}
                        autoComplete="new-password"
                        defaultValue={nieuwWachtwoord}
                        onChange={(e) => setNieuwWachtwoord(e.target.value)}
                        className="pr-10"
                        required
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setToonNieuw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        title={toonNieuw ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                      >
                        {toonNieuw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bevestig">{t("auth.resetBevestig")}</Label>
                    <div className="relative">
                      <Input
                        id="bevestig"
                        name="bevestig-wachtwoord"
                        ref={bevestigRef}
                        type={toonBevestig ? "text" : "password"}
                        autoComplete="new-password"
                        defaultValue={bevestig}
                        onChange={(e) => setBevestig(e.target.value)}
                        className="pr-10"
                        required
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setToonBevestig((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        title={toonBevestig ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                      >
                        {toonBevestig ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {fout && <p className="text-sm text-destructive">{fout}</p>}
                  <Button type="submit" className="w-full" disabled={bezig}>
                    {bezig && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("auth.resetKnop")}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  {t("auth.resetTitel")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("auth.resetGelukt")}
                </p>
              </CardContent>
            </>
          )}
          <div className="px-6 pb-5">
            <Link href="/">
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("auth.terugnaarInloggen")}
              </button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
