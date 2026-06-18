import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ArrowLeft, MailCheck } from "lucide-react";
import { wachtwoordVergeten } from "@workspace/api-client-react";
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

export default function WachtwoordVergetenPagina() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [bezig, setBezig] = useState(false);
  const [verzonden, setVerzonden] = useState(false);

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (bezig) return;
    setBezig(true);
    try {
      await wachtwoordVergeten({ email: email.trim().toLowerCase() });
    } catch {
      // Altijd succesmelding tonen (geen e-mail-enumeratie)
    } finally {
      setVerzonden(true);
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
          {!verzonden ? (
            <>
              <CardHeader>
                <CardTitle>{t("auth.vergetenTitel")}</CardTitle>
                <CardDescription>{t("auth.vergetenUitleg")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={verstuur} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("auth.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="naam@bedrijf.nl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={bezig}>
                    {bezig && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("auth.vergetenKnop")}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MailCheck className="h-5 w-5 text-primary" />
                  {t("auth.vergetenTitel")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("auth.vergetenVerzonden")}
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
