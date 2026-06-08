import { Link, useLocation } from "wouter";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from "@/components/ui/sidebar";
import { ShieldCheck, Home, Wrench, Search, Building, Map } from "lucide-react";
import { useRol } from "@/context/rol-context";
import { GebruikerMenu } from "@/components/gebruiker-menu";

const ROUTES_MONTEUR = [
  { href: "/", label: "Mijn opdrachten", icoon: Home },
  { href: "/onderhoud", label: "Werkbonnen", icoon: Wrench },
  { href: "/inspecties", label: "Inspecties", icoon: Search },
  { href: "/voorzieningen", label: "Voorzieningen", icoon: ShieldCheck },
  { href: "/gebouwen", label: "Gebouwen", icoon: Building },
];

const ROUTES_CONTROLEUR = [
  { href: "/", label: "Mijn inspecties", icoon: Home },
  { href: "/inspecties", label: "Inspecties", icoon: Search },
  { href: "/voorzieningen", label: "Voorzieningen", icoon: ShieldCheck },
  { href: "/gebouwen", label: "Gebouwen & plattegronden", icoon: Map },
];

export default function MonteurLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { rol } = useRol();
  const routes = rol === "controleur" ? ROUTES_CONTROLEUR : ROUTES_MONTEUR;
  const portalNaam = rol === "controleur" ? "Controleur portal" : "Monteur portal";

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="py-4">
          <div className="flex items-center gap-2 px-4">
            <div className="bg-blue-600 text-white p-1 rounded flex-shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <div className="font-bold text-sm tracking-tight leading-tight">FPS Brandpreventie</div>
              <div className="text-xs text-muted-foreground">{portalNaam}</div>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
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
