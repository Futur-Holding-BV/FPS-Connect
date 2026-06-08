import { useListGebruikers } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Mail, Phone, Building, Shield } from "lucide-react";

const rolKleur: Record<string, string> = {
  beheerder: "bg-primary/10 text-primary border-primary/20",
  monteur: "bg-blue-100 text-blue-800 border-blue-200",
  controleur: "bg-purple-100 text-purple-800 border-purple-200",
  klant: "bg-gray-100 text-gray-700 border-gray-200",
};

const rolLabel: Record<string, string> = {
  beheerder: "Beheerder",
  monteur: "Monteur",
  controleur: "Controleur",
  klant: "Klant",
};

function initialen(naam: string) {
  return naam
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

export default function Gebruikers() {
  const { data: gebruikers, isLoading } = useListGebruikers();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gebruikers</h1>
          <p className="text-muted-foreground mt-1">Beheer accounts en toegangsrechten.</p>
        </div>
        <Button>+ Gebruiker Toevoegen</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {["beheerder", "monteur", "controleur", "klant"].map((rol) => (
          <Card key={rol}>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">
                {gebruikers?.filter((g) => g.rol === rol).length ?? 0}
              </div>
              <div className="text-sm text-muted-foreground">{rolLabel[rol]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
        </div>
      )}

      {!isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {gebruikers?.map((gebruiker) => (
            <Card key={gebruiker.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12 text-sm border-2 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {initialen(gebruiker.naam ?? "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{gebruiker.naam}</span>
                      <Badge variant="outline" className={rolKleur[gebruiker.rol ?? ""]}>
                        <Shield className="h-3 w-3 mr-1" />
                        {rolLabel[gebruiker.rol ?? ""] ?? gebruiker.rol}
                      </Badge>
                      {!gebruiker.actief && (
                        <Badge variant="outline" className="bg-gray-100 text-gray-500">Inactief</Badge>
                      )}
                    </div>
                    <div className="space-y-1 mt-2">
                      {gebruiker.email && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{gebruiker.email}</span>
                        </div>
                      )}
                      {gebruiker.telefoon && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          <span>{gebruiker.telefoon}</span>
                        </div>
                      )}
                      {gebruiker.bedrijf && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Building className="h-3.5 w-3.5" />
                          <span>{gebruiker.bedrijf}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">Bewerken</Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!gebruikers?.length && (
            <Card className="col-span-2">
              <CardContent className="py-12 text-center text-muted-foreground">
                Geen gebruikers gevonden.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
