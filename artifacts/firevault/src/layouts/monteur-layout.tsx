import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Flame, ShieldCheck, Home, Wrench, Search, Building, Map, Info } from "lucide-react";
import { useRol } from "@/context/rol-context";
import { GebruikerMenu } from "@/components/gebruiker-menu";

const ROUTES_MONTEUR = [
  { href: "/", labelKey: "nav.mijnOpdrachten", icoon: Home },
  { href: "/onderhoud", labelKey: "nav.werkbonnen", icoon: Wrench },
  { href: "/inspecties", labelKey: "nav.inspecties", icoon: Search },
  { href: "/voorzieningen", labelKey: "nav.voorzieningen", icoon: ShieldCheck },
  { href: "/gebouwen", labelKey: "nav.gebouwen", icoon: Building },
  { href: "/info", labelKey: "nav.info", icoon: Info },
];

const ROUTES_CONTROLEUR = [
  { href: "/", labelKey: "nav.mijnInspecties", icoon: Home },
  { href: "/inspecties", labelKey: "nav.inspecties", icoon: Search },
  { href: "/voorzieningen", labelKey: "nav.voorzieningen", icoon: ShieldCheck },
  { href: "/gebouwen", labelKey: "nav.gebouwenPlattegronden", icoon: Map },
  { href: "/info", labelKey: "nav.info", icoon: Info },
];

export default function MonteurLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { rol } = useRol();
  const { t } = useTranslation();
  const routes = rol === "controleur" ? ROUTES_CONTROLEUR : ROUTES_MONTEUR;
  const portalNaam = rol === "controleur" ? t("nav.controleurPortal") : t("nav.monteurPortal");

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="py-4">
          <div className="flex items-center gap-2 px-4">
            <div className="bg-primary text-primary-foreground p-1.5 rounded flex-shrink-0">
              <Flame size={20} />
            </div>
            <div className="group-data-[collapsible=icon]:hidden leading-tight">
              <div className="font-extrabold text-sm tracking-wide uppercase text-primary">FPS</div>
              <div className="text-xs text-muted-foreground font-medium">{portalNaam}</div>
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
          <GebruikerMenu />
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 min-h-screen overflow-auto bg-background p-6">
        {children}
      </main>
    </SidebarProvider>
  );
}
