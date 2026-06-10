import type { GebouwSuggestie } from "@workspace/api-client-react";
import { MapPin } from "lucide-react";

interface Props {
  suggesties: GebouwSuggestie[];
  onKies: (suggestie: GebouwSuggestie) => void;
  bezig?: boolean;
}

export function GebouwAiSuggesties({ suggesties, onKies, bezig }: Props) {
  if (suggesties.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20 p-3">
      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
        Meerdere mogelijke locaties gevonden — kies de juiste:
      </p>
      <div className="space-y-1.5">
        {suggesties.map((s, i) => (
          <button
            key={`${s.label}-${i}`}
            type="button"
            disabled={bezig}
            onClick={() => onKies(s)}
            className="flex w-full items-start gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
