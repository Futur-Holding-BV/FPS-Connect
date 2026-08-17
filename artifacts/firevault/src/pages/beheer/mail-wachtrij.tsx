import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, XCircle, Eye, Loader2, ShieldCheck } from "lucide-react";

type WachtrijItem = {
  id: number;
  naar_email: string;
  naar_naam: string | null;
  onderwerp: string;
  html: string;
  soort: string;
  status: string;
  foutdetail: string | null;
  aangemaakt_op: string | null;
  verwerkt_op: string | null;
  verwerkt_door_naam: string | null;
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  wachtend: { label: "Wachtend", variant: "default" },
  verzenden: { label: "Bezig met verzenden", variant: "secondary" },
  verzonden: { label: "Verzonden", variant: "secondary" },
  afgewezen: { label: "Afgewezen", variant: "outline" },
  mislukt: { label: "Mislukt", variant: "destructive" },
};

function formateer(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

export default function MailWachtrijBeheer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("wachtend");
  const [preview, setPreview] = useState<WachtrijItem | null>(null);

  const { data: items = [], isLoading } = useQuery<WachtrijItem[]>({
    queryKey: ["/api/mail-wachtrij", filter],
    queryFn: async () => {
      const qs = filter === "alle" ? "" : `?status=${filter}`;
      const res = await fetch(`/api/mail-wachtrij${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Wachtrij ophalen mislukt");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const actie = useMutation({
    mutationFn: async ({ id, soort }: { id: number; soort: "verstuur" | "afwijzen" }) => {
      const res = await fetch(`/api/mail-wachtrij/${id}/${soort}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Actie mislukt");
      }
      return soort;
    },
    onSuccess: (soort) => {
      toast({
        title: soort === "verstuur" ? "Mail verzonden" : "Mail afgewezen",
        description: soort === "verstuur"
          ? "De mail is na uw goedkeuring daadwerkelijk verzonden."
          : "De mail wordt nooit verzonden.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mail-wachtrij"] });
    },
    onError: (err) => {
      toast({ title: "Actie mislukt", description: err instanceof Error ? err.message : "Onbekende fout", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/mail-wachtrij"] });
    },
  });

  return (
    <div className="space-y-6 p-6" data-testid="pagina-mail-wachtrij">
      <div>
        <h1 data-paginatitel className="text-2xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" /> Mail-wachtrij
        </h1>
        <p className="text-muted-foreground mt-1">
          Systeem- en notificatiemails worden pas verzonden na uw expliciete goedkeuring.
          Alleen account-mails (uitnodiging, wachtwoord-reset) en mails die een medewerker
          zelf met een verstuur-knop verstuurt, gaan direct.
        </p>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="wachtend" data-testid="tab-wachtend">Wachtend</TabsTrigger>
          <TabsTrigger value="verzonden">Verzonden</TabsTrigger>
          <TabsTrigger value="afgewezen">Afgewezen</TabsTrigger>
          <TabsTrigger value="mislukt">Mislukt</TabsTrigger>
          <TabsTrigger value="alle">Alles</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laden…</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Geen mails {filter === "alle" ? "" : `met status "${STATUS_LABEL[filter]?.label ?? filter}"`}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} data-testid={`mail-wachtrij-item-${item.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{item.onderwerp}</CardTitle>
                    <CardDescription>
                      Aan: {item.naar_naam ? `${item.naar_naam} <${item.naar_email}>` : item.naar_email}
                      {" · "}soort: {item.soort}
                      {" · "}aangemaakt: {formateer(item.aangemaakt_op)}
                      {item.verwerkt_op && ` · verwerkt: ${formateer(item.verwerkt_op)}${item.verwerkt_door_naam ? ` door ${item.verwerkt_door_naam}` : ""}`}
                    </CardDescription>
                    {item.foutdetail && <p className="text-sm text-destructive mt-1">Fout: {item.foutdetail}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={STATUS_LABEL[item.status]?.variant ?? "outline"}>
                      {STATUS_LABEL[item.status]?.label ?? item.status}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => setPreview(item)} data-testid={`knop-bekijk-${item.id}`}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {(item.status === "wachtend" || item.status === "mislukt") && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => actie.mutate({ id: item.id, soort: "verstuur" })}
                          disabled={actie.isPending}
                          data-testid={`knop-verstuur-${item.id}`}
                        >
                          <Send className="h-4 w-4 mr-1" /> Versturen
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => actie.mutate({ id: item.id, soort: "afwijzen" })}
                          disabled={actie.isPending}
                          data-testid={`knop-afwijs-${item.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-1" /> Afwijzen
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={preview != null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview?.onderwerp}</DialogTitle>
            <DialogDescription>
              Aan: {preview?.naar_naam ? `${preview.naar_naam} <${preview.naar_email}>` : preview?.naar_email}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <iframe
              title="Mailvoorbeeld"
              sandbox=""
              srcDoc={preview.html}
              className="w-full h-[50vh] border rounded bg-white"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
