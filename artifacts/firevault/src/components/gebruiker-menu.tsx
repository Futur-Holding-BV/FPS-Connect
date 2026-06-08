import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { ROL_INFO } from "@/context/rol-types";
import type { Rol } from "@/context/rol-types";

export function GebruikerMenu() {
  const { gebruiker, uitloggen } = useAuth();
  if (!gebruiker) return null;

  const rol = gebruiker.rol as Rol;
  const rolLabel = ROL_INFO[rol]?.label ?? rol;
  const initialen = gebruiker.naam
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="px-3 py-3 border-t">
      <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
          {initialen}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate leading-tight">{gebruiker.naam}</p>
          <p className="text-xs text-muted-foreground truncate">{rolLabel}</p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void uitloggen()}
        className="w-full mt-2 gap-2 group-data-[collapsible=icon]:px-0"
      >
        <LogOut className="h-4 w-4" />
        <span className="group-data-[collapsible=icon]:hidden">Uitloggen</span>
      </Button>
    </div>
  );
}
