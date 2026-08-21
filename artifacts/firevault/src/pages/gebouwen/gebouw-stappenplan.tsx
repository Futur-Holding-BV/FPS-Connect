import { useState } from "react";
import { useListGebouwPartijen, useListGebouwToewijzingen } from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipTrigger, TooltipContent,
} from "@/components/ui/tooltip";
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
  ontbrekendeVelden?: string[];
  doelTab?: string;
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

function StapRij({
  stap,
  volgnummer,
  onNavigeer,
  onSluit,
}: {
  stap: Stap;
  volgnummer: number;
  onNavigeer?: (tab: string) => void;
  onSluit: () => void;
}) {
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
        {stap.status === "ontbrekend" && (stap.ontbrekendeVelden?.length ?? 0) > 0 && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-amber-800">
              Vul in deze stap aan: {stap.ontbrekendeVelden!.join(", ")}.
            </p>
            {stap.doelTab && onNavigeer && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 border-amber-400 bg-white text-xs text-amber-800"
                onClick={() => {
                  onSluit();
                  onNavigeer(stap.doelTab!);
                }}
              >
                Naar deze stap
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StappenplanInhoud({
  gebouwId,
  gebouw,
  onNavigeer,
  onSluit,
}: {
  gebouwId: number;
  gebouw: any;
  onNavigeer?: (tab: string) => void;
  onSluit: () => void;
}) {
  const { data: partijen }     = useListGebouwPartijen(gebouwId);
  const { data: toewijzingen } = useListGebouwToewijzingen(gebouwId);

  const verdiepingen: any[] = gebouw?.verdiepingen ?? [];

  const opdrachtgever = (partijen ?? []).find(
    (p: any) => p.type === "opdrachtgever" || p.type === "eigenaar",
  );
  const ontbrekendeProjectvelden = [
    !gebouw?.naam?.trim() ? "project-/gebouwnaam" : null,
    !gebouw?.omschrijving?.trim() ? "opdrachtomschrijving" : null,
  ].filter((veld): veld is string => veld != null);
  const ontbrekendeGebouwNaw = [
    !gebouw?.adres?.trim() ? "adres" : null,
    !gebouw?.postcode?.trim() ? "postcode" : null,
    !gebouw?.stad?.trim() ? "plaats" : null,
  ].filter((veld): veld is string => veld != null);
  const ontbrekendeOpdrachtgeverNaw = opdrachtgever
    ? [
        !opdrachtgever.naam?.trim() ? "naam opdrachtgever" : null,
        !opdrachtgever.adres?.trim() ? "adres opdrachtgever" : null,
        !opdrachtgever.postcode?.trim() ? "postcode opdrachtgever" : null,
        !opdrachtgever.plaats?.trim() ? "plaats opdrachtgever" : null,
      ].filter((veld): veld is string => veld != null)
    : ["opdrachtgever"];
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
            "Leg de project-/gebouwnaam en opdrachtomschrijving vast. Deze gegevens reizen mee naar opname en calculatie.",
          status: ontbrekendeProjectvelden.length === 0 ? "gereed" : "ontbrekend",
          ontbrekendeVelden: ontbrekendeProjectvelden,
          doelTab: "project",
        },
        {
          id: "gegevens",
          icoon: <MapPin className="h-4 w-4" />,
          titel: "Gebouw-/projectadres controleren",
          beschrijving:
            "Controleer het NAW-adres van de uitvoeringslocatie. Overige gebouwkenmerken volgen pas wanneer opname of uitvoering ze nodig heeft.",
          status: ontbrekendeGebouwNaw.length === 0 ? "gereed" : "ontbrekend",
          ontbrekendeVelden: ontbrekendeGebouwNaw,
          doelTab: "project",
        },
        {
          id: "opdrachtgever",
          icoon: <Users className="h-4 w-4" />,
          titel: "Opdrachtgever controleren",
          beschrijving:
            "Controleer de gekoppelde CRM-opdrachtgever en diens NAW-gegevens bij de contactpartijen.",
          status: ontbrekendeOpdrachtgeverNaw.length === 0 ? "gereed" : "ontbrekend",
          ontbrekendeVelden: ontbrekendeOpdrachtgeverNaw,
          doelTab: "project",
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
          ontbrekendeVelden: heeftBouwlagen ? [] : ["minimaal één bouwlaag"],
          doelTab: "uitvoering",
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
          ontbrekendeVelden: heeftToewijzing ? [] : ["projectteam of monteur"],
          doelTab: "beheer",
        },
      ],
    },
  ];

  let volgnummer = 0;

  return (
    <div className="space-y-5">
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
                return (
                  <StapRij
                    key={stap.id}
                    stap={stap}
                    volgnummer={volgnummer}
                    onNavigeer={onNavigeer}
                    onSluit={onSluit}
                  />
                );
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
  compact,
  onNavigeer,
}: {
  gebouwId: number;
  gebouw: any;
  compact?: boolean;
  onNavigeer?: (tab: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {compact ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setOpen(true)}
              aria-label="Stappenplan"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Stappenplan</TooltipContent>
        </Tooltip>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <HelpCircle className="h-4 w-4" /> Stappenplan
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-[hsl(12,90%,50%)]" />
              Stappenplan — {gebouw?.naam ?? "Gebouw"}
            </DialogTitle>
          </DialogHeader>
          {open && (
            <StappenplanInhoud
              gebouwId={gebouwId}
              gebouw={gebouw}
              onNavigeer={onNavigeer}
              onSluit={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
