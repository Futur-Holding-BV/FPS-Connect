// /mijn/mail-voorkeuren — per gebruiker instelbare e-mailmeldingen.
// Gebruikt het bestaande gebruiker_voorkeuren-mechanisme (PANEEL_01 §4.4).
// Fail-open: geen voorkeur opgeslagen = e-mail aan. Expliciet false = uit.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetMijnVoorkeuren, useZetMijnVoorkeur, useVerwijderMijnVoorkeur } from "@workspace/api-client-react";
import { Bell, BellOff, Mail, Inbox } from "lucide-react";

// ── Categoriedefinities (zelfde volgorde als MAIL_CATEGORIE_LABELS op de server) ──
const CATEGORIEEN = [
  {
    sleutel: "email.planning_melding",
    titel: "Planning-herinneringen",
    beschrijving:
      "Dagelijks overzicht van aanvraag-planningsdeadlines die binnen 4 dagen vervallen.",
  },
  {
    sleutel: "email.reactietermijn_melding",
    titel: "Verstreken reactietermijn",
    beschrijving:
      "Melding wanneer een reactietermijn op een definitief rapport is verstreken zonder klantreactie.",
  },
  {
    sleutel: "email.portaal_klantvraag",
    titel: "Klantvragen via portaal",
    beschrijving:
      "Notificatie wanneer een klant een vraag of wijzigingsverzoek indient via het offerteportaal.",
  },
  {
    sleutel: "email.portaal_ondertekening",
    titel: "Offerte ondertekend",
    beschrijving:
      "Notificatie wanneer een klant een offerte ondertekent via het portaal.",
  },
  {
    sleutel: "email.portaal_afwijzing",
    titel: "Offerte afgewezen",
    beschrijving:
      "Notificatie wanneer een klant een offerte afwijst via het portaal.",
  },
] as const;

type MailSleutel = (typeof CATEGORIEEN)[number]["sleutel"];

export default function MailVoorkeurenPagina() {
  const { data: voorkeuren, isLoading, isError } = useGetMijnVoorkeuren();
  const { mutate: zetVoorkeur } = useZetMijnVoorkeur();
  const { mutate: verwijderVoorkeur } = useVerwijderMijnVoorkeur();

  // Lokale state: true = e-mail aan (default), false = uitgeschakeld.
  const [lokaal, setLokaal] = useState<Record<MailSleutel, boolean>>(() =>
    Object.fromEntries(CATEGORIEEN.map((c) => [c.sleutel, true])) as Record<MailSleutel, boolean>,
  );
  const [geinitialiseerd, setGeinitialiseerd] = useState(false);

  // Éénmalig initialiseren vanuit serverdata.
  useEffect(() => {
    if (!voorkeuren || geinitialiseerd) return;
    const bron = voorkeuren as Record<string, unknown>;
    const start: Record<MailSleutel, boolean> = Object.fromEntries(
      CATEGORIEEN.map((c) => {
        const waarde = bron[c.sleutel];
        // Fail-open: niet aanwezig of niet false → aan.
        return [c.sleutel, waarde !== false];
      }),
    ) as Record<MailSleutel, boolean>;
    setLokaal(start);
    setGeinitialiseerd(true);
  }, [voorkeuren, geinitialiseerd]);

  function handleWissel(sleutel: MailSleutel, nieuweWaarde: boolean) {
    setLokaal((huidig) => ({ ...huidig, [sleutel]: nieuweWaarde }));

    if (nieuweWaarde) {
      // Terug naar standaard (aan) = voorkeur verwijderen zodat fail-open geldt.
      verwijderVoorkeur({ sleutel });
    } else {
      // Uitschakelen = expliciet false opslaan.
      zetVoorkeur({ sleutel, data: { waarde: false } });
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Mail className="h-6 w-6 text-muted-foreground" />
          E-mailmeldingen
        </h1>
        <p className="text-sm text-muted-foreground">
          Kies welke e-mailmeldingen je wilt ontvangen. Wijzigingen worden direct
          opgeslagen. Kritieke berichten (uitnodigingen, wachtwoordherstel) worden altijd
          verstuurd.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Notificaties</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {isError && (
            <p className="py-4 text-sm text-destructive">
              Voorkeuren konden niet worden geladen. Probeer het later opnieuw.
            </p>
          )}

          {isLoading &&
            CATEGORIEEN.map((c) => (
              <div key={c.sleutel} className="flex items-center justify-between py-4">
                <div className="space-y-1.5 flex-1 pr-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
                <Skeleton className="h-6 w-10 rounded-full" />
              </div>
            ))}

          {!isLoading &&
            !isError &&
            CATEGORIEEN.map((c) => {
              const aan = lokaal[c.sleutel] ?? true;
              return (
                <div key={c.sleutel} className="flex items-start justify-between py-4 gap-4">
                  <div className="space-y-0.5 flex-1">
                    <div className="flex items-center gap-1.5">
                      {aan ? (
                        <Bell className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <BellOff className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-medium">{c.titel}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-5.5">{c.beschrijving}</p>
                    {!aan && (
                      <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-2 py-1 mt-1.5 ml-5.5">
                        <Inbox className="h-3.5 w-3.5 shrink-0" />
                        In-app inbox-items voor dit type blijven ongewijzigd beschikbaar in de werkbak.
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={aan}
                    onCheckedChange={(v) => handleWissel(c.sleutel, v)}
                    aria-label={`${c.titel} ${aan ? "uitschakelen" : "inschakelen"}`}
                  />
                </div>
              );
            })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Standaard zijn alle e-mailmeldingen ingeschakeld. Schakel je een melding uit, dan
        geldt dat alleen voor jouw account — andere gebruikers worden niet beïnvloed.
      </p>
    </div>
  );
}
