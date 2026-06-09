import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Flame, ShieldCheck, Building, Wrench, Users, Search, Home, Receipt, ShieldAlert, LifeBuoy, MessageSquarePlus, Activity, Contact, Info } from "lucide-react";
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
        <SidebarHeader className="py-4">
          <div className="flex items-center gap-2 px-4">
            <div className="bg-primary text-primary-foreground p-1.5 rounded flex-shrink-0">
              <Flame size={20} />
            </div>
            <div className="group-data-[collapsible=icon]:hidden leading-tight">
              <div className="font-extrabold text-sm tracking-wide uppercase text-primary">FPS</div>
              <div className="text-xs text-muted-foreground font-medium">Brandpreventie</div>
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
