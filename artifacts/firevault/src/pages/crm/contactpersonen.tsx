import { useState } from "react";
import { Link } from "wouter";
import {
  useListCrmContactpersonenAll,
  useListCrmKlanten,
} from "@workspace/api-client-react";
import type { CrmContactpersoon, CrmOrganisatie } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ArrowLeft, Phone, Mail, Search, Building2, Star } from "lucide-react";

const BESLISROL_LABEL: Record<string, string> = {
  beslisser: "Beslisser",
  beinvloeder: "Beinvloeder",
  inkoper: "Inkoper",
  technisch_adviseur: "Technisch adviseur",
  projectmanager: "Projectmanager",
  onbekend: "Onbekend",
};

const RELATIE_KLEUR: Record<string, string> = {
  sterk: "bg-emerald-100 text-emerald-700 border-emerald-200",
  normaal: "bg-blue-100 text-blue-700 border-blue-200",
  zwak: "bg-gray-100 text-gray-500 border-gray-200",
  onbekend: "bg-muted text-muted-foreground border-border",
};

export default function ContactpersonenPagina() {
  const [zoek, setZoek] = useState("");

  const { data: contacten = [], isLoading } = useListCrmContactpersonenAll(zoek ? { q: zoek } : {});
  const { data: orgs = [] } = useListCrmKlanten();

  const orgMap = new Map((orgs as CrmOrganisatie[]).map((o) => [o.id, o.naam]));

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/crm">
          <Button variant="ghost" size="sm" className="gap-1 pl-1"><ArrowLeft className="w-4 h-4" /> CRM</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Contactpersonen</h1>
          <p className="text-xs text-muted-foreground">{(contacten as CrmContactpersoon[]).length} contactpersonen</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Zoek op naam, functie of e-mail..." className="pl-9 h-9 text-sm" value={zoek} onChange={(e) => setZoek(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : (contacten as CrmContactpersoon[]).length === 0 ? (
        !zoek ? (
          <div className="text-center py-16">
            <Users className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-3" />
            <p className="font-medium text-muted-foreground">Nog geen contactpersonen</p>
            <p className="text-sm text-muted-foreground mt-1">Voeg contactpersonen toe via een organisatie.</p>
          </div>
        ) : (
          <div className="text-center py-16">
            <Users className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-3" />
            <p className="text-sm text-muted-foreground">Geen resultaten voor deze zoekopdracht.</p>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {(contacten as CrmContactpersoon[]).map((c) => {
            const orgNaam = c.klant_id ? orgMap.get(c.klant_id) : null;
            return (
              <Card key={c.id}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{c.naam}</span>
                      {c.primair && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                      {c.beslisrol && c.beslisrol !== "onbekend" && (
                        <span className="text-xs text-muted-foreground">{BESLISROL_LABEL[c.beslisrol] ?? c.beslisrol}</span>
                      )}
                      {c.relatiesterkte && c.relatiesterkte !== "onbekend" && (
                        <Badge variant="outline" className={`text-xs border ${RELATIE_KLEUR[c.relatiesterkte] ?? ""}`}>
                          {c.relatiesterkte}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c.functie && <span className="text-xs text-muted-foreground">{c.functie}</span>}
                      {orgNaam && (
                        <Link href={`/crm/${c.klant_id}`}>
                          <span className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer">
                            <Building2 className="w-3 h-3" />{orgNaam}
                          </span>
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {c.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                      {c.telefoon && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.telefoon}</span>}
                    </div>
                    {c.volgende_actie && <p className="text-xs text-amber-600 font-medium mt-1">{c.volgende_actie}</p>}
                    {c.laatste_contact_datum && <p className="text-xs text-muted-foreground mt-0.5">Laatste contact: {c.laatste_contact_datum}</p>}
                  </div>
                  {c.klant_id && (
                    <Link href={`/crm/${c.klant_id}`}>
                      <Button variant="ghost" size="sm" className="shrink-0 text-xs">Organisatie</Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
