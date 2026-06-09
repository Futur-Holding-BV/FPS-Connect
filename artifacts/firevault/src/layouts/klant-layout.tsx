import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Flame, Home, FileText, Building, Info } from "lucide-react";
import { GebruikerMenu } from "@/components/gebruiker-menu";

const ROUTES = [
  { href: "/", labelKey: "nav.mijnPortaal", icoon: Home },
  { href: "/gebouwen", labelKey: "nav.mijnGebouwen3d", icoon: Building },
  { href: "/klant/rapportages", labelKey: "nav.rapportages", icoon: FileText },
  { href: "/info", labelKey: "nav.info", icoon: Info },
];

export default function KlantLayout({ children }: { children: React.ReactNode }) {
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
              <div className="text-xs text-muted-foreground font-medium">{t("nav.klantportaal")}</div>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
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
