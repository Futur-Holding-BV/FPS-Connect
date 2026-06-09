import { useState } from "react";
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
import { useListVoorzieningTypes } from "@workspace/api-client-react";
import type { VoorzieningType } from "@workspace/api-client-react";

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function ApplicatiePicker({ value, onValueChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const { data: typen = [] } = useListVoorzieningTypes();

  const categorieën = Array.from(new Set(typen.map((t: VoorzieningType) => t.categorie)));
  const geselecteerd = typen.find((t: VoorzieningType) => t.code === value);

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
              ? `${geselecteerd.code} – ${geselecteerd.naam}`
              : "Kies applicatie..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Zoek op code of naam..." />
          <CommandList className="max-h-80">
            <CommandEmpty>Geen resultaten gevonden.</CommandEmpty>
            {categorieën.map((cat) => (
              <CommandGroup key={cat} heading={cat}>
                {typen
                  .filter((t: VoorzieningType) => t.categorie === cat)
                  .map((t: VoorzieningType) => (
                    <CommandItem
                      key={t.code}
                      value={`${t.code} ${t.naam}`}
                      onSelect={() => {
                        onValueChange(t.code);
                        setOpen(false);
                      }}
                      className={cn(!t.actief && "opacity-40")}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          value === t.code ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="font-mono text-xs mr-2 text-muted-foreground w-10 shrink-0">
                        {t.code}
                      </span>
                      <span className="truncate">{t.naam}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
