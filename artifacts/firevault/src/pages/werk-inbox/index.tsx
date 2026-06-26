import { Inbox } from "lucide-react";

export default function WerkInboxPagina() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <Inbox className="w-12 h-12 text-muted-foreground opacity-40 mb-4" />
      <h2 className="text-lg font-semibold mb-2">Werk-inbox</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        De e-mailintegratie (Microsoft 365 koppeling) is nog niet beschikbaar in deze omgeving. Dit onderdeel wordt in een volgende release toegevoegd.
      </p>
    </div>
  );
}
