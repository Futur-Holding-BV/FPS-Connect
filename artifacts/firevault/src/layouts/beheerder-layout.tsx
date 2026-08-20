import { Link, useLocation } from "wouter";
import logoFpsSchild from "@/assets/logo-fps-schild.png";
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBottomBarHeight } from "@/hooks/use-bottom-bar-height";
import { SlimUploadBalk } from "@/components/slim-upload-balk";
import { ZijrandKnoppen } from "@/components/zijrand-paneel";
import { useTranslation } from "react-i18next";
import {
  useListChatGesprekken,
  useGetMagazijnSignalering,
  useListGoedkeuringAanvragen,
  getListGoedkeuringAanvragenQueryKey,
} from "@workspace/api-client-react";
import { BerichtNotificatieToast } from "@/components/bericht-notificatie-toast";
import { NieuwsTicker } from "@/components/nieuws-ticker";
import { VersieBadge } from "@/components/versie-badge";
import { MeldingKnop } from "@/components/melding-knop";
import { DitWerktNietKnop } from "@/components/dit-werkt-niet-knop";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  ShieldCheck, Building, Wrench, Users, Home, Truck, Award,
  ShieldAlert, LifeBuoy, MessageSquarePlus, Activity, Contact, Info, Clock,
  FolderOpen, FileText, ListChecks, Files, LayoutTemplate, Mail,
  Calculator, CalendarDays, LayoutDashboard, BarChart3, CreditCard, MessageSquare, HardHat,
  Trophy, HardDrive, ClipboardList, Smartphone, Plus, Hammer, PackageCheck,
  BookOpen, HardDriveUpload, CalendarCheck2, Settings2, ArchiveRestore,
  Inbox, Building2, Target, Handshake, Newspaper, CalendarRange, KeyRound, Link2,
  ClipboardCheck, AlertTriangle, TriangleAlert, FileArchive, Receipt, ArrowUpRight, ScrollText,
  UserMinus, UserPlus, UserX, Car, GitBranch, ArrowLeft, Palette, Monitor, Images,
  Package, Upload, MapPin, Archive, ArrowLeftRight, BookmarkCheck, ScanSearch, Bot, ShoppingCart,
  TrendingUp, ImageIcon, LineChart, GalleryHorizontal, RotateCcw, Wallet, GitCompareArrows,
  Users2, Star,
  Megaphone, Share2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GebruikerMenu } from "@/components/gebruiker-menu";
import { TweeTrapsHoofdstuk, TweeTrapsProvider } from "@/components/ui/twee-traps-hoofdstuk";
import { hoofdstukVanRoute } from "@/lib/hoofdstuk-van-route";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useRol } from "@/context/rol-context";
import { useSidebarHoofdstukken } from "@/hooks/use-sidebar-hoofdstukken";
import { featureFlags } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { NavigatieBewakingProvider, useNavigatieBewaking } from "@/context/navigatie-bewaking";
import { OnlineGebruikersTaakbalk } from "@/components/online-gebruikers/online-gebruikers";
import { VeiligheidMeldingBanner, OpenMeldingenBadge } from "@/components/veiligheidsmelding-banner";
import { PaneelProvider, usePaneel } from "@/components/paneel/paneel-context";
import { BanenMenu } from "@/components/paneel/banen-menu";
import { BanenWeergave } from "@/components/paneel/banen-weergave";
import { isPaneelGeschikt } from "@/lib/paneel-geschiktheid";
import { useToast } from "@/hooks/use-toast";

function PwaInstalleerKnop() {
  const [prompt, setPrompt] = useState<Event & { prompt: () => Promise<void> } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!prompt) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await prompt.prompt();
        setPrompt(null);
      }}
      className="group-data-[collapsible=icon]:hidden flex items-center gap-2 w-full rounded-md px-3 py-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
    >
      <Monitor className="h-3.5 w-3.5 shrink-0" />
      <span>App op bureaublad installeren</span>
    </button>
  );
}

function TerugKnop() {
  const { requestTerug } = useNavigatieBewaking();
  return (
    <button
      onClick={requestTerug}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
      title="Terug"
      type="button"
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="hidden sm:inline">Terug</span>
    </button>
  );
}

export default function BeheerderLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavigatieBewakingProvider>
      <PaneelProvider>
        <BeheerderLayoutInhoud>{children}</BeheerderLayoutInhoud>
      </PaneelProvider>
    </NavigatieBewakingProvider>
  );
}

function BeheerderLayoutInhoud({ children }: { children: React.ReactNode }) {
  useBottomBarHeight();
  const [location, navigeer] = useLocation();
  const { t } = useTranslation();
  const { paneelAan, teSmal, gereed: paneelGereed, zetBeschikbareBreedte } =
    usePaneel();
  const { toast } = useToast();

  // Meet de werkelijke breedte van de hoofdcontent (ná sidebar) zodat het
  // banen-menu en de terugval-logica op de échte beschikbare ruimte rekenen,
  // niet op window.innerWidth. Deze <main> is altijd gemount.
  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = mainRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const meet = () => zetBeschikbareBreedte(el.getBoundingClientRect().width);
    meet();
    const ro = new ResizeObserver(meet);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zetBeschikbareBreedte]);

  // Paneelmodus is alleen actief in het Connect-portaal, boven de
  // terugvalbreedte, en niet op de mail-/werkbak-volledigschermroutes.
  const paneelBeschikbaar =
    !location.startsWith("/berichten") &&
    !location.startsWith("/werk-inbox");
  // Wanneer een baan naar een niet-geschikt pad navigeert, sturen we het
  // hoofdvenster daarheen. Zolang het hoofdvenster op een niet-geschikt pad
  // staat tonen we dat over de volle breedte i.p.v. de banen.
  const hoofdPadGeschikt = isPaneelGeschikt(location);
  const banenActief =
    paneelGereed && paneelAan && !teSmal && paneelBeschikbaar && hoofdPadGeschikt;
  const toonTerugNaarBanen =
    paneelGereed && paneelAan && !teSmal && paneelBeschikbaar && !hoofdPadGeschikt;

  // Niet-geschikt pad uit een baan → open over de volle breedte in het
  // hoofdvenster (paneelmodus blijft aan om naar terug te keren).
  const openVolleBreedte = useCallback(
    (pad: string) => {
      navigeer(pad);
      toast({
        title: "Volle breedte",
        description:
          "Dit scherm is niet geschikt voor een baan en is over de volle breedte geopend.",
      });
    },
    [navigeer, toast],
  );

  // Laatste baan sluiten (2 → 1): paneelmodus uit, overgebleven pad over de
  // volle breedte in het hoofdvenster.
  const sluitNaarVolleBreedte = useCallback(
    (pad: string) => {
      navigeer(pad);
      toast({
        title: "Paneelmodus uit",
        description: "De baan is gesloten; het scherm staat nu over de volle breedte open.",
      });
    },
    [navigeer, toast],
  );
  const { heeftNiveau } = useBevoegdheid();
  const { rol, is_uitvoerend_veld: isUitvoerendVeld, heeftLoonfundamentToegang } = useRol();
  const isHoofdbeheerder = rol === "hoofdbeheerder";

  // isUitvoerendVeld comes from rol-context which derives it from the
  // server-provided is_uitvoerend_veld flag (single source of truth).
  // No local UITVOERENDE_FUNCTIES list needed here.

  const toonGebouwen      = heeftNiveau("gebouwen", 1);
  const toonCrm           = heeftNiveau("crm", 1);
  const toonSocial        = heeftNiveau("social", 3);
  const toonMerk          = heeftNiveau("merk", 1);
  const toonBibliotheek   = heeftNiveau("bibliotheek", 1);
  const toonGebruikers    = heeftNiveau("gebruikers", 1);
  const toonSysteem       = heeftNiveau("systeem", 1);
  const toonPersoneel     = heeftNiveau("personeel", 1);
  const toonGereedschappen = heeftNiveau("gereedschappen", 1);
  const toonDossiers      = heeftNiveau("dossiers", 1);
  const toonOpname        = heeftNiveau("gebouwen", 1);
  const toonOffertes      = heeftNiveau("offertes", 1);
  // NP_INKOOP_01: ook administratie (financieel ≥ 2) zonder werkvoorbereidingsrechten
  const toonAlgemeneInkoop = toonOffertes || heeftNiveau("financieel", 2);
  const toonOnderhoud     = heeftNiveau("onderhoud", 1);
  const toonToolboxen     = heeftNiveau("toolbox", 1);
  const toonSnagstream    = heeftNiveau("bibliotheek", 1);
  const toonFinancieel    = heeftNiveau("financieel", 1);
  const toonBankafschriften = heeftNiveau("bankafschriften", 1);
  const toonSalarisarchief = heeftNiveau("salarisarchief", 1);
  const toonSalarisMutaties = heeftNiveau("salaris_mutaties", 1);
  const toonScabMail = heeftNiveau("scab_mail", 1);
  const toonBoekhouderPortaal = heeftNiveau("boekhouder_portaal", 1);
  const toonWagenpark    = heeftNiveau("wagenpark", 1);
  const toonDeclaraties  = heeftNiveau("declaraties", 1);
  const toonMagazijn  = heeftNiveau("magazijn", 1);
  const toonOrganisatie = heeftNiveau("organisatie", 1);
  const toonLoonOutput = heeftNiveau("salarisarchief", 2);
  const toonLoonfundament = heeftLoonfundamentToegang;
  const toonGoedkeuring = heeftNiveau("goedkeuring", 1);
  const magGoedkeurenActies = heeftNiveau("goedkeuring", 3);
  // WERKBAK_02: team & overleg = personeel≥2 of planning≥2 (of hoofdbeheerder).
  // Workflow = elke kantoorgebruiker.
  const toonTeamOverleg = heeftNiveau("personeel", 2) || heeftNiveau("planning", 2);
  const toonWorkflow = true;

  const { data: openGoedkeuringen } = useListGoedkeuringAanvragen(
    { alleen_mijn_acties: true, status: "ingediend" },
    {
      query: {
        enabled: magGoedkeurenActies,
        queryKey: getListGoedkeuringAanvragenQueryKey({ alleen_mijn_acties: true, status: "ingediend" }),
        refetchInterval: false,
      },
    },
  );
  const openGoedkeuringenAantal = openGoedkeuringen?.length ?? 0;

  const gebouwenActief =
    location === "/gebouwen" || location.startsWith("/gebouwen/") ||
    location === "/voorzieningen" || location.startsWith("/voorzieningen/");

  // RECHTEN_MENU_01: "In uitvoering" was misleidend — de modules achter de
  // feature-flags zijn gebouwd, alleen per omgeving uitgeschakeld. Ontbrekende
  // rechten tonen we bewust nooit grijs: die items staan niet in het menu
  // (APP_01 acceptatie 3).
  function Uitgeschakeld() {
    return (
      <Badge
        variant="outline"
        title={t("nav.uitgeschakeldTooltip")}
        className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
      >
        <Clock className="h-2.5 w-2.5 mr-0.5" />
        {t("nav.uitgeschakeld")}
      </Badge>
    );
  }

  function OngelezenBerichtenBadge() {
    const { data: gesprekken, refetch } = useListChatGesprekken();
    useEffect(() => {
      const timer = setInterval(() => void refetch(), 30000);
      return () => clearInterval(timer);
    }, [refetch]);
    const totaal = (gesprekken ?? []).reduce(
      (som, g) => som + (g.ongelezen_aantal ?? 0),
      0,
    );
    if (totaal === 0) return null;
    return (
      <Badge className="ml-auto text-[10px] px-1.5 py-0 min-w-5 h-4 bg-primary group-data-[collapsible=icon]:hidden">
        {totaal > 99 ? "99+" : totaal}
      </Badge>
    );
  }

  // Rood bolletje met aantal voor op de hoofdstukknop (NAV_01).
  function HoofdstukTelBadge({ aantal, label }: { aantal: number; label: string }) {
    if (aantal === 0) return null;
    return (
      <span
        className="ml-1 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground group-data-[collapsible=icon]:hidden"
        aria-label={`${aantal} ${label}`}
      >
        {aantal > 99 ? "99+" : aantal}
      </span>
    );
  }

  // Ongelezen, niet-afgehandelde werk-inbox-mails (60s-refresh).
  function useWerkInboxTelling(): number {
    const { data, refetch } = useQuery<{ aantal: number }>({
      queryKey: ["/api/werk-inbox/telling"],
      queryFn: async () => {
        const res = await fetch("/api/werk-inbox/telling", { credentials: "include" });
        if (!res.ok) return { aantal: 0 };
        return res.json() as Promise<{ aantal: number }>;
      },
      staleTime: 60000,
    });
    useEffect(() => {
      const timer = setInterval(() => void refetch(), 60000);
      return () => clearInterval(timer);
    }, [refetch]);
    return data?.aantal ?? 0;
  }

  function WerkInboxItemBadge() {
    const aantal = useWerkInboxTelling();
    return <HoofdstukTelBadge aantal={aantal} label="ongelezen werk-inbox-mails" />;
  }

  function CommunicatieHoofdstukBadge() {
    const { data: gesprekken, refetch } = useListChatGesprekken();
    useEffect(() => {
      const timer = setInterval(() => void refetch(), 30000);
      return () => clearInterval(timer);
    }, [refetch]);
    const werkInboxAantal = useWerkInboxTelling();
    const totaal = (gesprekken ?? []).reduce(
      (som, g) => som + (g.ongelezen_aantal ?? 0),
      0,
    ) + werkInboxAantal;
    return <HoofdstukTelBadge aantal={totaal} label="ongelezen berichten en werk-inbox-mails" />;
  }

  function MailWachtrijBadge() {
    const { data, refetch } = useQuery<{ aantal: number }>({
      queryKey: ["/api/mail-wachtrij/telling"],
      queryFn: async () => {
        const res = await fetch("/api/mail-wachtrij/telling", { credentials: "include" });
        if (!res.ok) return { aantal: 0 };
        return res.json() as Promise<{ aantal: number }>;
      },
      staleTime: 60000,
    });
    useEffect(() => {
      const timer = setInterval(() => void refetch(), 60000);
      return () => clearInterval(timer);
    }, [refetch]);
    const aantal = data?.aantal ?? 0;
    if (aantal === 0) return null;
    return (
      <Badge className="ml-auto text-[10px] px-1.5 py-0 min-w-5 h-4 bg-primary group-data-[collapsible=icon]:hidden">
        {aantal > 99 ? "99+" : aantal}
      </Badge>
    );
  }

  // Dreigende contract-/ZZP-overschrijdingen (aanzegtermijn, Wet DBA) voor HRM.
  type CruciaalItem = {
    medewerker_id: number;
    naam: string;
    datum: string;
    dagen_tot: number;
    urgent: boolean;
    bron: "contract" | "zzp";
    label: string;
    reden: string;
  };
  // Geeft ALLE cruciale datums terug (niet gefilterd op urgent).
  // ContractSignaalItems filtert zelf op urgent; ContractBewakingMenuBadge toont het totaal.
  function useAlleCrucialeDatums(actief: boolean): CruciaalItem[] {
    const { data, refetch } = useQuery<{ items: CruciaalItem[]; urgent_aantal: number }>({
      queryKey: ["contract-bewaking", "cruciale-datums"],
      queryFn: async () => {
        const res = await fetch("/api/contract-bewaking/cruciale-datums", { credentials: "include" });
        if (!res.ok) return { items: [], urgent_aantal: 0 };
        return res.json() as Promise<{ items: CruciaalItem[]; urgent_aantal: number }>;
      },
      staleTime: 5 * 60 * 1000,
      enabled: actief,
    });
    useEffect(() => {
      if (!actief) return;
      const timer = setInterval(() => void refetch(), 5 * 60 * 1000);
      return () => clearInterval(timer);
    }, [refetch, actief]);
    return actief ? (data?.items ?? []) : [];
  }

  function ContractSignaalItems({ actief }: { actief: boolean }) {
    const alle = useAlleCrucialeDatums(actief);
    const urgente = alle.filter((i) => i.urgent);
    if (urgente.length === 0) return null;
    return (
      <>
        {urgente.slice(0, 6).map((i) => (
          <SidebarMenuItem key={`cruciaal-${i.medewerker_id}`} className="pl-5">
            <SidebarMenuButton asChild isActive={location === `/personeel/${i.medewerker_id}`}>
              <Link href={`/personeel/${i.medewerker_id}`} title={i.reden}>
                <AlertTriangle className="text-destructive" />
                <span className="truncate text-destructive">
                  {i.naam} · {new Date(i.datum).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </>
    );
  }

  function ContractSignaalBadge({ actief }: { actief: boolean }) {
    const alle = useAlleCrucialeDatums(actief);
    const urgente = alle.filter((i) => i.urgent);
    return <HoofdstukTelBadge aantal={urgente.length} label="dreigende contract-deadlines" />;
  }

  // Badge op het "Contractbewaking" sidebar-item: toont het totale aantal medewerkers
  // met een naderende deadline (urgent + overige), niet alleen de urgente.
  function ContractBewakingMenuBadge({ actief }: { actief: boolean }) {
    const alle = useAlleCrucialeDatums(actief);
    if (alle.length === 0) return null;
    return (
      <Badge className="ml-auto text-[10px] px-1.5 py-0 min-w-5 h-4 bg-primary group-data-[collapsible=icon]:hidden">
        {alle.length}
      </Badge>
    );
  }

  function MagazijnKritiekBadge() {
    const { data, refetch } = useGetMagazijnSignalering();
    useEffect(() => {
      const timer = setInterval(() => void refetch(), 60000);
      return () => clearInterval(timer);
    }, [refetch]);
    const aantal = data?.kritiek_aantal ?? 0;
    if (aantal === 0) return null;
    return (
      <Badge
        variant="outline"
        className="ml-2 text-[10px] px-1.5 py-0 leading-tight border-destructive/60 text-destructive group-data-[collapsible=icon]:hidden"
      >
        {aantal > 99 ? "99+" : aantal}
      </Badge>
    );
  }

  const {
    hoofdstukPositie,
    verplaatsHoofdstuk,
    hoofdstukOpen,
    setHoofdstukOpen,
    herstelStandaard,
    isAangepast,
  } = useSidebarHoofdstukken("sidebar_hoofdstukken", [
    "mijn",
    "projectaanpak",
    "magazijn",
    "commercie",
    "communicatie",
    "veiligheid",
    "financieel",
    "goedkeuring",
    "declaraties",
    "organisatie",
    "personeel",
    "loon",
  ]);

  return (
    <SidebarProvider defaultOpen={true} className="h-dvh">
      <TweeTrapsProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="py-3">
          <div className="flex items-center px-2 gap-2 group-data-[collapsible=icon]:justify-center">
            <div className="flex items-center gap-2 min-w-0 group-data-[collapsible=icon]:hidden">
              <img
                src={logoFpsSchild}
                alt="FPS Connect"
                className="h-8 w-auto flex-shrink-0"
              />
              <span className="truncate text-base font-bold tracking-tight text-sidebar-foreground">
                FPS <span className="font-semibold text-muted-foreground">Connect</span>
              </span>
            </div>
            <SidebarTrigger
              className="ml-auto shrink-0 group-data-[collapsible=icon]:ml-0"
              title="Menu in-/uitklappen"
            />
          </div>

        </SidebarHeader>

        <SidebarContent>

          {/* ══════════ FPS CONNECT ══════════ */}
          <>
              {/* Dashboard */}
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={location === "/"}>
                        <Link href="/">
                          <Home />
                          <span>{t("nav.dashboard")}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {isAangepast && (
                <button
                  type="button"
                  onClick={herstelStandaard}
                  title="Zet de volgorde en in-/uitgeklapte hoofdstukken terug naar de standaardinstelling"
                  className="mx-2 mb-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:hidden"
                >
                  <RotateCcw className="h-3 w-3 shrink-0" />
                  <span>Standaardvolgorde herstellen</span>
                </button>
              )}

              {/* Mijn gegevens — basislaag eigen gegevens (APP_01 §4): altijd
                  zichtbaar voor iedere ingelogde medewerker, ongeacht profiel.
                  Backendroutes zijn alleen-inloggen en scopen op de eigen
                  medewerker; modulerechten gelden alleen voor andermans data. */}
              <TweeTrapsHoofdstuk
                sleutel="mijn"
                titel="Mijn gegevens"
                positie={hoofdstukPositie("mijn")}
                onVerplaats={verplaatsHoofdstuk}
                open={hoofdstukOpen("mijn")}
                onOpenChange={(open) => setHoofdstukOpen("mijn", open)}
              >
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/uren" || location.startsWith("/uren/")}>
                      <Link href="/uren">
                        <Clock />
                        <span>Mijn uren</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/mijn/declaraties"}>
                      <Link href="/mijn/declaraties">
                        <Receipt />
                        <span>Mijn declaraties</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/mijn/verlof"}>
                      <Link href="/mijn/verlof">
                        <CalendarCheck2 />
                        <span>Mijn verlof</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/mijn/salarisdocumenten"}>
                      <Link href="/mijn/salarisdocumenten">
                        <FileText />
                        <span>Mijn loonstroken</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </TweeTrapsHoofdstuk>

              {/* Projectaanpak — workflow in volgorde */}
              {!isUitvoerendVeld && (
              <TweeTrapsHoofdstuk
                sleutel="projectaanpak"
                titel="Projectaanpak"
                positie={hoofdstukPositie("projectaanpak")}
                onVerplaats={verplaatsHoofdstuk}
                open={hoofdstukOpen("projectaanpak")}
                onOpenChange={(open) => setHoofdstukOpen("projectaanpak", open)}
              >
                  <SidebarMenu>
                    {toonGebouwen && (
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={gebouwenActief}>
                          <Link href="/gebouwen">
                            <Building />
                            <span>Projecten</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    {/* ── scheiding: projectbeheer ↑ / calculatiefase ↓ ── */}
                    <div className="mx-3 my-2 flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[10px] text-muted-foreground/60 font-medium shrink-0 uppercase tracking-wider">Calculatiefase</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                    {toonOpname && (
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/opname" || location.startsWith("/opname/")}
                        >
                          <Link href="/opname">
                            <ClipboardList />
                            <span>Opnames</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    <SidebarMenuItem className="pl-5">
                      {featureFlags.calculatie ? (
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/modules/calculatie" || location.startsWith("/modules/calculatie/")}
                        >
                          <Link href="/modules/calculatie">
                            <Calculator />
                            <span>Calculaties</span>
                          </Link>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton disabled>
                          <Calculator />
                          <span>Calculaties</span>
                          <Uitgeschakeld />
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/offertes" || location.startsWith("/offertes/")}
                      >
                        <Link href="/offertes">
                          <FileText />
                          <span>Offertes</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {/* ── scheiding: commercieel ↑ / uitvoering ↓ ── */}
                    <div className="mx-3 my-2 flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[10px] text-muted-foreground/60 font-medium shrink-0 uppercase tracking-wider">Uitvoering</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/werkvoorbereiding" || location.startsWith("/werkvoorbereiding/") || location.startsWith("/opdrachten/")}
                      >
                        <Link href="/werkvoorbereiding">
                          <Hammer />
                          <span>Werkvoorbereiding</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/inkoop/overzicht"}
                      >
                        <Link href="/inkoop/overzicht">
                          <ShoppingCart />
                          <span>Inkoopoverzicht</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/regie" || location.startsWith("/regie/")}
                      >
                        <Link href="/regie">
                          <ClipboardList />
                          <span>Regiewerk</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {featureFlags.planning ? (
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/modules/planning" || location.startsWith("/modules/planning/")}
                        >
                          <Link href="/modules/planning">
                            <CalendarDays />
                            <span>Planning</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ) : (
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton disabled>
                          <CalendarDays />
                          <span>Planning</span>
                          <Uitgeschakeld />
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    {heeftNiveau("projecten", 1) && (
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/uitvoering" || location.startsWith("/uitvoering/")}
                        >
                          <Link href="/uitvoering">
                            <HardHat />
                            <span>Uitvoering</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    {/* ── scheiding: uitvoering ↑ / oplevering ↓ ── */}
                    <div className="mx-3 my-2 flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[10px] text-muted-foreground/60 font-medium shrink-0 uppercase tracking-wider">Oplevering</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/rapporten" || location.startsWith("/rapporten/")}
                      >
                        <Link href="/rapporten" onClick={() => { try { sessionStorage.removeItem("fps_rapporten_filters"); } catch { } }}>
                          <PackageCheck />
                          <span>Opleverrapportage</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {toonOnderhoud && (
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/onderhoud" || location.startsWith("/onderhoud/")}
                        >
                          <Link href="/onderhoud">
                            <Wrench />
                            <span>Onderhoud</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    {toonDossiers && (
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/dossiers" || location.startsWith("/dossiers/")}
                        >
                          <Link href="/dossiers">
                            <FolderOpen />
                            <span>{t("nav.dossiers")}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/documenten" || location.startsWith("/documenten/")}
                      >
                        <Link href="/documenten">
                          <Files />
                          <span>Productrapporten</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {toonSnagstream && (
                      <>
                        <div className="mx-3 my-2 h-px bg-slate-200 group-data-[collapsible=icon]:hidden" />
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/snagstream" || location.startsWith("/snagstream/")}
                          >
                            <Link href="/snagstream">
                              <FileArchive />
                              <span>Snagstream archief</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </>
                    )}
                  </SidebarMenu>
              </TweeTrapsHoofdstuk>
              )}

              {/* Magazijn */}
              {(toonMagazijn || toonGereedschappen) && (
              <TweeTrapsHoofdstuk
                sleutel="magazijn"
                titel="Magazijn"
                positie={hoofdstukPositie("magazijn")}
                onVerplaats={verplaatsHoofdstuk}
                open={hoofdstukOpen("magazijn")}
                onOpenChange={(open) => setHoofdstukOpen("magazijn", open)}
                kopExtra={<MagazijnKritiekBadge />}
              >
                        <SidebarMenu>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/magazijn"}
                            >
                              <Link href="/magazijn">
                                <LayoutDashboard />
                                <span>Dashboard</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/magazijn/artikelen"}
                            >
                              <Link href="/magazijn/artikelen">
                                <Package />
                                <span>Artikelen</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/magazijn/locaties"}
                            >
                              <Link href="/magazijn/locaties">
                                <MapPin />
                                <span>Locaties</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/magazijn/voorraad"}
                            >
                              <Link href="/magazijn/voorraad">
                                <Archive />
                                <span>Voorraad</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/magazijn/stellingscans"}
                            >
                              <Link href="/magazijn/stellingscans">
                                <ScanSearch />
                                <span>Stellingscans</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/magazijn/mutaties"}
                            >
                              <Link href="/magazijn/mutaties">
                                <ArrowLeftRight />
                                <span>Mutaties</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/magazijn/reserveringen"}
                            >
                              <Link href="/magazijn/reserveringen">
                                <BookmarkCheck />
                                <span>Reserveringen</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/magazijn/uitgiftes"}
                            >
                              <Link href="/magazijn/uitgiftes">
                                <PackageCheck />
                                <span>Uitgifte</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/magazijn/retouren"}
                            >
                              <Link href="/magazijn/retouren">
                                <ArchiveRestore />
                                <span>Retouren</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location.startsWith("/magazijn/inkooporders")}
                            >
                              <Link href="/magazijn/inkooporders">
                                <ShoppingCart />
                                <span>Inkooporders</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location.startsWith("/magazijn/picklijsten")}
                            >
                              <Link href="/magazijn/picklijsten">
                                <ClipboardList />
                                <span>Picklijsten</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location.startsWith("/magazijn/tellingen")}
                            >
                              <Link href="/magazijn/tellingen">
                                <Calculator />
                                <span>Tellingen</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          {toonGereedschappen && (
                            <SidebarMenuItem className="pl-5">
                              <SidebarMenuButton
                                asChild
                                isActive={location === "/gereedschappen" || location.startsWith("/gereedschappen/")}
                              >
                                <Link href="/gereedschappen">
                                  <Wrench />
                                  <span>{t("nav.gereedschappen")}</span>
                                </Link>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          )}
                        </SidebarMenu>
              </TweeTrapsHoofdstuk>
              )}

              {/* CRM — één centraal menu-item; alle onderdelen bereikbaar via het CRM-dashboard.
                  Het hoofdstuk toont ook voor marketing-only gebruikers (eigen module). */}
              {(toonCrm || heeftNiveau("marketing", 3) || toonSocial || toonMerk) && (
              <TweeTrapsHoofdstuk
                sleutel="commercie"
                titel="Commercie"
                positie={hoofdstukPositie("commercie")}
                onVerplaats={verplaatsHoofdstuk}
                open={hoofdstukOpen(
                  "commercie",
                  // Marketing-only gebruikers (geen CRM, social of merk) hebben
                  // Commercie als enige werkgebied: start het hoofdstuk open zodat
                  // ze na elke sessie direct hun pagina's zien. Niet persistent,
                  // conform het bestaande "alles ingeklapt" beleid (2026-08-09).
                  !toonCrm && heeftNiveau("marketing", 3) && !toonSocial && !toonMerk,
                )}
                onOpenChange={(open) => setHoofdstukOpen("commercie", open)}
              >
                    <SidebarMenu>
                      {toonCrm && (
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={(location === "/crm" || location.startsWith("/crm/")) && !location.startsWith("/crm/marketing") && !location.startsWith("/crm/social") && !location.startsWith("/crm/merkenkast") && !location.startsWith("/crm/beeldbank")}
                        >
                          <Link href="/crm">
                            <Contact />
                            <span>CRM</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      )}
                      {/* Marketing — eigen module in de rechtenmatrix: de Marketing-API
                          vereist marketing 3 (beheren) voor alle lees/beheer-endpoints;
                          verzenden gate't de pagina intern op marketing 4. */}
                      {heeftNiveau("marketing", 3) && (
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={location.startsWith("/crm/marketing")}
                        >
                          <Link href="/crm/marketing">
                            <Megaphone />
                            <span>Marketing</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      )}
                      {/* Social media (#1037) — eigen module: social 3 =
                          bekijken/opstellen; plannen en koppelingen gate't de
                          pagina intern op social 4. */}
                      {heeftNiveau("social", 3) && (
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={location.startsWith("/crm/social")}
                        >
                          <Link href="/crm/social">
                            <Share2 />
                            <span>Social media</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      )}
                      {/* Merkenkast + Beeldbank (#1037) — module merk: 1 =
                          zoeken en downloaden (zelfde grens als de API-routes). */}
                      {heeftNiveau("merk", 1) && (
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={location.startsWith("/crm/merkenkast")}
                        >
                          <Link href="/crm/merkenkast">
                            <Palette />
                            <span>Merkenkast</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      )}
                      {heeftNiveau("merk", 1) && (
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={location.startsWith("/crm/beeldbank")}
                        >
                          <Link href="/crm/beeldbank">
                            <Images />
                            <span>Beeldbank</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      )}
                    </SidebarMenu>
              </TweeTrapsHoofdstuk>
              )}

              {/* Communicatie — verborgen voor puur uitvoerende veldmedewerkers */}
              {!isUitvoerendVeld && (
              <TweeTrapsHoofdstuk
                sleutel="communicatie"
                kopExtra={<CommunicatieHoofdstukBadge />}
                titel="Communicatie"
                positie={hoofdstukPositie("communicatie")}
                onVerplaats={verplaatsHoofdstuk}
                open={hoofdstukOpen("communicatie")}
                onOpenChange={(open) => setHoofdstukOpen("communicatie", open)}
              >
                      <SidebarMenu>
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/berichten" || location.startsWith("/berichten/")}
                          >
                            <Link href="/berichten">
                              <MessageSquare />
                              <span>Berichten</span>
                              <OngelezenBerichtenBadge />
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/werk-inbox" || location.startsWith("/werk-inbox/")}
                          >
                            <Link href="/werk-inbox">
                              <PackageCheck />
                              <span>Werk-inbox</span>
                              <WerkInboxItemBadge />
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                        {toonWorkflow && (
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/workflow" || location.startsWith("/workflow/")}
                            >
                              <Link href="/workflow">
                                <Star />
                                <span>Workflow</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                        {toonTeamOverleg && (
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/team-overleg" || location.startsWith("/team-overleg/")}
                            >
                              <Link href="/team-overleg">
                                <Users2 />
                                <span>Team &amp; overleg</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                      </SidebarMenu>
              </TweeTrapsHoofdstuk>
              )}

              {/* Veiligheid */}
              {toonToolboxen && (
              <TweeTrapsHoofdstuk
                sleutel="veiligheid"
                titel="Veiligheid"
                positie={hoofdstukPositie("veiligheid")}
                onVerplaats={verplaatsHoofdstuk}
                open={hoofdstukOpen("veiligheid")}
                onOpenChange={(open) => setHoofdstukOpen("veiligheid", open)}
              >
                        <SidebarMenu>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/veiligheid/toolboxen" || location.startsWith("/veiligheid/toolboxen/")}
                            >
                              <Link href="/veiligheid/toolboxen">
                                <ShieldCheck />
                                <span>Toolbox Center</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/veiligheid/lmra" || location.startsWith("/veiligheid/lmra/")}
                            >
                              <Link href="/veiligheid/lmra">
                                <ClipboardCheck />
                                <span>LMRA</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/veiligheid/meldingen" || location.startsWith("/veiligheid/meldingen/")}
                            >
                              <Link href="/veiligheid/meldingen">
                                <AlertTriangle />
                                <span>Meldingen</span>
                                <OpenMeldingenBadge />
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/veiligheid/incidenten" || location.startsWith("/veiligheid/incidenten/")}
                            >
                              <Link href="/veiligheid/incidenten">
                                <TriangleAlert />
                                <span>Incidenten</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/veiligheid/pbm" || location.startsWith("/veiligheid/pbm")}
                            >
                              <Link href="/veiligheid/pbm">
                                <ShieldCheck />
                                <span>PBM & Middelen</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/veiligheid/toolbox-compliance"}
                            >
                              <Link href="/veiligheid/toolbox-compliance">
                                <BarChart3 />
                                <span>Toolbox Compliance</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </SidebarMenu>
              </TweeTrapsHoofdstuk>
              )}

              {/* Financieel */}
              {toonFinancieel && (
              <TweeTrapsHoofdstuk
                sleutel="financieel"
                titel="Financieel"
                positie={hoofdstukPositie("financieel")}
                onVerplaats={verplaatsHoofdstuk}
                open={hoofdstukOpen("financieel")}
                onOpenChange={(open) => setHoofdstukOpen("financieel", open)}
              >
                    <SidebarMenu>
                      {heeftNiveau("financieel", 2) && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton asChild isActive={location === "/directie/cockpit"}>
                            <Link href="/directie/cockpit">
                              <LayoutDashboard />
                              <span>Directiecockpit</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {heeftNiveau("financieel", 2) && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton asChild isActive={location === "/financieel/liquiditeit"}>
                            <Link href="/financieel/liquiditeit">
                              <Wallet />
                              <span>Liquiditeit</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {heeftNiveau("financieel", 2) && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton asChild isActive={location === "/directie/kompas"}>
                            <Link href="/directie/kompas">
                              <LayoutDashboard />
                              <span>Bedrijfskompas</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {heeftNiveau("financieel", 2) && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton asChild isActive={location === "/financieel/algemene-kosten"}>
                            <Link href="/financieel/algemene-kosten">
                              <TrendingUp />
                              <span>Algemene kosten</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {heeftNiveau("financieel", 2) && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton asChild isActive={location === "/financieel/scenarios"}>
                            <Link href="/financieel/scenarios">
                              <GitCompareArrows />
                              <span>Wat-als-scenario's</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {heeftNiveau("financieel", 2) && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton asChild isActive={location === "/beheer/bedrijfskompas"}>
                            <Link href="/beheer/bedrijfskompas">
                              <TrendingUp />
                              <span>FIE Begroting</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonSysteem && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton asChild isActive={location === "/beheer/mail-wachtrij"}>
                            <Link href="/beheer/mail-wachtrij">
                              <Mail />
                              <span>Mail-wachtrij</span>
                              <MailWachtrijBadge />
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonSysteem && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton asChild isActive={location === "/beheer/boekhouding"}>
                            <Link href="/beheer/boekhouding">
                              <Receipt />
                              <span>AccountView-koppeling</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/facturen/controlebox"}
                        >
                          <Link href="/facturen/controlebox">
                            <Inbox />
                            <span>Controlebox</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/facturen/stroom"}
                        >
                          <Link href="/facturen/stroom">
                            <Inbox />
                            <span>Factuurbewaking</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={
                            location === "/facturen" ||
                            location === "/facturen/dashboard" ||
                            (location.startsWith("/facturen/") &&
                              location !== "/facturen/klaar-voor-export" &&
                              location !== "/facturen/exportlog" &&
                              location !== "/facturen/controlebox" &&
                              location !== "/facturen/bankafschriften")
                          }
                        >
                          <Link href="/facturen/dashboard">
                            <LayoutDashboard />
                            <span>Facturen</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {toonBankafschriften && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/facturen/bankafschriften"}
                          >
                            <Link href="/facturen/bankafschriften">
                              <CreditCard />
                              <span>Bankafschriften</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {heeftNiveau("financieel", 2) && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/financieel/crediteuren"}
                          >
                            <Link href="/financieel/crediteuren">
                              <Inbox />
                              <span>Crediteuren inbox</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/financieel/bedrijfsresultaten"}
                        >
                          <Link href="/financieel/bedrijfsresultaten">
                            <BarChart3 />
                            <span>Bedrijfsresultaten</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/financieel/onderhanden-werk"}
                        >
                          <Link href="/financieel/onderhanden-werk">
                            <Calculator />
                            <span>Onderhanden werk</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/financieel/jaarrekening"}
                        >
                          <Link href="/financieel/jaarrekening">
                            <BookOpen />
                            <span>Jaarrekening OHW</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/financieel/contracten"}
                        >
                          <Link href="/financieel/contracten">
                            <ScrollText />
                            <span>Contracten &amp; polissen</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/financieel/marktspiegel"}
                        >
                          <Link href="/financieel/marktspiegel">
                            <ScanSearch />
                            <span>Marktspiegel</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/beheer/prijsafspraken"}
                        >
                          <Link href="/beheer/prijsafspraken">
                            <Handshake />
                            <span>Prijsafspraken</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {heeftNiveau("financieel_vertrouwelijk", 1) && (
                        <>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/financieel/jaarrekeningen"}
                            >
                              <Link href="/financieel/jaarrekeningen">
                                <ShieldCheck />
                                <span>Jaarrekeningen</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/financieel/meerjarenoverzicht"}
                            >
                              <Link href="/financieel/meerjarenoverzicht">
                                <TrendingUp />
                                <span>Meerjarenoverzicht</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </>
                      )}
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/facturen/klaar-voor-export"}
                        >
                          <Link href="/facturen/klaar-voor-export">
                            <ArrowUpRight />
                            <span>Klaar voor export</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/facturen/exportlog"}
                        >
                          <Link href="/facturen/exportlog">
                            <ScrollText />
                            <span>Exportlog</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {toonSalarisarchief && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/sepa-bestanden"}
                          >
                            <Link href="/sepa-bestanden">
                              <CreditCard />
                              <span>SEPA-bestanden</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                    </SidebarMenu>
              </TweeTrapsHoofdstuk>
              )}

              {/* Goedkeuring */}
              {toonGoedkeuring && (
              <TweeTrapsHoofdstuk
                sleutel="goedkeuring"
                kopExtra={<HoofdstukTelBadge aantal={openGoedkeuringenAantal} label="openstaande goedkeuringen" />}
                titel="Goedkeuring"
                positie={hoofdstukPositie("goedkeuring")}
                onVerplaats={verplaatsHoofdstuk}
                open={hoofdstukOpen("goedkeuring")}
                onOpenChange={(open) => setHoofdstukOpen("goedkeuring", open)}
              >
                  <SidebarMenu>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/beheer/goedkeuringen-dashboard"}
                      >
                        <Link href="/beheer/goedkeuringen-dashboard">
                          <LayoutDashboard />
                          <span>Dashboard</span>
                          {magGoedkeurenActies && openGoedkeuringenAantal > 0 && (
                            <Badge className="ml-auto h-4 min-w-4 shrink-0 px-1 text-[10px] leading-none bg-primary text-primary-foreground group-data-[collapsible=icon]:hidden">
                              {openGoedkeuringenAantal}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/beheer/goedkeuringsbeleid"}
                      >
                        <Link href="/beheer/goedkeuringsbeleid">
                          <ShieldCheck />
                          <span>Goedkeuringsbeleid</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
              </TweeTrapsHoofdstuk>
              )}

              {/* Declaraties — veldmedewerkers declareren via de telefoon */}
              {toonDeclaraties && !isUitvoerendVeld && (
              <TweeTrapsHoofdstuk
                sleutel="declaraties"
                titel="Declaraties"
                positie={hoofdstukPositie("declaraties")}
                onVerplaats={verplaatsHoofdstuk}
                open={hoofdstukOpen("declaraties")}
                onOpenChange={(open) => setHoofdstukOpen("declaraties", open)}
              >
                  <SidebarMenu>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location.startsWith("/declaraties")}
                      >
                        <Link href="/declaraties">
                          <Receipt />
                          <span>Overzicht</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
              </TweeTrapsHoofdstuk>
              )}

              {/* Organisatie — hoofdstuk alleen tonen bij minimaal één zichtbaar item */}
              {(toonOrganisatie || toonWagenpark) && (
              <TweeTrapsHoofdstuk
                sleutel="organisatie"
                titel="Organisatie"
                positie={hoofdstukPositie("organisatie")}
                onVerplaats={verplaatsHoofdstuk}
                open={hoofdstukOpen("organisatie")}
                onOpenChange={(open) => setHoofdstukOpen("organisatie", open)}
              >
                  <SidebarMenu>
                    {toonWagenpark && (
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/wagenpark" || (location.startsWith("/wagenpark/") && location !== "/wagenpark/meldingen")}
                        >
                          <Link href="/wagenpark">
                            <Truck />
                            <span>Wagenpark</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    {toonWagenpark && (
                      <SidebarMenuItem className="pl-9">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/wagenpark/meldingen"}
                        >
                          <Link href="/wagenpark/meldingen">
                            <ClipboardList />
                            <span>Meldingen</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    {toonOrganisatie && (<>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/organisatie/verzekeringen"}
                      >
                        <Link href="/organisatie/verzekeringen">
                          <ShieldCheck />
                          <span>Verzekeringen</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/organisatie/werkmaatschappijen"}
                      >
                        <Link href="/organisatie/werkmaatschappijen">
                          <Building2 />
                          <span>Werkmaatschappijen</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/organisatie/jaarverslagen"}
                      >
                        <Link href="/organisatie/jaarverslagen">
                          <BookOpen />
                          <span>Jaarverslagen &amp; Rekeningen</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/organisatie/bedrijfsdocumenten"}
                      >
                        <Link href="/organisatie/bedrijfsdocumenten">
                          <Files />
                          <span>Bedrijfsdocumenten</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/organisatie/documentopmaak"}
                      >
                        <Link href="/organisatie/documentopmaak">
                          <Palette />
                          <span>Documentopmaak</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {heeftNiveau("organisatie", 1) && (
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/organisatie/studio" || location.startsWith("/organisatie/studio/")}
                        >
                          <Link href="/organisatie/studio">
                            <LayoutTemplate />
                            <span>Document Studio</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/workflow-designer" || location.startsWith("/workflow-designer")}
                      >
                        <Link href="/workflow-designer">
                          <GitBranch />
                          <span>Workflow-designer</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    </>)}
                  </SidebarMenu>
              </TweeTrapsHoofdstuk>
              )}

              {/* Personeel */}
              {(toonPersoneel || isHoofdbeheerder) && (
              <TweeTrapsHoofdstuk
                sleutel="personeel"
                titel="Personeel"
                positie={hoofdstukPositie("personeel")}
                onVerplaats={verplaatsHoofdstuk}
                open={hoofdstukOpen("personeel")}
                onOpenChange={(open) => setHoofdstukOpen("personeel", open)}
                kopExtra={<ContractSignaalBadge actief={isHoofdbeheerder || heeftNiveau("personeel", 2)} />}
              >
                    <SidebarMenu>
                      {toonPersoneel && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={
                              location === "/personeel" ||
                              /^\/personeel\/\d+$/.test(location)
                            }
                          >
                            <Link href="/personeel">
                              <Users />
                              <span>Personeel</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {/* Dreigende contract-/ZZP-deadlines: klik = direct naar de kaart */}
                      <ContractSignaalItems actief={isHoofdbeheerder || heeftNiveau("personeel", 2)} />
                      {toonPersoneel && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location.startsWith("/personeel/werving")}
                          >
                            <Link href="/personeel/werving">
                              <UserPlus />
                              <span>Werving</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonPersoneel && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel/adviseurs"}
                          >
                            <Link href="/personeel/adviseurs">
                              <Contact />
                              <span>Externe adviseurs</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonPersoneel && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel/uitboarden"}
                          >
                            <Link href="/personeel/uitboarden">
                              <UserMinus />
                              <span>Uitboarden</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonPersoneel && featureFlags.wizardOnboarding && heeftNiveau("personeel", 2) && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel/integriteitstools"}
                          >
                            <Link href="/personeel/integriteitstools">
                              <ShieldCheck />
                              <span>Integriteitstools</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonPersoneel && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel/oud-medewerkers"}
                          >
                            <Link href="/personeel/oud-medewerkers">
                              <UserX />
                              <span>Oud-medewerkers</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonPersoneel && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel/externen"}
                          >
                            <Link href="/personeel/externen">
                              <Handshake />
                              <span>Externen / ZZP</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonPersoneel && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel/uitzendbureaus"}
                          >
                            <Link href="/personeel/uitzendbureaus">
                              <Link2 />
                              <span>Uitzendbureau-koppelingen</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonPersoneel && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel/contracten"}
                          >
                            <Link href="/personeel/contracten">
                              <ScrollText />
                              <span>Contractbewaking</span>
                              <ContractBewakingMenuBadge actief={isHoofdbeheerder || heeftNiveau("personeel", 1)} />
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonPersoneel && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location.startsWith("/personeel/verlof") && location !== "/personeel/verlof-instellingen"}
                          >
                            <Link href="/personeel/verlof">
                              <CalendarCheck2 />
                              <span>Verlofoverzicht</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonPersoneel && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel/jaarkalender"}
                          >
                            <Link href="/personeel/jaarkalender">
                              <CalendarRange />
                              <span>Jaarkalender</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {isHoofdbeheerder && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel/jaarplanning"}
                          >
                            <Link href="/personeel/jaarplanning">
                              <CalendarDays />
                              <span>Jaarplanning</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {(toonPersoneel || isHoofdbeheerder) && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/uren" || location.startsWith("/uren/")}
                          >
                            <Link href="/uren">
                              <Clock />
                              <span>Urenregistratie</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {(toonPersoneel || isHoofdbeheerder) && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/weekstaten" || location.startsWith("/weekstaten/")}
                          >
                            <Link href="/weekstaten">
                              <CalendarRange />
                              <span>Weekstaten</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {(toonPersoneel || isHoofdbeheerder) && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/hall-of-fame"}
                          >
                            <Link href="/hall-of-fame">
                              <Trophy />
                              <span>Hall of Fame</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                    </SidebarMenu>
              </TweeTrapsHoofdstuk>
              )}

              {/* Loon — scheiding vóór salarismodules */}
              {(toonSalarisMutaties || toonScabMail || toonLoonOutput || toonBoekhouderPortaal || toonSalarisarchief || toonLoonfundament) && (
              <TweeTrapsHoofdstuk
                sleutel="loon"
                titel="Loon"
                positie={hoofdstukPositie("loon")}
                onVerplaats={verplaatsHoofdstuk}
                open={hoofdstukOpen("loon")}
                onOpenChange={(open) => setHoofdstukOpen("loon", open)}
                metScheiding
              >
                      <SidebarMenu>
                        {toonSalarisMutaties && (
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/salaris-mutaties" || location.startsWith("/salaris-mutaties/")}
                            >
                              <Link href="/salaris-mutaties">
                                <ClipboardList />
                                <span>Salarismutaties</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                        {toonScabMail && (
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/scab-mail" || location.startsWith("/scab-mail/")}
                            >
                              <Link href="/scab-mail">
                                <Mail />
                                <span>Loonaanlevering</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                        {toonLoonOutput && (
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/loon-output" || location.startsWith("/loon-output/")}
                            >
                              <Link href="/loon-output">
                                <FileText />
                                <span>Loon-output</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                        {toonBoekhouderPortaal && (
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/boekhouder" || location.startsWith("/boekhouder/")}
                            >
                              <Link href="/boekhouder">
                                <LayoutDashboard />
                                <span>Boekhouderportaal</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                        {isHoofdbeheerder && (
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/personeel/jaarafsluiting"}
                            >
                              <Link href="/personeel/jaarafsluiting">
                                <ArchiveRestore />
                                <span>Jaarafsluiting verlof</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                        {toonSalarisarchief && (
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/salarisarchief" || location.startsWith("/salarisarchief/")}
                            >
                              <Link href="/salarisarchief">
                                <HardDriveUpload />
                                <span>Salarisarchief</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                        {toonLoonfundament && (
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/loonfundament" || location.startsWith("/loonfundament/")}
                            >
                              <Link href="/loonfundament">
                                <ScrollText />
                                <span>Loonfundament</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                      </SidebarMenu>
              </TweeTrapsHoofdstuk>
              )}

              {/* Algemene inkoop (NP_INKOOP_01) — losse post onder het laatste
                  hoofdstuk, in dezelfde lettergrootte als de hoofdstukkoppen.
                  Leveranciers & Artikelen staan onder Instellingen; het
                  Inkoopoverzicht staat bij Uitvoering (Werkvoorbereiding). */}
              {toonAlgemeneInkoop && (
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/algemene-inkoop" || location.startsWith("/algemene-inkoop/")}
                      className="text-xs font-medium text-sidebar-foreground/70"
                    >
                      <Link href="/algemene-inkoop">
                        <ShoppingCart />
                        <span>Algemene inkoop</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              )}

            </>

        </SidebarContent>

        <SidebarFooter style={{ paddingBottom: 'calc(var(--bottom-bar-hoogte, 56px) + 0.25rem)' }}>
          <PwaInstalleerKnop />
          <SidebarMenu>
            {(toonGebruikers || toonSysteem || toonBibliotheek || isHoofdbeheerder) && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      location === "/instellingen" ||
                      location.startsWith("/beheer/") ||
                      location === "/gebruikers" ||
                      location.startsWith("/gebruikers/") ||
                      location === "/toolbox" ||
                      location.startsWith("/toolbox/") ||
                      location === "/personeel/verlof-instellingen"
                    }
                  >
                    <Link href="/instellingen">
                      <Settings2 />
                      <span>Instellingen</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={location === "/release-notes"}>
                <Link href="/release-notes">
                  <Package />
                  <span>Wat is nieuw?</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <GebruikerMenu toonUitloggen={false} />
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground/50 select-none">
            v{__APP_VERSION__} &middot; {__BUILD_DATE__}
          </div>
        </SidebarFooter>
      </Sidebar>

      <main ref={mainRef} className={cn(
        "flex-1 bg-background min-h-0",
        (banenActief || location.startsWith("/berichten") || location.startsWith("/werk-inbox"))
          ? "overflow-hidden flex flex-col"
          : "overflow-y-auto",
      )}>
        {/* NAV_01: accentlijn in de hoofdstukkleur boven de pagina (prominenter sinds aug 2026) */}
        {hoofdstukVanRoute(location) && (
          <div
            aria-hidden
            className="h-1 w-full flex-shrink-0"
            style={{ backgroundColor: `hsl(var(--hoofdstuk-${hoofdstukVanRoute(location)}))` }}
          />
        )}
        {/* Universele topbalk — terugknop altijd zichtbaar, menu toggle alleen mobiel */}
        <div className={cn(
          "z-20 flex items-center gap-2 px-2 py-1.5 bg-background border-b border-border",
          (location.startsWith("/berichten") || location.startsWith("/werk-inbox")) ? "flex-shrink-0" : "sticky top-0",
        )}>
          <SidebarTrigger className="md:hidden" title="Menu openen" />
          <span className="flex items-center gap-1.5 md:hidden min-w-0">
            <img src={logoFpsSchild} alt="FPS Connect" className="h-5 w-auto flex-shrink-0" />
            <span className="truncate text-sm font-bold tracking-tight text-foreground">
              FPS <span className="font-semibold text-muted-foreground">Connect</span>
            </span>
          </span>
          <TerugKnop />
          <div className="ml-auto flex items-center gap-2">
            {paneelBeschikbaar && <BanenMenu />}
            <ZijrandKnoppen metWerkbak />
            <DitWerktNietKnop />
            <MeldingKnop />
            <VersieBadge />
            <OnlineGebruikersTaakbalk />
          </div>
        </div>
        {toonTerugNaarBanen && (
          <div className="flex items-center gap-2 border-b border-border bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <span>
              Dit scherm is niet geschikt voor een baan en staat over de volle
              breedte open.
            </span>
            <button
              type="button"
              onClick={() => navigeer("/")}
              className="ml-auto rounded px-2 py-0.5 font-medium text-amber-900 underline hover:bg-amber-100"
            >
              Terug naar banen
            </button>
          </div>
        )}
        {toonToolboxen && <VeiligheidMeldingBanner />}
        {banenActief ? (
          <div className="flex-1 min-h-0">
            <BanenWeergave
              onNietGeschikt={openVolleBreedte}
              onNaarVolleBreedte={sluitNaarVolleBreedte}
            />
          </div>
        ) : (location.startsWith("/berichten") || location.startsWith("/werk-inbox")) ? (
          <div className="flex-1 min-h-0">
            {children}
          </div>
        ) : (
          <div
            className="p-3 md:p-4 xl:p-6"
            // NAV_01: gekleurd merkteken bij de paginatitel (CSS in index.css op
            // [data-hoofdstuk]); alleen actief wanneer de route een hoofdstuk heeft.
            {...(hoofdstukVanRoute(location) ? { "data-hoofdstuk": "" } : {})}
            style={{
              // MOBIEL_01: onderbalk + veilig gebied mogen de laatste kaart nooit afdekken
            paddingBottom: 'calc(var(--bottom-bar-hoogte, 56px) + 1.5rem)',
              ...(hoofdstukVanRoute(location)
                ? ({ "--hoofdstuk-actief": `var(--hoofdstuk-${hoofdstukVanRoute(location)})` } as React.CSSProperties)
                : {}),
            }}
          >
            {children}
          </div>
        )}
      </main>
      <BerichtNotificatieToast />
      <SlimUploadBalk />
      <NieuwsTicker />
      </TweeTrapsProvider>
    </SidebarProvider>
  );
}
