import { useState } from "react";
import { useListMedewerkers } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserX, Search } from "lucide-react";
import { Link } from "wouter";

function initialen(naam: string): string {
  return naam
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((d) => d[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDatum(s: string | null | undefined): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return s;
  }
}

export default function OudMedewerkersPagina() {
  const { data: medewerkers, isLoading } = useListMedewerkers();
  const [zoek, setZoek] = useState("");

  const oud = (medewerkers ?? []).filter(
    (m) => !m.actief || (m.uit_dienst_per && new Date(m.uit_dienst_per) <= new Date()),
  );

  const gefilterd = oud.filter((m) => {
    if (!zoek.trim()) return true;
    const q = zoek.toLowerCase();
    return (
      m.naam.toLowerCase().includes(q) ||
      (m.functie_naam ?? "").toLowerCase().includes(q) ||
      (m.werkmaatschappij ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Oud-medewerkers</h1>
        <p className="text-muted-foreground mt-1">
          Voormalige medewerkers die zijn uitgeboardd of inactief zijn gesteld.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Zoek op naam, functie of werkmaatschappij..."
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <UserX className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>{oud.length === 0 ? "Nog geen oud-medewerkers." : "Geen resultaten voor uw zoekopdracht."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {gefilterd.map((m) => (
            <Link key={m.id} href={`/personeel/${m.id}`}>
              <Card className="hover:bg-muted/40 transition-colors cursor-pointer">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                      {initialen(m.naam)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{m.naam}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {m.functie_naam ?? "Geen functie"} &middot; {m.werkmaatschappij}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="secondary" className="text-xs">Inactief</Badge>
                    {m.uit_dienst_per && (
                      <span className="text-xs text-muted-foreground">
                        Uit dienst {formatDatum(m.uit_dienst_per)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {!isLoading && gefilterd.length > 0 && (
        <p className="text-xs text-muted-foreground">{gefilterd.length} oud-medewerker{gefilterd.length !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}
