import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { Building, ShieldCheck, Wrench, Users, Search, Home, Map, Receipt, Settings } from "lucide-react";

import Dashboard from "@/pages/dashboard";
import Gebouwen from "@/pages/gebouwen/index";
import GebouwDetail from "@/pages/gebouwen/detail";
import Plattegrond from "@/pages/gebouwen/plattegrond";
import Voorzieningen from "@/pages/voorzieningen/index";
import VoorzieningDetail from "@/pages/voorzieningen/detail";
import VoorzieningNieuw from "@/pages/voorzieningen/nieuw";
import Inspecties from "@/pages/inspecties/index";
import InspectieDetail from "@/pages/inspecties/detail";
import Onderhoud from "@/pages/onderhoud/index";
import Gebruikers from "@/pages/gebruikers/index";
import Abonnementen from "@/pages/abonnementen/index";

const queryClient = new QueryClient();

function AppSidebar() {
  const [location] = useLocation();

  const routes = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/gebouwen", label: "Gebouwen", icon: Building },
    { href: "/voorzieningen", label: "Voorzieningen", icon: ShieldCheck },
    { href: "/inspecties", label: "Inspecties", icon: Search },
    { href: "/onderhoud", label: "Onderhoud", icon: Wrench },
    { href: "/gebruikers", label: "Gebruikers", icon: Users },
    { href: "/abonnementen", label: "Abonnementen", icon: Receipt },
  ];

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="py-4">
        <div className="flex items-center gap-2 px-4">
          <div className="bg-primary text-primary-foreground p-1 rounded">
            <ShieldCheck size={24} />
          </div>
          <span className="font-bold text-lg tracking-tight group-data-[collapsible=icon]:hidden">FireVault</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {routes.map((route) => (
                <SidebarMenuItem key={route.href}>
                  <SidebarMenuButton asChild isActive={location === route.href || (location.startsWith(route.href) && route.href !== "/")}>
                    <Link href={route.href}>
                      <route.icon />
                      <span>{route.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 min-h-screen overflow-auto bg-background p-6">
        {children}
      </main>
    </SidebarProvider>
  );
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/gebouwen" component={Gebouwen} />
        <Route path="/gebouwen/:id" component={GebouwDetail} />
        <Route path="/gebouwen/:id/plattegrond/:verdiepingId" component={Plattegrond} />
        <Route path="/voorzieningen" component={Voorzieningen} />
        <Route path="/voorzieningen/nieuw" component={VoorzieningNieuw} />
        <Route path="/voorzieningen/:id" component={VoorzieningDetail} />
        <Route path="/inspecties" component={Inspecties} />
        <Route path="/inspecties/:id" component={InspectieDetail} />
        <Route path="/onderhoud" component={Onderhoud} />
        <Route path="/gebruikers" component={Gebruikers} />
        <Route path="/abonnementen" component={Abonnementen} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
