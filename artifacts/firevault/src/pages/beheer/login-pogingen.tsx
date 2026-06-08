import { useListLoginPogingen } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShieldAlert, Loader2, CheckCircle, XCircle, Smartphone, Globe } from "lucide-react";

function formatTijdstip(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LoginPogingen() {
  const { data, isLoading } = useListLoginPogingen();
  const pogingen = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-lg">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Login-pogingen</h1>
          <p className="text-sm text-muted-foreground">
            Overzicht van aanmeldingen met risicosignalen voor nieuw apparaat of IP-adres
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : pogingen.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Nog geen login-pogingen geregistreerd
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tijdstip</TableHead>
                  <TableHead>Gebruiker</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>IP-adres</TableHead>
                  <TableHead>Resultaat</TableHead>
                  <TableHead>Signalen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pogingen.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatTijdstip(p.tijdstip)}</TableCell>
                    <TableCell className="text-sm">{p.naam ?? "Onbekend"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.email}</TableCell>
                    <TableCell className="text-sm font-mono">{p.ip ?? "—"}</TableCell>
                    <TableCell>
                      {p.gelukt ? (
                        <Badge variant="outline" className="gap-1 bg-green-100 text-green-800 border-green-200">
                          <CheckCircle className="h-3 w-3" /> Gelukt
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 bg-red-100 text-red-800 border-red-200">
                          <XCircle className="h-3 w-3" /> Mislukt
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {p.nieuw_apparaat && (
                          <Badge variant="outline" className="gap-1 bg-amber-100 text-amber-800 border-amber-200">
                            <Smartphone className="h-3 w-3" /> Nieuw apparaat
                          </Badge>
                        )}
                        {p.nieuw_ip && (
                          <Badge variant="outline" className="gap-1 bg-amber-100 text-amber-800 border-amber-200">
                            <Globe className="h-3 w-3" /> Nieuw IP
                          </Badge>
                        )}
                        {!p.nieuw_apparaat && !p.nieuw_ip && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
