import { TriangleAlert } from "lucide-react";

export const GROOT_BESTAND_GRENS = 10 * 1024 * 1024;

export function formateerGrootte(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function BestandsGrootteInfo({
  bytes,
  toonGrootte = true,
  grootteClassName,
}: {
  bytes: number | null;
  toonGrootte?: boolean;
  grootteClassName?: string;
}) {
  if (bytes === null) return null;
  return (
    <>
      {toonGrootte && (
        <p className={grootteClassName ?? "text-xs text-muted-foreground"}>
          {formateerGrootte(bytes)}
        </p>
      )}
      {bytes > GROOT_BESTAND_GRENS && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <span>Groot bestand ({formateerGrootte(bytes)}) — overweeg een geoptimaliseerde versie</span>
        </div>
      )}
    </>
  );
}
