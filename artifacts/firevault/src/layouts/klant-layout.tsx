import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Home, FileText, Building, Info } from "lucide-react";
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
