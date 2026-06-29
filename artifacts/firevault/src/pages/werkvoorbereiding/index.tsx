// Werkvoorbereiding — overzicht actieve opdrachten met planningsstatus
import { Link } from "wouter";
import { useListOpdrachten } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, ShoppingCart, CalendarCheck, Hammer, Package } from "lucide-react";

function euro(n: number | null | undefined) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n ?? 0);
}

const OPDRACHT_STATUS: Record<string, { label: string; kleur: string }> = {
  actief: { label: "Actief", kleur: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  gepauzeerd: { label: "Gepauzeerd", kleur: "bg-amber-100 text-amber-800 border-amber-200" },
  afgerond: { label: "Afgerond", kleur: "bg-slate-100 text-slate-700 border-slate-200" },
  geannuleerd: { label: "Geannuleerd", kleur: "bg-rose-100 text-rose-800 border-rose-200" },
};

const WB_STATUS: Record<string, { label: string; kleur: string }> = {
  concept: { label: "Concept", kleur: "bg-amber-50 text-amber-800 border-amber-200" },
  vastgesteld: { label: "Vastgesteld", kleur: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

export default function WerkvoorbereidingOverzicht() {
  const { data: opdrachten, isLoading } = useListOpdrachten({ status: "actief" });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Werkvoorbereiding</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Inkoopplanning en uitvoeringsplanning per actieve opdracht
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !opdrachten || opdrachten.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Hammer className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground">Geen actieve opdrachten gevonden.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Maak een opdracht aan via een offerte.
            </p>
            <Link href="/offertes">
              <Button variant="outline" size="sm" className="mt-4">Naar offertes</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {opdrachten.map(o => {
            const opStatus = OPDRACHT_STATUS[o.status] ?? { label: o.status, kleur: "" };
            const wbStatus = o.begroting_status ? WB_STATUS[o.begroting_status] : null;

            return (
              <Card key={o.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{o.titel}</span>
                        <Badge variant="outline" className={`text-xs ${opStatus.kleur}`}>
                          {opStatus.label}
                        </Badge>
                        {wbStatus && (
                          <Badge variant="outline" className={`text-xs ${wbStatus.kleur}`}>
                            Begroting: {wbStatus.label}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {o.werknummer && <span>{o.werknummer}</span>}
                        {o.opdrachtgever && <span>{o.opdrachtgever}</span>}
                        {o.begroting_totaal_arbeid_uren != null && (
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {o.begroting_totaal_arbeid_uren.toFixed(1)} u begroot
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-blue-600">
                          <ShoppingCart className="h-3 w-3" />
                          Inkoop
                        </span>
                        <span className="flex items-center gap-1 text-blue-600">
                          <CalendarCheck className="h-3 w-3" />
                          Uitvoering
                        </span>
                      </div>
                    </div>
                    <Link href={`/opdrachten/${o.id}`}>
                      <Button variant="outline" size="sm" className="shrink-0">
                        Openen <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
