import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetMijnPrivacyGegevens,
  useListMijnActiviteiten,
} from "@workspace/api-client-react";
import { useRol } from "@/context/rol-context";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import {
  ShieldCheck,
  User,
  Clock,
  Eye,
  BookOpen,
  Building,
  Briefcase,
  Mail,
  Phone,
  GraduationCap,
  Calendar,
  Bot,
  AlertTriangle,
} from "lucide-react";

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
};

const STATUS_LABELS: Record<string, string> = {
  behaald: "Behaald",
  in_uitvoering: "In uitvoering",
  verlopen: "Verlopen",
  gepland: "Gepland",
};

const NIVEAU_LABELS: Record<string, string> = {
  mbo: "MBO",
  hbo: "HBO",
  wo: "WO",
  wo_ut: "WO-UT",
  anders: "Anders",
};

function fmtDatum(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtTijdstip(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("nl-NL", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
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
    return <p className="text-sm text-destructive py-6 text-center">Gegevens konden niet worden geladen.</p>;
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
        <CardContent>
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
        <>
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
                      <Mail className="h-3 w-3 text-muted-foreground" />{data.medewerker.email}
                    </p>
                  </div>
                )}
                {data.medewerker.telefoon && (
                  <div>
                    <p className="text-xs text-muted-foreground">Telefoon</p>
                    <p className="font-medium flex items-center gap-1">
                      <Phone className="h-3 w-3 text-muted-foreground" />{data.medewerker.telefoon}
                    </p>
                  </div>
                )}
                {data.medewerker.mobiel && (
                  <div>
                    <p className="text-xs text-muted-foreground">Mobiel</p>
                    <p className="font-medium flex items-center gap-1">
                      <Phone className="h-3 w-3 text-muted-foreground" />{data.medewerker.mobiel}
                    </p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground border-t pt-3">
                BSN en noodcontactgegevens worden hier niet getoond — die zijn alleen inzichtelijk voor de HR-beheerder.
              </p>
            </CardContent>
          </Card>

          {data.medewerker.verlofsaldi.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Verlofsaldo ({new Date().getFullYear()})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.medewerker.verlofsaldi.map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                      <div>
                        <p className="font-medium">{s.verlofsoort}</p>
                        <p className="text-xs text-muted-foreground">{s.jaar}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{s.saldo_uren} uur resterend</p>
                        <p className="text-xs text-muted-foreground">
                          Opgebouwd: {s.opgebouwd_uren}u &middot; Opgenomen: {s.opgenomen_uren}u
                        </p>
                        {s.vervalt_op && (
                          <p className="text-xs text-amber-600">Vervalt: {fmtDatum(s.vervalt_op)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data.medewerker.opleidingen.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  Opleidingen &amp; certificaten
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.medewerker.opleidingen.map((o, i) => (
                    <div key={i} className="flex items-start justify-between py-2 border-b last:border-0 text-sm gap-4">
                      <div className="min-w-0">
                        <p className="font-medium">{o.naam}</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          <Badge variant="outline" className="text-[11px] px-1.5 py-0 font-normal capitalize">
                            {o.type}
                          </Badge>
                          {o.niveau && (
                            <Badge variant="outline" className="text-[11px] px-1.5 py-0 font-normal">
                              {NIVEAU_LABELS[o.niveau] ?? o.niveau}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Badge
                          variant={o.status === "verlopen" ? "destructive" : "secondary"}
                          className="text-xs font-normal"
                        >
                          {STATUS_LABELS[o.status] ?? o.status}
                        </Badge>
                        {o.behaald_op && (
                          <p className="text-xs text-muted-foreground mt-0.5">Behaald: {fmtDatum(o.behaald_op)}</p>
                        )}
                        {o.verloopt_op && (
                          <p className="text-xs text-amber-600">Verloopt: {fmtDatum(o.verloopt_op)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground text-center">
            Er is geen medewerkersdossier gekoppeld aan dit account. Alleen uw accountgegevens zijn beschikbaar.
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
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-destructive py-6 text-center">Activiteiten konden niet worden geladen.</p>;
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
        <div key={r.id} className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="font-medium truncate">{r.omschrijving}</p>
            {r.gebouw_naam && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Building className="h-3 w-3" />{r.gebouw_naam}
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

const WIE_ROLLEN = [
  {
    rol: "HR-beheerder",
    icon: "HR",
    kleur: "bg-blue-100 text-blue-800",
    beschrijving: "De HR-beheerder beheert medewerkersdossiers en verlofregistratie.",
    bevoegdheidSleutel: "personeel" as const,
    bevoegdheidNiveau: 1,
    toegang: [
      { categorie: "Naam, e-mail en rol", ziet: "ja" },
      { categorie: "Dienstverband en functie", ziet: "ja" },
      { categorie: "Verlofaanvragen en saldo", ziet: "ja" },
      { categorie: "Opleidingen en certificaten", ziet: "ja" },
      { categorie: "BSN en noodcontact", ziet: "ja" },
      { categorie: "Spots en uitvoering", ziet: "nee" },
      { categorie: "Activiteitenlog", ziet: "nee" },
    ],
  },
  {
    rol: "Projectleider",
    icon: "PL",
    kleur: "bg-orange-100 text-orange-800",
    beschrijving: "De projectleider ziet welke medewerkers aan projecten zijn toegewezen.",
    bevoegdheidSleutel: "gebouwen" as const,
    bevoegdheidNiveau: 1,
    toegang: [
      { categorie: "Naam, e-mail en rol", ziet: "beperkt" },
      { categorie: "Dienstverband en functie", ziet: "nee" },
      { categorie: "Verlofaanvragen en saldo", ziet: "nee" },
      { categorie: "Opleidingen en certificaten", ziet: "beperkt" },
      { categorie: "BSN en noodcontact", ziet: "nee" },
      { categorie: "Spots en uitvoering", ziet: "ja" },
      { categorie: "Activiteitenlog", ziet: "nee" },
    ],
  },
  {
    rol: "Financieel",
    icon: "FIN",
    kleur: "bg-green-100 text-green-800",
    beschrijving: "Financieel medewerkers zien uren en projectgegevens, geen persoonsdetails.",
    bevoegdheidSleutel: null,
    bevoegdheidNiveau: 0,
    toegang: [
      { categorie: "Naam, e-mail en rol", ziet: "beperkt" },
      { categorie: "Dienstverband en functie", ziet: "nee" },
      { categorie: "Verlofaanvragen en saldo", ziet: "nee" },
      { categorie: "Opleidingen en certificaten", ziet: "nee" },
      { categorie: "BSN en noodcontact", ziet: "nee" },
      { categorie: "Spots en uitvoering", ziet: "nee" },
      { categorie: "Activiteitenlog", ziet: "nee" },
    ],
  },
  {
    rol: "Directie",
    icon: "DIR",
    kleur: "bg-purple-100 text-purple-800",
    beschrijving: "Directie ziet managementinformatie en totaaloverzichten, geen persoonlijke dossiers.",
    bevoegdheidSleutel: null,
    bevoegdheidNiveau: 0,
    toegang: [
      { categorie: "Naam, e-mail en rol", ziet: "beperkt" },
      { categorie: "Dienstverband en functie", ziet: "beperkt" },
      { categorie: "Verlofaanvragen en saldo", ziet: "nee" },
      { categorie: "Opleidingen en certificaten", ziet: "nee" },
      { categorie: "BSN en noodcontact", ziet: "nee" },
      { categorie: "Spots en uitvoering", ziet: "beperkt" },
      { categorie: "Activiteitenlog", ziet: "nee" },
    ],
  },
];

function ZietBadge({ ziet }: { ziet: string }) {
  if (ziet === "ja") {
    return <Badge className="text-[11px] px-1.5 py-0 bg-green-100 text-green-800 border-green-200 font-normal">Ja</Badge>;
  }
  if (ziet === "beperkt") {
    return <Badge className="text-[11px] px-1.5 py-0 bg-amber-100 text-amber-800 border-amber-200 font-normal">Beperkt</Badge>;
  }
  return <Badge variant="outline" className="text-[11px] px-1.5 py-0 text-muted-foreground font-normal">Niet</Badge>;
}

function WieZietTab() {
  const { bevoegdheden } = useRol();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Hieronder ziet u per functie welke categorieën gegevens zij in FPS Connect kunnen inzien. "Beperkt" betekent dat alleen projectrelevante informatie zichtbaar is.
      </p>

      {WIE_ROLLEN.map((r) => {
        const heeftZelfBevoegdheid =
          r.bevoegdheidSleutel !== null &&
          (bevoegdheden[r.bevoegdheidSleutel] ?? 0) >= r.bevoegdheidNiveau;

        return (
          <Card key={r.rol}>
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold ${r.kleur}`}>
                  {r.icon}
                </span>
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    {r.rol}
                    {heeftZelfBevoegdheid && (
                      <Badge className="text-[11px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20 font-normal">
                        Uw rol
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{r.beschrijving}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {r.toegang.map((t) => (
                  <div key={t.categorie} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                    <span className="text-muted-foreground">{t.categorie}</span>
                    <ZietBadge ziet={t.ziet} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function HoeGebruiktTab() {
  const secties = [
    {
      titel: "Verwerkingsdoel",
      icon: <BookOpen className="h-4 w-4 text-muted-foreground" />,
      tekst:
        "FPS Connect verwerkt uw persoonsgegevens uitsluitend voor de uitvoering van brandpreventieve inspectie- en onderhoudsdiensten: projectbeheer, personeelsplanning, certificaatregistratie en wettelijk verplichte verslaglegging.",
    },
    {
      titel: "Connect is niet ontworpen om u te controleren",
      icon: <ShieldCheck className="h-4 w-4 text-primary" />,
      tekst:
        "FPS Connect registreert acties om projecten en gebouwveiligheid bij te houden — niet om individueel gedrag of prestaties van medewerkers te monitoren. Activiteitenregistratie dient uitsluitend voor het herstellen van fouten en het bijhouden van wijzigingen in het systeem. Uw persoonlijke data is niet beschikbaar als managementrapportage.",
      accent: true,
    },
    {
      titel: "Connect AI — ondersteunt, beslist nooit",
      icon: <Bot className="h-4 w-4 text-muted-foreground" />,
      tekst:
        "FPS Connect gebruikt AI-assistentie om foto's te analyseren (herkenning van spotafwerking), documenten te valideren en opleidingen voor te stellen bij functies. De AI doet altijd een voorstel — een mens bevestigt en slaat op. De AI keurt nooit zelfstandig iets juridisch goed, besluit niet over personen en geeft geen advies over uw prestaties of geschiktheid.",
    },
    {
      titel: "GPS en voertuigtracking",
      icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      tekst:
        "FPS Connect slaat geen GPS-locaties of rijroutes van medewerkers op. Er is geen koppeling met voertuigvolgsystemen (zoals Traxgo) actief. Mocht dit in de toekomst worden overwogen, dan worden medewerkers vooraf geïnformeerd en is apart toestemming vereist.",
    },
    {
      titel: "Rechtmatige grondslag",
      icon: null,
      tekst:
        "De verwerking vindt plaats op basis van de uitvoering van een overeenkomst (arbeidscontract of dienstverleningsovereenkomst) en wettelijke verplichting (Arbowet, wet- en regelgeving brandveiligheid). Voor noodcontactgegevens is toestemming de grondslag.",
    },
    {
      titel: "Bewaartermijnen",
      icon: null,
      tekst:
        "Accountgegevens worden bewaard zolang het account actief is en tot 2 jaar na deactivering. Medewerkergegevens conform wet (minimaal 7 jaar voor fiscale administratie). Activiteitenlog maximaal 1 jaar.",
    },
    {
      titel: "Uw rechten als betrokkene",
      icon: null,
      tekst:
        "U heeft recht op inzage, rectificatie, wissing, beperking van de verwerking, dataportabiliteit en bezwaar. Dien een verzoek in via uw leidinggevende of de beheerder van FPS Connect. Reactie binnen 1 maand.",
    },
    {
      titel: "Beveiliging",
      icon: null,
      tekst:
        "Toegang is beveiligd met tweestapsverificatie (authenticator-app). Wachtwoorden zijn versleuteld (bcrypt). Verbindingen via HTTPS. Inlogpogingen worden geregistreerd; na 5 mislukte pogingen tijdelijk geblokkeerd.",
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Informatie over hoe FPS Connect uw gegevens gebruikt — in gewone taal, zonder juridisch jargon.
      </p>
      {secties.map((s) => (
        <Card key={s.titel} className={s.accent ? "border-primary/20 bg-primary/5" : undefined}>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {s.icon}
              {s.titel}
            </CardTitle>
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
          <h1 className="text-xl font-semibold">Privacy &amp; transparantie</h1>
          <p className="text-sm text-muted-foreground">Overzicht van uw gegevens en hoe FPS Connect ze gebruikt</p>
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
            Wie kan mijn gegevens zien
          </TabsTrigger>
          <TabsTrigger value="hoe-gebruikt" className="text-xs sm:text-sm">
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            Hoe gebruikt Connect mijn gegevens
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gegevens" className="mt-4"><GegevensTab /></TabsContent>
        <TabsContent value="activiteiten" className="mt-4"><ActiviteitenTab /></TabsContent>
        <TabsContent value="wie-ziet" className="mt-4"><WieZietTab /></TabsContent>
        <TabsContent value="hoe-gebruikt" className="mt-4"><HoeGebruiktTab /></TabsContent>
      </Tabs>
    </div>
  );
}
