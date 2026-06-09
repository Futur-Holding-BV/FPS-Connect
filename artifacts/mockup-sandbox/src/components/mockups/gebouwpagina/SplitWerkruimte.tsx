import React, { useState } from "react";
import "./_group.css";
import { 
  Building2, Map, LayoutDashboard, Settings, User, LogOut, ArrowLeft,
  ChevronDown, Search, Filter, Plus, Activity, Clock, Layers,
  ChevronRight, ExternalLink, Users, AlertTriangle, CheckCircle, 
  MapPin, Box, Hash, MoreVertical, Wifi, Radio
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const TYPEN: Record<string, { kleur: string; label: string }> = {
  branddeur:       { kleur: "#ef4444", label: "Branddeur" },
  doorvoering:     { kleur: "#f97316", label: "Doorvoering" },
  brandklep:       { kleur: "#eab308", label: "Brandklep" },
  kitvoeg:         { kleur: "#84cc16", label: "Kitvoeg" },
  manchet:         { kleur: "#10b981", label: "Manchet" },
  brandwerend_glas:{ kleur: "#3b82f6", label: "Brandwerend Glas" },
  coating:         { kleur: "#8b5cf6", label: "Coating" },
  luik:            { kleur: "#ec4899", label: "Luik" },
};

const STATUSKLEUREN: Record<string, string> = {
  concept:       "#94a3b8",
  in_uitvoering: "#3b82f6",
  opgeleverd:    "#14b8a6",
  goedgekeurd:   "#22c55e",
  afgekeurd:     "#ef4444",
  in_onderhoud:  "#f97316",
};

const STATUSLABEL: Record<string, string> = {
  concept:       "Concept",
  in_uitvoering: "In uitvoering",
  opgeleverd:    "Opgeleverd",
  goedgekeurd:   "Goedgekeurd",
  afgekeurd:     "Afgekeurd",
  in_onderhoud:  "In onderhoud",
};

const spots = [
  { id: 1, type: "branddeur", status: "goedgekeurd", x: 150, y: 200, nr: "1" },
  { id: 2, type: "doorvoering", status: "in_uitvoering", x: 300, y: 180, nr: "2" },
  { id: 3, type: "brandklep", status: "opgeleverd", x: 450, y: 220, nr: "3" },
  { id: 4, type: "kitvoeg", status: "concept", x: 200, y: 350, nr: "4" },
  { id: 5, type: "manchet", status: "goedgekeurd", x: 600, y: 400, nr: "5" },
  { id: 6, type: "brandwerend_glas", status: "afgekeurd", x: 750, y: 150, nr: "6" },
  { id: 7, type: "coating", status: "in_onderhoud", x: 500, y: 500, nr: "7" },
  { id: 8, type: "luik", status: "goedgekeurd", x: 350, y: 600, nr: "8" },
  { id: 9, type: "doorvoering", status: "in_uitvoering", x: 800, y: 300, nr: "9" },
  { id: 10, type: "branddeur", status: "concept", x: 100, y: 500, nr: "10" },
];

export function SplitWerkruimte() {
  const [locatieOpen, setLocatieOpen] = useState(false);
  const [visualOpen, setVisualOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside className="w-16 bg-sidebar border-r border-sidebar-border flex flex-col items-center py-4 flex-shrink-0 z-20">
        <div className="h-10 w-10 bg-sidebar-primary rounded-md flex items-center justify-center mb-8">
          <Building2 className="h-6 w-6 text-white" />
        </div>
        <nav className="flex flex-col gap-4 w-full px-2">
          <Button variant="ghost" size="icon" className="w-full h-12 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <LayoutDashboard className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="w-full h-12 bg-sidebar-accent text-sidebar-foreground relative">
            <div className="absolute left-0 top-2 bottom-2 w-1 bg-sidebar-primary rounded-r-full" />
            <Map className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="w-full h-12 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <Users className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="w-full h-12 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <Settings className="h-5 w-5" />
          </Button>
        </nav>
        <div className="mt-auto flex flex-col gap-4 w-full px-2">
          <Avatar className="h-10 w-10 mx-auto border border-sidebar-border">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground">MV</AvatarFallback>
          </Avatar>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 border-b bg-card px-6 flex items-center justify-between shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <h1 className="font-semibold text-lg leading-tight">Distributiecentrum Hoofdweg 12</h1>
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Actief</Badge>
                <Badge variant="outline" className="text-muted-foreground flex items-center gap-1 font-mono text-xs">
                  <Hash className="h-3 w-3" /> WN-2024-0087
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-0.5">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Hoofdweg 12, 3542 AB Utrecht</span>
                <span className="flex items-center gap-1"><User className="h-3 w-3" /> Projectleider: M. de Vries</span>
                <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> Opdrachtgever: Bouwbedrijf Janssen BV</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              Rapportage
            </Button>
            <Button size="sm">
              Gereedmelden
            </Button>
          </div>
        </header>

        {/* Workspace Split */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Plattegrond (70%) */}
          <div className="flex-[7] bg-muted/30 relative flex flex-col min-w-0 border-r">
            {/* Map Toolbar */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
              <div className="flex items-center gap-2 pointer-events-auto bg-card p-1 rounded-lg shadow-sm border">
                <Button variant="secondary" size="sm" className="font-medium bg-primary/10 text-primary hover:bg-primary/20">Begane grond</Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground">Kelder</Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground">1e Verdieping</Button>
              </div>
              <div className="flex gap-2 pointer-events-auto">
                <div className="bg-card p-1 rounded-lg shadow-sm border flex items-center">
                  <Button variant="ghost" size="icon" className="h-8 w-8"><Filter className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8"><Search className="h-4 w-4" /></Button>
                </div>
                <Button size="sm" className="shadow-sm">
                  <Plus className="h-4 w-4 mr-1" /> Nieuwe spot
                </Button>
              </div>
            </div>

            {/* Map Canvas */}
            <div className="flex-1 w-full h-full relative overflow-hidden cursor-move">
              <svg width="100%" height="100%" viewBox="0 0 1000 800" className="absolute inset-0">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                
                {/* Building Outline */}
                <rect x="50" y="50" width="900" height="700" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" rx="4" />
                <path d="M 50 250 L 300 250 M 50 550 L 400 550 M 700 50 L 700 350 M 500 800 L 500 550" stroke="#cbd5e1" strokeWidth="2" />
                
                {/* EW60 Line */}
                <g>
                  <path d="M 300 50 L 300 750" stroke="#dc2626" strokeWidth="3" strokeDasharray="10 5" opacity="0.6" />
                  <circle cx="300" cy="400" r="14" fill="#dc2626" />
                  <text x="300" y="400" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="central">EW60</text>
                </g>

                {/* Spots */}
                {spots.map((spot) => {
                  const typeColor = TYPEN[spot.type]?.kleur || "#000";
                  const statusColor = STATUSKLEUREN[spot.status] || "#000";
                  const isPulsing = spot.id === 2; // Simulated live placement

                  return (
                    <g key={spot.id} transform={`translate(${spot.x}, ${spot.y})`} style={{ cursor: "pointer" }}>
                      {isPulsing && (
                        <>
                          <circle r="20" fill={typeColor} opacity="0.2" className="animate-ping" />
                          <circle r="15" fill={typeColor} opacity="0.4" />
                        </>
                      )}
                      <circle r="12" fill={statusColor} stroke={typeColor} strokeWidth="2" />
                      <text x="0" y="0" fill="white" fontSize="11" fontWeight="bold" textAnchor="middle" dominantBaseline="central">
                        {spot.nr}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legenda (Bottom Left) */}
            <div className="absolute bottom-4 left-4 bg-card border shadow-sm rounded-lg p-3 z-10 pointer-events-auto flex gap-6 text-xs">
              <div>
                <h4 className="font-semibold mb-2 text-muted-foreground uppercase tracking-wider text-[10px]">Objecttypes</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {Object.entries(TYPEN).slice(0,4).map(([key, { kleur, label }]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full border-2 border-card" style={{ backgroundColor: kleur, outline: `2px solid ${kleur}`, outlineOffset: '-1px' }} />
                      <span className="truncate">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="w-px bg-border" />
              <div>
                <h4 className="font-semibold mb-2 text-muted-foreground uppercase tracking-wider text-[10px]">Status</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {Object.entries(STATUSLABEL).slice(0,4).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUSKLEUREN[key] }} />
                      <span className="truncate">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Toolbar / Info (30%) */}
          <div className="flex-[3] flex flex-col bg-muted/10 border-l max-w-sm">
            <ScrollArea className="flex-1">
              <div className="p-4 flex flex-col gap-4">
                
                {/* LIVE MEEKIJKEN Card */}
                <Card className="border-primary/20 shadow-sm bg-primary/5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/40 via-primary to-primary/40 animate-pulse" />
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-primary font-semibold text-sm uppercase tracking-wide">
                        <Radio className="h-4 w-4 animate-pulse" />
                        Live Meekijken
                      </div>
                      <Badge variant="outline" className="bg-white border-primary/20 text-primary">Nu actief</Badge>
                    </div>
                    <div className="flex items-center gap-3 bg-white p-3 rounded-md border border-primary/10 shadow-sm">
                      <Avatar className="h-8 w-8 border border-primary/20">
                        <AvatarFallback className="bg-primary/10 text-primary">JB</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Monteur J. Bakker</span>
                        <span className="text-xs text-muted-foreground">Plaatst momenteel op Begane grond</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Activiteitenfeed */}
                <Card className="shadow-sm">
                  <CardHeader className="p-4 pb-2 border-b">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      Live Activiteiten
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="flex flex-col divide-y">
                      <div className="p-3 hover:bg-muted/50 transition-colors flex gap-3 text-sm">
                        <div className="mt-0.5"><div className="w-2 h-2 rounded-full bg-primary animate-pulse" /></div>
                        <div>
                          <p><span className="font-medium">Branddeur K-014</span> geplaatst door J. Bakker</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Zojuist</p>
                        </div>
                      </div>
                      <div className="p-3 hover:bg-muted/50 transition-colors flex gap-3 text-sm">
                        <div className="mt-0.5"><CheckCircle className="h-3.5 w-3.5 text-green-500" /></div>
                        <div>
                          <p>Status <span className="font-medium">doorvoering BG-031</span> gewijzigd naar <span className="text-green-600 font-medium">goedgekeurd</span></p>
                          <p className="text-xs text-muted-foreground mt-0.5">5 min geleden · S. de Boer</p>
                        </div>
                      </div>
                      <div className="p-3 hover:bg-muted/50 transition-colors flex gap-3 text-sm opacity-70">
                        <div className="mt-0.5"><div className="w-2 h-2 rounded-full bg-blue-500" /></div>
                        <div>
                          <p><span className="font-medium">Brandklep BG-030</span> geplaatst door J. Bakker</p>
                          <p className="text-xs text-muted-foreground mt-0.5">12 min geleden</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-2 border-t text-center">
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground w-full">Bekijk volledige log</Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Bouwlagen Mini-Previews */}
                <Card className="shadow-sm">
                  <CardHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      Bouwlagen
                    </CardTitle>
                    <Badge variant="secondary">3</Badge>
                  </CardHeader>
                  <CardContent className="p-3 flex flex-col gap-3">
                    {/* Layer 1 */}
                    <div className="group rounded-md border border-primary ring-1 ring-primary/20 p-2 flex gap-3 bg-primary/5 cursor-pointer relative overflow-hidden">
                      <div className="w-16 h-12 bg-white rounded border shadow-sm relative overflow-hidden flex-shrink-0">
                        <div className="absolute inset-2 border-2 border-dashed border-gray-200" />
                        <div className="absolute top-3 left-3 w-1.5 h-1.5 bg-red-500 rounded-full" />
                        <div className="absolute top-6 left-8 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                        <div className="absolute top-4 right-4 w-1.5 h-1.5 bg-green-500 rounded-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="font-medium text-sm text-primary">Begane grond</h4>
                          <span className="text-xs text-muted-foreground font-medium">14 spots</span>
                        </div>
                        <div className="flex h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="bg-green-500 h-full" style={{ width: '40%' }} />
                          <div className="bg-blue-500 h-full" style={{ width: '30%' }} />
                          <div className="bg-slate-400 h-full" style={{ width: '30%' }} />
                        </div>
                      </div>
                    </div>
                    
                    {/* Layer 2 */}
                    <div className="group rounded-md border p-2 flex gap-3 hover:border-border hover:bg-muted/50 cursor-pointer transition-colors">
                      <div className="w-16 h-12 bg-white rounded border shadow-sm relative overflow-hidden flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                        <div className="absolute inset-2 border-2 border-dashed border-gray-200" />
                        <div className="absolute top-4 left-6 w-1.5 h-1.5 bg-green-500 rounded-full" />
                        <div className="absolute top-5 right-5 w-1.5 h-1.5 bg-slate-400 rounded-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="font-medium text-sm">1e Verdieping</h4>
                          <span className="text-xs text-muted-foreground font-medium">6 spots</span>
                        </div>
                        <div className="flex h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="bg-green-500 h-full" style={{ width: '70%' }} />
                          <div className="bg-slate-400 h-full" style={{ width: '30%' }} />
                        </div>
                      </div>
                    </div>

                    {/* Layer 3 */}
                    <div className="group rounded-md border p-2 flex gap-3 hover:border-border hover:bg-muted/50 cursor-pointer transition-colors">
                      <div className="w-16 h-12 bg-white rounded border shadow-sm relative overflow-hidden flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                        <div className="absolute inset-2 border-2 border-dashed border-gray-200" />
                        <div className="absolute top-2 right-3 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                        <div className="absolute bottom-3 left-4 w-1.5 h-1.5 bg-green-500 rounded-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="font-medium text-sm">Kelder</h4>
                          <span className="text-xs text-muted-foreground font-medium">8 spots</span>
                        </div>
                        <div className="flex h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="bg-green-500 h-full" style={{ width: '20%' }} />
                          <div className="bg-blue-500 h-full" style={{ width: '60%' }} />
                          <div className="bg-slate-400 h-full" style={{ width: '20%' }} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Secundaire context (Inklapbaar) */}
                <div className="flex flex-col gap-2">
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" className="w-full justify-between h-9 text-sm text-muted-foreground hover:text-foreground">
                        <span className="flex items-center gap-2"><Box className="h-4 w-4" /> 3D Visualisatie</span>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="h-32 bg-muted border rounded-md flex items-center justify-center relative overflow-hidden">
                        {/* Placeholder 3D isometric */}
                        <div className="absolute" style={{ transform: "rotateX(60deg) rotateZ(45deg)" }}>
                           <div className="w-20 h-16 bg-primary/20 border border-primary/50 absolute" style={{ transform: "translateZ(0px)" }} />
                           <div className="w-20 h-16 bg-primary/20 border border-primary/50 absolute" style={{ transform: "translateZ(20px)" }} />
                           <div className="w-20 h-16 bg-primary/20 border border-primary/50 absolute" style={{ transform: "translateZ(40px)" }} />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" className="w-full justify-between h-9 text-sm text-muted-foreground hover:text-foreground">
                        <span className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Google Maps Locatie</span>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="h-32 bg-muted border rounded-md flex items-center justify-center bg-[url('https://maps.googleapis.com/maps/api/staticmap?center=Utrecht&zoom=14&size=400x200&sensor=false')] bg-cover bg-center">
                        <div className="bg-white p-1 rounded-full shadow-md"><MapPin className="h-4 w-4 text-red-500" /></div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
