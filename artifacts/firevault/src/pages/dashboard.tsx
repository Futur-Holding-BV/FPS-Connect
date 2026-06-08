import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetDashboardStats, useGetRecenteActiviteit, useGetStatusVerdeling, useGetVervaldagen } from "@workspace/api-client-react";
import { Building, MapPin, CheckCircle2, XCircle, AlertTriangle, Calendar } from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activiteit, isLoading: activiteitLoading } = useGetRecenteActiviteit();
  const { data: verdeling, isLoading: verdelingLoading } = useGetStatusVerdeling();
  const { data: vervaldagen, isLoading: vervaldagenLoading } = useGetVervaldagen();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overzicht van uw brandpreventie portfolio.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Gebouwen</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totaal_gebouwen || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Totaal Spots</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totaal_voorzieningen || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Goedgekeurde Spots</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.goedgekeurde_voorzieningen || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Afgekeurde Spots</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.afgekeurde_voorzieningen || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Onderhoud</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.openstaande_onderhoud || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vervallen Inspecties</CardTitle>
            <Calendar className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.vervallen_inspecties || 0}</div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recente Activiteit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activiteit?.map((act) => (
                <div key={act.id} className="flex flex-col gap-1 border-b pb-2 last:border-0">
                  <div className="text-sm font-medium">{act.omschrijving}</div>
                  <div className="text-xs text-muted-foreground">{new Date(act.tijdstip).toLocaleString('nl-NL')} • {act.gebruiker_naam}</div>
                </div>
              ))}
              {!activiteit?.length && <div className="text-sm text-muted-foreground">Geen recente activiteit.</div>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aankomende Vervaldagen</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="space-y-4">
              {vervaldagen?.map((verval) => (
                <div key={verval.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                  <div className="flex flex-col gap-1">
                    <div className="text-sm font-medium">{verval.voorziening_nummer} - {verval.gebouw_naam}</div>
                    <div className="text-xs text-muted-foreground">{verval.type}</div>
                  </div>
                  <div className="text-sm font-bold text-destructive">{new Date(verval.vervaldatum).toLocaleDateString('nl-NL')}</div>
                </div>
              ))}
              {!vervaldagen?.length && <div className="text-sm text-muted-foreground">Geen aankomende vervaldagen.</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
