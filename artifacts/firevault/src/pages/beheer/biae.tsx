import { Activity, Boxes, ShieldAlert, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useListBiaeEvents,
  useListBiaeCapabilities,
  useListBiaeComplianceSignalen,
} from "@workspace/api-client-react";

function tijd(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "medium" });
}

function ernstBadge(ernst: string) {
  const map: Record<string, string> = {
    info: "border-blue-200 bg-blue-50 text-blue-800",
    waarschuwing: "border-amber-200 bg-amber-50 text-amber-800",
    kritiek: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <Badge variant="outline" className={map[ernst] ?? ""}>
      {ernst}
    </Badge>
  );
}

export default function BiaeBeheer() {
  const events = useListBiaeEvents({ limiet: 100 });
  const capabilities = useListBiaeCapabilities();
  const signalen = useListBiaeComplianceSignalen({ status: "open" });

  const herlaad = () => {
    void events.refetch();
    void capabilities.refetch();
    void signalen.refetch();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Business Intelligence &amp; Automation Engine</h1>
          <p className="text-sm text-muted-foreground">
            Centrale event-bus: events, geregistreerde capabilities en compliance-signalen.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={herlaad}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Vernieuwen
        </Button>
      </div>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">
            <Activity className="mr-2 h-4 w-4" />
            Event Feed
          </TabsTrigger>
          <TabsTrigger value="capabilities">
            <Boxes className="mr-2 h-4 w-4" />
            Capabilities
          </TabsTrigger>
          <TabsTrigger value="compliance">
            <ShieldAlert className="mr-2 h-4 w-4" />
            Compliance Signalen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle>Laatste events (max. 100)</CardTitle>
            </CardHeader>
            <CardContent>
              {events.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (events.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen events gepubliceerd.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tijdstip</TableHead>
                      <TableHead>Categorie</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Gebruiker</TableHead>
                      <TableHead>Payload</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(events.data ?? []).map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-xs">{tijd(e.tijdstip)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{e.categorie}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{e.type}</TableCell>
                        <TableCell className="text-xs">{e.gebruiker_naam ?? "—"}</TableCell>
                        <TableCell className="max-w-md truncate font-mono text-xs text-muted-foreground">
                          {JSON.stringify(e.payload)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capabilities">
          <Card>
            <CardHeader>
              <CardTitle>Geregistreerde capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              {capabilities.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Naam</TableHead>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead>Categorieën</TableHead>
                      <TableHead>Verwerkt</TableHead>
                      <TableHead>Laatst actief</TableHead>
                      <TableHead>Laatste fout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(capabilities.data ?? []).map((c) => (
                      <TableRow key={c.naam}>
                        <TableCell className="font-medium">{c.naam}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.omschrijving}</TableCell>
                        <TableCell className="text-xs">
                          {(c.categorieen ?? []).join(", ")}
                        </TableCell>
                        <TableCell>{c.verwerkte_events}</TableCell>
                        <TableCell className="text-xs">
                          {c.laatst_actief_op ? tijd(c.laatst_actief_op) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-red-700">
                          {c.laatste_fout ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle>Openstaande compliance-signalen</CardTitle>
            </CardHeader>
            <CardContent>
              {signalen.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (signalen.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen openstaande signalen.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ernst</TableHead>
                      <TableHead>Regel</TableHead>
                      <TableHead>Titel</TableHead>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead>Aangemaakt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(signalen.data ?? []).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{ernstBadge(s.ernst)}</TableCell>
                        <TableCell className="font-mono text-xs">{s.regel}</TableCell>
                        <TableCell className="text-sm font-medium">{s.titel}</TableCell>
                        <TableCell className="max-w-md text-xs text-muted-foreground">
                          {s.omschrijving}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{tijd(s.aangemaakt_op)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
