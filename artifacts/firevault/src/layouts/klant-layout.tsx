import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { BerichtNotificatieToast } from "@/components/bericht-notificatie-toast";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Home, FileText, Building, Info, LayoutDashboard, ArrowLeft } from "lucide-react";
import { GebruikerMenu } from "@/components/gebruiker-menu";
import { PauzeKnop } from "@/components/pauze/pauze-modal";
import { OnlineGebruikers } from "@/components/online-gebruikers/online-gebruikers";
import { useRol } from "@/context/rol-context";

const ROUTES = [
  { href: "/", labelKey: "nav.mijnPortaal", icoon: LayoutDashboard },
  { href: "/gebouwen", labelKey: "nav.mijnGebouwen3d", icoon: Building },
  { href: "/klant/rapportages", labelKey: "nav.rapportages", icoon: FileText },
  { href: "/info", labelKey: "nav.info", icoon: Info },
];

export default function KlantLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { kanWisselen, zetPersoon } = useRol();

  const defaultSidebarOpen =
    typeof window !== "undefined" ? window.innerWidth >= 1200 : true;

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <Sidebar variant="inset" collapsible="icon" className="border-r-0 shadow-[1px_0_10px_rgba(0,0,0,0.02)] bg-zinc-50">
        <SidebarHeader className="py-6">
          <div className="flex items-center justify-center px-4">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-[10px] bg-[#0EA5E9] flex items-center justify-center shadow-sm">
                  <span className="text-white font-bold text-[11px] tracking-wider">FPS</span>
               </div>
               <span className="group-data-[collapsible=icon]:hidden font-semibold text-zinc-900 tracking-wide text-lg">One</span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-3 mt-4">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1.5">
                {ROUTES.map((route) => {
                  const isActive = location === route.href || (location.startsWith(route.href) && route.href !== "/");
                  return (
                    <SidebarMenuItem key={route.href}>
                      <SidebarMenuButton
                        asChild
                        className={`h-11 rounded-xl transition-all duration-300 ease-out group ${
                          isActive 
                            ? "bg-white text-[#0EA5E9] shadow-[0_2px_8px_rgba(14,165,233,0.08)] font-medium" 
                            : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/80"
                        }`}
                      >
                        <Link href={route.href}>
                          <route.icoon className={`w-5 h-5 transition-colors ${isActive ? "text-[#0EA5E9]" : "text-zinc-400 group-hover:text-zinc-600"}`} />
                          <span className="text-[15px]">{t(route.labelKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4 pb-6 space-y-4">
          <OnlineGebruikers />
          <div className="hidden group-data-[collapsible=icon]:block"><PauzeKnop /></div>
          {kanWisselen && (
            <button
              onClick={() => { zetPersoon(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors group-data-[collapsible=icon]:justify-center"
              title="Terug naar FPS Connect"
            >
              <ArrowLeft className="w-4 h-4 flex-shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">Terug naar Connect</span>
            </button>
          )}
          <div className="bg-white rounded-xl p-2 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <GebruikerMenu />
          </div>
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 min-h-screen bg-zinc-50/50">
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-zinc-50/80 backdrop-blur-xl md:hidden border-b border-zinc-200/50">
          <SidebarTrigger title="Menu openen" className="text-zinc-600" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#0EA5E9] flex items-center justify-center">
              <span className="text-white font-bold text-[9px] tracking-wider">FPS</span>
            </div>
            <span className="font-semibold text-zinc-900">One</span>
          </div>
        </div>
        <div className="p-4 md:p-8 xl:p-12 max-w-[1600px] mx-auto animate-in fade-in duration-500">
          {children}
        </div>
      </main>
      <BerichtNotificatieToast />
    </SidebarProvider>
  );
}
