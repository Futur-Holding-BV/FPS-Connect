import { useState } from "react";
import { Link } from "wouter";
import { Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMijnDeclaraties,
  getListMijnDeclaratiesQueryKey,
  type Declaratie,
} from "@workspace/api-client-react";
import { NieuweDeclaratieDialog } from "@/pages/declaraties/index";

// Basislaag eigen gegevens: eigen declaraties voor iedere ingelogde medewerker,
// ongeacht modulerechten. Backend: GET /mijn/declaraties + POST /declaraties
// (alleen-inloggen, eigenGegevens); modulerechten gelden alleen voor andermans
// declaraties (modulepagina /declaraties).

const CATEGORIE_LABELS: Record<string, string> = {
  reiskosten: "Reiskosten",
  maaltijden: "Maaltijden",
  overnachting: "Overnachting",
  representatie: "Representatie",
  gereedschap: "Gereedschap",
  overig: "Overig",
};

function statusBadge(status: string) {
  switch (status) {
    case "concept":     return <Badge variant="outline">Concept</Badge>;
    case "ingediend":   return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Ingediend</Badge>;
    case "goedgekeurd": return <Badge className="bg-green-100 text-green-800 border-green-200">Goedgekeurd</Badge>;
    case "afgekeurd":   return <Badge className="bg-red-100 text-red-800 border-red-200">Afgekeurd</Badge>;
    case "verwerkt":    return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Verwerkt</Badge>;
    default:            return <Badge variant="outline">{status}</Badge>;
  }
}

function bedragTekst(cents: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function Rij({ d }: { d: Declaratie }) {
  return (
    <Link href={`/declaraties/${d.id}`}>
      <div className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs">{CATEGORIE_LABELS[d.categorie] ?? d.categorie}</Badge>
            {statusBadge(d.status)}
          </div>
          <p className="text-muted-foreground text-xs mt-0.5 truncate">{d.omschrijving}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Datum: {d.datum}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-sm">{bedragTekst(d.bedrag_totaal_cents)}</p>
          {d.ingediend_op && (
            <p className="text-xs text-muted-foreground">
              Ingediend {new Date(d.ingediend_op).toLocaleDateString("nl-NL")}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function MijnDeclaratiesPagina() {
  const queryClient = useQueryClient();
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const { data: declaraties = [], isLoading } = useListMijnDeclaraties({
    query: { queryKey: getListMijnDeclaratiesQueryKey() },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Mijn declaraties
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Uw eigen onkostendeclaraties indienen en volgen
          </p>
        </div>
        <Button onClick={() => setNieuwOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nieuwe declaratie
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">Laden...</div>
      ) : declaraties.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>U heeft nog geen declaraties. Maak er een aan met de knop hierboven.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {declaraties.map((d) => <Rij key={d.id} d={d} />)}
        </div>
      )}

      <NieuweDeclaratieDialog
        open={nieuwOpen}
        onSluit={() => setNieuwOpen(false)}
        naOpslaan={() => queryClient.invalidateQueries({ queryKey: getListMijnDeclaratiesQueryKey() })}
      />
    </div>
  );
}
