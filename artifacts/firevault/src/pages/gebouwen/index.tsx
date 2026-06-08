import { useTranslation } from "react-i18next";
import { useListGebouwen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Search, Building } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { GebouwAanmakenDialog } from "./gebouw-aanmaken-dialog";

const BEHEERDER_ROLLEN = ["beheerder", "hoofdbeheerder"];

export default function Gebouwen() {
  const { t } = useTranslation();
  const { gebruiker } = useAuth();
  const [search, setSearch] = useState("");
  const { data: gebouwen, isLoading } = useListGebouwen({ zoek: search });
  const isBeheerder =
    !!gebruiker?.rol && BEHEERDER_ROLLEN.includes(gebruiker.rol as string);

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
