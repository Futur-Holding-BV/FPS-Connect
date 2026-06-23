import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetMijnPrivacyGegevens,
  useListMijnActiviteiten,
} from "@workspace/api-client-react";
import { ShieldCheck, User, Clock, Eye, BookOpen, Building, Briefcase, Mail, Phone } from "lucide-react";

const DIENSTVERBAND_LABELS: Record<string, string> = {
  vast: "Vaste medewerker",
  tijdelijk: "Tijdelijk contract",
  oproep: "Oproepkracht",
  stage: "Stagiair",
  inhuur: "Inhuur / onderaannemer",
  zzp: "ZZP-er",
  uitzend: "Uitzendkracht",
};

const ROL_LABELS: Record<string, string> = {
  hoofdbeheerder: "Hoofdbeheerder",
  gebruiker: "Gebruiker",
  klant: "Klant",
  monteur: "Monteur",
  controleur: "Controleur",
};

function fmtDatum(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-NL", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function fmtTijdstip(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("nl-NL", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function GegevensTab() {
  const { data, isLoading, isError } = useGetMijnPrivacyGegevens();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-destructive py-6 text-center">
        Gegevens konden niet worden geladen.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Naam</p>
              <p className="font-medium">{data.naam}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">E-mailadres</p>
              <p className="font-medium">{data.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rol</p>
              <Badge variant="secondary" className="text-xs mt-0.5">
                {ROL_LABELS[data.rol] ?? data.rol}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Account aangemaakt</p>
              <p className="font-medium">{fmtDatum(data.aangemaaktOp)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {data.medewerker ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              Medewerkergegevens
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Naam</p>
                <p className="font-medium">{data.medewerker.naam}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Werkmaatschappij</p>
                <p className="font-medium">{data.medewerker.werkmaatschappij}</p>
              </div>
              {data.medewerker.functie_naam && (
                <div>
                  <p className="text-xs text-muted-foreground">Functie</p>
                  <p className="font-medium">{data.medewerker.functie_naam}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Dienstverband</p>
                <p className="font-medium">
                  {DIENSTVERBAND_LABELS[data.medewerker.dienstverband] ?? data.medewerker.dienstverband}
                </p>
              </div>
              {data.medewerker.in_dienst_sinds && (
                <div>
                  <p className="text-xs text-muted-foreground">In dienst sinds</p>
                  <p className="font-medium">{fmtDatum(data.medewerker.in_dienst_sinds)}</p>
                </div>
              )}
              {data.medewerker.email && (
                <div>
                  <p className="text-xs text-muted-foreground">Werk-e-mail</p>
                  <p className="font-medium flex items-center gap-1">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    {data.medewerker.email}
                  </p>
                </div>
              )}
              {data.medewerker.telefoon && (
                <div>
                  <p className="text-xs text-muted-foreground">Telefoon</p>
                  <p className="font-medium flex items-center gap-1">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    {data.medewerker.telefoon}
                  </p>
                </div>
              )}
              {data.medewerker.mobiel && (
                <div>
                  <p className="text-xs text-muted-foreground">Mobiel</p>
                  <p className="font-medium flex items-center gap-1">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    {data.medewerker.mobiel}
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground border-t pt-3">
              Gevoelige persoonsgegevens zoals BSN worden niet in dit overzicht getoond.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground text-center">
            Er is geen medewerkersdossier gekoppeld aan dit account.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ActiviteitenTab() {
  const { data, isLoading, isError } = useListMijnActiviteiten();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive py-6 text-center">
        Activiteiten konden niet worden geladen.
      </p>
    );
  }

  const rijen = data ?? [];

  if (rijen.length === 0) {
    return (
      <div className="py-12 text-center">
        <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Nog geen activiteiten geregistreerd.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-3">
        Onderstaande lijst toont uw eigen acties in FPS Connect (maximaal 50 meest recente).
      </p>
      {rijen.map((r) => (
        <div
          key={r.id}
          className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium truncate">{r.omschrijving}</p>
            {r.gebouw_naam && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Building className="h-3 w-3" />
                {r.gebouw_naam}
              </p>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
            {fmtTijdstip(r.tijdstip)}
          </span>
        </div>
      ))}
    </div>
  );
}

const ZIE_MATRIX = [
  {
    categorie: "Accountgegevens (naam, e-mail, rol)",
    hoofdbeheerder: "Ja",
    gebruiker: "Eigen",
    klant: "Eigen",
    toelichting: "Hoofdbeheerder ziet alle accounts. Uzelf ziet alleen uw eigen gegevens.",
  },
  {
    categorie: "Activiteitenlog (wat u deed in Connect)",
    hoofdbeheerder: "Ja",
    gebruiker: "Eigen",
    klant: "Eigen",
    toelichting: "Alleen uw eigen acties zijn zichtbaar in dit privacycentrum.",
  },
  {
    categorie: "Medewerkergegevens (werkgever, functie, dienstverband)",
    hoofdbeheerder: "Ja",
    gebruiker: "Eigen",
    klant: "Niet",
    toelichting: "HRM-beheerders zien alle medewerkerprofielen; klanten hebben geen toegang.",
  },
  {
    categorie: "Gevoelige gegevens (BSN, noodcontact)",
    hoofdbeheerder: "Ja",
    gebruiker: "Niet",
    klant: "Niet",
    toelichting: "BSN en noodcontactgegevens zijn uitsluitend zichtbaar voor HRM-beheerders.",
  },
  {
    categorie: "Verlofaanvragen",
    hoofdbeheerder: "Ja",
    gebruiker: "Eigen",
    klant: "Niet",
    toelichting: "HRM-beheerders beoordelen aanvragen; klanten hebben geen inzage in verlof.",
  },
  {
    categorie: "Spots en uitvoering (wie heeft wat gedaan)",
    hoofdbeheerder: "Ja",
    gebruiker: "Beperkt",
    klant: "Beperkt",
    toelichting: "Monteur is zichtbaar op spots waaraan hij is toegewezen. Klant ziet het eindresultaat.",
  },
];

function BADGE_WIE(v: string) {
  if (v === "Ja") return <Badge className="text-[11px] px-1.5 py-0 bg-green-100 text-green-800 border-green-200 font-normal">Ja</Badge>;
  if (v === "Eigen") return <Badge variant="outline" className="text-[11px] px-1.5 py-0 font-normal">Eigen</Badge>;
  if (v === "Beperkt") return <Badge className="text-[11px] px-1.5 py-0 bg-amber-100 text-amber-800 border-amber-200 font-normal">Beperkt</Badge>;
  return <Badge variant="outline" className="text-[11px] px-1.5 py-0 text-muted-foreground font-normal">Niet</Badge>;
}

function WieZietTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Overzicht van welke rollen uw persoonsgegevens in FPS Connect kunnen inzien.
      </p>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Categorie</th>
              <th className="text-center px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Hoofdbeheerder</th>
              <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Gebruiker</th>
              <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Klant</th>
            </tr>
          </thead>
          <tbody>
            {ZIE_MATRIX.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{r.categorie}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.toelichting}</p>
                </td>
                <td className="px-3 py-3 text-center">{BADGE_WIE(r.hoofdbeheerder)}</td>
                <td className="px-3 py-3 text-center">{BADGE_WIE(r.gebruiker)}</td>
                <td className="px-3 py-3 text-center">{BADGE_WIE(r.klant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        "Eigen" betekent dat u uitsluitend uw eigen gegevens kunt inzien. "Beperkt" betekent dat alleen projectrelevante informatie zichtbaar is.
      </p>
    </div>
  );
}

function HoeGebruiktTab() {
  const secties = [
    {
      titel: "Verwerkingsdoel",
      tekst:
        "FPS Connect verwerkt persoonsgegevens uitsluitend voor de uitvoering van brandpreventieve inspectie- en onderhoudsdiensten. Gegevens worden gebruikt voor projectbeheer, personeelsplanning, certificaatregistratie en wettelijk verplichte verslaglegging.",
    },
    {
      titel: "Rechtmatige grondslag",
      tekst:
        "De verwerking vindt plaats op basis van de uitvoering van een overeenkomst (arbeidscontract of dienstverleningsovereenkomst) en wettelijke verplichting (Arbowet, wet- en regelgeving brandveiligheid). Voor bepaalde verwerking (zoals noodcontactgegevens) is toestemming de grondslag.",
    },
    {
      titel: "Bewaartermijnen",
      tekst:
        "Accountgegevens worden bewaard zolang het account actief is en tot 2 jaar na deactivering. Medewerkergegevens worden conform de CAO en wettelijke verplichtingen bewaard (minimaal 7 jaar voor fiscale administratie). Activiteitenlog wordt maximaal 1 jaar bewaard.",
    },
    {
      titel: "Doorgifte aan derden",
      tekst:
        "FPS Connect deelt geen persoonsgegevens met derden, tenzij dit wettelijk verplicht is of noodzakelijk voor de dienstverlening (bijvoorbeeld inschakeling van een externe verwerker voor e-mail of back-up). Alle verwerkers zijn gebonden aan een verwerkersovereenkomst.",
    },
    {
      titel: "Uw rechten als betrokkene",
      tekst:
        "Op grond van de AVG heeft u het recht op inzage, rectificatie, wissing ('recht op vergetelheid'), beperking van de verwerking, dataportabiliteit en bezwaar. Dien een verzoek in via uw leidinggevende of beheerder. FPS Brandpreventie reageert binnen 1 maand.",
    },
    {
      titel: "Beveiliging",
      tekst:
        "Toegang tot FPS Connect is beveiligd met tweestapsverificatie (authenticator-app). Wachtwoorden worden versleuteld opgeslagen (bcrypt). Verbindingen zijn versleuteld via HTTPS. Inlogpogingen worden geregistreerd en na vijf mislukte pogingen tijdelijk geblokkeerd.",
    },
    {
      titel: "Contact",
      tekst:
        "Voor privacyvragen of het uitoefenen van uw rechten kunt u contact opnemen met de beheerder van FPS Connect binnen uw organisatie, of per e-mail via de contactgegevens in uw organisatieprofiel.",
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        FPS Connect is ontworpen met privacy als uitgangspunt (privacy by design). Hieronder leest u hoe uw gegevens worden gebruikt en welke rechten u heeft.
      </p>
      {secties.map((s) => (
        <Card key={s.titel}>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">{s.titel}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{s.tekst}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function PrivacyCentrumPagina() {
  const [tab, setTab] = useState("gegevens");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Privacy & transparantie</h1>
          <p className="text-sm text-muted-foreground">
            Overzicht van uw gegevens en hoe FPS Connect ze gebruikt
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start h-auto flex-wrap gap-1">
          <TabsTrigger value="gegevens" className="text-xs sm:text-sm">
            <User className="h-3.5 w-3.5 mr-1.5" />
            Mijn gegevens
          </TabsTrigger>
          <TabsTrigger value="activiteiten" className="text-xs sm:text-sm">
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            Mijn activiteiten
          </TabsTrigger>
          <TabsTrigger value="wie-ziet" className="text-xs sm:text-sm">
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            Wie ziet mijn gegevens
          </TabsTrigger>
          <TabsTrigger value="hoe-gebruikt" className="text-xs sm:text-sm">
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            Hoe gebruikt Connect mijn gegevens
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gegevens" className="mt-4">
          <GegevensTab />
        </TabsContent>
        <TabsContent value="activiteiten" className="mt-4">
          <ActiviteitenTab />
        </TabsContent>
        <TabsContent value="wie-ziet" className="mt-4">
          <WieZietTab />
        </TabsContent>
        <TabsContent value="hoe-gebruikt" className="mt-4">
          <HoeGebruiktTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
