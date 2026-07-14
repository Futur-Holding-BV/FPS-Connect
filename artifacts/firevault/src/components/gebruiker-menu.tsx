import { useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Eye, ChevronsUpDown, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/auth-context";
import { ROL_INFO } from "@/context/rol-types";
import type { Rol } from "@/context/rol-types";
import { useRol, type GeimiteerdePersoon } from "@/context/rol-context";
import { useListGebruikers } from "@workspace/api-client-react";

export function GebruikerMenu({ toonUitloggen = true }: { toonUitloggen?: boolean }) {
  const { gebruiker, uitloggen } = useAuth();
  const { t } = useTranslation();
  const { kanWisselen, persoon, zetPersoon } = useRol();
  const [, setLocation] = useLocation();

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
    <>
      <div className="px-3 py-3 border-t">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <Avatar className="h-8 w-8 border border-primary/20 flex-shrink-0">
            {gebruiker.avatar_url && <AvatarImage src={gebruiker.avatar_url} alt={gebruiker.naam} />}
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initialen}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate leading-tight">{gebruiker.naam}</p>
            <p className="text-xs text-muted-foreground truncate">{rolLabel}</p>
          </div>
        </div>

        {kanWisselen && (
          <BekijkenAlsSelector persoon={persoon} zetPersoon={zetPersoon} />
        )}

        {toonUitloggen && (
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void uitloggen()}
              className="w-full gap-2 group-data-[collapsible=icon]:px-0 bg-sidebar-accent/30 text-sidebar-foreground border-sidebar-border hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              title={t("menu.uitloggen")}
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">{t("menu.uitloggen")}</span>
            </Button>
          </div>
        )}

      </div>
    </>
  );
}

function BekijkenAlsSelector({
  persoon,
  zetPersoon,
}: {
  persoon: GeimiteerdePersoon | null;
  zetPersoon: (p: GeimiteerdePersoon | null) => void;
}) {
  const { t } = useTranslation();
  const { gebruiker } = useAuth();
  const [, setLocation] = useLocation();
  const { data: teamleden } = useListGebruikers();

  const kandidaten = (teamleden ?? []).filter(
    (g) => g.actief && g.id !== gebruiker?.id,
  );

  // Houd de geïmiteerde persoon in sync met de actuele serverdata: reset als het
  // account is verwijderd of gedeactiveerd, en werk rol/naam/functietitel bij
  // wanneer die op de server zijn gewijzigd (zodat het getoonde portaal klopt).
  useEffect(() => {
    if (!persoon || !teamleden) return;
    const actueel = teamleden.find((g) => g.id === persoon.id);
    if (!actueel || !actueel.actief) {
      zetPersoon(null);
      return;
    }
    const r = actueel.rol as Rol;
    const ft = actueel.functietitels ?? [];
    const bev = (actueel.bevoegdheden ?? {}) as Record<string, number>;
    if (
      actueel.naam !== persoon.naam ||
      r !== persoon.rol ||
      ft.join("|") !== (persoon.functietitels ?? []).join("|") ||
      JSON.stringify(bev) !== JSON.stringify(persoon.bevoegdheden ?? {})
    ) {
      zetPersoon({ id: actueel.id, naam: actueel.naam, rol: r, functietitels: ft, bevoegdheden: bev });
    }
  }, [teamleden, persoon, zetPersoon]);

  function kies(p: GeimiteerdePersoon | null) {
    if ((p?.id ?? null) === (persoon?.id ?? null)) return;
    zetPersoon(p);
    setLocation("/");
  }

  const triggerLabel = persoon ? persoon.naam : t("menu.eigenWeergave");

  return (
    <div className="mt-2 group-data-[collapsible=icon]:hidden">
      <p className="text-[11px] font-medium text-muted-foreground px-0.5 mb-1">
        {t("menu.bekijkenAls")}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between gap-2 bg-sidebar-accent/30 text-sidebar-foreground border-sidebar-border hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
            <span className="flex items-center gap-2 truncate">
              <Eye className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{triggerLabel}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
          <DropdownMenuItem
            onClick={() => kies(null)}
            className={persoon === null ? "bg-accent" : ""}
          >
            <span className="flex flex-col">
              <span className="text-sm font-medium">{t("menu.eigenWeergave")}</span>
              <span className="text-xs text-muted-foreground">
                {t("menu.eigenWeergaveUitleg")}
              </span>
            </span>
          </DropdownMenuItem>
          {kandidaten.map((g) => {
            const r = g.rol as Rol;
            return (
              <DropdownMenuItem
                key={g.id}
                onClick={() =>
                  kies({
                    id: g.id,
                    naam: g.naam,
                    rol: r,
                    functietitels: g.functietitels ?? [],
                    bevoegdheden: (g.bevoegdheden ?? {}) as Record<string, number>,
                  })
                }
                className={persoon?.id === g.id ? "bg-accent" : ""}
              >
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{g.naam}</span>
                  <span className="text-xs text-muted-foreground">
                    {(g.functietitels ?? []).length > 0 ? `${(g.functietitels ?? []).join(", ")} · ` : ""}
                    {ROL_INFO[r]?.label ?? r}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
