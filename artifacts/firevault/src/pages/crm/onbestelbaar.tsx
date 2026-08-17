/**
 * CRM — Onbestelbare e-mailadressen (HERSTEL_MAIL_01 punt 2).
 *
 * Werklijst van alle contactpersonen waarvan het adres als onbestelbaar
 * (gekaatst) is gemarkeerd. Deze contacten vallen automatisch buiten elke
 * marketingdoelgroep. Afhandelen kan op twee manieren:
 *  - nieuw adres invullen → onbestelbaar-status wordt gewist, contact telt
 *    weer mee in de doelgroep;
 *  - contact afvoeren → contactpersoon wordt verwijderd.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useUpdateCrmContactpersoon,
  useDeleteCrmContactpersoon,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MailWarning, ArrowLeft, Building2, Trash2, Check, X } from "lucide-react";

type OnbestelbaarItem = {
  id: number;
  klant_id: number | null;
  naam: string;
  functie: string | null;
  email: string | null;
  mail_onbestelbaar_op: string | null;
  mail_onbestelbaar_reden: string | null;
  organisatie_naam: string | null;
};

function datumNl(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export default function OnbestelbaarPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [nieuwEmail, setNieuwEmail] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["crm-onbestelbaar"],
    queryFn: async (): Promise<{ items: OnbestelbaarItem[]; aantal: number }> => {
      const resp = await fetch("/api/crm/onbestelbaar", { credentials: "include" });
      if (!resp.ok) throw new Error("Onbestelbare adressen ophalen mislukt");
      return resp.json();
    },
  });

  const update = useUpdateCrmContactpersoon();
  const verwijder = useDeleteCrmContactpersoon();

  const herlaad = () => queryClient.invalidateQueries({ queryKey: ["crm-onbestelbaar"] });

  const bewaarNieuwAdres = async (item: OnbestelbaarItem) => {
    const email = nieuwEmail.trim();
    if (!email || !email.includes("@")) {
      toast({ title: "Vul een geldig e-mailadres in", variant: "destructive" });
      return;
    }
    try {
      await update.mutateAsync({ id: item.id, data: { naam: item.naam, email } });
      setBewerkId(null);
      setNieuwEmail("");
      await herlaad();
      toast({ title: "Nieuw adres opgeslagen", description: `${item.naam} telt weer mee in doelgroepen.` });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  };

  const voerAf = async (item: OnbestelbaarItem) => {
    if (!window.confirm(`${item.naam} definitief afvoeren als contactpersoon?`)) return;
    try {
      await verwijder.mutateAsync({ id: item.id });
      await herlaad();
      toast({ title: "Contactpersoon afgevoerd" });
    } catch {
      toast({ title: "Afvoeren mislukt", variant: "destructive" });
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/crm">
          <Button variant="ghost" size="icon" aria-label="Terug naar CRM"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 data-paginatitel className="text-2xl font-bold flex items-center gap-2">
            <MailWarning className="h-6 w-6 text-red-600" /> Onbestelbare adressen
          </h1>
          <p className="text-sm text-muted-foreground">
            Gekaatste e-mailadressen. Deze contacten vallen automatisch buiten elke mailing tot het adres is gecorrigeerd.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Geen onbestelbare adressen. Alle bekende e-mailadressen zijn bruikbaar.
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {items.map((item) => (
              <div key={item.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {item.klant_id ? (
                        <Link href={`/crm/${item.klant_id}`} className="hover:underline">{item.naam}</Link>
                      ) : item.naam}
                      <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">Onbestelbaar</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground break-all">{item.email ?? "—"}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      {item.organisatie_naam && (
                        <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{item.organisatie_naam}</span>
                      )}
                      <span>Gekaatst op {datumNl(item.mail_onbestelbaar_op)}</span>
                      {item.mail_onbestelbaar_reden && <span>Reden: {item.mail_onbestelbaar_reden}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {bewerkId !== item.id && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setBewerkId(item.id); setNieuwEmail(""); }}>
                          Nieuw adres invullen
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" disabled={verwijder.isPending} onClick={() => void voerAf(item)}>
                          <Trash2 className="h-4 w-4 mr-1" /> Afvoeren
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {bewerkId === item.id && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="email"
                      value={nieuwEmail}
                      onChange={(e) => setNieuwEmail(e.target.value)}
                      placeholder="nieuw@adres.nl"
                      className="max-w-xs"
                      autoFocus
                    />
                    <Button size="sm" disabled={update.isPending} onClick={() => void bewaarNieuwAdres(item)}>
                      <Check className="h-4 w-4 mr-1" /> Opslaan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setBewerkId(null); setNieuwEmail(""); }}>
                      <X className="h-4 w-4 mr-1" /> Annuleren
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
