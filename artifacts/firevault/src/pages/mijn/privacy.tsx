import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMijnPrivacyGegevens,
  useListMijnActiviteiten,
  useListAvgMijnVerzoeken,
  useCreateAvgInzageverzoek,
  useUpdateMijnPrivacyInstellingen,
  type AvgVerzoek,
  type AvgVerzoekInputType,
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
  FileSearch,
  Trash2,
  CheckCircle2,
  Loader2,
  Cake,
  Pencil,
  PauseCircle,
  type LucideIcon,
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

const VERZOEK_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_behandeling: "In behandeling",
  afgehandeld: "Afgehandeld",
  afgewezen: "Afgewezen",
};

const VERZOEK_TYPE_LABELS: Record<string, string> = {
  inzage: "Inzageverzoek",
  verwijdering: "Verwijdering / wissing",
  correctie: "Correctieverzoek",
  beperking: "Beperking van verwerking",
  bezwaar: "Bezwaar",
};

const VERZOEK_TYPES: Array<{
  type: AvgVerzoekInputType;
  titel: string;
  beschrijving: string;
  destructief: boolean;
  icon: LucideIcon;
}> = [
  {
    type: "inzage",
    titel: "Inzageverzoek",
    beschrijving:
      "U kunt een volledig overzicht opvragen van alle persoonsgegevens die FPS Connect over u heeft opgeslagen.",
    destructief: false,
    icon: FileSearch,
  },
  {
    type: "correctie",
    titel: "Correctieverzoek",
    beschrijving:
      "Kloppen uw gegevens niet? Geef in de toelichting aan welke gegevens onjuist of onvolledig zijn, dan corrigeert de beheerder dit.",
    destructief: false,
    icon: Pencil,
  },
  {
    type: "beperking",
    titel: "Beperking van verwerking",
    beschrijving:
      "U kunt verzoeken de verwerking van uw gegevens tijdelijk te beperken, bijvoorbeeld tijdens een lopend geschil over de juistheid ervan.",
    destructief: false,
    icon: PauseCircle,
  },
  {
    type: "bezwaar",
    titel: "Bezwaar",
    beschrijving:
      "U kunt bezwaar maken tegen een specifieke verwerking van uw persoonsgegevens. Geef in de toelichting aan om welke verwerking het gaat.",
    destructief: false,
    icon: AlertTriangle,
  },
  {
    type: "verwijdering",
    titel: "Verwijdering / wissing",
    beschrijving:
      "U kunt verzoeken uw persoonsgegevens te laten verwijderen. Uw account wordt dan geanonimiseerd. Wettelijk verplichte gegevens (bijv. fiscale administratie) worden niet verwijderd maar losgekoppeld.",
    destructief: true,
    icon: Trash2,
  },
];

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

function VerzoekStatusBadge({ status }: { status: string }) {
  const klassen: Record<string, string> = {
    open: "bg-blue-100 text-blue-800 border-blue-200",
    in_behandeling: "bg-amber-100 text-amber-800 border-amber-200",
    afgehandeld: "bg-green-100 text-green-800 border-green-200",
    afgewezen: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <Badge className={`text-xs font-normal ${klassen[status] ?? "bg-muted text-muted-foreground"}`}>
      {VERZOEK_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

function GegevensTab() {
  const { data, isLoading, isError } = useGetMijnPrivacyGegevens();
  const queryClient = useQueryClient();
  const updateMomentsInstellingen = useUpdateMijnPrivacyInstellingen();

  async function toggleVerjaardag(checked: boolean) {
    await updateMomentsInstellingen.mutateAsync({
      data: { verjaardag_zichtbaar: checked },
    });
    queryClient.invalidateQueries();
  }

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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cake className="h-4 w-4 text-muted-foreground" />
                FPS Moments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Verjaardag zichtbaar voor collega's</p>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Uit staat standaard uit. Als u dit aanzet, ziet u op de dag zelf een felicitatie en
                    verschijnt uw naam en profielfoto (geen leeftijd of geboortejaar) in het
                    "Vandaag jarig"-overzicht van collega's. Klanten zien dit nooit.
                  </p>
                </div>
                <Switch
                  checked={data.medewerker.verjaardag_zichtbaar}
                  onCheckedChange={toggleVerjaardag}
                  disabled={updateMomentsInstellingen.isPending}
                />
              </div>
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

function VerzoekFormulier({
  type,
  destructief,
  heeftOpenVerzoek,
  onSuccess,
}: {
  type: AvgVerzoekInputType;
  destructief: boolean;
  heeftOpenVerzoek: boolean;
  onSuccess: () => void;
}) {
  const [toelichting, setToelichting] = useState("");
  const [bevestigd, setBevestigd] = useState(false);
  const [ingediend, setIngediend] = useState(false);

  const maakVerzoek = useCreateAvgInzageverzoek();

  function indienen() {
    maakVerzoek.mutate(
      { data: { type, toelichting: toelichting.trim() || undefined } },
      {
        onSuccess: () => {
          setIngediend(true);
          onSuccess();
        },
      }
    );
  }

  if (ingediend) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 py-3">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        Uw verzoek is ingediend. De beheerder neemt binnen 1 maand contact met u op.
      </div>
    );
  }

  if (heeftOpenVerzoek) {
    return (
      <p className="text-sm text-muted-foreground py-3">
        Er staat al een open {(VERZOEK_TYPE_LABELS[type] ?? type).toLowerCase()} voor uw account.
        U kunt een nieuw verzoek indienen nadat het huidige is afgehandeld.
      </p>
    );
  }

  return (
    <div className="space-y-3 pt-1">
      <Textarea
        placeholder="Optionele toelichting"
        rows={3}
        value={toelichting}
        onChange={(e) => setToelichting(e.target.value)}
        className="text-sm resize-none"
      />
      {destructief && (
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 accent-primary"
            checked={bevestigd}
            onChange={(e) => setBevestigd(e.target.checked)}
          />
          <span className="text-muted-foreground">
            Ik begrijp dat verwijdering van mijn gegevens leidt tot permanente anonimisering van mijn account
            en dat dit niet ongedaan gemaakt kan worden.
          </span>
        </label>
      )}
      <Button
        size="sm"
        onClick={indienen}
        disabled={maakVerzoek.isPending || (destructief && !bevestigd)}
        className="flex items-center gap-2"
      >
        {maakVerzoek.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Verzoek indienen
      </Button>
      {maakVerzoek.isError && (
        <p className="text-xs text-destructive">Er is iets misgegaan. Probeer het opnieuw.</p>
      )}
    </div>
  );
}

function VerzoekHistorie({ verzoeken }: { verzoeken: AvgVerzoek[] | undefined }) {
  if (!verzoeken || verzoeken.length === 0) return null;

  return (
    <div className="space-y-2 mt-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Eerdere verzoeken</p>
      {verzoeken.map((v) => (
        <div key={v.id} className="rounded-md border px-3 py-2.5 text-sm space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{VERZOEK_TYPE_LABELS[v.type] ?? v.type}</span>
            <VerzoekStatusBadge status={v.status} />
          </div>
          <p className="text-xs text-muted-foreground">{fmtTijdstip(v.aangemaakt_op)}</p>
          {v.toelichting && (
            <p className="text-xs text-muted-foreground italic">{v.toelichting}</p>
          )}
          {v.beheerder_opmerking && (
            <p className="text-xs border-t pt-1.5 mt-1.5">
              <span className="font-medium">Reactie beheerder: </span>
              {v.beheerder_opmerking}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function VerzoekTab() {
  const { data: verzoeken, isLoading, refetch } = useListAvgMijnVerzoeken();

  function heeftOpenVerzoekVanType(type: string) {
    return (verzoeken ?? []).some(
      (v) => v.type === type && (v.status === "open" || v.status === "in_behandeling")
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Op grond van de AVG heeft u het recht op inzage, correctie, beperking van de verwerking, bezwaar en
        verwijdering van uw persoonsgegevens. Dien hieronder een verzoek in; de beheerder behandelt het
        binnen 1 maand.
      </p>

      {VERZOEK_TYPES.map((cfg) => {
        const Icon = cfg.icon;
        return (
          <Card key={cfg.type} className={cfg.destructief ? "border-destructive/20" : undefined}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Icon className={`h-4 w-4 ${cfg.destructief ? "text-destructive/70" : "text-muted-foreground"}`} />
                {cfg.titel}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">{cfg.beschrijving}</p>
              <VerzoekFormulier
                type={cfg.type}
                destructief={cfg.destructief}
                heeftOpenVerzoek={heeftOpenVerzoekVanType(cfg.type)}
                onSuccess={() => refetch()}
              />
            </CardContent>
          </Card>
        );
      })}

      <VerzoekHistorie verzoeken={verzoeken} />
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
        "U heeft het recht op inzage, rectificatie, wissing, beperking van de verwerking, dataportabiliteit en bezwaar. Gebruik het tabblad 'AVG-verzoeken' om een verzoek in te dienen — de beheerder reageert binnen 1 maand.",
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
          <TabsTrigger value="avg-verzoeken" className="text-xs sm:text-sm">
            <FileSearch className="h-3.5 w-3.5 mr-1.5" />
            AVG-verzoeken
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
        <TabsContent value="avg-verzoeken" className="mt-4"><VerzoekTab /></TabsContent>
        <TabsContent value="wie-ziet" className="mt-4"><WieZietTab /></TabsContent>
        <TabsContent value="hoe-gebruikt" className="mt-4"><HoeGebruiktTab /></TabsContent>
      </Tabs>
    </div>
  );
}
