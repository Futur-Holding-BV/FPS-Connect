import { useListGrootboekrekeningen } from "@workspace/api-client-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";

// ── Grootboekrekening-keuzelijst (ADMINISTRATIE_01) ───────────────────────────
// Vervangt overal de vrije-tekstinvoer: kiezen kan alleen uit het
// rekeningschema (nummer + omschrijving). Een bestaande waarde die niet (meer)
// in het schema staat, blijft zichtbaar met een waarschuwing zodat historische
// data leesbaar blijft, maar nieuwe keuzes komen altijd uit het schema.
// Zolang er nog géén schema is ingelezen, is er niets te kiezen en meldt de
// lijst dat expliciet — vrije tekst komt niet terug.

const LEEG = "__geen__";

export function GrootboekSelect({
  value,
  onChange,
  werkgeverId,
  placeholder = "Kies grootboekrekening",
  className,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  werkgeverId?: number | null;
  placeholder?: string;
  className?: string;
}) {
  const { data, isLoading } = useListGrootboekrekeningen(
    werkgeverId != null ? { werkgever_id: werkgeverId } : undefined,
    { query: { queryKey: ["grootboekrekeningen", werkgeverId ?? "alle"] } },
  );
  const rekeningen = (data ?? []).filter((r) => r.actief);
  const huidige = (value ?? "").trim();
  const bekend = huidige === "" || rekeningen.some((r) => r.nummer === huidige);

  return (
    <div className={className}>
      <Select
        value={huidige === "" ? LEEG : huidige}
        onValueChange={(v) => onChange(v === LEEG ? null : v)}
      >
        <SelectTrigger className="font-mono">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LEEG}>
            <span className="text-muted-foreground">— Geen —</span>
          </SelectItem>
          {!bekend && (
            <SelectItem value={huidige}>
              <span className="font-mono">{huidige}</span>
              <span className="ml-2 text-amber-700 text-xs">niet in rekeningschema</span>
            </SelectItem>
          )}
          {rekeningen.map((r) => (
            <SelectItem key={r.id} value={r.nummer}>
              <span className="font-mono">{r.nummer}</span>
              {r.omschrijving ? <span className="ml-2 text-muted-foreground">{r.omschrijving}</span> : null}
            </SelectItem>
          ))}
          {rekeningen.length === 0 && !isLoading && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Nog geen rekeningschema ingelezen — zie Beheer → Boekhouding.
            </div>
          )}
        </SelectContent>
      </Select>
      {!bekend && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
          <AlertTriangle className="h-3 w-3" /> Deze rekening staat niet in het rekeningschema.
        </p>
      )}
    </div>
  );
}
