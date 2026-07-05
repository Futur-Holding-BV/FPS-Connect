import { useLocation, Link } from "wouter";
import { 
  useGetGebouw, 
  useGetGebouwSpotsInzicht, 
  useGetGebouwGevelbeeld 
} from "@workspace/api-client-react";
import { Building2, MapPin, Shield, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, FileText, Wrench } from "lucide-react";

interface Props {
  params: { id: string };
}

function StatCard({ title, value, icon: Icon, colorClass, subtitle }: any) {
  return (
    <div className="bg-white rounded-[24px] border border-zinc-100 p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
      <div className="flex items-start justify-between mb-6">
        <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center ${colorClass}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <div>
        <p className="text-4xl font-semibold tracking-tight text-zinc-900 mb-2">{value}</p>
        <h4 className="text-[15px] font-medium text-zinc-700">{title}</h4>
        {subtitle && <p className="text-[13px] text-zinc-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function OneGebouwDetail({ params }: Props) {
  const id = Number(params.id);
  const [location] = useLocation();

  const { data: gebouw, isLoading, isError } = useGetGebouw(id);
  const { data: spotsInzicht } = useGetGebouwSpotsInzicht(id);
  const { data: gevelbeeld } = useGetGebouwGevelbeeld(id);

  const terugHref = location.startsWith("/one/") ? "/one/gebouwen" : "/gebouwen";

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-6 w-32 bg-zinc-100 rounded-md"></div>
        <div className="h-64 w-full bg-zinc-100 rounded-[32px]"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-48 bg-zinc-100 rounded-[24px]"></div>
          <div className="h-48 bg-zinc-100 rounded-[24px]"></div>
          <div className="h-48 bg-zinc-100 rounded-[24px]"></div>
        </div>
      </div>
    );
  }

  if (isError || !gebouw) {
    return (
      <div className="rounded-[24px] bg-red-50 border border-red-100 p-8 text-center text-red-600">
        <p className="font-medium">Gebouwgegevens konden niet worden geladen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-10">
      <div className="flex items-center">
        <Link href={terugHref}>
          <button className="group inline-flex items-center gap-2 text-[15px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors bg-white px-4 py-2 rounded-full border border-zinc-200 shadow-sm hover:shadow-md">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Terug
          </button>
        </Link>
      </div>

      {/* Hero Section */}
      <div className="relative overflow-hidden bg-white border border-zinc-100 rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        {gevelbeeld?.beeld && (
          <div className="absolute inset-0 z-0">
            <img 
              src={gevelbeeld.beeld} 
              alt={gebouw.naam} 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/60"></div>
          </div>
        )}
        
        <div className="relative z-10 p-8 sm:p-12 md:p-16 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0EA5E9]/10 text-[#0EA5E9] text-xs font-bold tracking-wider uppercase mb-6">
            <Building2 className="w-3.5 h-3.5" /> Gebouwdossier
          </div>
          
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900 mb-4 leading-tight">
            {gebouw.naam}
          </h1>
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 text-lg text-zinc-600 font-light">
            {gebouw.adres && (
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-zinc-400" />
                <span>
                  {gebouw.adres}{gebouw.stad ? `, ${gebouw.stad}` : ""}
                </span>
              </div>
            )}
            {gebouw.projectnummer && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-base text-zinc-400 bg-zinc-100 px-3 py-1 rounded-lg">
                  {gebouw.projectnummer}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div>
        <h2 className="text-2xl font-medium tracking-tight text-zinc-900 mb-6 px-2">Veiligheidsstatus</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Totaal voorzieningen" 
            value={spotsInzicht?.totaal ?? 0}
            icon={Shield}
            colorClass="bg-[#0EA5E9]/10 text-[#0EA5E9]"
            subtitle="Geregistreerde brandspots"
          />
          <StatCard 
            title="Goedgekeurd" 
            value={(spotsInzicht as any)?.goedgekeurd ?? 0}
            icon={CheckCircle2}
            colorClass="bg-emerald-100 text-emerald-600"
            subtitle="Voldoet aan normering"
          />
          <StatCard 
            title="Afgekeurd" 
            value={(spotsInzicht as any)?.afgekeurd ?? 0}
            icon={AlertCircle}
            colorClass="bg-red-100 text-red-600"
            subtitle="Vereist directe actie"
          />
          <StatCard 
            title="In bewerking" 
            value={((spotsInzicht as any)?.in_bewerking ?? 0) + ((spotsInzicht as any)?.in_onderhoud ?? 0)}
            icon={Wrench}
            colorClass="bg-amber-100 text-amber-600"
            subtitle="Herstel of onderhoud"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/one/documenten">
          <div className="group bg-white rounded-[24px] border border-zinc-100 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgb(14,165,233,0.06)] hover:-translate-y-1 hover:border-[#0EA5E9]/20 transition-all duration-400 ease-out cursor-pointer flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-[20px] bg-zinc-50 group-hover:bg-[#0EA5E9]/10 flex items-center justify-center transition-colors">
                <FileText className="w-7 h-7 text-zinc-400 group-hover:text-[#0EA5E9] transition-colors" />
              </div>
              <div>
                <h3 className="text-xl font-medium text-zinc-900 mb-1">Documentatie</h3>
                <p className="text-zinc-500">Rapportages en certificaten inzien</p>
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-zinc-50 flex items-center justify-center group-hover:bg-[#0EA5E9] transition-colors">
              <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
            </div>
          </div>
        </Link>

        <Link href="/one/adviescentrum">
          <div className="group bg-zinc-900 rounded-[24px] border border-zinc-800 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.1)] hover:shadow-[0_20px_40px_rgb(14,165,233,0.15)] hover:-translate-y-1 hover:border-[#0EA5E9]/40 transition-all duration-400 ease-out cursor-pointer flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-[20px] bg-white/10 flex items-center justify-center">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-medium text-white mb-1">Project aanvragen</h3>
                <p className="text-zinc-400">Start een nieuwe brandpreventie workflow</p>
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#0EA5E9] transition-colors">
              <ArrowRight className="w-5 h-5 text-white" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
