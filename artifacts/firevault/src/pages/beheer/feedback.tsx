import { useListFeedback } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquarePlus, Loader2, Star, User } from "lucide-react";

const TYPE_LABEL: Record<string, string> = {
  algemeen: "Algemeen",
  idee: "Idee",
  probleem: "Probleem",
  compliment: "Compliment",
};

const TYPE_KLEUR: Record<string, string> = {
  algemeen: "bg-gray-100 text-gray-700 border-gray-200",
  idee: "bg-blue-100 text-blue-800 border-blue-200",
  probleem: "bg-red-100 text-red-800 border-red-200",
  compliment: "bg-green-100 text-green-800 border-green-200",
};

function formatTijdstip(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FeedbackBeheer() {
  const { data, isLoading } = useListFeedback();
  const items = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-lg">
          <MessageSquarePlus className="h-6 w-6" />
        </div>
        <div>
          <h1 data-paginatitel className="text-2xl font-bold tracking-tight">Feedback</h1>
          <p className="text-sm text-muted-foreground">Reacties en beoordelingen van gebruikers</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Nog geen feedback ontvangen
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((fb) => (
            <Card key={fb.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className={TYPE_KLEUR[fb.type] ?? ""}>
                    {TYPE_LABEL[fb.type] ?? fb.type}
                  </Badge>
                  {typeof fb.waardering === "number" && fb.waardering > 0 && (
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`h-4 w-4 ${
                            n <= (fb.waardering ?? 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{fb.bericht}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {fb.naam ?? "Anoniem"}
                  </span>
                  {fb.pagina && <span className="font-mono">{fb.pagina}</span>}
                  <span>{formatTijdstip(fb.aangemaakt_op)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
