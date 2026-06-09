import { useState } from "react";
import { useListGebouwPartijen, useListGebouwToewijzingen } from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HelpCircle, CheckCircle2, AlertCircle, Minus,
  Building2, Users, Mail, Layers, BookOpen,
  MapPin, ClipboardCheck, FileText, CheckSquare, Sparkles,
} from "lucide-react";

type StapStatus = "gereed" | "ontbrekend" | "optioneel";

type Stap = {
  id: string;
  titel: string;
  beschrijving: string;
  status: StapStatus;
  icoon: React.ReactNode;
};

type Segment = {
  nummer: number;
  titel: string;
  noodzakelijk: boolean;
  stappen: Stap[];
};

function StatusBadge({ status }: { status: StapStatus }) {
  if (status === "gereed") {
    return (
      <span className="flex items-center gap-1 text-green-700 font-medium text-xs shrink-0">
        <CheckCircle2 className="h-4 w-4 text-green-600" /> Gereed
      </span>
    );
  }
  if (status === "ontbrekend") {
    return (
      <span className="flex items-center gap-1 text-amber-700 font-medium text-xs shrink-0">
        <AlertCircle className="h-4 w-4 text-amber-500" /> Ontbrekend
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-slate-400 text-xs shrink-0">
      <Minus className="h-3.5 w-3.5" /> Optioneel
    </span>
  );
}

function StapRij({ stap, volgnummer }: { stap: Stap; volgnummer: number }) {
  const ringKleur =
    stap.status === "gereed"      ? "border-green-400 bg-green-50"
    : stap.status === "ontbrekend" ? "border-amber-400 bg-amber-50"
    : "border-slate-200 bg-slate-50";

  return (
    <div className={`flex gap-3 rounded-lg border p-3 ${ringKleur}`}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-500">
        {volgnummer}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{stap.titel}</span>
          </div>
          <StatusBadge status={stap.status} />
        </div>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{stap.beschrijving}</p>
      </div>
    </div>
  );
}

function StappenplanInhoud({
  gebouwId,
  gebouw,
}: {
  gebouwId: number;
  gebouw: any;
}) {
  const { data: partijen }     = useListGebouwPartijen(gebouwId);
  const { data: toewijzingen } = useListGebouwToewijzingen(gebouwId);

  const stats                  = gebouw?.stats;
  const verdiepingen: any[]    = gebouw?.verdiepingen ?? [];

  const heeftOpdrachtgever = (partijen ?? []).some(
    (p: any) => p.type === "opdrachtgever" || p.type === "eigenaar",
  );
  const heeftAdres      = !!(gebouw?.adres && gebouw?.stad);
  const heeftBouwlagen  = verdiepingen.length > 0;
  const heeftToewijzing = (toewijzingen ?? []).length > 0;
  const heeftSpots      = (stats?.totaal ?? 0) > 0;
  const heeftGereedSpots= (stats?.goedgekeurd ?? 0) > 0;
  const isGereedgemeld  = !!gebouw?.gereed_op;

  const segmenten: Segment[] = [
    {
      nummer: 1,
      titel: "Project- en gebouwgegevens",
      noodzakelijk: true,
      stappen: [
        {
          id: "gebouw",
          icoon: <Building2 className="h-4 w-4" />,
          titel: "Project/gebouw aanmaken",
          beschrijving: "Registreer het gebouw met naam, projectnummer en type. Dit is de basis van het dossier.",
          status: "gereed",
        },
        {
          id: "gegevens",
          icoon: <MapPin className="h-4 w-4" />,
          titel: "Gebouwgegevens aanvullen",
          beschrijving: "Voeg adres, postcode, stad, gebouwtype en aanvullende kenmerken toe.",
          status: heeftAdres ? "gereed" : "ontbrekend",
        },
        {
          id: "opdrachtgever",
          icoon: <Users className="h-4 w-4" />,
          titel: "Opdrachtgever/contactgegevens toevoegen",
          beschrijving: "Koppel de opdrachtgever, eigenaar of aanvrager aan het project via 'Contactpartijen' (segment 1).",
          status: heeftOpdrachtgever ? "gereed" : "ontbrekend",
        },
        {
          id: "emails",
          icoon: <Mail className="h-4 w-4" />,
          titel: "E-mails uploaden voor AI-contactextractie",
          beschrijving: "Importeer correspondentie via segment 3. De AI haalt automatisch contactpersonen, telefoonnummers en NAW-gegevens op als voorstel.",
          status: "optioneel",
        },
      ],
    },
    {
      nummer: 2,
      titel: "Uitvoering op locatie",
      noodzakelijk: true,
      stappen: [
        {
          id: "bouwlagen",
          icoon: <Layers className="h-4 w-4" />,
          titel: "Bouwlagen en plattegronden toevoegen",
          beschrijving: "Maak bouwlagen aan en upload een PDF-plattegrond per verdieping. Zonder plattegrond kunnen geen spots worden geplaatst.",
          status: heeftBouwlagen ? "gereed" : "ontbrekend",
        },
        {
          id: "spots",
          icoon: <MapPin className="h-4 w-4" />,
          titel: "Spots plaatsen op de plattegrond",
          beschrijving: "Open een plattegrond, activeer de plaatsingsmodus en klik om brandpreventieve voorzieningen in te tekenen.",
          status: heeftSpots ? "gereed" : (heeftBouwlagen ? "ontbrekend" : "optioneel"),
        },
        {
          id: "gereedmelden",
          icoon: <ClipboardCheck className="h-4 w-4" />,
          titel: "Spots als 'Gereed' markeren",
          beschrijving: "Verander de status van voltooide spots naar 'Gereed' na inspectie of oplevering.",
          status: heeftGereedSpots ? "gereed" : (heeftSpots ? "ontbrekend" : "optioneel"),
        },
        {
          id: "rapport",
          icoon: <FileText className="h-4 w-4" />,
          titel: "PDF/opleverrapport genereren",
          beschrijving: "Gebruik 'PDF / afdrukken' (header of segment 2) voor een volledig overzichtsrapport met plattegronden en spotdetails.",
          status: "optioneel",
        },
      ],
    },
    {
      nummer: 3,
      titel: "Beheer en communicatie",
      noodzakelijk: false,
      stappen: [
        {
          id: "gebruikers",
          icoon: <Users className="h-4 w-4" />,
          titel: "Monteurs en projectleider toewijzen",
          beschrijving: "Wijs monteurs, controleurs en een projectadministrateur toe via segment 3 (Teamleden). Toegewezen monteurs kunnen op het gebouw werken.",
          status: heeftToewijzing ? "gereed" : "ontbrekend",
        },
        {
          id: "bibliotheek",
          icoon: <BookOpen className="h-4 w-4" />,
          titel: "Bibliotheekkeuzes controleren",
          beschrijving: "Controleer in de Bibliotheek of de juiste applicaties, toepassingen en testdocumenten beschikbaar zijn.",
          status: "optioneel",
        },
        {
          id: "gebouw_gereed",
          icoon: <CheckSquare className="h-4 w-4" />,
          titel: "Gebouw gereedmelden",
          beschrijving: "Meld het volledige project als gereed via de knop 'Gereedmelden' (header). Dit sluit het dossier af.",
          status: isGereedgemeld ? "gereed" : "optioneel",
        },
      ],
    },
  ];

  const alleStappen      = segmenten.flatMap(s => s.stappen);
  const aantalGereed     = alleStappen.filter(s => s.status === "gereed").length;
  const aantalOntbrekend = alleStappen.filter(s => s.status === "ontbrekend").length;

  let volgnummer = 0;

  return (
    <div className="space-y-5">
      {/* Voortgangsoverzicht */}
      <div className="flex items-center gap-3 rounded-lg bg-slate-50 border px-4 py-3">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" /> {aantalGereed} gereed
            </Badge>
            {aantalOntbrekend > 0 && (
              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-xs">
                <AlertCircle className="h-3 w-3 mr-1" /> {aantalOntbrekend} ontbrekend
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {aantalOntbrekend === 0
              ? "Alle verplichte stappen zijn afgerond."
              : "Vul de ontbrekende stappen in voor een volledig dossier."}
          </p>
        </div>
      </div>

      {/* Stappen per segment */}
      <div className="max-h-[62vh] overflow-y-auto pr-1 space-y-5">
        {segmenten.map((seg) => (
          <div key={seg.nummer}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Segment {seg.nummer} — {seg.titel}
              </span>
              {seg.noodzakelijk ? (
                <Badge className="text-xs bg-primary/10 text-primary border-primary/20 font-normal">
                  Noodzakelijk
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
                  Aanvullend
                </Badge>
              )}
              {seg.nummer === 3 && (
                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
            </div>
            <div className="space-y-2">
              {seg.stappen.map((stap) => {
                volgnummer += 1;
                return <StapRij key={stap.id} stap={stap} volgnummer={volgnummer} />;
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 text-center pt-1">
        Stappen met status 'Optioneel' zijn niet verplicht maar aanbevolen voor een compleet dossier.
      </p>
    </div>
  );
}

export default function GebouwStappenplan({
  gebouwId,
  gebouw,
}: {
  gebouwId: number;
  gebouw: any;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <HelpCircle className="h-4 w-4" /> Stappenplan
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-[hsl(12,90%,50%)]" />
              Stappenplan — {gebouw?.naam ?? "Gebouw"}
            </DialogTitle>
          </DialogHeader>
          {open && (
            <StappenplanInhoud gebouwId={gebouwId} gebouw={gebouw} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
