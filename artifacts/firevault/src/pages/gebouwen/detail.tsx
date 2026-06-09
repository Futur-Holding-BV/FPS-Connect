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
import { ArrowLeft, Layers, Users, X, UserPlus, Loader2, Building2, Pencil, MapPin, CheckCircle } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import GebouwPartijen from "./gebouw-partijen";
import GebouwTekeningen from "./gebouw-tekeningen";
import GebouwPlattegronden from "./gebouw-plattegronden";
import GebouwBouwlagen from "./gebouw-bouwlagen";
import { GebouwBewerkenDialog } from "./gebouw-bewerken-dialog";

const BEHEERDER_ROLLEN = ["beheerder", "hoofdbeheerder"];
const TOEWIJSBARE_ROLLEN = ["monteur", "controleur"];
const PROJECT_ROLLEN = ["Projectleider", "Werkvoorbereider", "Monteur", "Controleur"];
const GEEN_PROJECT_ROL = "geen";

export default function GebouwDetail() {
  const { id } = useParams<{ id: string }>();
  const gebouwId = Number(id);
  const { gebruiker } = useAuth();
  const queryClient = useQueryClient();
  const isBeheerder =
    !!gebruiker?.rol && BEHEERDER_ROLLEN.includes(gebruiker.rol as string);

  const { data: gebouw, isLoading } = useGetGebouw(gebouwId);
  const { data: kaartData } = useGetGebouwKaart(gebouwId);
  const { data: toewijzingen, isLoading: toewijzingenLaden } =
    useListGebouwToewijzingen(gebouwId);
  const { data: gebruikers } = useListGebruikers();

  const maakToewijzing = useCreateGebouwToewijzing();
  const verwijderToewijzing = useDeleteGebouwToewijzing();
  const gereedMelden = useMeldGebouwGereed();

  const [gekozenGebruikerId, setGekozenGebruikerId] = useState<string>("");
  const [gekozenProjectRol, setGekozenProjectRol] = useState<string>("");
  const [bezig, setBezig] = useState(false);
  const [bewerkenOpen, setBewerkenOpen] = useState(false);
  const [gereedBezig, setGereedBezig] = useState(false);

  if (isLoading) return <div className="p-6 text-muted-foreground">Laden...</div>;
  if (!gebouw) return <div className="p-6">Gebouw niet gevonden.</div>;

  const beschikbareGebruikers = (gebruikers ?? []).filter(
    (g) =>
      TOEWIJSBARE_ROLLEN.includes(g.rol ?? "") &&
      !(toewijzingen ?? []).some((t) => t.gebruiker_id === g.id),
  );

  const aantalLagen = Math.max(
    1,
    Math.min(gebouw.aantal_verdiepingen ?? gebouw.verdiepingen?.length ?? 1, 30),
  );
  const maxFootprint = Math.max(gebouw.breedte ?? 0, gebouw.diepte ?? 0);
  const plaatBreedte =
    maxFootprint > 0 && gebouw.breedte ? Math.round(160 * (gebouw.breedte / maxFootprint)) : 160;
  const plaatDiepte =
    maxFootprint > 0 && gebouw.diepte ? Math.round(160 * (gebouw.diepte / maxFootprint)) : 160;
  const laagAfstand = Math.max(8, Math.min(40, Math.round(240 / aantalLagen)));

  const heeftGegevens =
    gebouw.gebouw_type != null ||
    gebouw.aantal_verdiepingen != null ||
    gebouw.hoogte != null ||
    gebouw.oppervlakte != null ||
    gebouw.breedte != null ||
    gebouw.diepte != null;

  async function voegToe() {
    if (!gekozenGebruikerId) return;
    setBezig(true);
    try {
      await maakToewijzing.mutateAsync({
        id: gebouwId,
        data: {
          gebruiker_id: Number(gekozenGebruikerId),
          project_rol: gekozenProjectRol || undefined,
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
    if (!confirm("Weet u zeker dat u dit gebouw als gereed wilt melden?")) return;
    setGereedBezig(true);
    try {
      await gereedMelden.mutateAsync({ id: gebouwId, data: { gereed_door: gebruiker?.naam ?? undefined } });
      queryClient.invalidateQueries();
    } finally {
      setGereedBezig(false);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
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
                Gereedgemeld op {new Date(gebouw.gereed_op).toLocaleDateString("nl-NL")}
                {gebouw.gereed_door ? ` door ${gebouw.gereed_door}` : ""}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {isBeheerder && !gebouw.gereed_op && (
              <Button variant="outline" onClick={meldGereed} disabled={gereedBezig}>
                {gereedBezig ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Gereedmelden
              </Button>
            )}
            {isBeheerder && (
              <Button variant="outline" onClick={() => setBewerkenOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Bewerken
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" /> 3D Visualisatie
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="h-80 bg-muted rounded-md relative overflow-hidden"
                style={{ perspective: "1200px" }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    transformStyle: "preserve-3d",
                    transform: "rotateX(60deg) rotateZ(45deg)",
                  }}
                >
                  {Array.from({ length: aantalLagen }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-primary/20 border border-primary/50 absolute left-1/2 top-1/2 transition-transform"
                      style={{
                        width: `${plaatBreedte}px`,
                        height: `${plaatDiepte}px`,
                        transform: `translate(-50%, -50%) translateZ(${i * laagAfstand}px)`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                {aantalLagen} {aantalLagen === 1 ? "bouwlaag" : "bouwlagen"}
                {gebouw.hoogte != null ? ` · ${gebouw.hoogte} m hoog` : ""}
                {gebouw.breedte != null && gebouw.diepte != null
                  ? ` · ${gebouw.breedte} × ${gebouw.diepte} m`
                  : ""}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" /> Locatie
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-hidden rounded-b-lg">
              {kaartData?.embed_url ? (
                <iframe
                  src={kaartData.embed_url}
                  className="w-full h-72 border-0"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`Kaartlocatie ${gebouw.naam}`}
                />
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm bg-muted rounded-b-lg px-6">
                  {gebouw.adres
                    ? "Kaartlocatie laden..."
                    : "Geen adres of coördinaten ingevuld voor dit gebouw."}
                </div>
              )}
            </CardContent>
          </Card>

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
                      <dd className="font-medium capitalize">{gebouw.gebouw_type}</dd>
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
            verdiepingen={gebouw.verdiepingen ?? []}
            isBeheerder={isBeheerder}
          />
        </div>

        <div className="space-y-6">
          {/* Toewijzingen – alleen zichtbaar voor beheerder */}
          {isBeheerder && (
            <Card className="border-primary/40 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" /> Toewijzingen
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Koppel monteurs of controleurs aan dit gebouw. Zij zien alleen
                  toegewezen gebouwen, inspecties en onderhoud.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {toewijzingenLaden ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Laden...
                  </div>
                ) : (toewijzingen ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Geen monteurs of controleurs toegewezen.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {(toewijzingen ?? []).map((t) => (
                      <li
                        key={t.gebruiker_id}
                        className="flex items-start justify-between gap-2 p-2 rounded-md border"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">
                              {t.naam}
                            </span>
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {t.rol}
                            </Badge>
                            {t.project_rol && (
                              <Badge className="text-xs shrink-0 bg-primary/10 text-primary border-primary/20">
                                {t.project_rol}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => verwijder(t.gebruiker_id)}
                          disabled={verwijderToewijzing.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Toevoegen */}
                {beschikbareGebruikers.length > 0 ? (
                  <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                    <Select
                      value={gekozenGebruikerId}
                      onValueChange={setGekozenGebruikerId}
                    >
                      <SelectTrigger className="flex-1 text-sm">
                        <SelectValue placeholder="Kies monteur of controleur" />
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
                    <Select
                      value={gekozenProjectRol ? gekozenProjectRol : GEEN_PROJECT_ROL}
                      onValueChange={(v) =>
                        setGekozenProjectRol(v === GEEN_PROJECT_ROL ? "" : v)
                      }
                    >
                      <SelectTrigger className="sm:w-44 text-sm">
                        <SelectValue placeholder="Projectfunctie" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={GEEN_PROJECT_ROL}>Geen projectfunctie</SelectItem>
                        {PROJECT_ROLLEN.map((pr) => (
                          <SelectItem key={pr} value={pr}>{pr}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      onClick={voegToe}
                      disabled={!gekozenGebruikerId || bezig}
                      className="shrink-0"
                    >
                      {bezig ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground pt-1">
                    Alle beschikbare monteurs en controleurs zijn al toegewezen.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <GebouwPlattegronden
            gebouwId={gebouwId}
            verdiepingen={gebouw.verdiepingen ?? []}
            isBeheerder={isBeheerder}
          />

          <GebouwTekeningen
            gebouwId={gebouwId}
            verdiepingen={gebouw.verdiepingen ?? []}
            isBeheerder={isBeheerder}
          />

          <Card>
            <CardHeader>
              <CardTitle>Statistieken</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Totaal</span>
                <span className="font-bold">{gebouw.stats?.totaal || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Goedgekeurd</span>
                <span className="font-bold text-green-600">
                  {gebouw.stats?.goedgekeurd || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Afgekeurd</span>
                <span className="font-bold text-destructive">
                  {gebouw.stats?.afgekeurd || 0}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
