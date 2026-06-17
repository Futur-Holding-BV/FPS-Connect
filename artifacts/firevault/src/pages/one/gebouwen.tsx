import { Link } from "wouter";
import { useListGebouwen } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ChevronRight, MapPin, Shield } from "lucide-react";

function GebouwSkeleton() {
  return (
    <Card>
      <CardContent className="pt-5">
        <Skeleton className="h-5 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
      </CardContent>
    </Card>
  );
}

export default function OneGebouwen() {
  const { data: gebouwen, isLoading, isError } = useListGebouwen();

  const actief = (gebouwen ?? []).filter((g) => !g.gearchiveerd);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 md:p-8">
        <Badge className="mb-4 bg-white/10 text-white border-white/20 hover:bg-white/20">
          FPS One — Klantomgeving
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Mijn gebouwen</h1>
        <p className="text-slate-300 mt-2 max-w-xl">
          Overzicht van uw brandpreventieve objecten met actuele spotstatus en inspectie-informatie.
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <GebouwSkeleton key={i} />)}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground text-center">
            Gebouwen konden niet worden geladen. Probeer de pagina te vernieuwen.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && actief.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground text-center py-12">
            <Building2 className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
            <p>Er zijn nog geen gebouwen aan uw account gekoppeld.</p>
            <p className="mt-1">Neem contact op met FPS Brandpreventie voor meer informatie.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && actief.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {actief.map((gebouw) => (
            <Link key={gebouw.id} href={`/gebouwen/${gebouw.id}`}>
              <Card className="hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group">
                <CardContent className="pt-5 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm leading-tight truncate">
                          {gebouw.projectnummer
                            ? `${gebouw.projectnummer} — ${gebouw.naam}`
                            : gebouw.naam}
                        </p>
                        {(gebouw as any).straat && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {(gebouw as any).straat}{(gebouw as any).huisnummer ? ` ${(gebouw as any).huisnummer}` : ""}{(gebouw as any).stad ? `, ${(gebouw as any).stad}` : ""}
                            </span>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                    </div>

                    <div className="flex items-center gap-3 mt-3">
                      {(gebouw.totaal_voorzieningen ?? 0) > 0 ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Shield className="h-3.5 w-3.5 text-primary" />
                          <span>
                            {gebouw.totaal_voorzieningen}{" "}
                            {gebouw.totaal_voorzieningen === 1 ? "brandpreventieve voorziening" : "brandpreventieve voorzieningen"}
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Nog geen voorzieningen geregistreerd</div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Alleen gebouwen die aan uw account zijn gekoppeld zijn zichtbaar.
        Klik op een gebouw voor de volledige details.
      </p>
    </div>
  );
}
