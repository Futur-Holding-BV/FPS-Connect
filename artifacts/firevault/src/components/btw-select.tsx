import { useListBtwCodes } from "@workspace/api-client-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";

// ── Btw-code-keuzelijst (ADMINISTRATIE_02 §1) ─────────────────────────────────
// Vervangt overal de vrije-tekst-/vaste-lijst-invoer: kiezen kan alleen uit het
// btw-schema van de administratie (code + omschrijving + percentage). Een
// bestaande waarde die niet (meer) in het schema staat, blijft zichtbaar met
// een waarschuwing. Zolang er nog géén btw-schema is ingelezen, valt de lijst
// terug op de gangbare AccountView-conventie (H/L/V/0) zodat het werk niet
// stilvalt — zodra het schema gevuld is, telt alleen het schema.

const LEEG = "__geen__";

const FALLBACK: Array<{ code: string; omschrijving: string }> = [
  { code: "H", omschrijving: "Hoog 21%" },
  { code: "L", omschrijving: "Laag 9%" },
  { code: "V", omschrijving: "Verlegd" },
  { code: "0", omschrijving: "Vrijgesteld / 0%" },
];

export function BtwSelect({
  value,
  onChange,
  werkgeverId,
  placeholder = "Kies btw-code",
  className,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  werkgeverId?: number | null;
  placeholder?: string;
  className?: string;
}) {
  const { data, isLoading } = useListBtwCodes(
    werkgeverId != null ? { werkgever_id: werkgeverId } : undefined,
    { query: { queryKey: ["btw-codes", werkgeverId ?? "gekoppeld"] } },
  );
  const schema = (data ?? []).filter((c) => c.actief);
  const heeftSchema = schema.length > 0;
  const opties = heeftSchema
    ? schema.map((c) => ({
        code: c.code,
        omschrijving: c.omschrijving || (c.percentage != null ? `${c.percentage}%` : ""),
      }))
    : FALLBACK;
  const huidige = (value ?? "").trim();
  const bekend = huidige === "" || opties.some((o) => o.code === huidige);

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
              <span className="ml-2 text-amber-700 text-xs">niet in btw-schema</span>
            </SelectItem>
          )}
          {opties.map((o) => (
            <SelectItem key={o.code} value={o.code}>
              <span className="font-mono">{o.code}</span>
              {o.omschrijving ? <span className="ml-2 text-muted-foreground">{o.omschrijving}</span> : null}
            </SelectItem>
          ))}
          {!heeftSchema && !isLoading && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Nog geen btw-schema ingelezen — standaardlijst actief. Zie Beheer → Boekhouding.
            </div>
          )}
        </SelectContent>
      </Select>
      {!bekend && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
          <AlertTriangle className="h-3 w-3" /> Deze btw-code staat niet in het btw-schema.
        </p>
      )}
    </div>
  );
}
