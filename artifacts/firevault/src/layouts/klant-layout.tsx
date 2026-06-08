import { Link, useLocation } from "wouter";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Home, FileText, Building, Plus } from "lucide-react";
import { useRol, type Rol } from "@/context/rol-context";
import { ROL_INFO } from "@/context/rol-types";

const ROUTES = [
  { href: "/", label: "Mijn portaal", icoon: Home },
  { href: "/gebouwen", label: "Mijn gebouwen & 3D", icoon: Building },
  { href: "/klant/rapportages", label: "Rapportages", icoon: FileText },
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

export default function KlantLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="py-4">
          <div className="flex items-center gap-2 px-4">
            <div className="bg-slate-700 text-white p-1 rounded flex-shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <div className="font-bold text-sm tracking-tight leading-tight">FPS Brandpreventie</div>
              <div className="text-xs text-muted-foreground">Klantportaal</div>
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
