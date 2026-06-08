import { useParams, Link } from "wouter";
import { useGetGebouw } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Layers, Map } from "lucide-react";

export default function GebouwDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: gebouw, isLoading } = useGetGebouw(Number(id), { query: { enabled: !!id } });

  if (isLoading) return <div>Laden...</div>;
  if (!gebouw) return <div>Gebouw niet gevonden.</div>;

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
          <p className="text-muted-foreground mt-1">{gebouw.adres}, {gebouw.stad}</p>
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
              <div className="h-80 bg-muted rounded-md flex items-center justify-center relative perspective-1000">
                <div className="text-muted-foreground text-sm font-medium z-10 bg-background/80 p-2 rounded">
                  3D Weergave (CSS/SVG)
                </div>
                {/* Simplified CSS 3D Stack */}
                <div className="absolute inset-0 flex flex-col items-center justify-center transform-style-3d rotate-x-60 rotate-z-45">
                  {gebouw.verdiepingen?.map((v, i) => (
                    <div 
                      key={v.id} 
                      className="w-48 h-48 bg-primary/20 border border-primary/50 absolute transition-transform"
                      style={{ transform: `translateZ(${i * 40}px)` }}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Verdiepingen</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {gebouw.verdiepingen?.map((verdieping) => (
                <div key={verdieping.id} className="flex items-center justify-between p-4 border rounded-md">
                  <div>
                    <h3 className="font-semibold">{verdieping.naam}</h3>
                    <p className="text-sm text-muted-foreground">{verdieping.totaal_voorzieningen || 0} voorzieningen</p>
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
                <span className="font-bold text-green-600">{gebouw.stats?.goedgekeurd || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Afgekeurd</span>
                <span className="font-bold text-destructive">{gebouw.stats?.afgekeurd || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
