import { useLocation } from "wouter";
import { FileText, LayoutDashboard, Wrench, ClipboardList, Calendar } from "lucide-react";
import OnderhoudDashboard from "./dashboard";
import ContractenLijst from "./contracten";
import WerkbonnenLijst from "./werkbonnen-lijst";
import OnderhoudPlanning from "./planning";

type Tab = "dashboard" | "contracten" | "werkbonnen" | "planning";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "contracten", label: "Contracten", icon: FileText },
  { id: "werkbonnen", label: "Werkbonnen", icon: ClipboardList },
  { id: "planning", label: "Planning", icon: Calendar },
];

export default function OnderhoudModule() {
  const [location, navigate] = useLocation();

  const actieveTab: Tab = (() => {
    if (location.startsWith("/onderhoud/contracten")) return "contracten";
    if (location.startsWith("/onderhoud/werkbonnen")) return "werkbonnen";
    if (location.startsWith("/onderhoud/planning")) return "planning";
    return "dashboard";
  })();

  return (
    <div className="space-y-0 max-w-7xl mx-auto">
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Onderhoud</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            Contractbeheer, werkbonnen en onderhoudsplanning
          </p>
        </div>
      </div>

      <div className="flex gap-1 pt-4 pb-2 border-b">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const actief = actieveTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === "dashboard") navigate("/onderhoud");
                else navigate(`/onderhoud/${tab.id}`);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                actief
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="pt-4">
        {actieveTab === "dashboard" && <OnderhoudDashboard />}
        {actieveTab === "contracten" && <ContractenLijst />}
        {actieveTab === "werkbonnen" && <WerkbonnenLijst />}
        {actieveTab === "planning" && <OnderhoudPlanning />}
      </div>
    </div>
  );
}
