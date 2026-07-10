import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useListArtikelen, getListArtikelenQueryKey } from "@workspace/api-client-react";

interface Props {
  value: number | null;
  onValueChange: (artikelId: number, artikel: { naam: string; code?: string | null; eenheid: string }) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ArtikelPicker({ value, onValueChange, disabled, placeholder = "Zoek artikel op naam, code of barcode..." }: Props) {
  const [open, setOpen] = useState(false);
  const [zoekInvoer, setZoekInvoer] = useState("");
  const [zoek, setZoek] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setZoek(zoekInvoer), 250);
    return () => clearTimeout(timer);
  }, [zoekInvoer]);

  const params = { zoek: zoek || undefined, actief: true };
  const { data: artikelen = [], isLoading } = useListArtikelen(
    params,
    { query: { enabled: open, queryKey: getListArtikelenQueryKey(params) } },
  );

  const geselecteerd = artikelen.find(a => a.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal truncate"
          disabled={disabled}
        >
          <span className="truncate">
            {geselecteerd
              ? `${geselecteerd.naam}${geselecteerd.code ? ` (${geselecteerd.code})` : ""}`
              : value != null
                ? `Artikel ${value}`
                : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Zoek op naam, code of barcode..."
            value={zoekInvoer}
            onValueChange={setZoekInvoer}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>
              {isLoading ? "Zoeken..." : "Geen artikelen gevonden."}
            </CommandEmpty>
            <CommandGroup>
              {artikelen.map(a => (
                <CommandItem
                  key={a.id}
                  value={String(a.id)}
                  onSelect={() => {
                    onValueChange(a.id, { naam: a.naam, code: a.code, eenheid: a.eenheid });
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4 shrink-0", value === a.id ? "opacity-100" : "opacity-0")}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">
                      <span className="font-medium">{a.naam}</span>
                      {a.code && <span className="text-xs text-muted-foreground ml-1.5">({a.code})</span>}
                    </div>
                    {a.leverancier_naam && (
                      <div className="text-xs text-muted-foreground truncate">{a.leverancier_naam}</div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">{a.eenheid}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
