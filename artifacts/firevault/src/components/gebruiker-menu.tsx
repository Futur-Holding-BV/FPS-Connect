import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { LogOut, KeyRound, Languages, Eye, ChevronsUpDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/auth-context";
import { useTaal } from "@/context/taal-context";
import { TALEN, type TaalCode } from "@/i18n/talen";
import { ROL_INFO } from "@/context/rol-types";
import type { Rol } from "@/context/rol-types";
import { useRol, type GeimiteerdePersoon } from "@/context/rol-context";
import {
  useWachtwoordWijzigen,
  useTaalWijzigen,
  useListGebruikers,
} from "@workspace/api-client-react";

export function GebruikerMenu() {
  const { gebruiker, uitloggen } = useAuth();
  const { t } = useTranslation();
  const { taal, zetTaal } = useTaal();
  const { kanWisselen, persoon, zetPersoon } = useRol();
  const [, setLocation] = useLocation();
  const wachtwoordWijzigen = useWachtwoordWijzigen();
  const taalWijzigen = useTaalWijzigen();

  const [wachtwoordOpen, setWachtwoordOpen] = useState(false);
  const [huidig, setHuidig]         = useState("");
  const [nieuw, setNieuw]           = useState("");
  const [bevestig, setBevestig]     = useState("");
  const [fout, setFout]             = useState<string | null>(null);
  const [gelukt, setGelukt]         = useState(false);

  if (!gebruiker) return null;

  const rol = gebruiker.rol as Rol;
  const rolLabel = ROL_INFO[rol]?.label ?? rol;
  const huidigeTaal = TALEN.find((item) => item.code === taal);
  const initialen = gebruiker.naam
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function kiesTaal(code: TaalCode) {
    if (code === taal) return;
    const vorige = taal;
    zetTaal(code, true);
    taalWijzigen.mutate(
      { data: { taal: code } },
      {
        onError: () => zetTaal(vorige, true),
      },
    );
  }

  function resetDialoog() {
    setHuidig("");
    setNieuw("");
    setBevestig("");
    setFout(null);
    setGelukt(false);
  }

  async function verstuurWijziging(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    if (!huidig || !nieuw) {
      setFout(t("menu.foutVerplicht"));
      return;
    }
    if (nieuw.length < 8) {
      setFout(t("menu.foutMinimaal"));
      return;
    }
    if (nieuw !== bevestig) {
      setFout(t("menu.foutOvereen"));
      return;
    }
    try {
      await wachtwoordWijzigen.mutateAsync({
        data: { huidig_wachtwoord: huidig, nieuw_wachtwoord: nieuw },
      });
      setGelukt(true);
      setHuidig("");
      setNieuw("");
      setBevestig("");
    } catch (err: any) {
      setFout(err?.response?.data?.error ?? err?.message ?? t("common.onbekendeFout"));
    }
  }

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

        <div className="mt-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 group-data-[collapsible=icon]:px-0"
                title={t("menu.taal")}
              >
                <Languages className="h-4 w-4 flex-shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden truncate">
                  {huidigeTaal ? `${huidigeTaal.vlag} ${huidigeTaal.naam}` : t("menu.taal")}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {TALEN.map((item) => (
                <DropdownMenuItem
                  key={item.code}
                  onClick={() => kiesTaal(item.code)}
                  className={taal === item.code ? "bg-accent" : ""}
                >
                  <span className="mr-2 text-base leading-none">{item.vlag}</span>
                  {item.naam}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex gap-1 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { resetDialoog(); setWachtwoordOpen(true); }}
            className="flex-1 gap-2 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:flex-none"
            title={t("menu.wachtwoordWijzigen")}
          >
            <KeyRound className="h-4 w-4 flex-shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden truncate">{t("menu.wachtwoord")}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void uitloggen()}
            className="flex-1 gap-2 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:flex-none"
            title={t("menu.uitloggen")}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">{t("menu.uitloggen")}</span>
          </Button>
        </div>

        <div className="mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/info")}
            className="w-full justify-start gap-2 text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            title="App-informatie"
          >
            <Info className="h-4 w-4 flex-shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">App-informatie</span>
          </Button>
        </div>
      </div>

      <Dialog open={wachtwoordOpen} onOpenChange={(o) => { if (!o) { setWachtwoordOpen(false); resetDialoog(); } }}>
        <DialogContent className="max-w-sm" aria-describedby="wachtwoord-beschr">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> {t("menu.wachtwoordWijzigen")}
            </DialogTitle>
          </DialogHeader>
          <p id="wachtwoord-beschr" className="text-sm text-muted-foreground -mt-1">
            {t("menu.wachtwoordUitleg")}
          </p>

          {gelukt ? (
            <div className="space-y-4">
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
                {t("menu.wachtwoordGewijzigd")}
              </div>
              <DialogFooter>
                <Button onClick={() => { setWachtwoordOpen(false); resetDialoog(); }}>
                  {t("common.sluiten")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={verstuurWijziging} className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="huidig-ww">{t("menu.huidigWachtwoord")}</Label>
                <Input
                  id="huidig-ww"
                  type="password"
                  value={huidig}
                  onChange={(e) => setHuidig(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nieuw-ww">{t("menu.nieuwWachtwoord")}</Label>
                <Input
                  id="nieuw-ww"
                  type="password"
                  value={nieuw}
                  onChange={(e) => setNieuw(e.target.value)}
                  autoComplete="new-password"
                  placeholder={t("menu.minimaalTekens")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bevestig-ww">{t("menu.bevestigWachtwoord")}</Label>
                <Input
                  id="bevestig-ww"
                  type="password"
                  value={bevestig}
                  onChange={(e) => setBevestig(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              {fout && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {fout}
                </div>
              )}

              <DialogFooter className="gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => { setWachtwoordOpen(false); resetDialoog(); }}>
                  {t("common.annuleren")}
                </Button>
                <Button type="submit" disabled={wachtwoordWijzigen.isPending}>
                  {wachtwoordWijzigen.isPending ? t("common.opslaanBezig") : t("common.wijzigen")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
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
    const ft = actueel.functietitel ?? null;
    if (actueel.naam !== persoon.naam || r !== persoon.rol || ft !== persoon.functietitel) {
      zetPersoon({ id: actueel.id, naam: actueel.naam, rol: r, functietitel: ft });
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
          <Button variant="outline" size="sm" className="w-full justify-between gap-2">
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
                    functietitel: g.functietitel ?? null,
                  })
                }
                className={persoon?.id === g.id ? "bg-accent" : ""}
              >
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{g.naam}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.functietitel ? `${g.functietitel} · ` : ""}
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
