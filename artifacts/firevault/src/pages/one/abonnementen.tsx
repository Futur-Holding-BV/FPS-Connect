import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CreditCard, FileCheck2, Headphones, BarChart3, Construction } from "lucide-react";

const PAKETTEN = [
  { naam: "Basis", prijs: "149", per: "maand", omschrijving: "Registratie en beheer van gebouwen en spots.", kleur: "border-slate-200" },
  { naam: "Beheer", prijs: "349", per: "maand", omschrijving: "Inclusief inspecties, onderhoud en rapportages.", kleur: "border-primary/30 bg-primary/5" },
  { naam: "Volledig", prijs: "699", per: "maand", omschrijving: "Alles uit Beheer plus HRM, calculatie en klantportaal.", kleur: "border-slate-200" },
];

const GEPLANDE_FUNCTIES = [
  { icoon: FileCheck2, titel: "Abonnementsbeheer", omschrijving: "Inzien en aanpassen van uw abonnementspakket." },
  { icoon: CreditCard, titel: "Facturen", omschrijving: "Factuurhistorie downloaden en betalingsstatus bekijken." },
  { icoon: Headphones, titel: "Support", omschrijving: "Direct contact met uw contactpersoon bij FPS Brandpreventie." },
  { icoon: BarChart3, titel: "Gebruiksstatistieken", omschrijving: "Inzicht in gebruik per module en gebouw." },
];

export default function OneAbonnementen() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 md:p-8">
        <Badge className="mb-4 bg-white/10 text-white border-white/20 hover:bg-white/20">
          FPS One — Klantomgeving
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Abonnementen</h1>
        <p className="text-slate-300 mt-2 max-w-xl">
          Beheer uw abonnement, factuurhistorie en contactgegevens bij FPS Brandpreventie.
        </p>
        <div className="mt-5 flex items-center gap-2 text-sm text-amber-400">
          <Construction className="h-4 w-4 shrink-0" />
          <span>Deze module is in voorbereiding en wordt binnenkort beschikbaar gesteld.</span>
        </div>
      </div>

      {/* Paketten overzicht */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Beschikbare pakketten
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PAKETTEN.map((p) => (
            <Card key={p.naam} className={`${p.kleur} opacity-70`}>
              <CardContent className="pt-5">
                <Badge variant="outline" className="mb-3">{p.naam}</Badge>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-bold">€ {p.prijs}</span>
                  <span className="text-sm text-muted-foreground">/{p.per}</span>
                </div>
                <p className="text-xs text-muted-foreground">{p.omschrijving}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Geplande functies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {GEPLANDE_FUNCTIES.map((f) => (
          <Card key={f.titel} className="border-dashed opacity-70">
            <CardContent className="pt-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <f.icoon className="h-5 w-5 text-slate-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{f.titel}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                    In voorbereiding
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{f.omschrijving}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
