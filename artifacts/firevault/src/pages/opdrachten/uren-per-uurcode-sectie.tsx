import { useGetUrenPerUurcode } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";

export function UrenPerUurcodeSectie({ opdrachtId }: { opdrachtId: number }) {
  const { data, isLoading } = useGetUrenPerUurcode(opdrachtId);

  if (isLoading) {
    return <Skeleton className="h-64 w-full mt-6" />;
  }

  if (!data) return null;

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Uren per uurcode (nacalculatie)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(!data.codes || data.codes.length === 0) && (!data.indirect || data.indirect.length === 0) && !data.niet_in_begroting_uren ? (
          <p className="text-sm text-muted-foreground">Geen urenregistraties gevonden voor deze opdracht.</p>
        ) : (
          <div className="space-y-6">
            {data.codes && data.codes.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Omschrijving</TableHead>
                    <TableHead className="text-right">Begroot</TableHead>
                    <TableHead className="text-right">Geschreven</TableHead>
                    <TableHead className="text-right">Verschil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.codes.map((c, i) => {
                    const verschil = c.begroot_uren - c.geschreven_uren;
                    const overschreden = verschil < 0;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium whitespace-nowrap">{c.code}</TableCell>
                        <TableCell className="text-sm">{c.omschrijving}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.begroot_uren.toFixed(1)} u</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.geschreven_uren.toFixed(1)} u</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${overschreden ? "text-red-600 font-semibold" : "text-green-600"}`}>
                          {verschil > 0 ? "+" : ""}{verschil.toFixed(1)} u
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {(data.indirect && data.indirect.length > 0 || (data.niet_in_begroting_uren ?? 0) > 0) && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Extra registraties</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead className="text-right">Geschreven</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.indirect?.map((i, idx) => (
                      <TableRow key={`ind_${idx}`}>
                        <TableCell className="text-sm text-muted-foreground">{i.naam}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{i.geschreven_uren.toFixed(1)} u</TableCell>
                      </TableRow>
                    ))}
                    {(data.niet_in_begroting_uren ?? 0) > 0 && (
                      <TableRow>
                        <TableCell className="text-sm text-amber-700 font-medium">Staat niet in de begroting</TableCell>
                        <TableCell className="text-right font-mono text-sm text-amber-700 font-medium">
                          {(data.niet_in_begroting_uren ?? 0).toFixed(1)} u
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
