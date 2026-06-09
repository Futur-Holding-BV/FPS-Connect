import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetGebouw,
  useGetGebouwKaart,
  useListGebouwToewijzingen,
  useCreateGebouwToewijzing,
  useDeleteGebouwToewijzing,
  useListGebruikers,
  useMeldGebouwGereed,
  useHerstelGebouwActief,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useRol } from "@/context/rol-context";
import GebouwPartijen from "./gebouw-partijen";
import GebouwTekeningen from "./gebouw-tekeningen";
import GebouwPlattegronden from "./gebouw-plattegronden";
import GebouwBouwlagen from "./gebouw-bouwlagen";
import GebouwEmails from "./gebouw-emails";
import { GebouwBewerkenDialog } from "./gebouw-bewerken-dialog";
import GebouwPlattegrondHero from "./gebouw-plattegrond-hero";
import GebouwActiviteit from "./gebouw-activiteit";

const BEHEERDER_ROLLEN = ["beheerder", "hoofdbeheerder"];
const TEAM_UITGESLOTEN_ROLLEN = ["hoofdbeheerder", "klant", "viewer"];

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
  const { data: gebruikers } = useListGebruikers();

  const maakToewijzing = useCreateGebouwToewijzing();
  const verwijderToewijzing = useDeleteGebouwToewijzing();
  const gereedMelden = useMeldGebouwGereed();
  const herstelGereed = useHerstelGebouwActief();

  const [gekozenGebruikerId, setGekozenGebruikerId] = useState<string>("");
  const [gekozenProjectRol, setGekozenProjectRol] = useState<string>("");
  const [bezig, setBezig] = useState(false);
  const [bewerkenOpen, setBewerkenOpen] = useState(false);
  const [gereedBezig, setGereedBezig] = useState(false);
  const [herstelBezig, setHerstelBezig] = useState(false);

  if (isLoading) return <div className="p-6 text-muted-foreground">Laden...</div>;
  if (!gebouw) return <div className="p-6">Gebouw niet gevonden.</div>;

  const beschikbareGebruikers = (gebruikers ?? []).filter(
    (g) => !TEAM_UITGESLOTEN_ROLLEN.includes(g.rol ?? ""),
  );

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

  const projectAdmin = (toewijzingen ?? []).find(
    (t) => t.project_rol === "Project-administratie",
  );

  const gegroepeerdeTeamleden = Object.values(
    (toewijzingen ?? []).reduce<
      Record<number, { gebruikerId: number; naam: string; rol: string; rollen: string[] }>
    >((acc, t) => {
      if (!acc[t.gebruiker_id]) {
        acc[t.gebruiker_id] = {
          gebruikerId: t.gebruiker_id,
          naam: t.naam,
          rol: t.rol ?? "",
          rollen: [],
        };
      }
      if (t.project_rol) acc[t.gebruiker_id].rollen.push(t.project_rol);
      return acc;
    }, {}),
  );

  const verdiepingen = gebouw.verdiepingen ?? [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header rij: titel + acties | partijen */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 flex items-center gap-4">
          <Link href="/gebouwen">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">
                {gebouw.projectnummer
                  ? `${gebouw.projectnummer} - ${gebouw.naam}`
                  : gebouw.naam}
              </h1>
              {gebouw.gereed_op && (
                <Badge className="bg-green-600 text-white gap-1">
                  <CheckCircle className="h-3 w-3" /> Gereed
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {gebouw.adres}, {gebouw.stad}
            </p>
            {gebouw.gereed_op && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Gereedgemeld op{" "}
                {new Date(gebouw.gereed_op).toLocaleDateString("nl-NL")}
                {gebouw.gereed_door ? ` door ${gebouw.gereed_door}` : ""}
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
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
              {projectAdmin && (
                <span className="flex items-center gap-1">
                  <ClipboardList className="h-3 w-3" /> Project-administratie:{" "}
                  {projectAdmin.naam}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Link href={`/gebouwen/${gebouwId}/print`}>
              <Button variant="outline">
                <Printer className="h-4 w-4" /> PDF / afdrukken
              </Button>
            </Link>
            {isBeheerder && !gebouw.gereed_op && (
              <Button variant="outline" onClick={meldGereed} disabled={gereedBezig}>
                {gereedBezig ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Gebouw gereedmelden
              </Button>
            )}
            {isBeheerder && gebouw.gereed_op && (
              <Button
                variant="outline"
                onClick={herstelActief}
                disabled={herstelBezig}
              >
                {herstelBezig ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Terugzetten naar actief
              </Button>
            )}
            {isBeheerder && (
              <Button variant="outline" onClick={() => setBewerkenOpen(true)}>
                <Pencil className="h-4 w-4" /> Bewerken
              </Button>
            )}
          </div>
        </div>
        <div className="lg:col-span-1">
          <GebouwPartijen gebouwId={gebouwId} isBeheerder={isBeheerder} />
        </div>
      </div>

      {isBeheerder && (
        <GebouwBewerkenDialog
          gebouw={gebouw}
          open={bewerkenOpen}
          onOpenChange={setBewerkenOpen}
        />
      )}

      {/* Plattegrond-hero + live activiteitsfeed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <GebouwPlattegrondHero
            gebouwId={gebouwId}
            verdiepingen={verdiepingen}
          />
        </div>
        <div className="lg:col-span-1 h-full min-h-[520px]">
          <GebouwActiviteit gebouwNaam={gebouw.naam} />
        </div>
      </div>

      {/* Secundaire content: 3D/locatie/gegevens/bouwlagen | beheer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* 3D + Locatie compact naast elkaar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="h-4 w-4" /> 3D Visualisatie
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
                  <div className="h-52 flex items-center justify-center text-muted-foreground text-sm bg-muted rounded-b-lg px-6">
                    {gebouw.adres
                      ? "Kaartlocatie laden..."
                      : "Geen adres ingevuld voor dit gebouw."}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {heeftGegevens && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" /> Gebouwgegevens
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  {gebouw.gebouw_type != null && (
                    <div>
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="font-medium capitalize">
                        {gebouw.gebouw_type}
                      </dd>
                    </div>
                  )}
                  {gebouw.aantal_verdiepingen != null && (
                    <div>
                      <dt className="text-muted-foreground">Verdiepingen</dt>
                      <dd className="font-medium">{gebouw.aantal_verdiepingen}</dd>
                    </div>
                  )}
                  {gebouw.hoogte != null && (
                    <div>
                      <dt className="text-muted-foreground">Hoogte</dt>
                      <dd className="font-medium">{gebouw.hoogte} m</dd>
                    </div>
                  )}
                  {gebouw.oppervlakte != null && (
                    <div>
                      <dt className="text-muted-foreground">Oppervlakte</dt>
                      <dd className="font-medium">{gebouw.oppervlakte} m²</dd>
                    </div>
                  )}
                  {gebouw.breedte != null && gebouw.diepte != null && (
                    <div>
                      <dt className="text-muted-foreground">Afmeting</dt>
                      <dd className="font-medium">
                        {gebouw.breedte} × {gebouw.diepte} m
                      </dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          <GebouwBouwlagen
            gebouwId={gebouwId}
            verdiepingen={verdiepingen}
            isBeheerder={isBeheerder}
          />
        </div>

        <div className="space-y-6">
          {isBeheerder && (
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
                              ({t.rol})
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

                {beschikbareGebruikers.length > 0 && (
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
                              ({g.rol})
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
          )}

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

          <GebouwEmails gebouwId={gebouwId} isBeheerder={isBeheerder} />

          <Card>
            <CardHeader>
              <CardTitle>Spot-statistieken</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Totaal spots</span>
                <span className="font-bold">{gebouw.stats?.totaal || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Goedgekeurde spots</span>
                <span className="font-bold text-green-600">
                  {gebouw.stats?.goedgekeurd || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Afgekeurde spots</span>
                <span className="font-bold text-destructive">
                  {gebouw.stats?.afgekeurd || 0}
                </span>
              </div>
              {(gebouw.stats?.in_bewerking ?? 0) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Spots in uitvoering</span>
                  <span className="font-bold text-amber-600">
                    {gebouw.stats?.in_bewerking || 0}
                  </span>
                </div>
              )}
              {(gebouw.stats?.in_onderhoud ?? 0) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Spots in onderhoud</span>
                  <span className="font-bold text-orange-600">
                    {gebouw.stats?.in_onderhoud || 0}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
