import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useListVoorzieningen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useVoorkeur } from "@/hooks/use-voorkeur";

export default function Voorzieningen() {
  const { t } = useTranslation();
  const { data: voorzieningenLijst, isLoading } = useListVoorzieningen({});
  const [zoek, setZoek] = useVoorkeur("voorzieningen_zoek", "");
  const [alleenTeControleren, setAlleenTeControleren] = useVoorkeur(
    "voorzieningen_alleen_te_controleren",
    false,
  );

  const teControlerenAantal = useMemo(
    () => (voorzieningenLijst?.items ?? []).filter((v) => (v as any).ai_te_controleren).length,
    [voorzieningenLijst],
  );

  const gefilterd = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    let items = voorzieningenLijst?.items ?? [];
    if (alleenTeControleren) items = items.filter((v) => (v as any).ai_te_controleren);
    if (!term) return items;
    return items.filter((v) =>
      [v.objectnummer, v.type, v.gebouw_naam, v.status]
        .some((veld) => (veld ?? "").toLowerCase().includes(term)),
    );
  }, [voorzieningenLijst, zoek, alleenTeControleren]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("voorzieningen.titel")}</h1>
          <p className="text-muted-foreground mt-1">{t("voorzieningen.ondertitel")}</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("voorzieningen.zoek")}
              className="pl-8"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
            />
          </div>
          {teControlerenAantal > 0 && (
            <Button
              variant={alleenTeControleren ? "default" : "outline"}
              onClick={() => setAlleenTeControleren((v) => !v)}
              className={alleenTeControleren ? "" : "border-red-300 text-red-700 hover:text-red-800"}
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Te controleren ({teControlerenAantal})
            </Button>
          )}
          <Link href="/voorzieningen/nieuw">
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />Toepassing toevoegen
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
                  <th className="px-6 py-3">{t("voorzieningen.nummer")}</th>
                  <th className="px-6 py-3">{t("voorzieningen.type")}</th>
                  <th className="px-6 py-3">{t("voorzieningen.gebouw")}</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="px-6 py-4 text-center">Laden...</td></tr>
                ) : (
                  gefilterd.map(v => (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-6 py-4 font-medium">
                        <span className="inline-flex items-center gap-2">
                          {(v as any).ai_te_controleren && (
                            <span title="AI-controle vereist" className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-red-600" />
                          )}
                          {v.objectnummer}
                        </span>
                      </td>
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
                {!isLoading && !gefilterd.length && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Geen spots gevonden.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
