import { Eye } from "lucide-react";

export function DemoBanner({ className }: { className?: string }) {
  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs ${className ?? ""}`}>
      <Eye className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
      <div>
        <span className="font-semibold text-amber-800">Voorbeeldweergave</span>
        <span className="text-amber-700 ml-1">— Onderstaande items zijn illustratief en laten zien hoe deze module werkt. Voeg uw eigen gegevens toe om te beginnen.</span>
      </div>
    </div>
  );
}
