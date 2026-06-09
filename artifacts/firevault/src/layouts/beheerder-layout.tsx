import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import {
  ShieldCheck, Building, Wrench, Users, Search, Home, Receipt,
  ShieldAlert, LifeBuoy, MessageSquarePlus, Activity, Contact, Info,
  Clock, UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GebruikerMenu } from "@/components/gebruiker-menu";
import { useAuth } from "@/context/auth-context";
import { useRol } from "@/context/rol-context";

export default function BeheerderLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { gebruiker } = useAuth();
  const { echteRol } = useRol();

  const isHoofdBeheerder = echteRol === "hoofdbeheerder";
  const heeftCommercieel = gebruiker?.functietitels?.includes("Commercieel") ?? false;
  const toonAbonnementen = isHoofdBeheerder || (echteRol === "beheerder" && heeftCommercieel);
  const toonKlantPortaal = isHoofdBeheerder || echteRol === "beheerder";

  const beheerRoutes: { href: string; label: string; icoon: React.ElementType }[] = [
    { href: "/gebruikers", label: t("nav.gebruikers"), icoon: Users },
    { href: "/beheer/login-pogingen", label: "Login-pogingen", icoon: ShieldAlert },
    { href: "/beheer/helpdesk", label: "Helpdesk", icoon: LifeBuoy },
    { href: "/beheer/feedback", label: "Feedback", icoon: MessageSquarePlus },
    { href: "/beheer/heatmaps", label: "Heatmaps", icoon: Activity },
    { href: "/info", label: t("nav.info"), icoon: Info },
  ];

  const projectenActief =
    location === "/gebouwen" || location.startsWith("/gebouwen/") ||
    location === "/voorzieningen" || location.startsWith("/voorzieningen/");

  return (
    <SidebarProvider>
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

                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={projectenActief}>
                    <Link href="/gebouwen">
                      <Building />
                      <span>{t("nav.gebouwen")}</span>
                    </Link>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        asChild
                        isActive={location === "/voorzieningen" || location.startsWith("/voorzieningen/")}
                      >
                        <Link href="/voorzieningen">
                          <ShieldCheck />
                          <span>{t("nav.voorzieningen")}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* ── Domeinen ── */}
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.domeinen")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton className="opacity-60 cursor-default" disabled>
                    <Search />
                    <span>{t("nav.inspecties")}</span>
                    <Badge
                      variant="outline"
                      className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
                    >
                      <Clock className="h-2.5 w-2.5 mr-0.5" />
                      {t("nav.inUitvoering")}
                    </Badge>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton className="opacity-60 cursor-default" disabled>
                    <Wrench />
                    <span>{t("nav.onderhoud")}</span>
                    <Badge
                      variant="outline"
                      className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
                    >
                      <Clock className="h-2.5 w-2.5 mr-0.5" />
                      {t("nav.inUitvoering")}
                    </Badge>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton className="opacity-60 cursor-default" disabled>
                    <Contact />
                    <span>{t("nav.crm")}</span>
                    <Badge
                      variant="outline"
                      className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
                    >
                      <Clock className="h-2.5 w-2.5 mr-0.5" />
                      {t("nav.inUitvoering")}
                    </Badge>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {toonAbonnementen && (
                  <SidebarMenuItem>
                    <SidebarMenuButton className="opacity-60 cursor-default" disabled>
                      <Receipt />
                      <span>{t("nav.abonnementen")}</span>
                      <Badge
                        variant="outline"
                        className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
                      >
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        {t("nav.inUitvoering")}
                      </Badge>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {toonKlantPortaal && (
                  <SidebarMenuItem>
                    <SidebarMenuButton className="opacity-60 cursor-default" disabled>
                      <UserRound />
                      <span>{t("nav.klantportaal")}</span>
                      <Badge
                        variant="outline"
                        className="ml-auto text-[10px] px-1.5 py-0 leading-tight border-muted-foreground/40 text-muted-foreground group-data-[collapsible=icon]:hidden"
                      >
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        {t("nav.inUitvoering")}
                      </Badge>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* ── Beheer ── */}
          <SidebarGroup>
            <SidebarGroupLabel>Beheer</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {beheerRoutes.map((route) => (
                  <SidebarMenuItem key={route.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === route.href || location.startsWith(route.href + "/")}
                    >
                      <Link href={route.href}>
                        <route.icoon />
                        <span>{route.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <GebruikerMenu />
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 min-h-screen overflow-auto bg-background p-6">
        {children}
      </main>
    </SidebarProvider>
  );
}
