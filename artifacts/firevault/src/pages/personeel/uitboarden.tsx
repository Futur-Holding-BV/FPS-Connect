import { useState } from "react";
import { useListMedewerkers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserMinus, Search } from "lucide-react";
import { OffboardDialog } from "./offboard-dialog";

function initialen(naam: string): string {
  return naam
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((d) => d[0]?.toUpperCase() ?? "")
    .join("");
}

export default function UitboardenPagina() {
  const { data: medewerkers, isLoading } = useListMedewerkers();
  const [zoek, setZoek] = useState("");
  const [offboardId, setOffboardId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const actief = (medewerkers ?? []).filter((m) => m.actief && !m.uit_dienst_per);

  const gefilterd = actief.filter((m) => {
    if (!zoek.trim()) return true;
    const q = zoek.toLowerCase();
    return (
      m.naam.toLowerCase().includes(q) ||
      (m.functie_naam ?? "").toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q)
    );
  });

  function openOffboard(id: number) {
    setOffboardId(id);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Uitboarden</h1>
        <p className="text-muted-foreground mt-1">
          Medewerkers formeel uitschrijven uit de organisatie. Het uitboardingproces legt de uitdienstdatum vast,
          genereert een arbeidsgetuigenis en deactiveert het account.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UserMinus className="h-4 w-4 text-muted-foreground" />
            Actieve medewerkers
            {!isLoading && (
              <Badge variant="secondary" className="ml-auto">
                {actief.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek op naam, functie of e-mail..."
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && gefilterd.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {zoek ? "Geen medewerkers gevonden voor deze zoekopdracht." : "Geen actieve medewerkers."}
            </p>
          )}

          {!isLoading && gefilterd.length > 0 && (
            <div className="divide-y">
              {gefilterd.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="text-xs bg-muted">
                      {initialen(m.naam)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.naam}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.functie_naam ?? "Geen functie"}
                      {m.werkmaatschappij ? ` · ${m.werkmaatschappij}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.dienstverband && (
                      <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                        {m.dienstverband}
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/5"
                      onClick={() => openOffboard(m.id)}
                    >
                      <UserMinus className="h-3.5 w-3.5 mr-1" />
                      Uitboarden
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <OffboardDialog
        medewerkerId={offboardId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => setDialogOpen(false)}
      />
    </div>
  );
}
