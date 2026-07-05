import { CreditCard, FileCheck2, Headphones, BarChart3, Check } from "lucide-react";

const PAKETTEN = [
  { 
    naam: "Basis", 
    prijs: "149", 
    omschrijving: "Perfect voor kleinschalig beheer.",
    features: ["Objectregistratie", "Digitale logboeken", "Basisrapportages", "Email support"],
    featured: false
  },
  { 
    naam: "Beheer", 
    prijs: "349", 
    omschrijving: "Volledige ontzorging voor beheerders.",
    features: ["Alles in Basis", "Periodieke inspecties", "Onderhoudsplanning", "Prioriteit support"],
    featured: true
  },
  { 
    naam: "Volledig", 
    prijs: "699", 
    omschrijving: "Enterprise niveau brandveiligheid.",
    features: ["Alles in Beheer", "HRM integratie", "Calculatiemodules", "Dedicated account manager"],
    featured: false
  },
];

export default function OneAbonnementen() {
  return (
    <div className="max-w-6xl mx-auto py-12 space-y-20">
      
      <div className="text-center max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900 mb-6">
          Eenvoudig beheer, heldere tarieven
        </h1>
        <p className="text-xl text-zinc-500 font-light leading-relaxed">
          Kies de servicegraad die past bij uw portefeuille. Binnenkort beheert u hier uw facturen en abonnementen volledig digitaal.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
        {PAKETTEN.map((p) => (
          <div 
            key={p.naam} 
            className={`rounded-[32px] p-10 ${
              p.featured 
                ? "bg-zinc-900 text-white shadow-2xl scale-105 transform z-10" 
                : "bg-white border border-zinc-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)]"
            }`}
          >
            <div className="mb-8">
              <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-6 ${
                p.featured ? "bg-[#0EA5E9]/20 text-[#0EA5E9]" : "bg-zinc-100 text-zinc-600"
              }`}>
                {p.naam}
              </span>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-5xl font-bold tracking-tight">€{p.prijs}</span>
                <span className={`text-lg ${p.featured ? "text-zinc-400" : "text-zinc-500"}`}>/mnd</span>
              </div>
              <p className={p.featured ? "text-zinc-400" : "text-zinc-500"}>{p.omschrijving}</p>
            </div>
            
            <ul className="space-y-4 mb-10">
              {p.features.map((feat, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    p.featured ? "bg-[#0EA5E9]/20" : "bg-emerald-50"
                  }`}>
                    <Check className={`w-3.5 h-3.5 ${p.featured ? "text-[#0EA5E9]" : "text-emerald-600"}`} />
                  </div>
                  <span className={p.featured ? "text-zinc-300" : "text-zinc-600"}>{feat}</span>
                </li>
              ))}
            </ul>
            
            <button className={`w-full py-4 rounded-2xl font-medium transition-all ${
              p.featured 
                ? "bg-[#0EA5E9] hover:bg-[#0284c7] text-white" 
                : "bg-zinc-50 hover:bg-zinc-100 text-zinc-900"
            }`}>
              Binnenkort beschikbaar
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}
