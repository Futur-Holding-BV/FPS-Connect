import { Link, useLocation } from "wouter";
import logoFps from "@/assets/logo-fps.png";
import logoFpsConnect from "@/assets/logo-fps-connect.png";
import { useTranslation } from "react-i18next";
import { BerichtNotificatieToast } from "@/components/bericht-notificatie-toast";
import { AdviseurChat } from "@/components/adviseur-chat";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger,
} from "@/components/ui/sidebar";
import { ShieldCheck, Home, Wrench, Search, Building, Map, Info } from "lucide-react";
import { useRol } from "@/context/rol-context";
import { GebruikerMenu } from "@/components/gebruiker-menu";
import { PauzeKnop } from "@/components/pauze/pauze-modal";
import { OnlineGebruikers } from "@/components/online-gebruikers/online-gebruikers";

const ROUTES_MONTEUR = [
  { href: "/", labelKey: "nav.mijnOpdrachten", icoon: Home },
  { href: "/voorzieningen", labelKey: "nav.voorzieningen", icoon: ShieldCheck },
  { href: "/gebouwen", labelKey: "nav.gebouwen", icoon: Building },
  { href: "/info", labelKey: "nav.info", icoon: Info },
];

const ROUTES_CONTROLEUR = [
  { href: "/", labelKey: "nav.mijnInspecties", icoon: Home },
  { href: "/gebouwen", labelKey: "nav.gebouwenPlattegronden", icoon: Map },
  { href: "/info", labelKey: "nav.info", icoon: Info },
];

export default function MonteurLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { rol } = useRol();
  const { t } = useTranslation();
  const routes = ROUTES_MONTEUR;
  const portalNaam = t("nav.monteurPortal");

  const defaultSidebarOpen =
    typeof window !== "undefined" ? window.innerWidth >= 1200 : true;

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="py-3">
          <div className="flex items-center justify-center px-2">
            <img
              src={logoFps}
              alt="FPS Brandpreventie"
              className="group-data-[collapsible=icon]:hidden h-9 w-auto object-contain bg-white rounded px-2 py-1"
            />
            <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-8 h-8 bg-white rounded text-[10px] font-extrabold text-primary leading-none">
              FPS
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.menu")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {routes.map((route) => (
                  <SidebarMenuItem key={route.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === route.href || (location.startsWith(route.href) && route.href !== "/")}
                    >
                      <Link href={route.href}>
                        <route.icoon />
                        <span>{t(route.labelKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <OnlineGebruikers />
          <SidebarMenu>
            <PauzeKnop />
          </SidebarMenu>
          <GebruikerMenu />
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 min-h-screen overflow-auto bg-background">
        <div className="sticky top-0 z-10 flex items-center gap-3 px-3 py-2 bg-background border-b border-border md:hidden">
          <SidebarTrigger title="Menu openen" />
          <img src={logoFpsConnect} alt="FPS Connect" className="h-6 w-auto" />
        </div>
        <div className="p-3 md:p-4 xl:p-6">
          {children}
        </div>
      </main>
      <BerichtNotificatieToast />
      <AdviseurChat />
    </SidebarProvider>
  );
}
