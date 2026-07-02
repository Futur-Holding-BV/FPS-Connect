import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { SlimUploadBalk } from "@/components/slim-upload-balk";
import { useTranslation } from "react-i18next";
import { useListChatGesprekken, useGetMagazijnSignalering } from "@workspace/api-client-react";
import { BerichtNotificatieToast } from "@/components/bericht-notificatie-toast";
import { NieuwsTicker } from "@/components/nieuws-ticker";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  ShieldCheck, Building, Wrench, Users, Home, Truck,
  ShieldAlert, LifeBuoy, MessageSquarePlus, Activity, Contact, Info, Clock,
  FolderOpen, FileText, ListChecks, Files, LayoutTemplate, Mail,
  Calculator, CalendarDays, LayoutDashboard, BarChart3, CreditCard, MessageSquare, HardHat,
  Trophy, HardDrive, ClipboardList, Smartphone, Plus, Hammer, PackageCheck,
  BookOpen, HardDriveUpload, CalendarCheck2, Settings2, ArchiveRestore,
  Inbox, Building2, Target, Handshake, Newspaper, CalendarRange, KeyRound,
  ClipboardCheck, AlertTriangle, TriangleAlert, FileArchive, Receipt, ArrowUpRight, ScrollText,
  UserPlus, UserMinus, UserX, Car, GitBranch, ArrowLeft, ChevronDown, Palette, Monitor,
  Package, Upload, MapPin, Archive, ArrowLeftRight, BookmarkCheck, ScanSearch,
} from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { GebruikerMenu } from "@/components/gebruiker-menu";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useRol } from "@/context/rol-context";
import { featureFlags } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { NavigatieBewakingProvider, useNavigatieBewaking } from "@/context/navigatie-bewaking";
import { OnlineGebruikers } from "@/components/online-gebruikers/online-gebruikers";
import { VeiligheidMeldingBanner, OpenMeldingenBadge } from "@/components/veiligheidsmelding-banner";

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

type Omgeving = "connect" | "one";
const OMGEVING_SLEUTEL = "fps.omgeving";

function omgevingVanLocatie(loc: string): Omgeving | null {
  if (loc.startsWith("/one/")) return "one";
  return null;
}

export default function BeheerderLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavigatieBewakingProvider>
      <BeheerderLayoutInhoud>{children}</BeheerderLayoutInhoud>
    </NavigatieBewakingProvider>
  );
}

function BeheerderLayoutInhoud({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { heeftNiveau } = useBevoegdheid();
  const { rol } = useRol();
  const isHoofdbeheerder = rol === "hoofdbeheerder";

  const toonGebouwen      = heeftNiveau("gebouwen", 1);
  const toonCrm           = heeftNiveau("crm", 1);
  const toonBibliotheek   = heeftNiveau("bibliotheek", 1);
  const toonGebruikers    = heeftNiveau("gebruikers", 1);
  const toonSysteem       = heeftNiveau("systeem", 1);
  const toonPersoneel     = heeftNiveau("personeel", 1);
  const toonGereedschappen = heeftNiveau("gereedschappen", 1);
  const toonDossiers      = heeftNiveau("dossiers", 1);
  const toonOpname        = heeftNiveau("gebouwen", 1);
  const toonOffertes      = heeftNiveau("offertes", 1);
  const toonOnderhoud     = heeftNiveau("onderhoud", 1);
  const toonToolboxen     = heeftNiveau("toolbox", 1);
  const toonSnagstream    = heeftNiveau("bibliotheek", 1);
  const toonFinancieel    = heeftNiveau("financieel", 1);
  const toonSalarisarchief = heeftNiveau("salarisarchief", 1);
  const toonSalarisMutaties = heeftNiveau("salaris_mutaties", 1);
  const toonScabMail = heeftNiveau("scab_mail", 1);
  const toonBoekhouderPortaal = heeftNiveau("boekhouder_portaal", 1);
  const toonWagenpark = heeftNiveau("wagenpark", 1);
  const toonMagazijn  = heeftNiveau("magazijn", 1);
  const toonLoonOutput = heeftNiveau("salarisarchief", 2);

  const heeftOne = isHoofdbeheerder;
  const aantalOmgevingen = 1 + (heeftOne ? 1 : 0);

  const [opgeslagenKeuze, setOpgeslagenKeuze] = useState<Omgeving>(() => {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem(OMGEVING_SLEUTEL);
      if (v === "connect" || v === "one") return v as Omgeving;
    }
    return "connect";
  });

  const actieveOmgeving: Omgeving = omgevingVanLocatie(location) ?? opgeslagenKeuze;

  function kiesOmgeving(o: Omgeving) {
    setOpgeslagenKeuze(o);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(OMGEVING_SLEUTEL, o);
    }
  }

  const gebouwenActief =
    location === "/gebouwen" || location.startsWith("/gebouwen/") ||
    location === "/voorzieningen" || location.startsWith("/voorzieningen/");

  function InUitvoering() {
    return (
      <Badge
        variant="outline"
        className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
      >
        <Clock className="h-2.5 w-2.5 mr-0.5" />
        {t("nav.inUitvoering")}
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

  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="py-3">
          <div className="flex items-center px-2 gap-2 group-data-[collapsible=icon]:justify-center">
            <img
              src="/logo-fps-connect.png"
              alt="FPS Connect"
              className="h-8 w-auto flex-shrink-0 group-data-[collapsible=icon]:hidden"
            />
            <SidebarTrigger
              className="ml-auto shrink-0 group-data-[collapsible=icon]:ml-0"
              title="Menu in-/uitklappen"
            />
          </div>


          {aantalOmgevingen > 1 && (
            <div className="mt-2 flex gap-1 px-1 group-data-[collapsible=icon]:hidden">
              <button
                onClick={() => kiesOmgeving("connect")}
                className={cn(
                  "flex-1 text-[11px] font-semibold py-1.5 px-1 rounded transition-colors",
                  actieveOmgeving === "connect"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                Connect
              </button>
              {heeftOne && (
                <button
                  onClick={() => kiesOmgeving("one")}
                  className={cn(
                    "flex-1 text-[11px] font-semibold py-1.5 px-1 rounded transition-colors",
                    actieveOmgeving === "one"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  One
                </button>
              )}
            </div>
          )}
        </SidebarHeader>

        <SidebarContent>

          {/* ══════════ FPS CONNECT ══════════ */}
          {actieveOmgeving === "connect" && (
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

              {/* Projectaanpak — workflow in volgorde */}
              <SidebarGroup>
                <SidebarGroupLabel>Projectaanpak</SidebarGroupLabel>
                <SidebarGroupContent>
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
                    {/* ── scheiding: projectbeheer ↑ / acquisitie ↓ ── */}
                    <div className="mx-3 my-2 flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[10px] text-muted-foreground/60 font-medium shrink-0 uppercase tracking-wider">Acquisitie</span>
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
                          <InUitvoering />
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
                          <InUitvoering />
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    <SidebarMenuItem className="pl-5">
                      <SidebarMenuButton disabled>
                        <HardHat />
                        <span>Uitvoering</span>
                        <InUitvoering />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
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
                        <Link href="/rapporten">
                          <PackageCheck />
                          <span>Opleverrapportage</span>
                          <InUitvoering />
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
                            <InUitvoering />
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
                          <span>Documenten</span>
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
                </SidebarGroupContent>
              </SidebarGroup>

              {/* Inkoop */}
              {toonOffertes && (
                <Collapsible defaultOpen className="group/collapsible">
                  <SidebarGroup>
                    <SidebarGroupLabel asChild>
                      <CollapsibleTrigger className="flex w-full items-center">
                        Inkoop
                        <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180 group-data-[collapsible=icon]:hidden" />
                      </CollapsibleTrigger>
                    </SidebarGroupLabel>
                    <CollapsibleContent>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/leveranciers" || location.startsWith("/leveranciers/")}
                            >
                              <Link href="/leveranciers">
                                <Truck />
                                <span>Leveranciers</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/artikelen" || location.startsWith("/artikelen/")}
                            >
                              <Link href="/artikelen">
                                <Package />
                                <span>Artikelen</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              )}

              {/* Magazijn */}
              {toonMagazijn && (
                <Collapsible defaultOpen className="group/collapsible">
                  <SidebarGroup>
                    <SidebarGroupLabel asChild>
                      <CollapsibleTrigger className="flex w-full items-center">
                        Magazijn
                        <MagazijnKritiekBadge />
                        <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180 group-data-[collapsible=icon]:hidden" />
                      </CollapsibleTrigger>
                    </SidebarGroupLabel>
                    <CollapsibleContent>
                      <SidebarGroupContent>
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
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              )}

              {/* Commercie */}
              {toonCrm && (
                <Collapsible defaultOpen className="group/collapsible">
                  <SidebarGroup>
                    <SidebarGroupLabel asChild>
                      <CollapsibleTrigger className="flex w-full items-center">
                        Commercie
                        <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180 group-data-[collapsible=icon]:hidden" />
                      </CollapsibleTrigger>
                    </SidebarGroupLabel>
                    <CollapsibleContent>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/crm/projectkansen"}
                            >
                              <Link href="/crm/projectkansen">
                                <Target />
                                <span>Projectkansen</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/crm" && !location.startsWith("/crm/")}
                            >
                              <Link href="/crm">
                                <Contact />
                                <span>Klanten</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/crm/organisaties" || location.startsWith("/crm/organisaties")}
                            >
                              <Link href="/crm/organisaties">
                                <Building2 />
                                <span>Organisaties</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/crm/concurrenten"}
                            >
                              <Link href="/crm/concurrenten">
                                <Handshake />
                                <span>Concurrenten</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/crm/marktintelligentie"}
                            >
                              <Link href="/crm/marktintelligentie">
                                <Newspaper />
                                <span>Marktinzicht</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/crm/kennisbibliotheek"}
                            >
                              <Link href="/crm/kennisbibliotheek">
                                <BookOpen />
                                <span>Kennisbibliotheek</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              )}

              {/* Communicatie */}
              <Collapsible defaultOpen className="group/collapsible">
                <SidebarGroup>
                  <SidebarGroupLabel asChild>
                    <CollapsibleTrigger className="flex w-full items-center">
                      Communicatie
                      <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180 group-data-[collapsible=icon]:hidden" />
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <SidebarGroupContent>
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
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                        {toonCrm && (
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton
                              asChild
                              isActive={location === "/inbox" || location.startsWith("/inbox/")}
                            >
                              <Link href="/inbox">
                                <Inbox />
                                <span>Slim Uploadpunt</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>

              {/* Veiligheid */}
              {toonToolboxen && (
                <Collapsible defaultOpen className="group/collapsible">
                  <SidebarGroup>
                    <SidebarGroupLabel asChild>
                      <CollapsibleTrigger className="flex w-full items-center">
                        Veiligheid
                        <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180 group-data-[collapsible=icon]:hidden" />
                      </CollapsibleTrigger>
                    </SidebarGroupLabel>
                    <CollapsibleContent>
                      <SidebarGroupContent>
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
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              )}

              {/* Financieel */}
              {toonFinancieel && (
                <SidebarGroup>
                  <SidebarGroupLabel>Financieel</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
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
                          isActive={
                            location === "/facturen" ||
                            location === "/facturen/dashboard" ||
                            (location.startsWith("/facturen/") &&
                              location !== "/facturen/klaar-voor-export" &&
                              location !== "/facturen/exportlog")
                          }
                        >
                          <Link href="/facturen/dashboard">
                            <LayoutDashboard />
                            <span>Facturen</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
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
                  </SidebarGroupContent>
                </SidebarGroup>
              )}

              {/* Organisatie */}
              <SidebarGroup>
                <SidebarGroupLabel>Organisatie</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
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
                    {toonWagenpark && (
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/wagenpark" || location.startsWith("/wagenpark/")}
                        >
                          <Link href="/wagenpark">
                            <Truck />
                            <span>Wagenpark</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
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
                        isActive={location === "/organisatie/bedrijfsgegevens"}
                      >
                        <Link href="/organisatie/bedrijfsgegevens">
                          <Building2 />
                          <span>Bedrijfsgegevens</span>
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
                        isActive={location === "/workflow" || location.startsWith("/workflow")}
                      >
                        <Link href="/workflow">
                          <GitBranch />
                          <span>Workflow</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* Personeel */}
              {(toonPersoneel || isHoofdbeheerder) && (
                <SidebarGroup>
                  <SidebarGroupLabel>Personeel</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {toonPersoneel && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel/onboarden"}
                          >
                            <Link href="/personeel/onboarden">
                              <UserPlus />
                              <span>Onboarden</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
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
                            isActive={location === "/personeel/contracten"}
                          >
                            <Link href="/personeel/contracten">
                              <ScrollText />
                              <span>Contractbewaking</span>
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
                  </SidebarGroupContent>
                </SidebarGroup>
              )}

              {/* Loon — scheiding vóór salarismodules */}
              {(toonSalarisMutaties || toonScabMail || toonLoonOutput || toonBoekhouderPortaal || toonSalarisarchief) && (
                <>
                  <div className="mx-4 my-1 h-px bg-border group-data-[collapsible=icon]:hidden" />
                  <SidebarGroup>
                    <SidebarGroupLabel>Loon</SidebarGroupLabel>
                    <SidebarGroupContent>
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
                                <span>SCAB Salarismails</span>
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
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                </>
              )}

              {/* Instellingen — scheiding vóór beheersectie */}
              {(toonGebruikers || toonSysteem || toonBibliotheek) && (
                <>
                  <div className="mx-4 my-1 h-px bg-border group-data-[collapsible=icon]:hidden" />
                </>
              )}
              {(toonGebruikers || toonSysteem || toonBibliotheek) && (
                <SidebarGroup>
                  <SidebarGroupLabel>Instellingen</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {isHoofdbeheerder && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel/verlof-instellingen"}
                          >
                            <Link href="/personeel/verlof-instellingen">
                              <Settings2 />
                              <span>Verlof-instellingen</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {isHoofdbeheerder && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/beheer/go-live"}
                          >
                            <Link href="/beheer/go-live">
                              <Target />
                              <span>Go-Live Manager</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonGebruikers && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/gebruikers" || location.startsWith("/gebruikers/")}
                          >
                            <Link href="/gebruikers">
                              <Users />
                              <span>{t("nav.gebruikers")}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonBibliotheek && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={
                              location === "/beheer/bibliotheek" ||
                              location.startsWith("/beheer/bibliotheek/") ||
                              location.startsWith("/beheer/toepassingen") ||
                              location.startsWith("/beheer/applicaties")
                            }
                          >
                            <Link href="/beheer/bibliotheek">
                              <BookOpen />
                              <span>Bibliotheek</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {isHoofdbeheerder && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton asChild isActive={location === "/beheer/profielen"}>
                            <Link href="/beheer/profielen">
                              <ShieldCheck />
                              <span>Profielen</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {isHoofdbeheerder && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/beheer/rollen-rechten"}
                          >
                            <Link href="/beheer/rollen-rechten">
                              <KeyRound />
                              <span>Rollen &amp; Rechten</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {isHoofdbeheerder && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/beheer/spotconfiguratie"}
                          >
                            <Link href="/beheer/spotconfiguratie">
                              <Settings2 />
                              <span>Spotconfiguratie</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {isHoofdbeheerder && (
                        <SidebarMenuItem className="pl-5">
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/beheer/gebouwen-archief"}
                          >
                            <Link href="/beheer/gebouwen-archief">
                              <FileArchive />
                              <span>Gebouwenarchief</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonSysteem && (
                        <>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton asChild isActive={location === "/beheer/login-pogingen"}>
                              <Link href="/beheer/login-pogingen">
                                <ShieldAlert />
                                <span>Login-pogingen</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton asChild isActive={location === "/beheer/mail"}>
                              <Link href="/beheer/mail">
                                <Mail />
                                <span>Mailinstellingen</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton asChild isActive={location === "/beheer/helpdesk"}>
                              <Link href="/beheer/helpdesk">
                                <LifeBuoy />
                                <span>Helpdesk</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton asChild isActive={location === "/beheer/feedback"}>
                              <Link href="/beheer/feedback">
                                <MessageSquarePlus />
                                <span>Feedback</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton asChild isActive={location === "/beheer/heatmaps"}>
                              <Link href="/beheer/heatmaps">
                                <Activity />
                                <span>Heatmaps</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton asChild isActive={location === "/beheer/ontwikkelstatus"}>
                              <Link href="/beheer/ontwikkelstatus">
                                <ListChecks />
                                <span>Ontwikkelstatus</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton asChild isActive={location === "/beheer/projectstatus"}>
                              <Link href="/beheer/projectstatus">
                                <BarChart3 />
                                <span>Projectstatus</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton asChild isActive={location === "/beheer/import"}>
                              <Link href="/beheer/import">
                                <Upload />
                                <span>Importeren</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton asChild isActive={location === "/beheer/backup"}>
                              <Link href="/beheer/backup">
                                <HardDrive />
                                <span>Back-up &amp; Herstel</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton asChild isActive={location === "/beheer/herstel"}>
                              <Link href="/beheer/herstel">
                                <Activity />
                                <span>Systeemstatus</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton asChild isActive={location === "/toolbox" || location.startsWith("/toolbox/")}>
                              <Link href="/toolbox">
                                <HardDriveUpload />
                                <span>Toolbox</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem className="pl-5">
                            <SidebarMenuButton asChild isActive={location === "/beheer/privacy"}>
                              <Link href="/beheer/privacy">
                                <ShieldCheck />
                                <span>Privacy AVG-matrix</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </>
                      )}
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton asChild isActive={location === "/beheer/pwa-test"}>
                          <Link href="/beheer/pwa-test">
                            <Smartphone />
                            <span>Mobiele test</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem className="pl-5">
                        <SidebarMenuButton asChild isActive={location === "/info"}>
                          <Link href="/info">
                            <Info />
                            <span>{t("nav.info")}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}
            </>
          )}

          {/* ══════════ FPS ONE ══════════ */}
          {actieveOmgeving === "one" && heeftOne && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem className="pl-5">
                    <SidebarMenuButton asChild isActive={location === "/one/dashboard"}>
                      <Link href="/one/dashboard">
                        <LayoutDashboard />
                        <span>Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem className="pl-5">
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/one/gebouwen" || location.startsWith("/one/gebouwen/")}
                    >
                      <Link href="/one/gebouwen">
                        <Building />
                        <span>Gebouwen</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem className="pl-5">
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/one/documenten" || location.startsWith("/one/documenten/")}
                    >
                      <Link href="/one/documenten">
                        <Files />
                        <span>Documenten</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem className="pl-5">
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/one/rapporten" || location.startsWith("/one/rapporten/")}
                    >
                      <Link href="/one/rapporten">
                        <BarChart3 />
                        <span>Rapporten</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem className="pl-5">
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/one/abonnementen" || location.startsWith("/one/abonnementen/")}
                    >
                      <Link href="/one/abonnementen">
                        <CreditCard />
                        <span>Abonnementen</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

        </SidebarContent>

        <SidebarFooter>
          <PwaInstalleerKnop />
          <OnlineGebruikers />
          <GebruikerMenu />
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 min-h-screen overflow-auto bg-background">
        {/* Universele topbalk — terugknop altijd zichtbaar, menu toggle alleen mobiel */}
        <div className="sticky top-0 z-20 flex items-center gap-2 px-2 py-1.5 bg-background border-b border-border">
          <SidebarTrigger className="md:hidden" title="Menu openen" />
          <img src="/logo-fps-connect.png" alt="FPS Connect" className="h-5 w-auto md:hidden" />
          <TerugKnop />
        </div>
        {toonToolboxen && <VeiligheidMeldingBanner />}
        <div className="p-3 md:p-4 xl:p-6 pb-10">
          {children}
        </div>
      </main>
      <BerichtNotificatieToast />
      <SlimUploadBalk />
      <NieuwsTicker />
    </SidebarProvider>
  );
}
