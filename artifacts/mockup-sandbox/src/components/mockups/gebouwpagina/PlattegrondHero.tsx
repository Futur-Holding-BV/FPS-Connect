import React, { useState } from "react";
import "./_group.css";
import { 
  Building2, 
  Map, 
  Layers, 
  Users, 
  Settings, 
  Search, 
  Bell, 
  Menu, 
  ChevronRight, 
  CheckCircle, 
  Hash, 
  Calendar, 
  ClipboardList, 
  Activity, 
  Wifi, 
  ZoomIn, 
  ZoomOut, 
  Move,
  MapPin,
  Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// ---- Data & Constanten ----
const OBJECT_KLEUREN: Record<string, string> = {
  branddeur: "#ef4444",
  doorvoering: "#f97316",
  brandklep: "#eab308",
  kitvoeg: "#84cc16",
  manchet: "#10b981",
  "brandwerend glas": "#3b82f6",
  coating: "#8b5cf6",
  luik: "#ec4899",
};

const STATUS_KLEUREN: Record<string, string> = {
  concept: "#94a3b8",
  "in uitvoering": "#3b82f6",
  opgeleverd: "#14b8a6",
  goedgekeurd: "#22c55e",
  afgekeurd: "#ef4444",
  "in onderhoud": "#f97316",
};

const BOUWLAGEN = [
  { id: "kelder", naam: "Kelder", spots: 8 },
  { id: "begane-grond", naam: "Begane grond", spots: 14 },
  { id: "verdieping-1", naam: "1e Verdieping", spots: 6 },
];

const SPOTS_BEGANE_GROND = [
  { id: 1, type: "branddeur", status: "goedgekeurd", x: 150, y: 200, nummer: "1" },
  { id: 2, type: "doorvoering", status: "in uitvoering", x: 250, y: 180, nummer: "2" },
  { id: 3, type: "brandklep", status: "concept", x: 400, y: 220, nummer: "3" },
  { id: 4, type: "kitvoeg", status: "goedgekeurd", x: 600, y: 150, nummer: "4" },
  { id: 5, type: "manchet", status: "afgekeurd", x: 700, y: 300, nummer: "5" },
  { id: 6, type: "brandwerend glas", status: "goedgekeurd", x: 300, y: 400, nummer: "6" },
  { id: 7, type: "coating", status: "goedgekeurd", x: 800, y: 250, nummer: "7" },
  { id: 8, type: "luik", status: "in onderhoud", x: 100, y: 350, nummer: "8" },
  { id: 9, type: "doorvoering", status: "goedgekeurd", x: 500, y: 450, nummer: "9" },
  { id: 10, type: "branddeur", status: "in uitvoering", x: 550, y: 500, nummer: "10" },
  { id: 11, type: "kitvoeg", status: "goedgekeurd", x: 850, y: 400, nummer: "11" },
  { id: 12, type: "brandklep", status: "concept", x: 200, y: 500, nummer: "12" },
  { id: 13, type: "doorvoering", status: "afgekeurd", x: 750, y: 150, nummer: "13" },
  { id: 14, type: "manchet", status: "goedgekeurd", x: 450, y: 100, nummer: "14" },
];

export function PlattegrondHero() {
  const [actieveBouwlaag, setActieveBouwlaag] = useState("begane-grond");

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      {/* Sidebar */}
      <aside className="w-16 lg:w-64 flex-shrink-0 bg-sidebar text-sidebar-foreground flex flex-col items-center lg:items-stretch border-r border-sidebar-border">
        <div className="h-14 flex items-center justify-center lg:justify-start lg:px-4 border-b border-sidebar-border shrink-0">
          <div className="w-8 h-8 rounded bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold text-lg">F</div>
          <span className="ml-3 font-semibold text-lg hidden lg:block tracking-tight">FPS</span>
        </div>
        <div className="flex-1 py-4 flex flex-col gap-2 px-2 lg:px-3">
          <NavItem icon={<Activity />} label="Dashboard" />
          <NavItem icon={<Building2 />} label="Gebouwen" active />
          <NavItem icon={<Map />} label="Plattegronden" />
          <NavItem icon={<Users />} label="Team" />
          <div className="mt-auto">
            <NavItem icon={<Settings />} label="Instellingen" />
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Topbar */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center text-sm text-muted-foreground">
              <span>Gebouwen</span>
              <ChevronRight className="h-4 w-4 mx-1" />
              <span className="text-foreground font-medium">Distributiecentrum Hoofdweg 12</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" placeholder="Zoeken..." className="h-9 w-64 rounded-md border border-input bg-background pl-9 pr-4 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary border-2 border-card"></span>
            </Button>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/20 text-primary">JD</AvatarFallback>
            </Avatar>
          </div>
        </header>

        <ScrollArea className="flex-1">
          <div className="p-6 md:p-8 max-w-screen-2xl mx-auto space-y-6">
            
            {/* Gebouw Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight">Distributiecentrum Hoofdweg 12</h1>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1.5 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Actief
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-muted-foreground/70" />
                    Hoofdweg 12, 3542 AB Utrecht
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Hash className="h-4 w-4 text-muted-foreground/70" />
                    WN-2024-0087
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-muted-foreground/70" />
                    Start: 12 Mrt 2024
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-md border border-border">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Projectleider:</span>
                  <span className="font-medium">M. de Vries</span>
                </div>
                <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-md border border-border">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Opdrachtgever:</span>
                  <span className="font-medium">Bouwbedrijf Janssen BV</span>
                </div>
              </div>
            </div>

            {/* HERO PLATTEGROND SECTIE */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <Tabs value={actieveBouwlaag} onValueChange={setActieveBouwlaag} className="w-full max-w-md">
                  <TabsList className="grid w-full grid-cols-3 bg-muted p-1">
                    {BOUWLAGEN.map(laag => (
                      <TabsTrigger key={laag.id} value={laag.id} className="text-sm">
                        {laag.naam} <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 bg-background">{laag.spots}</Badge>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <div className="flex items-center gap-1.5 bg-card border border-border rounded-full px-3 py-1 shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-[#22c55e]"></div>
                    <span className="font-medium text-foreground">9 goedgekeurd</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-card border border-border rounded-full px-3 py-1 shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-[#3b82f6]"></div>
                    <span className="font-medium text-foreground">3 in uitvoering</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-card border border-border rounded-full px-3 py-1 shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-[#ef4444]"></div>
                    <span className="font-medium text-foreground">2 afgekeurd</span>
                  </div>
                </div>
              </div>

              <Card className="border-border shadow-md overflow-hidden relative group">
                <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                  <div className="bg-white/90 backdrop-blur-sm border border-border shadow-sm rounded-full px-3 py-1.5 flex items-center gap-2 text-xs font-medium text-foreground">
                    <div className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </div>
                    Live meekijken
                    <span className="text-muted-foreground font-normal ml-1">K. Hendriks plaatst spot #15</span>
                  </div>
                </div>

                <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
                  <div className="bg-white/90 backdrop-blur-sm border border-border rounded-md shadow-sm p-1 flex flex-col">
                    <Button variant="ghost" size="icon" className="h-8 w-8"><ZoomIn className="h-4 w-4" /></Button>
                    <Separator />
                    <Button variant="ghost" size="icon" className="h-8 w-8"><ZoomOut className="h-4 w-4" /></Button>
                    <Separator />
                    <Button variant="ghost" size="icon" className="h-8 w-8"><Move className="h-4 w-4" /></Button>
                  </div>
                </div>

                <div className="h-[600px] w-full bg-slate-50 relative overflow-hidden flex items-center justify-center">
                  <svg width="100%" height="100%" viewBox="0 0 1000 600" className="absolute inset-0">
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="1"/>
                      </pattern>
                      <pattern id="grid-large" width="200" height="200" patternUnits="userSpaceOnUse">
                        <rect width="200" height="200" fill="url(#grid)" />
                        <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#cbd5e1" strokeWidth="2"/>
                      </pattern>
                    </defs>
                    
                    {/* Grid */}
                    <rect width="100%" height="100%" fill="url(#grid-large)" />
                    
                    {/* Plattegrond Omtrek */}
                    <rect x="100" y="100" width="800" height="400" fill="none" stroke="#64748b" strokeWidth="3" strokeDasharray="10 5" rx="8" />
                    <rect x="300" y="300" width="200" height="200" fill="none" stroke="#64748b" strokeWidth="3" strokeDasharray="10 5" />
                    <path d="M 700 100 L 700 500" fill="none" stroke="#64748b" strokeWidth="3" strokeDasharray="10 5" />
                    
                    {/* Scheidingslijn EW60 */}
                    <path d="M 500 100 L 500 500" fill="none" stroke="#dc2626" strokeWidth="4" strokeDasharray="8 8" />
                    <circle cx="500" cy="300" r="18" fill="#dc2626" />
                    <text x="500" y="300" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="10" fontWeight="bold">EW60</text>

                    {/* Spots */}
                    {SPOTS_BEGANE_GROND.map(spot => (
                      <g key={spot.id} transform={`translate(${spot.x}, ${spot.y})`}>
                        <circle cx="0" cy="0" r="20" fill={OBJECT_KLEUREN[spot.type]} opacity="0.2" />
                        <circle cx="0" cy="0" r="14" fill={STATUS_KLEUREN[spot.status]} stroke="#ffffff" strokeWidth="2" />
                        <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="11" fontWeight="bold">{spot.nummer}</text>
                      </g>
                    ))}
                    
                    {/* Live indicator ripple effect on spot #15 (simulated) */}
                    <g transform="translate(650, 400)">
                      <circle cx="0" cy="0" r="25" fill="none" stroke="#ef4444" strokeWidth="2" className="animate-ping opacity-75" />
                      <circle cx="0" cy="0" r="14" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
                      <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="11" fontWeight="bold">15</text>
                    </g>
                  </svg>
                </div>

                <div className="bg-card border-t border-border p-4 flex flex-col md:flex-row gap-6 justify-between items-center text-sm">
                  <div className="flex gap-6 items-start flex-wrap">
                    <div>
                      <h4 className="font-semibold mb-2 text-xs uppercase tracking-wider text-muted-foreground">Objecttypes</h4>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1.5">
                        {Object.entries(OBJECT_KLEUREN).map(([type, color]) => (
                          <div key={type} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full opacity-60" style={{ backgroundColor: color }}></div>
                            <span className="capitalize">{type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator orientation="vertical" className="hidden lg:block h-auto" />
                    <div>
                      <h4 className="font-semibold mb-2 text-xs uppercase tracking-wider text-muted-foreground">Status</h4>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
                        {Object.entries(STATUS_KLEUREN).map(([status, color]) => (
                          <div key={status} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
                            <span className="capitalize">{status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Secundaire rij: 3D en Kaart */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="shadow-sm border-border">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm flex items-center gap-2 font-medium">
                    <Layers className="h-4 w-4 text-primary" /> 3D Visualisatie
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="h-48 bg-muted rounded-md relative flex items-center justify-center overflow-hidden border border-border/50">
                     <div style={{ transform: "rotateX(60deg) rotateZ(45deg)", transformStyle: "preserve-3d" }} className="relative w-32 h-32">
                        <div className="absolute inset-0 bg-primary/20 border border-primary/50" style={{ transform: "translateZ(0px)" }}></div>
                        <div className="absolute inset-0 bg-primary/20 border border-primary/50" style={{ transform: "translateZ(30px)" }}></div>
                        <div className="absolute inset-0 bg-primary/20 border border-primary/50" style={{ transform: "translateZ(60px)" }}></div>
                     </div>
                  </div>
                  <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
                    <span>3 bouwlagen</span>
                    <span>15m hoog</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-border">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm flex items-center gap-2 font-medium">
                    <MapPin className="h-4 w-4 text-primary" /> Locatie
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="h-48 bg-muted rounded-md relative flex items-center justify-center overflow-hidden border border-border/50">
                    {/* Fake map */}
                    <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM5NGEzYjgiIHN0cm9rZS13aWR0aD0iMC41Ii8+PC9zdmc+')]"></div>
                    <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center absolute">
                      <div className="w-3 h-3 bg-primary rounded-full relative">
                        <div className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75"></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
                    <span className="truncate pr-4">Hoofdweg 12, 3542 AB Utrecht</span>
                  </div>
                </CardContent>
              </Card>
            </div>
            
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button className={`w-full flex items-center gap-3 p-2 rounded-md transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
      <div className="shrink-0">{icon}</div>
      <span className="text-sm font-medium hidden lg:block">{label}</span>
    </button>
  );
}
