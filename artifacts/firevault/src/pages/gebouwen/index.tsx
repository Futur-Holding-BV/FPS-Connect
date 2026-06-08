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
import { Search, Building, X, ArrowDownUp } from "lucide-react";
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

type SorteerOptie =
  | "alfabetisch"
  | "laatst_toegevoegd"
  | "laatst_bewerkt"
  | "laatst_spot";

const SORTEER_LABELS: Record<SorteerOptie, string> = {
  alfabetisch: "Alfabetisch (A-Z)",
  laatst_toegevoegd: "Laatst toegevoegd",
  laatst_bewerkt: "Laatst bewerkt",
  laatst_spot: "Laatst spot toegevoegd",
};

function tijd(waarde: string | null | undefined): number {
  if (!waarde) return 0;
  const ms = new Date(waarde).getTime();
  return isFinite(ms) ? ms : 0;
}

export default function Gebouwen() {
  const { t } = useTranslation();
  const { gebruiker } = useAuth();
  const [search, setSearch] = useState("");
  const [partijType, setPartijType] = useState<string>(ALLE);
  const [partijNaam, setPartijNaam] = useState<string>(ALLE);
  const [sortering, setSortering] = useState<SorteerOptie>("alfabetisch");

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

  const gesorteerdeGebouwen = useMemo(() => {
    const lijst = [...(gebouwen ?? [])];
    switch (sortering) {
      case "laatst_toegevoegd":
        return lijst.sort((a, b) => tijd(b.aangemaakt_op) - tijd(a.aangemaakt_op));
      case "laatst_bewerkt":
        return lijst.sort((a, b) => tijd(b.bijgewerkt_op) - tijd(a.bijgewerkt_op));
      case "laatst_spot":
        return lijst.sort((a, b) => tijd(b.laatste_spot_op) - tijd(a.laatste_spot_op));
      case "alfabetisch":
      default:
        return lijst.sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
    }
  }, [gebouwen, sortering]);

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

        <Select
          value={sortering}
          onValueChange={(v) => setSortering(v as SorteerOptie)}
        >
          <SelectTrigger className="w-full sm:w-56 sm:ml-auto">
            <ArrowDownUp className="h-4 w-4 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Sorteren" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORTEER_LABELS) as SorteerOptie[]).map((optie) => (
              <SelectItem key={optie} value={optie}>
                {SORTEER_LABELS[optie]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-48 bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gesorteerdeGebouwen.map((gebouw) => (
            <Link key={gebouw.id} href={`/gebouwen/${gebouw.id}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer h-full flex flex-col">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="bg-primary/10 p-2 rounded-md">
                      <Building className="h-6 w-6 text-primary" />
                    </div>
                    <Badge variant="outline" className="bg-background">
                      {gebouw.totaal_voorzieningen} {gebouw.totaal_voorzieningen === 1 ? "spot" : "spots"}
                    </Badge>
                  </div>
                  {gebouw.werknummer && (
                    <Badge variant="secondary" className="mt-4 w-fit font-mono text-xs">
                      {gebouw.werknummer}
                    </Badge>
                  )}
                  <CardTitle className={gebouw.werknummer ? "mt-2" : "mt-4"}>
                    {gebouw.projectnummer
                      ? `${gebouw.projectnummer} - ${gebouw.naam}`
                      : gebouw.naam}
                  </CardTitle>
                  <CardDescription>{gebouw.adres}, {gebouw.stad}</CardDescription>
                  {gebouw.partijen && gebouw.partijen.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {gebouw.partijen.map((partij, i) => (
                        <div
                          key={i}
                          className="flex items-baseline gap-1.5 text-sm"
                        >
                          <span className="text-muted-foreground shrink-0">
                            {PARTIJ_TYPE_LABELS[partij.type] ?? partij.type}:
                          </span>
                          <span className="font-medium truncate">
                            {partij.naam}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
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
