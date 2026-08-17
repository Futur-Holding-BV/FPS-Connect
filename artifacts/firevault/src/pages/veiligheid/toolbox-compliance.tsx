import { useState } from "react";
import { useGetToolboxCompliance } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PaginaHulp } from "@/components/pagina-hulp";
import {
  CheckCircle, Clock, ChevronDown, ChevronRight, BarChart3,
} from "lucide-react";

const MAANDEN = [
  "Januari","Februari","Maart","April","Mei","Juni",
  "Juli","Augustus","September","Oktober","November","December",
];

function VoortgangBalk({ pct }: { pct: number }) {
  const kleur = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div className={`${kleur} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function OpdrachtRij({ o }: { o: {
  id: number;
  toolbox_titel: string;
  toolbox_categorie: string;
  totaal_voltooid: number;
  totaal_gebruikers: number;
  voltooiingspercentage: number;
  niet_voltooid: Array<{ gebruiker_id: number | null; naam: string; eerste_aanbieding: string | null }>;
}}) {
  const [open, setOpen] = useState(false);
  const pct = o.voltooiingspercentage;
  const badgeKleur = pct >= 80
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : pct >= 50
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-red-50 text-red-700 border-red-200";

  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{o.toolbox_titel}</span>
            <Badge variant="outline" className={`text-[10px] ${badgeKleur}`}>
              {pct}% voltooid
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <VoortgangBalk pct={pct} />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {o.totaal_voltooid} / {o.totaal_gebruikers}
            </span>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t bg-muted/20 px-5 py-4 space-y-3">
          {o.niet_voltooid.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle className="h-4 w-4" />
              Alle deelnemers hebben deze toolbox voltooid
            </div>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Nog niet voltooid ({o.niet_voltooid.length})
              </p>
              <div className="space-y-1.5">
                {o.niet_voltooid.map((u, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                      <span>{u.naam}</span>
                    </div>
                    {u.eerste_aanbieding && (
                      <span className="text-xs text-muted-foreground">
                        aangeboden {new Date(u.eerste_aanbieding).toLocaleDateString("nl-NL")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ToolboxCompliancePagina() {
  const nu = new Date();
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [maand, setMaand] = useState(nu.getMonth() + 1);

  const { data, isLoading } = useGetToolboxCompliance(
    { jaar, maand },
    { query: {} } as any
  );

  const stat = (data as any)?.statistieken;
  const opdrachten: any[] = (data as any)?.opdrachten ?? [];

  const jaren = Array.from({ length: 3 }, (_, i) => nu.getFullYear() - i);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PaginaHulp pagina="veiligheid-toolbox-compliance" />
      {/* Koptekst */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Toolbox Compliance
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Voltooiingsstatus van maandelijkse toolbox-opdrachten per medewerker
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(maand)} onValueChange={(v) => setMaand(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAANDEN.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(jaar)} onValueChange={(v) => setJaar(Number(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {jaren.map((j) => (
                <SelectItem key={j} value={String(j)}>{j}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Statistieken */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : stat ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Opdrachten</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-3xl font-bold">{stat.totaal_opdrachten}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Deelnemers</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-3xl font-bold">{stat.totaal_gebruikers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Voltooid</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-3xl font-bold text-emerald-600">{stat.voltooide_gebruikers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Percentage</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-3xl font-bold ${stat.voltooiingspercentage >= 80 ? "text-emerald-600" : stat.voltooiingspercentage >= 50 ? "text-amber-600" : "text-red-600"}`}>
                {stat.voltooiingspercentage}%
              </div>
              <div className="mt-2">
                <VoortgangBalk pct={stat.voltooiingspercentage} />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Opdrachten */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : opdrachten.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Geen maandopdrachten in {MAANDEN[maand - 1]} {jaar}</p>
            <p className="text-sm mt-1">Maak maandopdrachten aan via Toolbox Center.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {opdrachten.map((o: any) => (
            <OpdrachtRij key={o.id} o={o} />
          ))}
        </div>
      )}
    </div>
  );
}
