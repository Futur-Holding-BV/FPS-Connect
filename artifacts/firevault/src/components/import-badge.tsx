import { Badge } from "@/components/ui/badge";

interface ImportBadgeProps {
  bron?: string | null;
  importId?: number | null;
}

/**
 * IMPORT_01 §2.4: toont dat een record via een import is aangemaakt.
 * Alleen zichtbaar wanneer bron === "import".
 */
export function ImportBadge({ bron, importId }: ImportBadgeProps) {
  if (bron !== "import") return null;
  return (
    <Badge
      variant="outline"
      className="text-xs text-muted-foreground"
      data-testid="badge-geimporteerd"
    >
      {importId != null ? `Geïmporteerd #${importId}` : "Geïmporteerd"}
    </Badge>
  );
}

export default ImportBadge;
