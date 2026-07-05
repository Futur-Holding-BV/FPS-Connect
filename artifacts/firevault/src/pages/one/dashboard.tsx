import { Link } from "wouter";
import { useListGebouwen, useGetRecenteActiviteit } from "@workspace/api-client-react";
import { Building2, ArrowRight, Activity, Clock, ShieldCheck, MapPin } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

function SkeletonCard() {
  return (
    <div className="rounded-[24px] bg-white border border-zinc-100 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] h-[280px] animate-pulse">
      <div className="w-12 h-12 bg-zinc-100 rounded-[16px] mb-6"></div>
      <div className="h-6 w-3/4 bg-zinc-100 rounded-full mb-3"></div>
      <div className="h-4 w-1/2 bg-zinc-100 rounded-full mb-8"></div>
      <div className="h-10 w-full bg-zinc-50 rounded-xl mt-auto"></div>
    </div>
  );
}

export default function OneDashboard() {
  const { data: gebouwen, isLoading: isGebouwenLaden } = useListGebouwen();
  const { data: activiteiten, isLoading: isActLaden } = useGetRecenteActiviteit();

  const actiefGebouwen = (gebouwen ?? []).filter((g) => !g.gearchiveerd).slice(0, 4);

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900">
          Goedemorgen.
        </h1>
        <p className="text-lg md:text-xl text-zinc-500 mt-4 leading-relaxed font-light">
          Welkom in FPS One. Uw brandpreventieve portefeuille is veilig, up-to-date en volledig in beheer.
        </p>
      </div>

      {/* Main Focus: Gebouwen */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-medium tracking-tight text-zinc-900">Uw gebouwen</h2>
          <Link href="/one/gebouwen" className="text-[#0EA5E9] hover:text-[#0284c7] font-medium text-sm flex items-center gap-1.5 transition-colors group">
            Bekijk portefeuille
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {isGebouwenLaden ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {actiefGebouwen.length === 0 ? (
              <div className="col-span-full rounded-[24px] bg-white border border-zinc-100 p-12 text-center shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
                <Building2 className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-zinc-900">Geen gebouwen gevonden</h3>
                <p className="text-zinc-500 mt-2">Er zijn nog geen objecten gekoppeld aan uw omgeving.</p>
              </div>
            ) : (
              actiefGebouwen.map((gebouw) => (
                <Link key={gebouw.id} href={`/one/gebouwen/${gebouw.id}`}>
                  <div className="group relative rounded-[24px] bg-white border border-zinc-100 p-6 md:p-8 shadow-[0_4px_20px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgb(14,165,233,0.06)] hover:-translate-y-1 hover:border-[#0EA5E9]/20 transition-all duration-400 ease-out cursor-pointer flex flex-col h-full overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#0EA5E9]/5 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                    
                    <div className="w-14 h-14 rounded-[18px] bg-zinc-50 group-hover:bg-[#0EA5E9]/10 flex items-center justify-center mb-6 transition-colors duration-300">
                      <Building2 className="w-6 h-6 text-zinc-400 group-hover:text-[#0EA5E9] transition-colors" />
                    </div>
                    
                    <h3 className="text-[19px] font-semibold text-zinc-900 leading-tight mb-2 line-clamp-2">
                      {gebouw.naam}
                    </h3>
                    
                    {gebouw.adres && (
                      <p className="text-sm text-zinc-500 flex items-center gap-1.5 mb-6">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="truncate">{gebouw.adres}{gebouw.stad ? `, ${gebouw.stad}` : ""}</span>
                      </p>
                    )}

                    <div className="mt-auto pt-6 border-t border-zinc-100">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-500 font-medium">Status</span>
                        <span className="flex items-center gap-1.5 text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full">
                          <ShieldCheck className="w-3.5 h-3.5" /> Actief
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </section>

      {/* Recente Activiteit */}
      <section className="pt-4">
        <h2 className="text-2xl font-medium tracking-tight text-zinc-900 mb-8">Activiteit</h2>
        
        <div className="bg-white rounded-[24px] border border-zinc-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] overflow-hidden">
          {isActLaden ? (
            <div className="p-8 space-y-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 shrink-0"></div>
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 w-1/3 bg-zinc-100 rounded-full"></div>
                    <div className="h-3 w-1/4 bg-zinc-50 rounded-full"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : !activiteiten || activiteiten.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500 font-medium">Geen recente activiteit</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100/80">
              {activiteiten.slice(0, 5).map((act, idx) => (
                <div key={idx} className="p-6 sm:px-8 flex items-start gap-5 hover:bg-zinc-50/50 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-[#0EA5E9]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="w-4 h-4 text-[#0EA5E9]" />
                  </div>
                  <div>
                    <p className="text-zinc-900 font-medium text-[15px]">{act.omschrijving}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[13px] text-zinc-500">
                      {act.gebouw_naam && <span className="font-medium text-zinc-700">{act.gebouw_naam}</span>}
                      {act.gebouw_naam && <span className="w-1 h-1 rounded-full bg-zinc-300"></span>}
                      <span>{format(new Date(act.tijdstip), "d MMMM yyyy, HH:mm", { locale: nl })}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
