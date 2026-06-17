import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  ShieldCheck, Building, Wrench, Users, Search, Home, Receipt,
  ShieldAlert, LifeBuoy, MessageSquarePlus, Activity, Contact, Info, BookOpen, Clock,
  FolderOpen, FileText, ListChecks, Files, LayoutTemplate, Mail,
  Calculator, CalendarDays, LayoutDashboard, Globe, BarChart3, CreditCard, MessageSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GebruikerMenu } from "@/components/gebruiker-menu";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useRol } from "@/context/rol-context";

export default function BeheerderLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { heeftNiveau } = useBevoegdheid();
  const { echteRol } = useRol();
  const isHoofdbeheerder = echteRol === "hoofdbeheerder";

  const toonGebouwen      = heeftNiveau("gebouwen", 1);
  const toonInspecties    = heeftNiveau("inspecties", 1);
  const toonOnderhoud     = heeftNiveau("onderhoud", 1);
  const toonCrm           = heeftNiveau("crm", 1);
  const toonAbonnementen  = heeftNiveau("abonnementen", 1);
  const toonBibliotheek   = heeftNiveau("bibliotheek", 1);
  const toonGebruikers    = heeftNiveau("gebruikers", 1);
  const toonSysteem       = heeftNiveau("systeem", 1);
  const toonPersoneel     = heeftNiveau("personeel", 1);
  const toonDossiers      = heeftNiveau("dossiers", 1);
  const toonOffertes      = heeftNiveau("offertes", 1);

  const heeftDomein = toonInspecties || toonOnderhoud || toonCrm || toonAbonnementen;
  const heeftOrganisatie = toonPersoneel || toonDossiers || toonOffertes || isHoofdbeheerder;

  const projectenActief =
    location === "/gebouwen" || location.startsWith("/gebouwen/") ||
    location === "/voorzieningen" || location.startsWith("/voorzieningen/");

  const defaultSidebarOpen =
    typeof window !== "undefined" ? window.innerWidth >= 1200 : true;

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="py-3">
          <div className="flex items-center justify-center px-2">
            <img
              src="/logo-fps.png"
              alt="FPS Brandpreventie"
              className="group-data-[collapsible=icon]:hidden h-9 w-auto object-contain bg-white rounded px-2 py-1"
            />
            <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-8 h-8 bg-white rounded text-[10px] font-extrabold text-primary leading-none">
              FPS
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {/* ── Platform ── */}
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.platform")}</SidebarGroupLabel>
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

                {toonGebouwen && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={projectenActief}>
                      <Link href="/gebouwen">
                        <Building />
                        <span>{t("nav.gebouwen")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* ── Domeinen ── */}
          {heeftDomein && (
            <SidebarGroup>
              <SidebarGroupLabel>{t("nav.domeinen")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {toonInspecties && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/inspecties" || location.startsWith("/inspecties/")}
                      >
                        <Link href="/inspecties">
                          <Search />
                          <span>{t("nav.inspecties")}</span>
                          <Badge
                            variant="outline"
                            className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
                          >
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {t("nav.inUitvoering")}
                          </Badge>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {toonOnderhoud && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/onderhoud" || location.startsWith("/onderhoud/")}
                      >
                        <Link href="/onderhoud">
                          <Wrench />
                          <span>{t("nav.onderhoud")}</span>
                          <Badge
                            variant="outline"
                            className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
                          >
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {t("nav.inUitvoering")}
                          </Badge>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {toonCrm && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/crm" || location.startsWith("/crm/")}
                      >
                        <Link href="/crm">
                          <Contact />
                          <span>{t("nav.crm")}</span>
                          <Badge
                            variant="outline"
                            className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
                          >
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {t("nav.inUitvoering")}
                          </Badge>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {toonAbonnementen && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/abonnementen" || location.startsWith("/abonnementen/")}
                      >
                        <Link href="/abonnementen">
                          <Receipt />
                          <span>{t("nav.abonnementen")}</span>
                          <Badge
                            variant="outline"
                            className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
                          >
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {t("nav.inUitvoering")}
                          </Badge>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* ── Organisatie ── */}
          {heeftOrganisatie && (
            <SidebarGroup>
              <SidebarGroupLabel>{t("nav.organisatie")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {toonPersoneel && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/personeel" || location.startsWith("/personeel/")}
                      >
                        <Link href="/personeel">
                          <Users />
                          <span>{t("nav.personeel")}</span>
                          <Badge
                            variant="outline"
                            className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
                          >
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {t("nav.inUitvoering")}
                          </Badge>
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
                          <Badge
                            variant="outline"
                            className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
                          >
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {t("nav.inUitvoering")}
                          </Badge>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {toonOffertes && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/offertes" || location.startsWith("/offertes/")}
                      >
                        <Link href="/offertes">
                          <FileText />
                          <span>{t("nav.offertes")}</span>
                          <Badge
                            variant="outline"
                            className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
                          >
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {t("nav.inUitvoering")}
                          </Badge>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {isHoofdbeheerder && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/toolbox" || location.startsWith("/toolbox/")}
                      >
                        <Link href="/toolbox">
                          <MessageSquare />
                          <span>Toolbox &amp; berichten</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* ── Bibliotheek ── */}
          {toonBibliotheek && (
            <SidebarGroup>
              <SidebarGroupLabel>Bibliotheek</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/beheer/bibliotheek" || location.startsWith("/beheer/bibliotheek/")}
                    >
                      <Link href="/beheer/bibliotheek">
                        <BookOpen />
                        <span>Bibliotheek</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
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
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/rapporten" || location.startsWith("/rapporten/")}
                    >
                      <Link href="/rapporten">
                        <FileText />
                        <span>Rapporten</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* ── Modules ── */}
          {isHoofdbeheerder && (
            <SidebarGroup>
              <SidebarGroupLabel>Modules</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
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
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/modules/calculatie" || location.startsWith("/modules/calculatie/")}
                    >
                      <Link href="/modules/calculatie">
                        <Calculator />
                        <span>Calculatie</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* ── FPS Connect ── */}
          {isHoofdbeheerder && (
            <SidebarGroup>
              <SidebarGroupLabel>FPS Connect</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/connect/planning" || location.startsWith("/connect/planning/")}
                    >
                      <Link href="/connect/planning">
                        <CalendarDays />
                        <span>Planning</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/connect/calculatie" || location.startsWith("/connect/calculatie/")}
                    >
                      <Link href="/connect/calculatie">
                        <Calculator />
                        <span>Calculatie</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/connect/hrm" || location.startsWith("/connect/hrm/")}
                    >
                      <Link href="/connect/hrm">
                        <Users />
                        <span>HRM</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* ── FPS One ── */}
          {isHoofdbeheerder && (
            <SidebarGroup>
              <SidebarGroupLabel>FPS One</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/one/dashboard"}
                    >
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
                        <Globe />
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

          {/* ── Beheer ── */}
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
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={location === "/beheer/ontwikkelstatus"}>
                        <Link href="/beheer/ontwikkelstatus">
                          <ListChecks />
                          <span>Ontwikkelstatus</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={location === "/beheer/documentopmaak"}>
                        <Link href="/beheer/documentopmaak">
                          <LayoutTemplate />
                          <span>Documentopmaak</span>
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
                  </>
                )}
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
