import { useState } from "react";
import { useListGebouwPartijen, useListGebouwToewijzingen } from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HelpCircle, CheckCircle2, AlertCircle, Minus,
  Building2, Users, Mail, Layers, MapPin,
} from "lucide-react";

type StapStatus = "gereed" | "ontbrekend" | "optioneel";

type Stap = {
  id: string;
  titel: string;
  beschrijving: string;
  status: StapStatus;
  icoon: React.ReactNode;
};

type Fase = {
  nummer: number;
  titel: string;
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
          <span className="text-sm font-semibold text-slate-800">{stap.titel}</span>
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

  const verdiepingen: any[] = gebouw?.verdiepingen ?? [];

  const heeftAdres         = !!(gebouw?.adres && gebouw?.stad);
  const heeftOpdrachtgever = (partijen ?? []).some(
    (p: any) => p.type === "opdrachtgever" || p.type === "eigenaar",
  );
  const heeftBouwlagen  = verdiepingen.length > 0;
  const heeftToewijzing = (toewijzingen ?? []).length > 0;

  const fasen: Fase[] = [
    {
      nummer: 1,
      titel: "Project- en gebouwgegevens",
      stappen: [
        {
          id: "gebouw",
          icoon: <Building2 className="h-4 w-4" />,
          titel: "Project/gebouw aanmaken",
          beschrijving:
            "Registreer het gebouw met naam, projectnummer en type. Dit is de basis van het administratieve dossier.",
          status: "gereed",
        },
        {
          id: "gegevens",
          icoon: <MapPin className="h-4 w-4" />,
          titel: "Gebouwgegevens controleren",
          beschrijving:
            "Controleer en vul adres, postcode, stad, gebouwtype en aanvullende kenmerken in (tabblad 'Project & gegevens').",
          status: heeftAdres ? "gereed" : "ontbrekend",
        },
        {
          id: "opdrachtgever",
          icoon: <Users className="h-4 w-4" />,
          titel: "Opdrachtgever en contactgegevens toevoegen",
          beschrijving:
            "Koppel de opdrachtgever, eigenaar of aanvrager aan het project via 'Contactpartijen' in tabblad 'Project & gegevens'.",
          status: heeftOpdrachtgever ? "gereed" : "ontbrekend",
        },
        {
          id: "emails",
          icoon: <Mail className="h-4 w-4" />,
          titel: "E-mails uploaden en AI-contactvoorstellen controleren",
          beschrijving:
            "Importeer correspondentie via tabblad 'Beheer'. De AI haalt contactpersonen, telefoonnummers en NAW-gegevens op als voorstel. Controleer en bevestig de voorstellen in tabblad 'Project & gegevens'.",
          status: "optioneel",
        },
      ],
    },
    {
      nummer: 2,
      titel: "Locatie en plattegronden",
      stappen: [
        {
          id: "bouwlagen",
          icoon: <Layers className="h-4 w-4" />,
          titel: "Bouwlagen en plattegronden toevoegen",
          beschrijving:
            "Maak bouwlagen aan en upload een PDF-plattegrond per verdieping via tabblad 'Uitvoering'. Zonder plattegrond kunnen monteurs geen spots intekenen.",
          status: heeftBouwlagen ? "gereed" : "ontbrekend",
        },
      ],
    },
    {
      nummer: 3,
      titel: "FPS Projectteam",
      stappen: [
        {
          id: "toewijzingen",
          icoon: <Users className="h-4 w-4" />,
          titel: "Monteurs en FPS Projectteam toewijzen",
          beschrijving:
            "Wijs monteurs, controleurs en een projectadministrateur toe via tabblad 'Beheer' (Teamleden). Toegewezen monteurs krijgen toegang tot dit gebouw in de monteur-app.",
          status: heeftToewijzing ? "gereed" : "ontbrekend",
        },
      ],
    },
  ];

  const alleStappen      = fasen.flatMap(f => f.stappen);
  const aantalGereed     = alleStappen.filter(s => s.status === "gereed").length;
  const aantalOntbrekend = alleStappen.filter(s => s.status === "ontbrekend").length;
  const administratiefGereed = aantalOntbrekend === 0;

  let volgnummer = 0;

  return (
    <div className="space-y-5">
      {/* Voortgangsoverzicht */}
      <div
        className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
          administratiefGereed
            ? "bg-green-50 border-green-200"
            : "bg-amber-50 border-amber-200"
        }`}
      >
        <div className="mt-0.5 shrink-0">
          {administratiefGereed ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-500" />
          )}
        </div>
        <div className="flex-1 space-y-1">
          <p
            className={`text-sm font-semibold ${
              administratiefGereed ? "text-green-800" : "text-amber-800"
            }`}
          >
            {administratiefGereed
              ? "Administratief gereed om door te zetten naar uitvoering"
              : "Nog niet administratief gereed voor uitvoering"}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className="text-green-700 border-green-300 bg-white text-xs"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" /> {aantalGereed} gereed
            </Badge>
            {aantalOntbrekend > 0 && (
              <Badge
                variant="outline"
                className="text-amber-700 border-amber-300 bg-white text-xs"
              >
                <AlertCircle className="h-3 w-3 mr-1" /> {aantalOntbrekend} ontbrekend
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Stappen per fase */}
      <div className="max-h-[62vh] overflow-y-auto pr-1 space-y-5">
        {fasen.map((fase) => (
          <div key={fase.nummer}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Fase {fase.nummer} — {fase.titel}
              </span>
            </div>
            <div className="space-y-2">
              {fase.stappen.map((stap) => {
                volgnummer += 1;
                return <StapRij key={stap.id} stap={stap} volgnummer={volgnummer} />;
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 text-center pt-1">
        Stappen met status 'Optioneel' zijn aanbevolen maar niet vereist voor doorzetbaarheid naar uitvoering.
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
