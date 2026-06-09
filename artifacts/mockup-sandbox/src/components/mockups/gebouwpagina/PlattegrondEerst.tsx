import React, { useState } from "react";
import { 
  Building2, 
  Map, 
  Layers, 
  FileText, 
  Settings, 
  Users, 
  Bell, 
  Search, 
  Menu,
  ChevronDown,
  Hash,
  MapPin,
  Clock,
  Eye,
  Activity
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import "./_group.css";

// --- Constanten & Kleuren ---
const OBJECT_TYPEN = {
  branddeur: { kleur: "#ef4444", label: "Branddeur" },
  doorvoering: { kleur: "#f97316", label: "Doorvoering" },
  brandklep: { kleur: "#eab308", label: "Brandklep" },
  kitvoeg: { kleur: "#84cc16", label: "Kitvoeg" },
  manchet: { kleur: "#10b981", label: "Manchet" },
  brandwerend_glas: { kleur: "#3b82f6", label: "Brandw. Glas" },
  coating: { kleur: "#8b5cf6", label: "Coating" },
  luik: { kleur: "#ec4899", label: "Luik" },
};

const STATUS_KLEUREN = {
  concept: { kleur: "#94a3b8", label: "Concept" },
  in_uitvoering: { kleur: "#3b82f6", label: "In uitvoering" },
  opgeleverd: { kleur: "#14b8a6", label: "Opgeleverd" },
  goedgekeurd: { kleur: "#22c55e", label: "Goedgekeurd" },
  afgekeurd: { kleur: "#ef4444", label: "Afgekeurd" },
  in_onderhoud: { kleur: "#f97316", label: "In onderhoud" },
};

// --- Mock Data ---
const BOUWLAGEN = [
  { id: "kelder", naam: "Kelder", count: 8 },
  { id: "begane-grond", naam: "Begane grond", count: 14 },
  { id: "verdieping-1", naam: "1e Verdieping", count: 6 },
];

const MOCK_SPOTS = [
  { id: 1, x: 120, y: 150, num: "01", type: "branddeur", status: "goedgekeurd" },
  { id: 2, x: 250, y: 150, num: "02", type: "doorvoering", status: "opgeleverd" },
  { id: 3, x: 380, y: 150, num: "03", type: "doorvoering", status: "in_uitvoering" },
  { id: 4, x: 500, y: 150, num: "04", type: "brandklep", status: "concept" },
  { id: 5, x: 120, y: 300, num: "05", type: "kitvoeg", status: "goedgekeurd" },
  { id: 6, x: 250, y: 300, num: "06", type: "manchet", status: "goedgekeurd" },
  { id: 7, x: 400, y: 300, num: "07", type: "brandwerend_glas", status: "afgekeurd" },
  { id: 8, x: 650, y: 220, num: "08", type: "coating", status: "in_onderhoud" },
  { id: 9, x: 150, y: 400, num: "09", type: "luik", status: "goedgekeurd" },
  { id: 10, x: 350, y: 420, num: "10", type: "branddeur", status: "in_uitvoering" },
  { id: 11, x: 550, y: 380, num: "11", type: "doorvoering", status: "in_uitvoering" }, // Live!
];

// --- Subcomponenten ---

function Sidebar() {
  return (
    <div className="w-16 md:w-64 bg-sidebar text-sidebar-foreground flex flex-col h-screen flex-shrink-0 border-r border-sidebar-border sticky top-0">
      <div className="h-14 flex items-center justify-center md:justify-start md:px-4 border-b border-sidebar-border">
        <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold shrink-0">
          FPS
        </div>
        <span className="ml-3 font-semibold hidden md:block truncate">Brandpreventie</span>
      </div>
      <div className="flex-1 py-4 flex flex-col gap-1">
        <NavItem icon={<Activity />} label="Dashboard" />
        <NavItem icon={<Building2 />} label="Gebouwen" active />
        <NavItem icon={<Users />} label="Klanten" />
        <NavItem icon={<FileText />} label="Rapportages" />
      </div>
      <div className="p-4 border-t border-sidebar-border">
        <NavItem icon={<Settings />} label="Instellingen" />
      </div>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <button className={`w-full flex items-center h-10 px-0 md:px-4 justify-center md:justify-start gap-3 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground border-r-4 border-primary" : "text-muted-foreground"}`}>
      <span className="w-5 h-5">{icon}</span>
      <span className="hidden md:block text-sm font-medium">{label}</span>
    </button>
  );
}

function Topbar() {
  return (
    <header className="h-14 bg-background border-b border-border flex items-center justify-between px-4 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="relative hidden sm:flex items-center">
          <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Zoeken in FPS..." 
            className="h-9 w-64 rounded-md border border-input bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="text-muted-foreground relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full"></span>
        </Button>
        <div className="flex items-center gap-2 cursor-pointer hover:bg-muted p-1 pr-2 rounded-full transition-colors">
          <Avatar className="h-8 w-8">
            <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026024d" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium hidden sm:block">Jan de Beheerder</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
        </div>
      </div>
    </header>
  );
}

function GebouwHeader() {
  return (
    <div className="bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground">Distributiecentrum Hoofdweg 12</h1>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Actief</Badge>
            </div>
            <div className="flex items-center text-muted-foreground text-sm gap-4 mb-4">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> Hoofdweg 12, 3542 AB Utrecht
              </div>
              <div className="flex items-center gap-1.5">
                <Hash className="h-4 w-4" /> WN-2024-0087
              </div>
            </div>
            
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div><span className="text-muted-foreground">Projectleider:</span> <span className="font-medium">M. de Vries</span></div>
              <div><span className="text-muted-foreground">Opdrachtgever:</span> <span className="font-medium">Bouwbedrijf Janssen BV</span></div>
              <div><span className="text-muted-foreground">Opleverdatum:</span> <span className="font-medium">15 Nov 2024</span></div>
            </div>
          </div>
          
          <div className="flex gap-2 self-start">
            <Button variant="outline">Project bewerken</Button>
            <Button>Nieuwe spot</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SVGPlattegrond() {
  return (
    <div className="w-full bg-slate-50 border border-border rounded-lg overflow-hidden relative" style={{ height: '600px' }}>
      {/* Live meekijken indicator */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm border border-blue-200 rounded-md shadow-sm p-3 z-10 flex items-start gap-3">
        <div className="relative mt-1">
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
            <Eye className="w-4 h-4" /> Live meekijken
          </p>
          <p className="text-xs text-slate-600 mt-0.5">Monteur <span className="font-medium">J. de Jong</span> is momenteel spots aan het plaatsen.</p>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><Clock className="w-3 h-3"/> Laatste update: 14:02 (Spot 11)</p>
        </div>
      </div>

      <svg width="100%" height="100%" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet">
        {/* Grid Background */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Plattegrond Omtrek (Gestreept) */}
        <rect x="50" y="50" width="700" height="400" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" strokeDasharray="10 5" rx="4" />
        
        {/* Binnenmuren */}
        <line x1="200" y1="50" x2="200" y2="250" stroke="#94a3b8" strokeWidth="2" />
        <line x1="50" y1="250" x2="200" y2="250" stroke="#94a3b8" strokeWidth="2" />
        <line x1="500" y1="200" x2="750" y2="200" stroke="#94a3b8" strokeWidth="2" />
        <line x1="350" y1="250" x2="350" y2="450" stroke="#94a3b8" strokeWidth="2" />

        {/* Brandscheiding Lijn met Label */}
        <g>
          <line x1="400" y1="50" x2="400" y2="450" stroke="#dc2626" strokeWidth="3" strokeDasharray="8 4" />
          <circle cx="400" cy="250" r="16" fill="#dc2626" />
          <text x="400" y="250" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="10" fontWeight="bold">EW60</text>
        </g>

        {/* Spots */}
        {MOCK_SPOTS.map(spot => {
          const typeColor = OBJECT_TYPEN[spot.type as keyof typeof OBJECT_TYPEN]?.kleur || "#000";
          const statusColor = STATUS_KLEUREN[spot.status as keyof typeof STATUS_KLEUREN]?.kleur || "#000";
          const isLive = spot.id === 11;

          return (
            <g key={spot.id} transform={`translate(${spot.x}, ${spot.y})`}>
              {isLive && (
                <circle cx="0" cy="0" r="24" fill="none" stroke="#3b82f6" strokeWidth="2" className="animate-pulse" />
              )}
              {/* Buitenste ring = Status */}
              <circle cx="0" cy="0" r="14" fill={statusColor} />
              {/* Binnenste cirkel = Type */}
              <circle cx="0" cy="0" r="10" fill={typeColor} stroke="#ffffff" strokeWidth="1.5" />
              {/* Nummer */}
              <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="9" fontWeight="bold">
                {spot.num}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Compacte Legenda */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm border border-border rounded-md shadow-sm p-3 flex gap-6 text-xs">
        <div>
          <h4 className="font-semibold text-slate-700 mb-2">Objecttypen</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {Object.entries(OBJECT_TYPEN).slice(0, 6).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: val.kleur }}></div>
                <span className="text-slate-600">{val.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="w-px bg-slate-200"></div>
        <div>
          <h4 className="font-semibold text-slate-700 mb-2">Status</h4>
          <div className="flex flex-col gap-1.5">
            {Object.entries(STATUS_KLEUREN).slice(0, 4).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full border-2 border-white ring-1 ring-slate-200" style={{ backgroundColor: val.kleur }}></div>
                <span className="text-slate-600">{val.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SegmentedControl({ active, onChange }: { active: string, onChange: (id: string) => void }) {
  return (
    <div className="inline-flex bg-muted p-1 rounded-md mb-4">
      {BOUWLAGEN.map(laag => (
        <button
          key={laag.id}
          onClick={() => onChange(laag.id)}
          className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-all ${
            active === laag.id 
              ? "bg-background text-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {laag.naam} <span className="ml-1.5 opacity-60 text-xs">({laag.count})</span>
        </button>
      ))}
    </div>
  );
}

function InfoTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4" /> 3D Visualisatie
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-slate-100 rounded-md border border-slate-200 flex items-center justify-center relative overflow-hidden" style={{ perspective: "800px" }}>
            <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: "preserve-3d", transform: "rotateX(60deg) rotateZ(45deg)" }}>
              {/* Mock 3D layers */}
              <div className="w-32 h-48 bg-primary/20 border border-primary/40 absolute" style={{ transform: "translateZ(0px)" }}></div>
              <div className="w-32 h-48 bg-primary/20 border border-primary/40 absolute" style={{ transform: "translateZ(30px)" }}></div>
              <div className="w-32 h-48 bg-primary/20 border border-primary/40 absolute" style={{ transform: "translateZ(60px)" }}></div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">3 bouwlagen • 12m hoog • 60x80m</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Map className="w-4 h-4" /> Locatiekaart
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-slate-200 rounded-md border border-slate-300 overflow-hidden relative flex items-center justify-center">
            {/* Fake map */}
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>
            <MapPin className="w-8 h-8 text-primary absolute" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Main Page ---
export function PlattegrondEerst() {
  const [activeTab, setActiveTab] = useState("plattegrond");
  const [activeLaag, setActiveLaag] = useState("begane-grond");

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        
        <main className="flex-1 pb-12">
          <GebouwHeader />
          
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            {/* Prominente Tab Navigatie */}
            <div className="border-b border-border mt-2">
              <nav className="flex gap-6">
                {[
                  { id: "plattegrond", label: "Plattegrond" },
                  { id: "voorzieningen", label: "Voorzieningen" },
                  { id: "tekeningen", label: "Tekeningen" },
                  { id: "onderhoud", label: "Onderhoud" },
                  { id: "info", label: "Info & Locatie" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                      activeTab === tab.id
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="mt-6">
              {activeTab === "plattegrond" && (
                <div className="animate-in fade-in duration-300">
                  <SegmentedControl active={activeLaag} onChange={setActiveLaag} />
                  <SVGPlattegrond />
                </div>
              )}

              {activeTab === "info" && (
                <div className="animate-in fade-in duration-300">
                  <h2 className="text-lg font-semibold mb-4">Gebouwinformatie</h2>
                  <InfoTab />
                </div>
              )}

              {/* Placeholder voor andere tabs */}
              {["voorzieningen", "tekeningen", "onderhoud"].includes(activeTab) && (
                <div className="py-12 text-center border-2 border-dashed border-border rounded-lg text-muted-foreground animate-in fade-in duration-300">
                  <p className="font-medium">Inhoud voor {activeTab}</p>
                  <p className="text-sm mt-1">Selecteer "Plattegrond" of "Info" voor de uitgewerkte mockups.</p>
                </div>
              )}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
