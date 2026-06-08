import { useListAbonnementen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Building, Users, Calendar, Star } from "lucide-react";

const niveauLabel: Record<string, string> = {
  basis: "Basis",
  beheer: "Beheer",
  volledig: "Volledig",
};

const niveauKleur: Record<string, string> = {
  basis: "border-gray-200",
  beheer: "border-primary/40",
  volledig: "border-primary",
};

const niveauBadge: Record<string, string> = {
  basis: "bg-gray-100 text-gray-700",
  beheer: "bg-primary/10 text-primary",
  volledig: "bg-primary text-white",
};

const plannen = [
  {
    niveau: "basis",
    naam: "Basis",
    prijs: "€ 149",
    periode: "/maand",
    beschrijving: "Voor kleine portfolios met basisregistratie.",
    functies: [
      "Tot 3 gebouwen",
      "Tot 5 gebruikers",
      "Assetoverzicht & registratie",
      "Dashboard",
      "PDF-export",
    ],
    populair: false,
  },
  {
    niveau: "beheer",
    naam: "Beheer",
    prijs: "€ 349",
    periode: "/maand",
    beschrijving: "Voor professioneel beheer van meerdere panden.",
    functies: [
      "Tot 10 gebouwen",
      "Tot 15 gebruikers",
      "Alles uit Basis",
      "Onderhoudsbeheer",
      "Inspecties & keuringen",
      "QR-codes",
      "PDF/Excel-export",
    ],
    populair: true,
  },
  {
    niveau: "volledig",
    naam: "Volledig",
    prijs: "€ 699",
    periode: "/maand",
    beschrijving: "Onbeperkt, met alle functies en API-toegang.",
    functies: [
      "Onbeperkt gebouwen",
      "Onbeperkt gebruikers",
      "Alles uit Beheer",
      "3D gebouwweergave",
      "API-toegang",
      "SLA & prioriteitsondersteuning",
      "Meerdere organisaties",
    ],
    populair: false,
  },
];

export default function Abonnementen() {
  const { data: abonnementen, isLoading } = useListAbonnementen();

  const actief = abonnementen?.filter((a) => a.actief);

  return (
    <div className="space-y-10 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Abonnementen</h1>
        <p className="text-muted-foreground mt-1">Beheer abonnementen en kies het juiste pakket.</p>
      </div>

      {/* Actieve abonnementen */}
      {!isLoading && actief && actief.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Actieve Abonnementen</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {actief.map((abo) => (
              <Card key={abo.id} className={`border-2 ${niveauKleur[abo.niveau ?? "basis"]}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge className={niveauBadge[abo.niveau ?? "basis"]}>
                      {niveauLabel[abo.niveau ?? "basis"]}
                    </Badge>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Actief
                    </Badge>
                  </div>
                  <CardTitle className="text-base mt-2">{abo.klant_naam}</CardTitle>
                  <CardDescription>{abo.klant_email}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-2xl font-bold">
                    € {Number(abo.prijs_per_maand).toFixed(0)}
                    <span className="text-sm font-normal text-muted-foreground">/maand</span>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {abo.max_gebouwen && (
                      <div className="flex items-center gap-2">
                        <Building className="h-3.5 w-3.5" />
                        Max. {abo.max_gebouwen} gebouwen
                      </div>
                    )}
                    {abo.max_gebruikers && (
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" />
                        Max. {abo.max_gebruikers} gebruikers
                      </div>
                    )}
                    {abo.start_datum && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        Gestart: {new Date(abo.start_datum).toLocaleDateString("nl-NL")}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1">Bewerken</Button>
                    <Button variant="ghost" size="sm" className="text-destructive">Opzeggen</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Abonnementspakketten */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Beschikbare Pakketten</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {plannen.map((plan) => (
            <Card
              key={plan.niveau}
              className={`border-2 relative ${plan.populair ? "border-primary shadow-lg" : "border-border"}`}
            >
              {plan.populair && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-white px-3">
                    <Star className="h-3 w-3 mr-1" /> Meest gekozen
                  </Badge>
                </div>
              )}
              <CardHeader>
                <Badge variant="outline" className={`w-fit mb-1 ${niveauBadge[plan.niveau]}`}>
                  {plan.naam}
                </Badge>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.prijs}</span>
                  <span className="text-muted-foreground text-sm">{plan.periode}</span>
                </div>
                <CardDescription>{plan.beschrijving}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.functies.map((functie) => (
                    <li key={functie} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                      {functie}
                    </li>
                  ))}
                </ul>
                <Button className="w-full" variant={plan.populair ? "default" : "outline"}>
                  {plan.populair ? "Activeren" : "Kies pakket"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
