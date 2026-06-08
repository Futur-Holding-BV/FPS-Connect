import { Link, useLocation } from "wouter";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Building, Wrench, Users, Search, Home, Receipt } from "lucide-react";
import { useRol, type Rol } from "@/context/rol-context";
import { ROL_INFO } from "@/context/rol-types";

const ROUTES = [
  { href: "/", label: "Dashboard", icoon: Home },
  { href: "/gebouwen", label: "Gebouwen", icoon: Building },
  { href: "/voorzieningen", label: "Voorzieningen", icoon: ShieldCheck },
  { href: "/inspecties", label: "Inspecties", icoon: Search },
  { href: "/onderhoud", label: "Onderhoud", icoon: Wrench },
  { href: "/gebruikers", label: "Gebruikers", icoon: Users },
  { href: "/abonnementen", label: "Abonnementen", icoon: Receipt },
];

function RolWisselaar() {
  const { rol, setRol } = useRol();
  return (
    <div className="px-3 py-3 border-t">
      <p className="text-xs text-muted-foreground mb-1.5 group-data-[collapsible=icon]:hidden">Demo: portalkeuze</p>
      <Select value={rol} onValueChange={(v) => setRol(v as Rol)}>
        <SelectTrigger className="h-8 text-xs group-data-[collapsible=icon]:hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(ROL_INFO) as Rol[]).map((r) => (
            <SelectItem key={r} value={r}>{ROL_INFO[r].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function BeheerderLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="py-4">
          <div className="flex items-center gap-2 px-4">
            <div className="bg-primary text-primary-foreground p-1 rounded flex-shrink-0">
              <ShieldCheck size={22} />
            </div>
            <span className="font-bold text-base tracking-tight group-data-[collapsible=icon]:hidden">
              FPS Brandpreventie
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
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
          <RolWisselaar />
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 min-h-screen overflow-auto bg-background p-6">
        {children}
      </main>
    </SidebarProvider>
  );
}
