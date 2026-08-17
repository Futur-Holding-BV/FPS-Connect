import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  BookOpen, Search, Lightbulb, Users, Phone, FileText, Target, Building2, Clock,
} from "lucide-react";
import { CrmCoachPanel } from "@/components/crm-coach-panel";

interface KennisItem {
  id: string;
  categorie: string;
  vraag: string;
  uitleg: string;
  praktijkvoorbeeld: string;
  tip: string;
  icoon: React.ElementType;
}

const KENNIS: KennisItem[] = [
  {
    id: "mjop",
    categorie: "Woningcorporaties",
    vraag: "Waarom vragen we altijd naar het MJOP?",
    uitleg:
      "Het meerjaren onderhoudsplan (MJOP) van een woningcorporatie bevat alle geplande renovaties en onderhoudsprojecten voor de komende vijf tot tien jaar. Wie het MJOP kent, weet precies wanneer er budget is en welke gebouwen aan de beurt zijn.",
    praktijkvoorbeeld:
      "Domijn heeft een MJOP dat aangeeft dat complex Heelweg-Noord in 2026 wordt gerenoveerd. Door dit tijdig te weten, kan FPS een opname inplannen en een offerte voorbereiden ruim voordat de aanbesteding start.",
    tip: "Vraag al bij het eerste gesprek: 'Heeft u een actueel MJOP? Mogen we dat inzien?' Bij een ja maak je direct een afspraak voor een dieper gesprek.",
    icoon: FileText,
  },
  {
    id: "vertrouwen",
    categorie: "Relatieopbouw",
    vraag: "Waarom bezoeken we corporaties eerst zonder iets te verkopen?",
    uitleg:
      "Woningcorporaties hebben te maken met veel aanbieders. Wie direct met een offerte komt, wordt beschouwd als een verkoper. Wie eerst luistert, meedenkt en kennis deelt, wordt gezien als een betrouwbare partner. Dat vertrouwen leidt op de lange termijn tot grotere opdrachten.",
    praktijkvoorbeeld:
      "De eerste afspraak met woningcorporatie Plavei is gebruikt om de uitdagingen rond brandveiligheid in hun portefeuille te bespreken — zonder een offerte te noemen. Drie maanden later vroegen zij FPS om een offerte voor tien complexen.",
    tip: "Plan het eerste gesprek als een 'kennismaking en inventarisatie', niet als 'verkoopgesprek'. Neem een paar relevante referentiecases mee.",
    icoon: Users,
  },
  {
    id: "nabellen",
    categorie: "Offertes",
    vraag: "Waarom bellen we een week na een offerte?",
    uitleg:
      "Een offerte die wordt verstuurd en niet wordt nagebeld, wordt zelden gewonnen. Na een week is de offerte vers in het geheugen van de klant, maar de urgentie begint te zakken. Eén telefoontje op het juiste moment toont betrokkenheid en geeft de kans om vragen te beantwoorden.",
    praktijkvoorbeeld:
      "FPS stuurde een offerte van 28.000 euro naar een VvE-beheerder. Na één week belde de accountmanager op. De beheerder had een technische vraag die telefonisch in twee minuten werd beantwoord. De opdracht volgde de week erna.",
    tip: "Plan het nabellen direct in je agenda als je de offerte verstuurt. Gebruik de tekst: 'Is alles duidelijk? Zijn er nog vragen?'",
    icoon: Phone,
  },
  {
    id: "hierarchie",
    categorie: "Besluitvorming",
    vraag: "Waarom spreken we eerst de opzichter, daarna de inkoper?",
    uitleg:
      "Bij woningcorporaties en zorginstellingen zijn er meerdere mensen betrokken bij een aankoopbeslissing. De opzichter begrijpt het technische probleem en kan FPS intern aanbevelen. Zonder technische aanbeveling komt een offerte nooit bij de juiste beslisser terecht.",
    praktijkvoorbeeld:
      "Bij Elkien nam FPS contact op met de technisch beheerder. Die adviseerde intern positief over FPS na een rondleiding. Toen het inkoopteam de aanvraag uitschreef, stond FPS al op de lijst van vertrouwde leveranciers.",
    tip: "Vraag na een technisch gesprek altijd: 'Wie is verder betrokken bij deze beslissing? Met wie moet ik ook spreken?' Maak dan een warme introductie.",
    icoon: Building2,
  },
  {
    id: "key-accounts",
    categorie: "Relatiebeheer",
    vraag: "Hoe onderhoud je een key account relatie?",
    uitleg:
      "Key accounts zijn klanten die structureel bijdragen aan de omzet van FPS. Ze verdienen meer aandacht dan gewone klanten. Regelmatig persoonlijk contact houdt de relatie warm en geeft inzicht in nieuwe kansen voordat een aanbesteding start.",
    praktijkvoorbeeld:
      "FPS bezoekt woningcorporatie Domijn elk kwartaal — ook als er geen lopende opdrachten zijn. In een van die gesprekken vertelde de opzichter over een nieuw complex dat in het MJOP was opgenomen. FPS stond als eerste klaar met een offerte.",
    tip: "Maak elk kwartaal een vast overleg met je key accounts. Agenda: actuele projecten, tevredenheid, komende plannen. Maximaal een uur.",
    icoon: Target,
  },
  {
    id: "aanbestedingen",
    categorie: "Gemeenten",
    vraag: "Hoe werken aanbestedingen bij gemeenten?",
    uitleg:
      "Gemeenten zijn wettelijk verplicht om opdrachten boven een bepaalde drempelwaarde Europees aan te besteden. Wie pas reageert als de aanbesteding gepubliceerd is, is te laat. Het gaat erom je naam bekend te maken bij de juiste ambtenaren ruim vóór de aanbesteding.",
    praktijkvoorbeeld:
      "Gemeente Enschede schreef een aanbesteding uit voor brandveiligheidsinspecties. FPS had een jaar eerder al een gesprek gehad met de technisch adviseur. Daardoor kende FPS de eisen al voor publicatie en kon een sterk aanbod schrijven.",
    tip: "Zoek op TenderNed en Negometrix naar lopende en komende aanbestedingen in brandveiligheid. Zet een abonnement op e-mailmeldingen.",
    icoon: FileText,
  },
  {
    id: "signaleren",
    categorie: "Kansen herkennen",
    vraag: "Hoe herken je een goede commerciële kans?",
    uitleg:
      "Een kans is goed als er een technische noodzaak is, budget beschikbaar is, en een beslisser betrokken is die FPS kent. Ontbreekt één van deze drie, dan is de kans nog niet rijp. Verplaats hem dan naar 'signaal' en onderhoud de relatie.",
    praktijkvoorbeeld:
      "Een VvE-beheerder meldt dat er branddeuren afgekeurd zijn bij een inspectie. Er is een wettelijke verplichting om dit te herstellen (noodzaak), de VvE heeft geld in het reservefonds (budget), en de beheerder belt FPS direct (beslisser). Dit is een rijpe kans.",
    tip: "Gebruik de drie-check: (1) Is er een wettelijke of technische urgentie? (2) Is er budget? (3) Spreek ik met de juiste persoon? Drie keer ja = nu handelen.",
    icoon: Lightbulb,
  },
  {
    id: "contactfrequentie",
    categorie: "Contactbeheer",
    vraag: "Hoe vaak nemen we contact op met prospects?",
    uitleg:
      "Prospects die te weinig aandacht krijgen, worden vergeten. Te veel contact werkt irritant. De juiste frequentie hangt af van de fase in het commerciële traject. In de warme fase is één contact per maand ideaal; bij actieve trajecten wekelijks.",
    praktijkvoorbeeld:
      "FPS had een prospect in de 'eerste contact'-fase staan. Na drie maanden zonder contact werd de klant niet meer herkend. De concurrent had in die tijd twee keer gebeld. FPS verloor de opdracht.",
    tip: "Stel een taak in Connect bij elke prospect: 'Volgende contactmoment over X weken'. Verander de frequentie op basis van de fase.",
    icoon: Clock,
  },
];

const CATEGORIEEN = [...new Set(KENNIS.map(k => k.categorie))];

export default function KennisbibliothkeekPagina() {
  const [zoek, setZoek] = useState("");
  const [catFilter, setCatFilter] = useState<string | null>(null);

  const gefilterd = KENNIS.filter(k => {
    const zoekMatch = !zoek.trim() ||
      k.vraag.toLowerCase().includes(zoek.toLowerCase()) ||
      k.uitleg.toLowerCase().includes(zoek.toLowerCase()) ||
      k.categorie.toLowerCase().includes(zoek.toLowerCase());
    const catMatch = !catFilter || k.categorie === catFilter;
    return zoekMatch && catMatch;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="bg-primary/10 text-primary rounded-lg p-2.5">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h1 data-paginatitel className="text-xl font-bold">Kennisbibliotheek</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Commerciële bedrijfskennis van FPS — leer hoe ervaren accountmanagers werken
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Zoek in de kennisbibliotheek..."
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setCatFilter(null)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  !catFilter
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Alles
              </button>
              {CATEGORIEEN.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat === catFilter ? null : cat)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    catFilter === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {gefilterd.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Geen kennisitems gevonden voor deze zoekopdracht.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {gefilterd.map((item) => {
                const Icoon = item.icoon;
                return (
                  <Card key={item.id} className="flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <Icoon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <Badge variant="outline" className="text-[10px]">{item.categorie}</Badge>
                          <CardTitle className="text-sm leading-snug">{item.vraag}</CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-3 text-sm">
                      <p className="text-muted-foreground leading-relaxed">{item.uitleg}</p>

                      <div className="rounded-md bg-slate-50 border p-3 space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Praktijkvoorbeeld
                        </p>
                        <p className="text-sm text-foreground/80 leading-relaxed">{item.praktijkvoorbeeld}</p>
                      </div>

                      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
                          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Tip</p>
                        </div>
                        <p className="text-sm text-amber-900 leading-relaxed">{item.tip}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:w-72 shrink-0">
          <div className="sticky top-4 rounded-lg border bg-card p-4">
            <CrmCoachPanel scherm="kennisbibliotheek" />
          </div>
        </div>
      </div>
    </div>
  );
}
