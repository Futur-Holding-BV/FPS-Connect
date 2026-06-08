import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetGebouw,
  useListGebouwToewijzingen,
  useCreateGebouwToewijzing,
  useDeleteGebouwToewijzing,
  useListGebruikers,
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
import { ArrowLeft, Layers, Map, Users, X, UserPlus, Loader2, Building2, Mail, Phone } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import GebouwPartijen from "./gebouw-partijen";
import GebouwTekeningen from "./gebouw-tekeningen";

const BEHEERDER_ROLLEN = ["beheerder", "hoofdbeheerder"];
const TOEWIJSBARE_ROLLEN = ["monteur", "controleur"];

export default function GebouwDetail() {
  const { id } = useParams<{ id: string }>();
  const gebouwId = Number(id);
  const { gebruiker } = useAuth();
  const queryClient = useQueryClient();
  const isBeheerder =
    !!gebruiker?.rol && BEHEERDER_ROLLEN.includes(gebruiker.rol as string);

  const { data: gebouw, isLoading } = useGetGebouw(gebouwId);
  const { data: toewijzingen, isLoading: toewijzingenLaden } =
    useListGebouwToewijzingen(gebouwId);
  const { data: gebruikers } = useListGebruikers();

  const maakToewijzing = useCreateGebouwToewijzing();
  const verwijderToewijzing = useDeleteGebouwToewijzing();

  const [gekozenGebruikerId, setGekozenGebruikerId] = useState<string>("");
  const [bezig, setBezig] = useState(false);

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
    gebouw.bouwjaar != null ||
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
        data: { gebruiker_id: Number(gekozenGebruikerId) },
      });
      setGekozenGebruikerId("");
      queryClient.invalidateQueries();
    } finally {
      setBezig(false);
    }
  }

  async function verwijder(gebruikerId: number) {
    await verwijderToewijzing.mutateAsync({ id: gebouwId, gebruikerId });
    queryClient.invalidateQueries();
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/gebouwen">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{gebouw.naam}</h1>
          <p className="text-muted-foreground mt-1">
            {gebouw.adres}, {gebouw.stad}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" /> 3D Visualisatie
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80 bg-muted rounded-md flex items-center justify-center relative perspective-1000 overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center transform-style-3d rotate-x-60 rotate-z-45">
                  {Array.from({ length: aantalLagen }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-primary/20 border border-primary/50 absolute transition-transform"
                      style={{
                        width: `${plaatBreedte}px`,
                        height: `${plaatDiepte}px`,
                        transform: `translateZ(${i * laagAfstand}px)`,
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
                  {gebouw.bouwjaar != null && (
                    <div>
                      <dt className="text-muted-foreground">Bouwjaar</dt>
                      <dd className="font-medium">{gebouw.bouwjaar}</dd>
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

          <Card>
            <CardHeader>
              <CardTitle>Verdiepingen</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {gebouw.verdiepingen?.map((verdieping) => (
                <div
                  key={verdieping.id}
                  className="flex items-center justify-between p-4 border rounded-md"
                >
                  <div>
                    <h3 className="font-semibold">{verdieping.naam}</h3>
                    <p className="text-sm text-muted-foreground">
                      {verdieping.totaal_voorzieningen || 0} voorzieningen
                    </p>
                  </div>
                  <Link href={`/gebouwen/${gebouw.id}/plattegrond/${verdieping.id}`}>
                    <Button variant="secondary" size="sm">
                      <Map className="h-4 w-4 mr-2" /> Plattegrond
                    </Button>
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
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
                            {t.actief === false && (
                              <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
                                Inactief
                              </Badge>
                            )}
                          </div>
                          {t.organisatie && (
                            <p className="text-xs text-muted-foreground">{t.organisatie}</p>
                          )}
                          <div className="mt-1 space-y-0.5">
                            {t.email && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3 shrink-0" />
                                <a href={`mailto:${t.email}`} className="hover:underline truncate">
                                  {t.email}
                                </a>
                              </div>
                            )}
                            {t.telefoon && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3 shrink-0" />
                                <a href={`tel:${t.telefoon}`} className="hover:underline">
                                  {t.telefoon}
                                </a>
                              </div>
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
                  <div className="flex gap-2 pt-1">
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

          <GebouwPartijen gebouwId={gebouwId} isBeheerder={isBeheerder} />

          <GebouwTekeningen gebouwId={gebouwId} isBeheerder={isBeheerder} />

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
