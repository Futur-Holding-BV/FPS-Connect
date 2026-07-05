import { Link } from "wouter";
import { useListGebouwen } from "@workspace/api-client-react";
import { Building2, ArrowRight, Shield, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

function SkeletonCard() {
  return (
    <div className="rounded-[24px] bg-white border border-zinc-100 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.02)] h-[320px] animate-pulse">
      <div className="w-16 h-16 bg-zinc-100 rounded-[20px] mb-6"></div>
      <div className="h-7 w-2/3 bg-zinc-100 rounded-full mb-4"></div>
      <div className="h-4 w-1/2 bg-zinc-100 rounded-full mb-8"></div>
      <div className="mt-auto flex gap-4">
        <div className="h-10 w-24 bg-zinc-50 rounded-xl"></div>
        <div className="h-10 w-32 bg-zinc-50 rounded-xl"></div>
      </div>
    </div>
  );
}

export default function OneGebouwen() {
  const { data: gebouwen, isLoading, isError } = useListGebouwen();

  const actief = (gebouwen ?? []).filter((g) => !g.gearchiveerd);

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900">
            Uw gebouwen
          </h1>
          <p className="text-lg text-zinc-500 mt-4 leading-relaxed font-light">
            Beheer uw vastgoedportefeuille. Klik op een gebouw om de status van voorzieningen en documentatie in te zien.
          </p>
        </div>
        
        {/* Zoekbalk placeholder styling */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input 
            placeholder="Zoeken in gebouwen..." 
            className="pl-11 h-12 rounded-xl bg-white border-zinc-200 focus-visible:ring-[#0EA5E9]/20 focus-visible:border-[#0EA5E9] shadow-sm text-[15px]"
          />
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {isError && (
        <div className="rounded-[24px] bg-red-50 border border-red-100 p-8 text-center text-red-600">
          <p className="font-medium">Er is een fout opgetreden bij het ophalen van uw gebouwen.</p>
        </div>
      )}

      {!isLoading && !isError && actief.length === 0 && (
        <div className="rounded-[32px] bg-white border border-zinc-100 p-16 text-center shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
          <div className="w-20 h-20 bg-zinc-50 rounded-[24px] flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-10 h-10 text-zinc-300" />
          </div>
          <h3 className="text-xl font-medium text-zinc-900 mb-2">Geen gebouwen gevonden</h3>
          <p className="text-zinc-500 max-w-md mx-auto">
            Er zijn momenteel geen actieve objecten gekoppeld aan uw FPS One account.
          </p>
        </div>
      )}

      {!isLoading && !isError && actief.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {actief.map((gebouw) => (
            <Link key={gebouw.id} href={`/one/gebouwen/${gebouw.id}`}>
              <div className="group relative rounded-[32px] bg-white border border-zinc-100/80 p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] hover:shadow-[0_24px_48px_rgb(14,165,233,0.08)] hover:-translate-y-1.5 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] cursor-pointer flex flex-col h-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0EA5E9]/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                
                <div className="relative">
                  <div className="w-16 h-16 rounded-[22px] bg-zinc-50 group-hover:bg-[#0EA5E9]/10 flex items-center justify-center mb-8 transition-colors duration-500">
                    <Building2 className="w-7 h-7 text-zinc-400 group-hover:text-[#0EA5E9] transition-colors duration-500" />
                  </div>
                  
                  <h3 className="text-2xl font-semibold text-zinc-900 leading-tight mb-3">
                    {gebouw.naam}
                  </h3>
                  
                  <div className="space-y-2 mb-10">
                    {gebouw.adres && (
                      <p className="text-[15px] text-zinc-500 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="truncate">{gebouw.adres}{gebouw.stad ? `, ${gebouw.stad}` : ""}</span>
                      </p>
                    )}
                    {gebouw.projectnummer && (
                      <p className="text-[14px] text-zinc-400 font-mono tracking-tight">
                        {gebouw.projectnummer}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-zinc-100/80 relative flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#0EA5E9]/10 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-[#0EA5E9]" />
                    </div>
                    <span className="text-sm font-medium text-zinc-700">
                      {(gebouw.totaal_voorzieningen ?? 0)} spots
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-zinc-50 flex items-center justify-center group-hover:bg-[#0EA5E9] transition-colors duration-500">
                    <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors duration-500" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
