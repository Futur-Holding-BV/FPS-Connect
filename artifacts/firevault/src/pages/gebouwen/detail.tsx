import { useState } from "react";
import { useParams, Link, useSearch } from "wouter";
import {
  useGetGebouw,
  useGetGebouwKaart,
  useListGebouwToewijzingen,
  useCreateGebouwToewijzing,
  useDeleteGebouwToewijzing,
  useListToewijsbareGebruikers,
  useMeldGebouwGereed,
  useHerstelGebouwActief,
  useListGebouwPartijen,
  useListOnderhoud,
  useArchiveerGebouw,
  useListGekoppeldeDocumenten,
  useListModCalculaties,
  useListOffertes,
  useListOpnames,
  useListGebouwFacturen,
  type Document,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Layers,
  Users,
  X,
  UserPlus,
  Loader2,
  Building2,
  Pencil,
  MapPin,
  CheckCircle,
  RotateCcw,
  Calendar,
  Hash,
  ClipboardList,
  Printer,
  HelpCircle,
  AlertTriangle,
  FileText,
  Wrench,
  ListChecks,
  Lock,
  Sparkles,
  Archive,
  Download,
  Calculator,
  Euro,
  Plus,
  Receipt,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useRol } from "@/context/rol-context";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { PaginaHulp } from "@/components/pagina-hulp";
import { TYPE_LABELS } from "@/lib/documenten-labels";
import GebouwPartijen from "./gebouw-partijen";
import GebouwTekeningen from "./gebouw-tekeningen";
import GebouwPlattegronden from "./gebouw-plattegronden";
import GebouwBouwlagen from "./gebouw-bouwlagen";
import GebouwEmails from "./gebouw-emails";
import { Projectformulier } from "./gebouw-projectformulier";
import { GebouwBewerkenDialog } from "./gebouw-bewerken-dialog";
import GebouwPlattegrondHero from "./gebouw-plattegrond-hero";
import GebouwActiviteit from "./gebouw-activiteit";
import GebouwStappenplan from "./gebouw-stappenplan";
import GebouwRapporten from "./gebouw-rapporten";

const BEHEERDER_ROLLEN = ["beheerder", "hoofdbeheerder"];
const TEAM_UITGESLOTEN_ROLLEN = ["hoofdbeheerder", "klant"];

const CALC_STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  intern_akkoord: "Intern akkoord",
  aangeboden: "Aangeboden",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
};

const OFFERTE_STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  verzonden: "Verzonden",
  geaccepteerd: "Geaccepteerd",
  afgewezen: "Afgewezen",
  vervallen: "Vervallen",
};

const PROJECT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  offerte_aanvraag: {
    label: "Offerte-aanvraag",
    className: "bg-amber-100 text-amber-800 border-amber-300",
  },
  offerte_ingediend: {
    label: "Offerte-ingediend",
    className: "bg-blue-100 text-blue-800 border-blue-300",
  },
  opdracht_in_uitvoering: {
    label: "Opdracht in uitvoering",
    className: "bg-primary/10 text-primary border-primary/30",
  },
};

function bepaalAfgeleidStatus(calcs: any[], offertes: any[]): string | null {
  if (offertes.some((o) => o.status === "geaccepteerd") || calcs.some((c) => c.status === "gewonnen")) {
    return "opdracht_in_uitvoering";
  }
  if (
    offertes.some((o) => o.status === "verzonden") ||
    calcs.some((c) => c.status === "aangeboden" || c.status === "intern_akkoord")
  ) {
    return "offerte_ingediend";
  }
  const heeftActieveCalc = calcs.some((c) => c.status !== "verloren");
  const heeftActieveOfferte = offertes.some((o) => !["afgewezen", "vervallen"].includes(o.status));
  if (heeftActieveCalc || heeftActieveOfferte) return "offerte_aanvraag";
  return null;
}

function ProjectStatusBadge({ status }: { status: string }) {
  const cfg = PROJECT_STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <Badge variant="outline" className={`shrink-0 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

function rolLabelVan(g: { rol?: string | null }): string {
  return g.rol ?? "";
}

const PRIORITEIT_KLEUR: Record<string, string> = {
  kritiek: "bg-destructive/10 text-destructive border-destructive/20",
  hoog: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  normaal: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  laag: "bg-muted text-muted-foreground",
};

function RailKnop({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

function PdfRailKnop({ gebouwId }: { gebouwId: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={`/gebouwen/${gebouwId}/print`}>
          <Button variant="outline" size="icon" aria-label="PDF / afdrukken">
            <Printer className="h-4 w-4" />
          </Button>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="left">PDF / afdrukken</TooltipContent>
    </Tooltip>
  );
}

function SegmentKop({
  icoon,
  titel,
  ondertitel,
  noodzakelijk,
}: {
  icoon: React.ReactNode;
  titel: string;
  ondertitel: string;
  noodzakelijk?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b pb-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icoon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold tracking-tight">
            {titel}
          </h2>
          {!noodzakelijk && (
            <Badge variant="outline" className="text-muted-foreground">
              Aanvullend · beheer
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{ondertitel}</p>
      </div>
    </div>
  );
}

function verdiepingenMetPlattegrond(
  verdiepingen: { plattegrond_url?: string | null }[],
): boolean {
  return verdiepingen.some((v) => !!v.plattegrond_url);
}

function DataWaarschuwing({ punten }: { punten: string[] }) {
  if (punten.length === 0) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
      <div>
        <p className="font-medium text-amber-700">
          Mogelijk onvoldoende informatie voor de monteur
        </p>
        <p className="text-amber-700/90 mt-0.5">
          De volgende essentiële gegevens ontbreken nog:{" "}
          {punten.join(", ")}.
        </p>
      </div>
    </div>
  );
}

function GebouwDocumenten({ gebouwId }: { gebouwId: number }) {
  const { heeftNiveau } = useBevoegdheid();
  const magLezen = heeftNiveau("bibliotheek", 1);
  const { data, isLoading } = useListGekoppeldeDocumenten({
    doel_type: "gebouw",
    doel_id: gebouwId,
  });
  if (!magLezen) return null;
  const documenten = ((data ?? []) as Document[]).filter((d) => !d.gearchiveerd);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" /> Documenten
          {documenten.length > 0 && (
            <Badge variant="secondary">{documenten.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : documenten.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen documenten aan dit gebouw gekoppeld.
          </p>
        ) : (
          <ul className="space-y-2">
            {documenten.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-md border p-2.5 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{d.naam}</div>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      {TYPE_LABELS[d.documenttype] ?? d.documenttype}
                    </Badge>
                    {typeof d.revisie_nummer === "number" && d.revisie_nummer > 1 && (
                      <span>Revisie {d.revisie_nummer}</span>
                    )}
                    {d.datum && (
                      <span>{new Date(d.datum).toLocaleDateString("nl-NL")}</span>
                    )}
                  </div>
                </div>
                {d.pdf_url && (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`/api/documenten/${d.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download className="h-4 w-4" /> Openen
                    </a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function GebouwDetail() {
  const { id } = useParams<{ id: string }>();
  const gebouwId = Number(id);
  const { gebruiker } = useAuth();
  const { rol: effectieveRol } = useRol();
  const queryClient = useQueryClient();
  const isBeheerder = BEHEERDER_ROLLEN.includes(effectieveRol as string);

  const { data: gebouw, isLoading } = useGetGebouw(gebouwId);
  const { data: kaartData } = useGetGebouwKaart(gebouwId);
  const { data: toewijzingen, isLoading: toewijzingenLaden } =
    useListGebouwToewijzingen(gebouwId);
  const { data: gebruikers } = useListToewijsbareGebruikers();
  const { data: partijen } = useListGebouwPartijen(gebouwId);
  const { data: openActiepunten } = useListOnderhoud({
    gebouw_id: gebouwId,
    status: "open",
  });

  const { heeftNiveau } = useBevoegdheid();
  const maakToewijzing = useCreateGebouwToewijzing();
  const verwijderToewijzing = useDeleteGebouwToewijzing();
  const gereedMelden = useMeldGebouwGereed();
  const herstelGereed = useHerstelGebouwActief();
  const archiveerMutatie = useArchiveerGebouw();
  const { toast } = useToast();

  const { data: alleCalculaties = [] } = useListModCalculaties(undefined, { query: { queryKey: ["mod-calculaties"] } });
  const gebouwCalcs = (Array.isArray(alleCalculaties) ? alleCalculaties : []).filter((c: any) => c.gebouw_id === gebouwId);
  const { data: alleOffertes = [] } = useListOffertes();
  const gebouwOffertes = (Array.isArray(alleOffertes) ? alleOffertes : []).filter((o: any) => o.gebouw_id === gebouwId);
  const { data: gebouwOpnames = [] } = useListOpnames(
    { gebouw_id: gebouwId },
    { query: { queryKey: ["opnames", gebouwId] } },
  );
  const { data: gebouwFacturen = [] } = useListGebouwFacturen(gebouwId ?? 0, {
    query: { enabled: !!gebouwId, queryKey: ["gebouw-facturen", gebouwId] },
  });
  const afgeleidStatus = bepaalAfgeleidStatus(gebouwCalcs, gebouwOffertes);

  const [gekozenGebruikerId, setGekozenGebruikerId] = useState<string>("");
  const [gekozenProjectRol, setGekozenProjectRol] = useState<string>("");
  const [bezig, setBezig] = useState(false);
  const [bewerkenOpen, setBewerkenOpen] = useState(false);
  const search = useSearch();
  const [segment, setSegment] = useState(() => new URLSearchParams(search).get("tab") ?? "project");
  const [gereedBezig, setGereedBezig] = useState(false);
  const [herstelBezig, setHerstelBezig] = useState(false);
  const [archiveerBezig, setArchiveerBezig] = useState(false);
  const [archiveerDialogOpen, setArchiveerDialogOpen] = useState(false);
  const [archiveerRichting, setArchiveerRichting] = useState<boolean>(true);

  if (isLoading) return <div className="p-6 text-muted-foreground">Laden...</div>;
  if (!gebouw) return <div className="p-6">Gebouw niet gevonden.</div>;

  const beschikbareGebruikers = (gebruikers ?? []).filter(
    (g) => !TEAM_UITGESLOTEN_ROLLEN.includes(g.rol ?? ""),
  );

  // Toewijzen vereist het wijzig-/aanmaakniveau op gebouwen (zelfde drempel als
  // de POST /gebouwen/:id/toewijzingen op de server). Zo verschijnt de
  // teamlid-keuzelijst niet voor lees-only gebruikers.
  const magToewijzen = heeftNiveau("gebouwen", 3);

  const gekozenGebruiker = beschikbareGebruikers.find(
    (g) => String(g.id) === gekozenGebruikerId,
  );
  const isGekozenBeheerder =
    !!gekozenGebruiker?.rol && BEHEERDER_ROLLEN.includes(gekozenGebruiker.rol);
  const gekozenFuncties = gekozenGebruiker?.functietitels ?? [];

  const aantalLagen = Math.max(
    1,
    Math.min(gebouw.aantal_verdiepingen ?? gebouw.verdiepingen?.length ?? 1, 30),
  );
  const maxFootprint = Math.max(gebouw.breedte ?? 0, gebouw.diepte ?? 0);
  const plaatBreedte =
    maxFootprint > 0 && gebouw.breedte
      ? Math.round(120 * (gebouw.breedte / maxFootprint))
      : 120;
  const plaatDiepte =
    maxFootprint > 0 && gebouw.diepte
      ? Math.round(120 * (gebouw.diepte / maxFootprint))
      : 120;
  const laagAfstand = Math.max(6, Math.min(30, Math.round(180 / aantalLagen)));

  const heeftGegevens =
    gebouw.gebouw_type != null ||
    gebouw.aantal_verdiepingen != null ||
    gebouw.hoogte != null ||
    gebouw.oppervlakte != null ||
    gebouw.breedte != null ||
    gebouw.diepte != null;

  async function voegToe() {
    if (!gekozenGebruikerId) return;
    const gekozen = beschikbareGebruikers.find(
      (g) => String(g.id) === gekozenGebruikerId,
    );
    const beheerder = !!gekozen?.rol && BEHEERDER_ROLLEN.includes(gekozen.rol);
    if (beheerder && !gekozenProjectRol) return;
    const projectRol = beheerder ? gekozenProjectRol : "";
    const duplicaat = (toewijzingen ?? []).some(
      (t) =>
        t.gebruiker_id === Number(gekozenGebruikerId) &&
        (t.project_rol ?? "") === projectRol,
    );
    if (duplicaat) return;
    setBezig(true);
    try {
      await maakToewijzing.mutateAsync({
        id: gebouwId,
        data: {
          gebruiker_id: Number(gekozenGebruikerId),
          project_rol: projectRol || undefined,
        },
      });
      setGekozenGebruikerId("");
      setGekozenProjectRol("");
      queryClient.invalidateQueries();
    } finally {
      setBezig(false);
    }
  }

  async function verwijder(gebruikerId: number) {
    await verwijderToewijzing.mutateAsync({ id: gebouwId, gebruikerId });
    queryClient.invalidateQueries();
  }

  async function meldGereed() {
    if (!confirm("Weet u zeker dat u dit project als gereed wilt melden?")) return;
    setGereedBezig(true);
    try {
      await gereedMelden.mutateAsync({
        id: gebouwId,
        data: { gereed_door: gebruiker?.naam ?? undefined },
      });
      queryClient.invalidateQueries();
    } finally {
      setGereedBezig(false);
    }
  }

  async function herstelActief() {
    if (
      !confirm(
        "Weet u zeker dat u de gereed-status wilt terugzetten? Het project wordt weer actief.",
      )
    )
      return;
    setHerstelBezig(true);
    try {
      await herstelGereed.mutateAsync({ id: gebouwId });
      queryClient.invalidateQueries();
    } finally {
      setHerstelBezig(false);
    }
  }

  function archiveer(gearchiveerd: boolean) {
    setArchiveerRichting(gearchiveerd);
    setArchiveerDialogOpen(true);
  }

  async function bevestigArchiveer() {
    setArchiveerBezig(true);
    try {
      await archiveerMutatie.mutateAsync({
        id: gebouwId,
        data: { gearchiveerd: archiveerRichting },
      });
      queryClient.invalidateQueries();
      setArchiveerDialogOpen(false);
    } finally {
      setArchiveerBezig(false);
    }
  }

  const projectAdmin = (toewijzingen ?? []).find(
    (t) => t.project_rol === "Project-admin",
  );
  const projectleider = (toewijzingen ?? []).find(
    (t) => t.project_rol === "Projectleider",
  );

  const partijenLijst = partijen ?? [];
  const actiepunten = openActiepunten ?? [];

  const heeftPlattegrond = verdiepingenMetPlattegrond(gebouw.verdiepingen ?? []);
  const aantalSpots = gebouw.stats?.totaal ?? 0;

  const ontbrekendeProjectdata: string[] = [];
  if (!gebouw.adres) ontbrekendeProjectdata.push("adres van het gebouw");
  if (partijenLijst.length === 0)
    ontbrekendeProjectdata.push("contactpartijen (opdrachtgever/eigenaar)");

  const ontbrekendeUitvoeringsdata: string[] = [];
  if ((gebouw.verdiepingen ?? []).length === 0)
    ontbrekendeUitvoeringsdata.push("bouwlagen");
  if (!heeftPlattegrond)
    ontbrekendeUitvoeringsdata.push("plattegrond(en)");
  if (aantalSpots === 0)
    ontbrekendeUitvoeringsdata.push("geregistreerde spots");

  const gegroepeerdeTeamleden = Object.values(
    (toewijzingen ?? []).reduce<
      Record<number, { gebruikerId: number; naam: string; rol: string; functietitels: string[]; rollen: string[] }>
    >((acc, t) => {
      if (!acc[t.gebruiker_id]) {
        const g = (gebruikers ?? []).find(
          (u) => Number(u.id) === t.gebruiker_id,
        );
        acc[t.gebruiker_id] = {
          gebruikerId: t.gebruiker_id,
          naam: t.naam,
          rol: t.rol ?? "",
          functietitels: g?.functietitels ?? [],
          rollen: [],
        };
      }
      if (t.project_rol) acc[t.gebruiker_id].rollen.push(t.project_rol);
      return acc;
    }, {}),
  );

  const verdiepingen = gebouw.verdiepingen ?? [];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <PaginaHulp pagina="gebouw-detail" />

      {/* ── Compacte header ── */}
      <div className="flex items-start gap-3">
        <Link href="/gebouwen">
          <Button variant="outline" size="icon" className="shrink-0 mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight leading-tight">
              {gebouw.projectnummer
                ? `${gebouw.projectnummer} \u2014 ${gebouw.naam}`
                : gebouw.naam}
            </h1>
            {afgeleidStatus && !gebouw.gereed_op && (
              <ProjectStatusBadge status={afgeleidStatus} />
            )}
            {gebouw.gereed_op && (
              <Badge className="bg-green-600 text-white gap-1 shrink-0">
                <CheckCircle className="h-3 w-3" /> Gereed
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {gebouw.adres}
            {gebouw.stad ? `, ${gebouw.stad}` : ""}
            {gebouw.postcode ? ` \u00b7 ${gebouw.postcode}` : ""}
          </p>
          {gebouw.gereed_op && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Gereedgemeld op{" "}
              {new Date(gebouw.gereed_op).toLocaleDateString("nl-NL")}
              {gebouw.gereed_door ? ` door ${gebouw.gereed_door}` : ""}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
            {gebouw.werknummer && (
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" /> {gebouw.werknummer}
              </span>
            )}
            {gebouw.aangemaakt_op && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Start{" "}
                {new Date(gebouw.aangemaakt_op).toLocaleDateString("nl-NL")}
              </span>
            )}
            {projectleider && (
              <span className="flex items-center gap-1">
                <ClipboardList className="h-3 w-3" /> Projectleider:{" "}
                {projectleider.naam}
              </span>
            )}
            {projectAdmin && (
              <span className="flex items-center gap-1">
                <ClipboardList className="h-3 w-3" /> Project-admin:{" "}
                {projectAdmin.naam}
              </span>
            )}
          </div>
        </div>
      </div>

      {isBeheerder && (
        <GebouwBewerkenDialog
          gebouw={gebouw}
          open={bewerkenOpen}
          onOpenChange={setBewerkenOpen}
        />
      )}

      <AlertDialog
        open={archiveerDialogOpen}
        onOpenChange={(o) => { if (!o && !archiveerBezig) setArchiveerDialogOpen(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveerRichting ? "Gebouw verwijderen" : "Gebouw terugplaatsen"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveerRichting
                ? `"${gebouw.naam}" wordt verwijderd en verdwijnt uit het actieve overzicht. Alleen de hoofdbeheerder kan het gebouw via het Gebouwenarchief terugplaatsen.`
                : `"${gebouw.naam}" wordt teruggeplaatst naar het actieve overzicht en is weer zichtbaar voor alle gebruikers met toegang.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveerBezig}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={bevestigArchiveer}
              disabled={archiveerBezig}
              className={archiveerRichting ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {archiveerBezig ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" />Bezig...</>
              ) : archiveerRichting ? (
                "Verwijderen"
              ) : (
                "Terugplaatsen"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {gebouw.gearchiveerd && (
        <div className="flex items-center gap-3 rounded-lg border border-muted-foreground/30 bg-muted/50 p-4 text-sm">
          <Archive className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium text-muted-foreground">Gearchiveerd project</p>
            <p className="text-muted-foreground/80 mt-0.5">
              Dit project is gearchiveerd{gebouw.gearchiveerd_op ? ` op ${new Date(gebouw.gearchiveerd_op).toLocaleDateString("nl-NL")}` : ""} en verschijnt niet meer in het actieve overzicht.
              {isBeheerder && " Gebruik 'Terugplaatsen' om het weer actief te maken."}
            </p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          SEGMENT 1 — Project- en gebouwgegevens
          ════════════════════════════════════════════════════ */}
      <Tabs value={segment} onValueChange={setSegment} className="w-full">
        <div className="flex items-start justify-between gap-4">
          <TabsList className="grid w-full max-w-5xl min-w-0 grid-cols-8">
            <TabsTrigger value="project" className="gap-1.5">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Gebouw</span>
              <span className="sm:hidden">Gebouw</span>
            </TabsTrigger>
            <TabsTrigger value="uitvoering" className="gap-1.5">
              <Wrench className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Uitvoering</span>
            </TabsTrigger>
            <TabsTrigger value="beheer" className="gap-1.5">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Beheer</span>
            </TabsTrigger>
            <TabsTrigger value="rapporten" className="gap-1.5">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Rapporten</span>
            </TabsTrigger>
            <TabsTrigger value="calculaties" className="gap-1.5">
              <Calculator className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Calculaties</span>
            </TabsTrigger>
            <TabsTrigger value="offertes" className="gap-1.5">
              <Euro className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Offertes</span>
            </TabsTrigger>
            <TabsTrigger value="opnames" className="gap-1.5">
              <ListChecks className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Opnames</span>
            </TabsTrigger>
            <TabsTrigger value="facturen" className="gap-1.5">
              <Receipt className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Facturen</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab-gebonden actieknoppen: icoon-only, verticaal, rechts in lijn met de tabbladen */}
          <div className="flex flex-col gap-2 shrink-0">
            {segment === "project" && (
              <>
                {isBeheerder && (
                  <RailKnop
                    icon={<Pencil className="h-4 w-4" />}
                    label="Bewerken"
                    onClick={() => setBewerkenOpen(true)}
                  />
                )}
                <GebouwStappenplan gebouwId={gebouwId} gebouw={gebouw} compact />
              </>
            )}
            {segment === "uitvoering" && (
              <>
                <GebouwStappenplan gebouwId={gebouwId} gebouw={gebouw} compact />
              </>
            )}
            {segment === "beheer" && (
              <>
                {isBeheerder && !gebouw.gereed_op && (
                  <RailKnop
                    icon={
                      gereedBezig ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )
                    }
                    label="Gereedmelden"
                    onClick={meldGereed}
                    disabled={gereedBezig}
                  />
                )}
                {isBeheerder && gebouw.gereed_op && (
                  <RailKnop
                    icon={
                      herstelBezig ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )
                    }
                    label="Terugzetten naar actief"
                    onClick={herstelActief}
                    disabled={herstelBezig}
                  />
                )}
                {isBeheerder && !gebouw.gearchiveerd && (
                  <RailKnop
                    icon={
                      archiveerBezig ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )
                    }
                    label="Verwijderen"
                    onClick={() => archiveer(true)}
                    disabled={archiveerBezig}
                  />
                )}
                {isBeheerder && gebouw.gearchiveerd && (
                  <RailKnop
                    icon={
                      archiveerBezig ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )
                    }
                    label="Terugplaatsen"
                    onClick={() => archiveer(false)}
                    disabled={archiveerBezig}
                  />
                )}
              </>
            )}
            {segment === "rapporten" && (
              <PdfRailKnop gebouwId={gebouwId} />
            )}
          </div>
        </div>

      <TabsContent value="project" className="space-y-4 mt-6">
        <SegmentKop
          icoon={<Building2 className="h-5 w-5" />}
          titel="Gebouwgegevens"
          ondertitel="NAW-gegevens, contactpartijen, opdracht­omschrijving en open actiepunten"
          noodzakelijk
        />
        <DataWaarschuwing punten={ontbrekendeProjectdata} />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
          <div className="xl:col-span-2 space-y-6">

            {/* Bewerkbaar projectformulier (AI-aangevuld, beheerder bevestigt) */}
            <Projectformulier gebouwId={gebouwId} isBeheerder={isBeheerder} gebouw={gebouw} />

            {/* Open actiepunten */}
            {actiepunten.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ListChecks className="h-4 w-4" /> Open actiepunten{" "}
                    <Badge variant="secondary">{actiepunten.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {actiepunten.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-start gap-3 rounded-md border p-2.5 text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{a.titel}</div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                            <Badge
                              variant="outline"
                              className={`text-xs ${PRIORITEIT_KLEUR[a.prioriteit] ?? ""}`}
                            >
                              {a.prioriteit}
                            </Badge>
                            {a.deadline && (
                              <span>
                                {new Date(a.deadline).toLocaleDateString("nl-NL")}
                              </span>
                            )}
                            {a.toegewezen_aan_naam && (
                              <span className="flex items-center gap-1">
                                {a.toegewezen_aan_naam}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <GebouwDocumenten gebouwId={gebouwId} />
          </div>

          <div className="space-y-6">
            {/* Google Maps locatie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Locatie
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-hidden rounded-b-lg">
                {kaartData?.embed_url ? (
                  <iframe
                    src={kaartData.embed_url}
                    className="w-full h-52 border-0"
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Kaartlocatie ${gebouw.naam}`}
                  />
                ) : (
                  <div className="h-52 flex items-center justify-center text-muted-foreground text-sm bg-muted rounded-b-lg px-6 text-center">
                    {gebouw.adres
                      ? "Kaartlocatie laden..."
                      : "Geen adres ingevuld voor dit gebouw."}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contactpartijen */}
            <GebouwPartijen gebouwId={gebouwId} isBeheerder={isBeheerder} />

            {/* Kerngegevens (technisch overzicht) */}
            {heeftGegevens && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Gebouwkenmerken
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {gebouw.gebouw_type != null && (
                      <div>
                        <dt className="text-muted-foreground text-xs">Type</dt>
                        <dd className="font-medium capitalize">{gebouw.gebouw_type}</dd>
                      </div>
                    )}
                    {gebouw.aantal_verdiepingen != null && (
                      <div>
                        <dt className="text-muted-foreground text-xs">Verdiepingen</dt>
                        <dd className="font-medium">{gebouw.aantal_verdiepingen}</dd>
                      </div>
                    )}
                    {gebouw.hoogte != null && (
                      <div>
                        <dt className="text-muted-foreground text-xs">Hoogte</dt>
                        <dd className="font-medium">{gebouw.hoogte} m</dd>
                      </div>
                    )}
                    {gebouw.oppervlakte != null && (
                      <div>
                        <dt className="text-muted-foreground text-xs">Oppervlakte</dt>
                        <dd className="font-medium">{gebouw.oppervlakte} m²</dd>
                      </div>
                    )}
                    {gebouw.breedte != null && gebouw.diepte != null && (
                      <div className="col-span-2">
                        <dt className="text-muted-foreground text-xs">Afmeting</dt>
                        <dd className="font-medium">
                          {gebouw.breedte} × {gebouw.diepte} m
                        </dd>
                      </div>
                    )}
                  </dl>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </TabsContent>

      {/* ════════════════════════════════════════════════════
          SEGMENT 2 — Uitvoering op locatie
          ════════════════════════════════════════════════════ */}
      <TabsContent value="uitvoering" className="space-y-4 mt-6">
        <SegmentKop
          icoon={<Wrench className="h-5 w-5" />}
          titel="Uitvoering"
          ondertitel="Bouwlagen, plattegronden, tekeningen en spot­registratie"
          noodzakelijk
        />
        <DataWaarschuwing punten={ontbrekendeUitvoeringsdata} />

        <GebouwPlattegrondHero gebouwId={gebouwId} verdiepingen={verdiepingen} />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <GebouwBouwlagen
              gebouwId={gebouwId}
              verdiepingen={verdiepingen}
              isBeheerder={isBeheerder}
            />
            <GebouwPlattegronden
              gebouwId={gebouwId}
              verdiepingen={verdiepingen}
              isBeheerder={isBeheerder}
            />
            <GebouwTekeningen
              gebouwId={gebouwId}
              verdiepingen={verdiepingen}
              isBeheerder={isBeheerder}
            />
          </div>

          <div className="space-y-6">
            {/* Spot-statistieken */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ListChecks className="h-4 w-4" /> Spot-statistieken
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Totaal spots</span>
                  <span className="font-bold">{gebouw.stats?.totaal || 0}</span>
                </div>
                {(gebouw.stats?.voorbereid ?? 0) > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Voorbereid</span>
                    <span className="font-bold text-slate-600">
                      {gebouw.stats?.voorbereid || 0}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Gereed</span>
                  <span className="font-bold text-green-600">
                    {gebouw.stats?.goedgekeurd || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Afgekeurd</span>
                  <span className="font-bold text-destructive">
                    {gebouw.stats?.afgekeurd || 0}
                  </span>
                </div>
                {(gebouw.stats?.in_bewerking ?? 0) > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">In uitvoering</span>
                    <span className="font-bold text-amber-600">
                      {gebouw.stats?.in_bewerking || 0}
                    </span>
                  </div>
                )}
                {(gebouw.stats?.in_onderhoud ?? 0) > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">In onderhoud</span>
                    <span className="font-bold text-orange-600">
                      {gebouw.stats?.in_onderhoud || 0}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </TabsContent>

      {/* ════════════════════════════════════════════════════
          SEGMENT 3 — Beheer en communicatie
          ════════════════════════════════════════════════════ */}
      <TabsContent value="beheer" className="space-y-4 mt-6">
        <SegmentKop
          icoon={<Sparkles className="h-5 w-5" />}
          titel="Beheer & Historie"
          ondertitel="E-mails, teamleden, 3D-weergave en projectactiviteit"
        />
        {isBeheerder ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
            <div className="xl:col-span-2 space-y-6">
              <GebouwEmails gebouwId={gebouwId} isBeheerder={isBeheerder} />

              {/* Teamleden / toewijzingen */}
              <Card className="border-primary/40 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" /> Teamleden
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Koppel teamleden aan dit project en wijs projectfuncties toe.
                    Monteurs en controleurs zien alleen hun toegewezen projecten.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {toewijzingenLaden ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" /> Laden...
                    </div>
                  ) : gegroepeerdeTeamleden.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nog geen teamleden toegewezen aan dit project.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {gegroepeerdeTeamleden.map((t) => (
                        <li
                          key={t.gebruikerId}
                          className="flex items-start justify-between gap-2 p-2 rounded-md border"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{t.naam}</span>
                              <span className="text-muted-foreground text-xs">
                                ({rolLabelVan(t)})
                              </span>
                              {t.rollen.length > 0 && (
                                <Badge className="text-xs shrink-0 bg-primary/10 text-primary border-primary/20">
                                  {t.rollen.join(" | ")}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => verwijder(t.gebruikerId)}
                            disabled={verwijderToewijzing.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {magToewijzen && beschikbareGebruikers.length > 0 && (
                    <div className="flex flex-col gap-2 pt-1">
                      <Select
                        value={gekozenGebruikerId}
                        onValueChange={(v) => {
                          setGekozenGebruikerId(v);
                          setGekozenProjectRol("");
                        }}
                      >
                        <SelectTrigger className="w-full text-sm">
                          <SelectValue placeholder="Kies teamlid" />
                        </SelectTrigger>
                        <SelectContent>
                          {beschikbareGebruikers.map((g) => (
                            <SelectItem key={g.id} value={String(g.id)}>
                              {g.naam}{" "}
                              <span className="text-muted-foreground text-xs">
                                ({rolLabelVan(g)})
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isGekozenBeheerder && gekozenFuncties.length > 0 && (
                        <Select
                          value={gekozenProjectRol}
                          onValueChange={setGekozenProjectRol}
                        >
                          <SelectTrigger className="w-full text-sm">
                            <SelectValue placeholder="Kies projectfunctie" />
                          </SelectTrigger>
                          <SelectContent>
                            {gekozenFuncties.map((pr) => (
                              <SelectItem key={pr} value={pr}>
                                {pr}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {isGekozenBeheerder && gekozenFuncties.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Deze beheerder heeft geen projectfuncties in het profiel.
                        </p>
                      )}
                      <Button
                        onClick={voegToe}
                        disabled={
                          !gekozenGebruikerId ||
                          bezig ||
                          (isGekozenBeheerder && !gekozenProjectRol)
                        }
                        className="w-full gap-2"
                      >
                        {bezig ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserPlus className="h-4 w-4" />
                        )}
                        Teamlid toevoegen
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {/* 3D Visualisatie */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="h-4 w-4" /> 3D Gebouwweergave
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="h-44 bg-muted rounded-md relative overflow-hidden"
                    style={{ perspective: "1000px" }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        transformStyle: "preserve-3d",
                        transform: "rotateX(55deg) rotateZ(45deg)",
                      }}
                    >
                      {Array.from({ length: aantalLagen }).map((_, i) => (
                        <div
                          key={i}
                          className="bg-primary/20 border border-primary/50 absolute left-1/2 top-1/2"
                          style={{
                            width: `${plaatBreedte}px`,
                            height: `${plaatDiepte}px`,
                            transform: `translate(-50%, -50%) translateZ(${i * laagAfstand}px)`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {aantalLagen} {aantalLagen === 1 ? "bouwlaag" : "bouwlagen"}
                    {gebouw.hoogte != null ? ` · ${gebouw.hoogte} m` : ""}
                    {gebouw.breedte != null && gebouw.diepte != null
                      ? ` · ${gebouw.breedte}×${gebouw.diepte} m`
                      : ""}
                  </p>
                </CardContent>
              </Card>

              {/* Live activiteitsfeed */}
              <GebouwActiviteit gebouwNaam={gebouw.naam} />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-5 text-sm text-muted-foreground">
            <Lock className="h-5 w-5 shrink-0" />
            Beheerinhoud is alleen beschikbaar voor beheerders.
          </div>
        )}
      </TabsContent>

      {/* ════════════════════════════════════════════════════
          SEGMENT 4 — Opleverrapporten
          ════════════════════════════════════════════════════ */}
      <TabsContent value="rapporten" className="space-y-4 mt-6">
        <GebouwRapporten gebouwId={gebouwId} isBeheerder={isBeheerder} />
      </TabsContent>

      {/* ════════════════════════════════════════════════════
          SEGMENT 5 — Calculaties
          ════════════════════════════════════════════════════ */}
      <TabsContent value="calculaties" className="space-y-6 mt-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Calculaties
              </CardTitle>
              <Button size="sm" asChild>
                <Link href={`/modules/calculatie/nieuw?gebouw_id=${gebouwId}`}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Nieuwe calculatie
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {gebouwCalcs.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Calculator className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p>Geen calculaties gekoppeld aan dit gebouw</p>
              </div>
            ) : (
              <div className="divide-y">
                {gebouwCalcs.map((c: any) => (
                  <Link key={c.id} href={`/modules/calculatie/${c.id}`}>
                    <div className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 cursor-pointer transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.naam}</p>
                        {c.klant_naam && <p className="text-xs text-muted-foreground">{c.klant_naam}</p>}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {CALC_STATUS_LABEL[c.status] ?? c.status}
                      </Badge>
                      {c.totaal_na_opslagen != null && (
                        <span className="text-sm font-medium tabular-nums shrink-0">
                          {new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(c.totaal_na_opslagen)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ════════════════════════════════════════════════════
          SEGMENT 6 — Offertes
          ════════════════════════════════════════════════════ */}
      <TabsContent value="offertes" className="space-y-6 mt-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Euro className="h-4 w-4" />
                Offertes
              </CardTitle>
              <Button size="sm" variant="outline" asChild>
                <Link href="/offertes">
                  Alle offertes
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {gebouwOffertes.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Euro className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p>Geen offertes gekoppeld aan dit gebouw</p>
              </div>
            ) : (
              <div className="divide-y">
                {gebouwOffertes.map((o: any) => (
                  <Link key={o.id} href={`/offertes/${o.id}`}>
                    <div className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 cursor-pointer transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{o.titel}</p>
                        {o.opdrachtgever && <p className="text-xs text-muted-foreground">{o.opdrachtgever}</p>}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {OFFERTE_STATUS_LABEL[o.status] ?? o.status}
                      </Badge>
                      {o.bedrag_excl_btw != null && (
                        <span className="text-sm font-medium tabular-nums shrink-0">
                          {new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(o.bedrag_excl_btw)}
                          <span className="text-xs text-muted-foreground ml-1">excl.</span>
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ════════════════════════════════════════════════════
          SEGMENT 7 — Opnames
          ════════════════════════════════════════════════════ */}
      <TabsContent value="opnames" className="space-y-6 mt-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                Opnames
              </CardTitle>
              <Button size="sm" asChild>
                <Link href={`/opname/nieuw?gebouw_id=${gebouwId}`}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Nieuwe opname
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {gebouwOpnames.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p>Geen opnames gekoppeld aan dit gebouw</p>
              </div>
            ) : (
              <div className="divide-y">
                {gebouwOpnames.map((o) => (
                  <Link key={o.id} href={`/opname/${o.id}`}>
                    <div className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 cursor-pointer transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{o.naam}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(o.datum).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                          {o.aangemaakt_door_naam && <> · {o.aangemaakt_door_naam}</>}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{o.aantal_items} items</span>
                      <Badge
                        variant={o.status === "definitief" ? "default" : "secondary"}
                        className="text-xs shrink-0"
                      >
                        {o.status === "definitief" ? "Definitief" : "Concept"}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="facturen" className="space-y-6 mt-6">
        <GebouwFacturenTab
          gebouwId={gebouwId ?? 0}
          facturen={gebouwFacturen}
          magBeheren={heeftNiveau("financieel", 2)}
        />
      </TabsContent>
      </Tabs>

    </div>
  );
}

function GebouwFacturenTab({
  gebouwId,
  facturen,
  magBeheren,
}: {
  gebouwId: number;
  facturen: import("@workspace/api-client-react").Factuur[];
  magBeheren: boolean;
}) {
  const STATUSSEN: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    nieuw: { label: "Nieuw", variant: "secondary" },
    in_behandeling: { label: "In behandeling", variant: "secondary" },
    geaccordeerd: { label: "Geaccordeerd", variant: "default" },
    afgewezen: { label: "Afgewezen", variant: "destructive" },
    geexporteerd: { label: "Geexporteerd", variant: "outline" },
    geblokkeerd: { label: "Geblokkeerd", variant: "destructive" },
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Inkomende facturen
            {facturen.length > 0 && (
              <Badge variant="secondary" className="ml-1">{facturen.length}</Badge>
            )}
          </CardTitle>
          {magBeheren && (
            <Button size="sm" variant="outline" asChild>
              <a href={`/financieel/facturen?gebouw_id=${gebouwId}`}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Beheren
              </a>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {facturen.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            <Receipt className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p>Geen inkomende facturen gekoppeld aan dit gebouw</p>
          </div>
        ) : (
          <div className="divide-y text-sm">
            <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 px-6 py-2 text-xs text-muted-foreground font-medium bg-muted/40">
              <span>Factuurnummer / Leverancier</span>
              <span>Factuurdatum / Vervaldatum</span>
              <span className="text-right">Bedrag incl. btw</span>
              <span>Status</span>
            </div>
            {facturen.map((f) => {
              const st = STATUSSEN[f.status] ?? { label: f.status, variant: "secondary" as const };
              return (
                <div key={f.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 px-6 py-3 items-center hover:bg-muted/30 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{f.factuurnummer ?? <span className="text-muted-foreground italic">Geen nummer</span>}</p>
                    <p className="text-xs text-muted-foreground truncate">{f.relatienaam ?? "—"}</p>
                  </div>
                  <div>
                    <p>{f.factuurdatum ? new Date(f.factuurdatum).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—"}</p>
                    {f.vervaldatum && (
                      <p className="text-xs text-muted-foreground">
                        Vervalt {new Date(f.vervaldatum).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    )}
                  </div>
                  <span className="text-right tabular-nums font-medium">
                    {f.bedrag_incl_btw != null
                      ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(f.bedrag_incl_btw))
                      : "—"}
                  </span>
                  <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
