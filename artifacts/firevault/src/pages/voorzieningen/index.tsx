import { useListVoorzieningen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

export default function Voorzieningen() {
  const { data: voorzieningenLijst, isLoading } = useListVoorzieningen({});

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Voorzieningen</h1>
          <p className="text-muted-foreground mt-1">Overzicht van alle brandpreventie assets.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Zoek op nummer..." className="pl-8" />
          </div>
          <Link href="/voorzieningen/nieuw">
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Nieuw
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase">
                <tr>
                  <th className="px-6 py-3">Nummer</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Gebouw</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="px-6 py-4 text-center">Laden...</td></tr>
                ) : (
                  voorzieningenLijst?.items.map(v => (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-6 py-4 font-medium">{v.objectnummer}</td>
                      <td className="px-6 py-4">{v.type}</td>
                      <td className="px-6 py-4">{v.gebouw_naam}</td>
                      <td className="px-6 py-4">
                        <Badge variant="outline">{v.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/voorzieningen/${v.id}`}>
                          <Button variant="ghost" size="sm">Details</Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
                {!isLoading && !voorzieningenLijst?.items?.length && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Geen voorzieningen gevonden.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
