import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from "@/components/ui/sidebar";
import { ShieldCheck, Building, Wrench, Users, Search, Home, Receipt, ShieldAlert, LifeBuoy, MessageSquarePlus, Activity, Contact, Info } from "lucide-react";
import { GebruikerMenu } from "@/components/gebruiker-menu";

const ROUTES = [
  { href: "/", labelKey: "nav.dashboard", icoon: Home },
  { href: "/gebouwen", labelKey: "nav.gebouwen", icoon: Building },
  { href: "/voorzieningen", labelKey: "nav.voorzieningen", icoon: ShieldCheck },
  { href: "/inspecties", labelKey: "nav.inspecties", icoon: Search },
  { href: "/onderhoud", labelKey: "nav.onderhoud", icoon: Wrench },
  { href: "/gebruikers", labelKey: "nav.gebruikers", icoon: Users },
  { href: "/crm", labelKey: "nav.crm", icoon: Contact },
  { href: "/abonnementen", labelKey: "nav.abonnementen", icoon: Receipt },
];

const BEHEER_ROUTES = [
  { href: "/beheer/login-pogingen", label: "Login-pogingen", icoon: ShieldAlert },
  { href: "/beheer/helpdesk", label: "Helpdesk", icoon: LifeBuoy },
  { href: "/beheer/feedback", label: "Feedback", icoon: MessageSquarePlus },
  { href: "/beheer/heatmaps", label: "Heatmaps", icoon: Activity },
  { href: "/info", label: "App-informatie", icoon: Info },
];

export default function BeheerderLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { t } = useTranslation();

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
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.platform")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ROUTES.map((route) => (
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

          <SidebarGroup>
            <SidebarGroupLabel>Beheer</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {BEHEER_ROUTES.map((route) => (
                  <SidebarMenuItem key={route.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === route.href || location.startsWith(route.href)}
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
