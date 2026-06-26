import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useListChatGesprekken } from "@workspace/api-client-react";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  ShieldCheck, Building, Wrench, Users, Home,
  ShieldAlert, LifeBuoy, MessageSquarePlus, Activity, Contact, Info, Clock,
  FolderOpen, FileText, ListChecks, Files, LayoutTemplate, Mail,
  Calculator, CalendarDays, LayoutDashboard, BarChart3, CreditCard, MessageSquare, HardHat,
  Trophy, HardDrive, ClipboardList, Smartphone, Plus, Hammer, PackageCheck,
  BookOpen, HardDriveUpload, CalendarCheck2, Settings2, ArchiveRestore,
  Inbox, Building2, Target, Handshake, Newspaper, CalendarRange, KeyRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GebruikerMenu } from "@/components/gebruiker-menu";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useRol } from "@/context/rol-context";
import { featureFlags } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";

type Omgeving = "connect" | "one";
const OMGEVING_SLEUTEL = "fps.omgeving";

function omgevingVanLocatie(loc: string): Omgeving | null {
  if (loc.startsWith("/one/")) return "one";
  return null;
}

export default function BeheerderLayout({ children }: { children: React.ReactNode }) {
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
  const toonOnderhoud     = heeftNiveau("gebouwen", 1);

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

              {/* Acquisitie */}
              {toonCrm && (
                <SidebarGroup>
                  <SidebarGroupLabel>Acquisitie</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
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
                      <SidebarMenuItem>
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
                      <SidebarMenuItem>
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
                      <SidebarMenuItem>
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
                      <SidebarMenuItem>
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
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}

              {/* Projectvoorbereiding */}
              <SidebarGroup>
                <SidebarGroupLabel>Projectvoorbereiding</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {toonGebouwen && (
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={gebouwenActief}>
                          <Link href="/gebouwen">
                            <Building />
                            <span>Alle gebouwen</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    {toonOpname && (
                      <SidebarMenuItem>
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
                    <SidebarMenuItem>
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
                    {toonOffertes && (
                      <SidebarMenuItem>
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
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* Uitvoering */}
              <SidebarGroup>
                <SidebarGroupLabel>Uitvoering</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton disabled>
                        <Hammer />
                        <span>Werkvoorbereiding</span>
                        <InUitvoering />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {featureFlags.planning ? (
                      <SidebarMenuItem>
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
                      <SidebarMenuItem>
                        <SidebarMenuButton disabled>
                          <CalendarDays />
                          <span>Planning</span>
                          <InUitvoering />
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    <SidebarMenuItem>
                      <SidebarMenuButton disabled>
                        <HardHat />
                        <span>Uitvoering</span>
                        <InUitvoering />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* Oplevering */}
              <SidebarGroup>
                <SidebarGroupLabel>Oplevering</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
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
                      <SidebarMenuItem>
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
                      <SidebarMenuItem>
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
                    <SidebarMenuItem>
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
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* Communicatie */}
              <SidebarGroup>
                <SidebarGroupLabel>Communicatie</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/werk-inbox" || location.startsWith("/werk-inbox/")}
                      >
                        <Link href="/werk-inbox">
                          <Inbox />
                          <span>Werk-inbox</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
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
                    {toonCrm && (
                      <SidebarMenuItem>
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
              </SidebarGroup>

              {/* HRM */}
              {(toonPersoneel || toonGereedschappen || isHoofdbeheerder) && (
                <SidebarGroup>
                  <SidebarGroupLabel>HRM</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {toonPersoneel && (
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel" || (location.startsWith("/personeel/") && !location.startsWith("/personeel/verlof") && !location.startsWith("/personeel/capaciteitsplanning") && !location.startsWith("/personeel/jaarafsluiting"))}
                          >
                            <Link href="/personeel">
                              <Users />
                              <span>{t("nav.personeel")}</span>
                              <InUitvoering />
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonPersoneel && (
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            asChild
                            isActive={location.startsWith("/personeel/verlof")}
                          >
                            <Link href="/personeel/verlof">
                              <CalendarCheck2 />
                              <span>Verlofoverzicht</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {toonPersoneel && (
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/personeel/capaciteitsplanning"}
                          >
                            <Link href="/personeel/capaciteitsplanning">
                              <BarChart3 />
                              <span>Capaciteitsplanning</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {isHoofdbeheerder && (
                        <SidebarMenuItem>
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
                      {toonGereedschappen && (
                        <SidebarMenuItem>
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
                      {(toonPersoneel || isHoofdbeheerder) && (
                        <SidebarMenuItem>
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
                        <SidebarMenuItem>
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
                        <SidebarMenuItem>
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

              {/* Beheer */}
              {(toonGebruikers || toonSysteem || toonBibliotheek) && (
                <SidebarGroup>
                  <SidebarGroupLabel>Beheer</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {toonGebruikers && (
                        <SidebarMenuItem>
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
                        <SidebarMenuItem>
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
                        <SidebarMenuItem>
                          <SidebarMenuButton asChild isActive={location === "/beheer/profielen"}>
                            <Link href="/beheer/profielen">
                              <ShieldCheck />
                              <span>Profielen</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {isHoofdbeheerder && (
                        <SidebarMenuItem>
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
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            asChild
                            isActive={location === "/beheer/documentopmaak"}
                          >
                            <Link href="/beheer/documentopmaak">
                              <LayoutTemplate />
                              <span>Documentopmaak</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {isHoofdbeheerder && (
                        <SidebarMenuItem>
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
                      {toonSysteem && (
                        <>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={location === "/beheer/login-pogingen"}>
                              <Link href="/beheer/login-pogingen">
                                <ShieldAlert />
                                <span>Login-pogingen</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={location === "/beheer/mail"}>
                              <Link href="/beheer/mail">
                                <Mail />
                                <span>Mailinstellingen</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={location === "/beheer/helpdesk"}>
                              <Link href="/beheer/helpdesk">
                                <LifeBuoy />
                                <span>Helpdesk</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={location === "/beheer/feedback"}>
                              <Link href="/beheer/feedback">
                                <MessageSquarePlus />
                                <span>Feedback</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={location === "/beheer/heatmaps"}>
                              <Link href="/beheer/heatmaps">
                                <Activity />
                                <span>Heatmaps</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={location === "/beheer/ontwikkelstatus"}>
                              <Link href="/beheer/ontwikkelstatus">
                                <ListChecks />
                                <span>Ontwikkelstatus</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={location === "/beheer/projectstatus"}>
                              <Link href="/beheer/projectstatus">
                                <BarChart3 />
                                <span>Projectstatus</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={location === "/beheer/backup"}>
                              <Link href="/beheer/backup">
                                <HardDrive />
                                <span>Back-up &amp; Herstel</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={location === "/toolbox" || location.startsWith("/toolbox/")}>
                              <Link href="/toolbox">
                                <HardDriveUpload />
                                <span>Toolbox</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={location === "/beheer/privacy"}>
                              <Link href="/beheer/privacy">
                                <ShieldCheck />
                                <span>Privacy AVG-matrix</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </>
                      )}
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={location === "/beheer/pwa-test"}>
                          <Link href="/beheer/pwa-test">
                            <Smartphone />
                            <span>Mobiele test</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
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
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/one/dashboard"}>
                      <Link href="/one/dashboard">
                        <LayoutDashboard />
                        <span>Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
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
                  <SidebarMenuItem>
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
                  <SidebarMenuItem>
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
                  <SidebarMenuItem>
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
          <GebruikerMenu />
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 min-h-screen overflow-auto bg-background p-3 md:p-4 xl:p-6">
        {children}
      </main>
    </SidebarProvider>
  );
}
