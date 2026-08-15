// NAV_01 §3 — één gedeeld goedkeuringslabel. Toont de serverstatus van de
// goedkeuringsmotor voor een object: geel = goedkeuring vereist en nog open,
// groen = gegeven. Geen aanvraag (n.v.t.) = niets tonen — bewust geen grijs
// label. Het label informeert en mag doorlinken, maar blokkeert nooit iets.
import {
  useGetGoedkeuringVoorObject,
  getGetGoedkeuringVoorObjectQueryKey,
} from "@workspace/api-client-react";
import { Clock, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GOEDKEURING_STATUS_INFO } from "@/components/goedkeuring/goedkeuring-widget";

interface GoedkeuringLabelProps {
  objectType: string;
  objectId: number;
  /** Optioneel: link naar de plek waar de goedkeuring afgehandeld wordt. */
  koppeling?: string;
  className?: string;
}

export function GoedkeuringLabel({ objectType, objectId, koppeling, className }: GoedkeuringLabelProps) {
  // retry: false — zonder goedkeuring:1 geeft het endpoint 403; dat is geen
  // fout om te herhalen, het label blijft dan gewoon afwezig.
  const { data: aanvraag } = useGetGoedkeuringVoorObject(objectType, objectId, {
    query: { retry: false, queryKey: getGetGoedkeuringVoorObjectQueryKey(objectType, objectId) },
  });
  // Afwezig bij n.v.t., bij laden en bij afgewezen/ingetrokken (de widget op de
  // detailpagina toont die uitzonderingen; het label dekt alleen open/gegeven).
  if (!aanvraag) return null;
  const open = aanvraag.status === "ingediend";
  const gegeven = aanvraag.status === "goedgekeurd";
  if (!open && !gegeven) return null;

  const laatsteStap = aanvraag.stappen?.[aanvraag.stappen.length - 1];
  const wie = open ? aanvraag.ingediend_door_naam : laatsteStap?.gebruiker_naam;
  const sinds = new Date(
    (open ? aanvraag.ingediend_op ?? aanvraag.aangemaakt_op : laatsteStap?.aangemaakt_op ?? aanvraag.afgehandeld_op ?? aanvraag.aangemaakt_op),
  ).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });

  const inhoud = (
    <span
      data-testid={`goedkeuring-label-${objectType}-${objectId}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        // Zelfde statuskleuren als de gedeelde goedkeuring-widget (één bron
        // binnen de goedkeuring-bouwstenen).
        GOEDKEURING_STATUS_INFO[open ? "ingediend" : "goedgekeurd"]?.kleur,
        !open && "border-green-200 bg-green-100 text-green-800",
        className,
      )}
    >
      {open ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      {open ? "Wacht op goedkeuring" : "Goedgekeurd"}
    </span>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {koppeling ? <Link href={koppeling}>{inhoud}</Link> : inhoud}
      </TooltipTrigger>
      <TooltipContent>
        {open
          ? `Ingediend${wie ? ` door ${wie}` : ""} op ${sinds} — wacht op goedkeuring`
          : `Goedgekeurd${wie ? ` door ${wie}` : ""} op ${sinds}`}
      </TooltipContent>
    </Tooltip>
  );
}
