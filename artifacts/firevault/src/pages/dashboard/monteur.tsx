import { Link } from "wouter";
import { useListOnderhoud, useListInspecties } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, ClipboardCheck, AlertTriangle, CheckCircle, Clock, ChevronRight, Calendar } from "lucide-react";
import { useRol } from "@/context/rol-context";
import { useAuth } from "@/context/auth-context";
import { MomentsFelicitatie, VandaagJarigWidget } from "@/components/moments-widget";

const PRIORITEITKLEUR: Record<string, string> = {
  hoog:   "bg-red-100 text-red-800 border-red-200",
  middel: "bg-orange-100 text-orange-800 border-orange-200",
  laag:   "bg-green-100 text-green-800 border-green-200",
};

const STATUSKLEUR: Record<string, string> = {
  open:         "bg-gray-100 text-gray-700",
  in_uitvoering:"bg-blue-100 text-blue-800",
  afgerond:     "bg-green-100 text-green-800",
  geannuleerd:  "bg-red-100 text-red-800",
};

const STATUSLABEL: Record<string, string> = {
  open:         "Open",
  in_uitvoering:"In uitvoering",
  afgerond:     "Afgerond",
  geannuleerd:  "Geannuleerd",
};

export default function MonteurDashboard() {
  const { rol } = useRol();
  const { gebruiker } = useAuth();
  const functietitel = gebruiker?.functietitels?.[0] ?? null;
  const { data: onderhoud } = useListOnderhoud();
  const { data: inspecties } = useListInspecties();

  const ONDERHOUD_TYPES = ["periodiek", "jaarlijks", "herstel"];

  const mijnOpdrachten = onderhoud?.filter((o: any) => o.status !== "afgerond" && o.status !== "geannuleerd") ?? [];
  const mijnInspecties = (inspecties?.filter((i: any) => {
    return i.status !== "goedgekeurd";
  }) ?? []);

  const isControleur = false;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <MomentsFelicitatie gebruikerId={gebruiker?.id} />
      <VandaagJarigWidget />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {functietitel
            ? `Dashboard — ${functietitel}`
            : isControleur
              ? "Onderhoudscontroleur overzicht"
              : "Monteur overzicht"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isControleur
            ? "Uw periodieke en jaarlijkse controle-inspecties bij onderhoudscontracten."
            : "Uw werkbonnen en onderhoudsopdrachten."}
        </p>
      </div>

      {/* Snel overzicht */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-orange-700">{mijnOpdrachten.filter((o: any) => o.prioriteit === "hoog").length}</div>
            <div className="text-xs text-orange-600 font-medium mt-0.5">Hoge prioriteit</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{mijnOpdrachten.length}</div>
            <div className="text-xs text-blue-600 font-medium mt-0.5">Open opdrachten</div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-purple-700">{mijnInspecties.length}</div>
            <div className="text-xs text-purple-600 font-medium mt-0.5">Te inspecteren</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Werkbonnen — monteur: eigen werkbonnen; controleur: onderhoudswerkbonnen waarbij betrokken */}
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                {isControleur ? "Onderhoudswerkbonnen" : "Mijn werkbonnen"}
              </CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/onderhoud">Alle werkbonnen</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {mijnOpdrachten.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                  <CheckCircle className="h-4 w-4 text-green-500" /> Geen openstaande werkbonnen.
                </div>
              )}
              <div className="space-y-2">
                {mijnOpdrachten.slice(0, 5).map((o: any) => (
                  <Link key={o.id} href={`/onderhoud`}>
                    <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                      <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${o.prioriteit === "hoog" ? "text-red-500" : o.prioriteit === "middel" ? "text-orange-500" : "text-gray-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{o.titel}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.gebouw_naam ?? "Onbekend gebouw"}
                          {o.deadline && ` — voor ${new Date(o.deadline).toLocaleDateString("nl-NL")}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className={`text-xs ${PRIORITEITKLEUR[o.prioriteit] ?? ""}`}>
                          {o.prioriteit}
                        </Badge>
                        <Badge variant="secondary" className={`text-xs ${STATUSKLEUR[o.status] ?? ""}`}>
                          {STATUSLABEL[o.status] ?? o.status}
                        </Badge>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

        {/* Inspecties — controleur ziet alleen onderhoudsinspecties (periodiek/jaarlijks/herstel) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              {isControleur ? "Periodieke controle-inspecties" : "Inspecties"}
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/inspecties">Alle inspecties</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {mijnInspecties.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                <CheckCircle className="h-4 w-4 text-green-500" /> Geen openstaande inspecties.
              </div>
            )}
            <div className="space-y-2">
              {mijnInspecties.slice(0, 5).map((i: any) => (
                <Link key={i.id} href={`/inspecties/${i.id}`}>
                  <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                    <Calendar className="h-4 w-4 text-purple-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
              {i.type === "periodiek" ? "Periodieke controle"
                : i.type === "jaarlijks" ? "Jaarlijkse controle"
                : i.type === "herstel" ? "Herstel controle"
                : i.type} — {i.voorziening_nummer ?? i.voorziening_id}
            </div>
                      <div className="text-xs text-muted-foreground">
                        {i.gebouw_naam ?? "Onbekend gebouw"}
                        {i.datum && ` — ${new Date(i.datum).toLocaleDateString("nl-NL")}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {i.status ?? "gepland"}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Snelkoppelingen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Snelkoppelingen</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {!isControleur && (
              <Button variant="outline" className="justify-start h-12" asChild>
                <Link href="/voorzieningen">
                  <Clock className="h-4 w-4 mr-2 text-primary" /> Spots
                </Link>
              </Button>
            )}
            <Button variant="outline" className="justify-start h-12" asChild>
              <Link href="/gebouwen">
                <Clock className="h-4 w-4 mr-2 text-primary" /> Gebouwen en plattegronden
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
