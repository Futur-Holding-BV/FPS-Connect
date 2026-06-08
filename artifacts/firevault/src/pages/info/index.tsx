import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Info,
  Scale,
  History,
  ShieldCheck,
  Lock,
  Phone,
  Mail,
  Globe,
  Pencil,
  Save,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  APP_VERSIE,
  APP_UITGEBRACHT_OP,
  APP_LEVERANCIER,
  WIJZIGINGSLOGBOEK,
} from "@/lib/app-info";
import { useGetInfoInstellingen, useUpdateInfoInstellingen } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function InfoPagina() {
  const { gebruiker } = useAuth();
  const queryClient = useQueryClient();
  const isHoofdBeheerder = gebruiker?.rol === "hoofdbeheerder";

  const { data: instellingen } = useGetInfoInstellingen();
  const updateInstellingen = useUpdateInfoInstellingen();

  const [bewerken, setBewerken] = useState(false);
  const [velden, setVelden] = useState({
    support_email: "",
    support_telefoon: "",
    support_website: "",
    extra_disclaimer: "",
  });

  function startBewerken() {
    setVelden({
      support_email: instellingen?.support_email ?? "",
      support_telefoon: instellingen?.support_telefoon ?? "",
      support_website: instellingen?.support_website ?? "",
      extra_disclaimer: instellingen?.extra_disclaimer ?? "",
    });
    setBewerken(true);
  }

  async function opslaan() {
    await updateInstellingen.mutateAsync({
      data: {
        support_email: velden.support_email || undefined,
        support_telefoon: velden.support_telefoon || undefined,
        support_website: velden.support_website || undefined,
        extra_disclaimer: velden.extra_disclaimer || undefined,
      },
    });
    queryClient.invalidateQueries();
    setBewerken(false);
  }

  const heeftSupportInfo =
    instellingen &&
    (instellingen.support_email ||
      instellingen.support_telefoon ||
      instellingen.support_website);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-lg">
          <Info className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">App-informatie</h1>
          <p className="text-sm text-muted-foreground">
            Versiebeheer, juridische verantwoordelijkheid en ondersteuning
          </p>
        </div>
      </div>

      {/* Over de applicatie */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Over de applicatie
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Applicatie</dt>
              <dd className="text-sm font-medium">{APP_LEVERANCIER}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Versie</dt>
              <dd className="text-sm font-medium">
                <Badge variant="outline" className="font-mono">
                  v{APP_VERSIE}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Uitgebracht op</dt>
              <dd className="text-sm font-medium">{formatDatum(APP_UITGEBRACHT_OP)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Leverancier</dt>
              <dd className="text-sm font-medium">{APP_LEVERANCIER}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Privacybeleid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-5 w-5 text-primary" />
            Privacybeleid en gegevensverwerking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            {APP_LEVERANCIER} verwerkt persoonsgegevens uitsluitend in het kader
            van het leveren van de dienst. De verwerking beperkt zich tot gegevens
            die noodzakelijk zijn voor de registratie en het beheer van
            brandpreventieve gebouwvoorzieningen, zoals naam, e-mailadres, gebruikersrol
            en activiteitenlogboek.
          </p>
          <p>
            Gegevens worden opgeslagen in een beveiligde omgeving en worden niet
            gedeeld met derden tenzij dit wettelijk verplicht is. Gebruikers hebben
            te allen tijde recht op inzage, correctie en verwijdering van hun
            persoonsgegevens conform de Algemene Verordening Gegevensbescherming (AVG).
          </p>
          <p>
            Voor vragen over de verwerking van persoonsgegevens of het uitoefenen
            van privacyrechten kunt u contact opnemen via de supportgegevens
            onderaan deze pagina.
          </p>
        </CardContent>
      </Card>

      {/* Veiligheidsdisclaimer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Veiligheidsdisclaimer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            De informatie en registraties in {APP_LEVERANCIER} zijn bedoeld als
            ondersteunend hulpmiddel bij het beheer van brandveiligheidsvoorzieningen.
            De applicatie geeft geen garantie over de daadwerkelijke brandveiligheid
            van een gebouw of installatie.
          </p>
          <p>
            Inspecties, keuringen en onderhoud dienen uitsluitend te worden uitgevoerd
            door gecertificeerde en bevoegde personen, conform de geldende wet- en
            regelgeving, NEN-normen en de eisen van het bevoegd gezag.
            Een digitale registratie vervangt nooit een fysieke controle ter plaatse.
          </p>
          <p>
            Bij calamiteiten of twijfel over de brandveiligheid dient altijd een
            bevoegde instantie te worden geraadpleegd. Het gebruik van deze
            applicatie ontslaat de gebruiker, beheerder of gebouweigenaar niet van
            hun wettelijke verplichtingen op het gebied van brandveiligheid.
          </p>
        </CardContent>
      </Card>

      {/* Juridische verantwoordelijkheid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-5 w-5 text-primary" />
            Juridische verantwoordelijkheid
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            {APP_LEVERANCIER} is een hulpmiddel voor het registreren, beheren en
            inspecteren van brandpreventieve gebouwvoorzieningen. De applicatie
            ondersteunt bij het vastleggen en plannen van werkzaamheden, maar
            vervangt niet het professionele oordeel van bevoegde inspecteurs,
            monteurs of de verantwoordelijke gebouweigenaar.
          </p>
          <p>
            De gebruiker en de gebouweigenaar blijven te allen tijde zelf
            verantwoordelijk voor het naleven van de geldende wet- en regelgeving
            op het gebied van brandveiligheid, waaronder het Bouwbesluit en de
            van toepassing zijnde NEN-normen. {APP_LEVERANCIER} aanvaardt geen
            aansprakelijkheid voor schade die voortvloeit uit onjuiste, onvolledige
            of verouderde gegevens, noch uit beslissingen die op basis van de in de
            applicatie getoonde informatie zijn genomen.
          </p>
          <p>
            Controleer ingevoerde gegevens zorgvuldig en raadpleeg bij twijfel
            altijd een gecertificeerde specialist. Alle rechten voorbehouden.
            Ongeoorloofd gebruik of verspreiding van de applicatie of haar inhoud
            is niet toegestaan.
          </p>
        </CardContent>
      </Card>

      {/* Ondersteuning */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base justify-between">
            <span className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Ondersteuning
            </span>
            {isHoofdBeheerder && !bewerken && (
              <Button variant="ghost" size="sm" onClick={startBewerken}>
                <Pencil className="h-4 w-4 mr-1" /> Bewerken
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bewerken ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="support_email">E-mailadres</Label>
                  <Input
                    id="support_email"
                    type="email"
                    placeholder="support@voorbeeld.nl"
                    value={velden.support_email}
                    onChange={(e) =>
                      setVelden((v) => ({ ...v, support_email: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="support_telefoon">Telefoonnummer</Label>
                  <Input
                    id="support_telefoon"
                    type="tel"
                    placeholder="+31 (0)20 123 4567"
                    value={velden.support_telefoon}
                    onChange={(e) =>
                      setVelden((v) => ({ ...v, support_telefoon: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="support_website">Website</Label>
                  <Input
                    id="support_website"
                    type="url"
                    placeholder="https://www.voorbeeld.nl"
                    value={velden.support_website}
                    onChange={(e) =>
                      setVelden((v) => ({ ...v, support_website: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="extra_disclaimer">Aanvullende toelichting</Label>
                  <Textarea
                    id="extra_disclaimer"
                    placeholder="Optionele aanvullende tekst voor de supportpagina..."
                    rows={3}
                    value={velden.extra_disclaimer}
                    onChange={(e) =>
                      setVelden((v) => ({ ...v, extra_disclaimer: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={opslaan}
                  disabled={updateInstellingen.isPending}
                  size="sm"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {updateInstellingen.isPending ? "Opslaan..." : "Opslaan"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBewerken(false)}>
                  <X className="h-4 w-4 mr-1" /> Annuleren
                </Button>
              </div>
            </div>
          ) : heeftSupportInfo ? (
            <dl className="space-y-3 text-sm">
              {instellingen?.support_email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <dt className="text-xs text-muted-foreground">E-mail</dt>
                    <dd>
                      <a
                        href={`mailto:${instellingen.support_email}`}
                        className="text-primary hover:underline"
                      >
                        {instellingen.support_email}
                      </a>
                    </dd>
                  </div>
                </div>
              )}
              {instellingen?.support_telefoon && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Telefoon</dt>
                    <dd>
                      <a
                        href={`tel:${instellingen.support_telefoon}`}
                        className="hover:underline"
                      >
                        {instellingen.support_telefoon}
                      </a>
                    </dd>
                  </div>
                </div>
              )}
              {instellingen?.support_website && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Website</dt>
                    <dd>
                      <a
                        href={instellingen.support_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {instellingen.support_website}
                      </a>
                    </dd>
                  </div>
                </div>
              )}
              {instellingen?.extra_disclaimer && (
                <p className="text-muted-foreground pt-2 border-t">
                  {instellingen.extra_disclaimer}
                </p>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isHoofdBeheerder
                ? "Klik op 'Bewerken' om supportgegevens in te voeren."
                : "Er zijn nog geen supportgegevens ingevoerd. Neem contact op met uw systeembeheerder."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Versiebeheer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-primary" />
            Versiebeheer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {WIJZIGINGSLOGBOEK.map((wijziging) => (
              <div key={wijziging.versie} className="border-l-2 border-primary/30 pl-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    v{wijziging.versie}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDatum(wijziging.datum)}
                  </span>
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {wijziging.punten.map((punt, i) => (
                    <li key={i}>{punt}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="pt-2 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} {APP_LEVERANCIER} &middot; v{APP_VERSIE}
      </p>
    </div>
  );
}
