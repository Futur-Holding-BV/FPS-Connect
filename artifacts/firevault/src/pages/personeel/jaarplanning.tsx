import { useState } from "react";
import { useListFeestdagen, useListVerlofInstellingen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Building2, Sun } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const MAANDEN = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",
];

function formatDatum(datum: string): string {
  try {
    const d = new Date(datum);
    return d.toLocaleDateString("nl-NL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return datum;
  }
}

function maandNummer(datum: string): number {
  try {
    return new Date(datum).getMonth();
  } catch {
    return 0;
  }
}

type FeestdagItem = {
  id: number;
  naam: string;
  datum: string;
  is_nationaal?: boolean;
  werkgever_id?: number | null;
};

export default function JaarplanningPagina() {
  const huidigJaar = new Date().getFullYear();
  const [jaar, setJaar] = useState(huidigJaar);

  const { data: feestdagen, isLoading: feestdagenLaden } = useListFeestdagen();

  const feestdagenVoorJaar = (feestdagen ?? []).filter((f: FeestdagItem) => {
    try {
      return new Date(f.datum).getFullYear() === jaar;
    } catch {
      return false;
    }
  });

  const nationaal = feestdagenVoorJaar.filter((f: FeestdagItem) => f.is_nationaal);
  const bedrijf = feestdagenVoorJaar.filter((f: FeestdagItem) => !f.is_nationaal);

  const gegroepeerd = MAANDEN.map((naam, idx) => ({
    naam,
    nationaal: nationaal.filter((f: FeestdagItem) => maandNummer(f.datum) === idx),
    bedrijf: bedrijf.filter((f: FeestdagItem) => maandNummer(f.datum) === idx),
  })).filter((m) => m.nationaal.length > 0 || m.bedrijf.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jaarplanning</h1>
          <p className="text-muted-foreground mt-1">
            Overzicht van nationale feestdagen en bedrijfssluitingsdagen voor {jaar}.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setJaar((j) => j - 1)}
          >
            &larr; {jaar - 1}
          </Button>
          <span className="text-sm font-semibold px-2">{jaar}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setJaar((j) => j + 1)}
          >
            {jaar + 1} &rarr;
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 bg-muted/40">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sun className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">{nationaal.length}</p>
                <p className="text-xs text-muted-foreground">Nationale feestdagen</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 bg-muted/40">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <Building2 className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{bedrijf.length}</p>
                <p className="text-xs text-muted-foreground">Bedrijfssluitingsdagen</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 bg-muted/40">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <CalendarDays className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{nationaal.length + bedrijf.length}</p>
                <p className="text-xs text-muted-foreground">Totaal vrije dagen</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="alle">
        <div className="flex items-center justify-between gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="alle">Alle dagen</TabsTrigger>
            <TabsTrigger value="nationaal">Feestdagen</TabsTrigger>
            <TabsTrigger value="bedrijf">Bedrijfssluiting</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" asChild>
            <Link href="/personeel/verlof-instellingen">
              Beheren
            </Link>
          </Button>
        </div>

        {feestdagenLaden && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!feestdagenLaden && feestdagenVoorJaar.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center">
              <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Geen vrije dagen geconfigureerd voor {jaar}.
              </p>
              <Button variant="outline" size="sm" className="mt-4" asChild>
                <Link href="/personeel/verlof-instellingen">
                  Feestdagen instellen
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {!feestdagenLaden && feestdagenVoorJaar.length > 0 && (
          <>
            <TabsContent value="alle" className="mt-0 space-y-4">
              {gegroepeerd.map((m) => (
                <MaandKaart
                  key={m.naam}
                  naam={m.naam}
                  items={[...m.nationaal, ...m.bedrijf]}
                />
              ))}
            </TabsContent>

            <TabsContent value="nationaal" className="mt-0 space-y-4">
              {MAANDEN.map((naam, idx) => {
                const items = nationaal.filter((f: FeestdagItem) => maandNummer(f.datum) === idx);
                if (items.length === 0) return null;
                return <MaandKaart key={naam} naam={naam} items={items} />;
              })}
              {nationaal.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Geen nationale feestdagen geconfigureerd voor {jaar}.
                </p>
              )}
            </TabsContent>

            <TabsContent value="bedrijf" className="mt-0 space-y-4">
              {MAANDEN.map((naam, idx) => {
                const items = bedrijf.filter((f: FeestdagItem) => maandNummer(f.datum) === idx);
                if (items.length === 0) return null;
                return <MaandKaart key={naam} naam={naam} items={items} />;
              })}
              {bedrijf.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Geen bedrijfssluitingsdagen geconfigureerd voor {jaar}.
                </p>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function MaandKaart({ naam, items }: { naam: string; items: FeestdagItem[] }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {naam}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 divide-y">
        {items.map((f) => (
          <div key={f.id} className="flex items-center justify-between py-2.5 gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`h-2 w-2 rounded-full shrink-0 ${
                  f.is_nationaal ? "bg-primary" : "bg-orange-500"
                }`}
              />
              <div>
                <p className="text-sm font-medium">{f.naam}</p>
                <p className="text-xs text-muted-foreground">{formatDatum(f.datum)}</p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] shrink-0 ${
                f.is_nationaal
                  ? "border-primary/30 text-primary"
                  : "border-orange-400/40 text-orange-600"
              }`}
            >
              {f.is_nationaal ? "Nationaal" : "Bedrijfssluiting"}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
