import { useTranslation } from "react-i18next";
import { useListGebouwen, useListGebouwPartijOpties } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { Search, Building, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { GebouwAanmakenDialog } from "./gebouw-aanmaken-dialog";

const BEHEERDER_ROLLEN = ["beheerder", "hoofdbeheerder"];

const PARTIJ_TYPE_LABELS: Record<string, string> = {
  eigenaar: "Eigenaar",
  gebruiker: "Gebruiker",
  opdrachtgever: "Opdrachtgever",
  aanvrager: "Aanvrager",
};

const ALLE = "__alle__";

export default function Gebouwen() {
  const { t } = useTranslation();
  const { gebruiker } = useAuth();
  const [search, setSearch] = useState("");
  const [partijType, setPartijType] = useState<string>(ALLE);
  const [partijNaam, setPartijNaam] = useState<string>(ALLE);

  const { data: partijOpties } = useListGebouwPartijOpties();

  const beschikbareTypes = useMemo(() => {
    const set = new Set<string>();
    for (const o of partijOpties ?? []) set.add(o.type);
    return Array.from(set).sort((a, b) =>
      (PARTIJ_TYPE_LABELS[a] ?? a).localeCompare(PARTIJ_TYPE_LABELS[b] ?? b),
    );
  }, [partijOpties]);

  const beschikbareNamen = useMemo(() => {
    const namen = (partijOpties ?? [])
      .filter((o) => partijType === ALLE || o.type === partijType)
      .map((o) => o.naam);
    return Array.from(new Set(namen)).sort((a, b) => a.localeCompare(b));
  }, [partijOpties, partijType]);

  const { data: gebouwen, isLoading } = useListGebouwen({
    zoek: search,
    ...(partijType !== ALLE ? { partij_type: partijType } : {}),
    ...(partijNaam !== ALLE ? { partij_naam: partijNaam } : {}),
  });
  const isBeheerder =
    !!gebruiker?.rol && BEHEERDER_ROLLEN.includes(gebruiker.rol as string);

  const filterActief = partijType !== ALLE || partijNaam !== ALLE;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("gebouwen.titel")}</h1>
          <p className="text-muted-foreground mt-1">{t("gebouwen.ondertitel")}</p>
        </div>
        <div className="flex w-full sm:w-auto items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("gebouwen.zoek")}
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isBeheerder && <GebouwAanmakenDialog />}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Select
          value={partijType}
          onValueChange={(v) => {
            setPartijType(v);
            setPartijNaam(ALLE);
          }}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Filter op type partij" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALLE}>Alle partijtypes</SelectItem>
            {beschikbareTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {PARTIJ_TYPE_LABELS[type] ?? type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={partijNaam} onValueChange={setPartijNaam}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Filter op naam" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALLE}>Alle namen</SelectItem>
            {beschikbareNamen.map((naam) => (
              <SelectItem key={naam} value={naam}>
                {naam}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filterActief && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPartijType(ALLE);
              setPartijNaam(ALLE);
            }}
          >
            <X className="h-4 w-4 mr-1" /> Filter wissen
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-48 bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gebouwen?.map((gebouw) => (
            <Link key={gebouw.id} href={`/gebouwen/${gebouw.id}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer h-full flex flex-col">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="bg-primary/10 p-2 rounded-md">
                      <Building className="h-6 w-6 text-primary" />
                    </div>
                    <Badge variant="outline" className="bg-background">
                      {gebouw.totaal_voorzieningen} voorzieningen
                    </Badge>
                  </div>
                  <CardTitle className="mt-4">{gebouw.naam}</CardTitle>
                  <CardDescription>{gebouw.adres}, {gebouw.stad}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <div className="flex gap-2">
                    {/* Simplified stats placeholder */}
                    <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                      Ok
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {gebouwen?.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              Geen gebouwen gevonden.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
