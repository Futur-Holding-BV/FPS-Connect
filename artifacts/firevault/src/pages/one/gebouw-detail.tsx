import { useLocation, Link } from "wouter";
import { useGetGebouw, useGetGebouwSpotsInzicht } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, MapPin, Shield, ArrowLeft } from "lucide-react";

interface Props {
  params: { id: string };
}

export default function OneGebouwDetail({ params }: Props) {
  const id = Number(params.id);
  const [location] = useLocation();

  const { data: gebouw, isLoading, isError } = useGetGebouw(id);
  const { data: spotsInzicht } = useGetGebouwSpotsInzicht(id);

  const terugHref = location.startsWith("/one/") ? "/one/gebouwen" : "/gebouwen";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={terugHref}>
          <button className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Terug naar overzicht
          </button>
        </Link>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground text-center py-12">
            Gebouwgegevens konden niet worden geladen. Probeer de pagina te vernieuwen.
          </CardContent>
        </Card>
      )}

      {gebouw && (
        <>
          <div className="rounded-xl border bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 md:p-8">
            <Badge className="mb-4 bg-white/10 text-white border-white/20 hover:bg-white/20">
              FPS One — Klantomgeving
            </Badge>
            <h1 className="text-2xl font-bold tracking-tight">
              {gebouw.projectnummer
                ? `${gebouw.projectnummer} — ${gebouw.naam}`
                : gebouw.naam}
            </h1>
            {gebouw.adres && (
              <div className="flex items-center gap-1.5 mt-2 text-slate-300 text-sm">
                <MapPin className="h-4 w-4 shrink-0" />
                <span>
                  {gebouw.adres}
                  {gebouw.stad ? `, ${gebouw.stad}` : ""}
                  {gebouw.postcode ? ` ${gebouw.postcode}` : ""}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Brandpreventieve voorzieningen
                </CardTitle>
              </CardHeader>
              <CardContent>
                {spotsInzicht && spotsInzicht.totaal > 0 ? (
                  <p className="text-2xl font-bold text-foreground">
                    {spotsInzicht.totaal}
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      {spotsInzicht.totaal === 1 ? "voorziening" : "voorzieningen"}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Nog geen voorzieningen geregistreerd</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Gebouwinformatie
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {gebouw.gebouw_type && (
                  <p className="text-sm text-foreground">
                    <span className="text-muted-foreground">Type: </span>
                    {gebouw.gebouw_type}
                  </p>
                )}
                {gebouw.omschrijving && (
                  <p className="text-sm text-foreground">
                    <span className="text-muted-foreground">Omschrijving: </span>
                    {gebouw.omschrijving}
                  </p>
                )}
                {!gebouw.gebouw_type && !gebouw.omschrijving && (
                  <p className="text-sm text-muted-foreground">Geen aanvullende informatie beschikbaar</p>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Neem contact op met FPS Brandpreventie voor meer informatie over dit gebouw.
          </p>
        </>
      )}
    </div>
  );
}
