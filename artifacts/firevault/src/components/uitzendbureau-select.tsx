// FACTUUR_01 — één plek om een uitzendbureau/onderaannemer vast te leggen.
//
// De bron van waarheid is de verwijzing naar een organisatie in het CRM
// (uitzendbureau_id → crm_klanten, type uitzendbureau/inlener). De vrije tekst
// blijft als naam-cache gevuld voor weergave en oude schermen. Staat de
// organisatie nog niet in het CRM, dan kan de beheerder tijdelijk vrije tekst
// invullen; die verschijnt daarna in Personeel → Uitzendbureau-koppelingen om
// alsnog gekoppeld te worden.
import { useListCrmKlanten } from "@workspace/api-client-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const VRIJE_TEKST = "__vrij__";

export function UitzendbureauSelect({
  label,
  uitzendbureauId,
  tekst,
  onChange,
  idPrefix = "uitzendbureau",
}: {
  label: string;
  uitzendbureauId: number | null | undefined;
  tekst: string;
  onChange: (waarde: { uitzendbureau_id: number | null; tekst: string }) => void;
  idPrefix?: string;
}) {
  const { data: organisaties } = useListCrmKlanten();
  // Keuzelijst: alle organisaties met type uitzendbureau/inlener, plus de
  // eventueel al gekoppelde organisatie (ook als die een ander type heeft).
  const keuzes = (organisaties ?? []).filter(
    (o) => o.type === "uitzendbureau" || o.type === "inlener" || o.id === uitzendbureauId,
  );

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-org`}>{label}</Label>
      <Select
        value={uitzendbureauId != null ? String(uitzendbureauId) : VRIJE_TEKST}
        onValueChange={(v) => {
          if (v === VRIJE_TEKST) {
            onChange({ uitzendbureau_id: null, tekst: "" });
            return;
          }
          const org = keuzes.find((o) => String(o.id) === v);
          onChange({ uitzendbureau_id: Number(v), tekst: org?.naam ?? tekst });
        }}
      >
        <SelectTrigger id={`${idPrefix}-org`}><SelectValue placeholder="Kies organisatie" /></SelectTrigger>
        <SelectContent>
          {keuzes.map((o) => (
            <SelectItem key={o.id} value={String(o.id)}>{o.naam}</SelectItem>
          ))}
          <SelectItem value={VRIJE_TEKST}>Niet in lijst (vrije tekst)</SelectItem>
        </SelectContent>
      </Select>
      {uitzendbureauId == null && (
        <>
          <Input
            id={`${idPrefix}-tekst`}
            value={tekst}
            onChange={(e) => onChange({ uitzendbureau_id: null, tekst: e.target.value })}
            placeholder="Naam van het bureau of bedrijf"
          />
          <p className="text-[11px] text-muted-foreground">
            Vrije tekst verschijnt bij Personeel → Uitzendbureau-koppelingen om later aan een CRM-organisatie te koppelen.
          </p>
        </>
      )}
    </div>
  );
}
