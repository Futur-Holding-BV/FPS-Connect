import { useGetMagazijnDashboard } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Package, Archive, ShoppingCart, TrendingUp, Euro } from "lucide-react";
import { Link } from "wouter";

function StatKaart({
  titel, waarde, icoon: Icoon, kleur, link,
}: {
  titel: string;
  waarde: string;
  icoon: React.ElementType;
  kleur: string;
  link?: string;
}) {
  const inhoud = (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-lg ${kleur}`}>
            <Icoon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{titel}</p>
            <p className="text-2xl font-bold">{waarde}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (link) return <Link href={link}>{inhoud}</Link>;
  return inhoud;
}

function formatBedrag(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export default function MagazijnDashboard() {
  const { heeftNiveau } = useBevoegdheid();
  const kanLezen = heeftNiveau("magazijn", 1);
  const { data, isLoading } = useGetMagazijnDashboard();

  if (!kanLezen) return <div className="p-6"><p className="text-muted-foreground">Geen toegang tot magazijn.</p></div>;
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Magazijn dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Magazijn dashboard</h1>

      {/* Stat-kaarten */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatKaart
          titel="Totale voorraadwaarde"
          waarde={formatBedrag(data?.totaal_waarde ?? 0)}
          icoon={Euro}
          kleur="bg-blue-100 text-blue-700"
          link="/magazijn/voorraad"
        />
        <StatKaart
          titel="Onder minimumvoorraad"
          waarde={String(data?.artikelen_onder_minimum ?? 0)}
          icoon={AlertTriangle}
          kleur={(data?.artikelen_onder_minimum ?? 0) > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}
          link="/magazijn/voorraad"
        />
        <StatKaart
          titel="Gereserveerd"
          waarde={String(data?.totaal_gereserveerd ?? 0)}
          icoon={Archive}
          kleur="bg-amber-100 text-amber-700"
          link="/magazijn/reserveringen"
        />
        <StatKaart
          titel="Besteld / onderweg"
          waarde={String(data?.totaal_besteld ?? 0)}
          icoon={ShoppingCart}
          kleur="bg-purple-100 text-purple-700"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kritieke artikelen */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Kritieke voorraad
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.kritieke_artikelen ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Alle artikelen boven minimumvoorraad.</p>
            ) : (
              <div className="space-y-2">
                {data!.kritieke_artikelen.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <Link href={`/magazijn/artikelen/${a.id}`} className="text-sm font-medium hover:underline">
                      {a.naam}
                    </Link>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs">
                        {a.hoeveelheid} / {a.minimum_voorraad} {a.eenheid}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Meest verbruikt */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Meest verbruikt (30 dagen)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.meest_verbruikt ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen uitgifte geregistreerd.</p>
            ) : (
              <div className="space-y-2">
                {data!.meest_verbruikt.map((a, i) => (
                  <div key={a.artikel_id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                      <span className="text-sm font-medium">{a.naam}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {a.totaal} {a.eenheid}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
