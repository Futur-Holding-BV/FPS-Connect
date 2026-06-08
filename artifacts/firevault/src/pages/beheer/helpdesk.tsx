import { useListHelpdeskTickets, useUpdateHelpdeskTicket, getListHelpdeskTicketsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, Loader2, Mail, User } from "lucide-react";

const STATUS_OPTIES = [
  { v: "open", l: "Open" },
  { v: "in_behandeling", l: "In behandeling" },
  { v: "afgehandeld", l: "Afgehandeld" },
];

const STATUS_KLEUR: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800 border-yellow-200",
  in_behandeling: "bg-blue-100 text-blue-800 border-blue-200",
  afgehandeld: "bg-green-100 text-green-800 border-green-200",
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

export default function HelpdeskBeheer() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListHelpdeskTickets();
  const update = useUpdateHelpdeskTicket();
  const tickets = data ?? [];

  function wijzigStatus(id: number, status: string) {
    update.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListHelpdeskTicketsQueryKey() });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-lg">
          <LifeBuoy className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Helpdesk</h1>
          <p className="text-sm text-muted-foreground">Vragen en verzoeken van gebruikers beheren</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Nog geen helpdeskvragen ontvangen
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Card key={ticket.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{ticket.onderwerp}</h3>
                      <Badge variant="outline" className={STATUS_KLEUR[ticket.status] ?? ""}>
                        {STATUS_OPTIES.find((s) => s.v === ticket.status)?.l ?? ticket.status}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground whitespace-pre-wrap">{ticket.bericht}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {ticket.naam ?? "Onbekend"}
                      </span>
                      {ticket.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {ticket.email}
                        </span>
                      )}
                      <span>{formatTijdstip(ticket.aangemaakt_op)}</span>
                    </div>
                  </div>
                  <Select value={ticket.status} onValueChange={(v) => wijzigStatus(ticket.id, v)}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIES.map((s) => (
                        <SelectItem key={s.v} value={s.v}>
                          {s.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
