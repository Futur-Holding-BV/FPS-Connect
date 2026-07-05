import { BarChart3, FileBadge, Clock, CheckCircle2 } from "lucide-react";

const FEATURES = [
  { icoon: BarChart3, titel: "Opleverrapporten", omschrijving: "Definitieve rapportages met uitgebreide spotdetails en plattegronden." },
  { icoon: FileBadge, titel: "Inspectiestatus", omschrijving: "Real-time inzicht in keuringen, afkeuringen en benodigd herstel." },
  { icoon: Clock, titel: "Reactietermijnen", omschrijving: "Proactieve signalering van openstaande punten en veiligheidstermijnen." },
  { icoon: CheckCircle2, titel: "Opleverstatus", omschrijving: "Transparante voortgang per gebouw — van concept tot definitief." },
];

export default function OneRapporten() {
  return (
    <div className="max-w-4xl mx-auto py-12">
      <div className="text-center mb-16">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-[28px] bg-[#0EA5E9]/10 mb-8">
          <BarChart3 className="w-10 h-10 text-[#0EA5E9]" />
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900 mb-6">
          Inzicht in perfectie
        </h1>
        <p className="text-xl text-zinc-500 font-light leading-relaxed max-w-2xl mx-auto">
          Een nieuwe standaard voor rapportages. Binnenkort bieden we u kristalhelder inzicht in de veiligheidsstatus van uw vastgoed.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {FEATURES.map((f, i) => (
          <div key={i} className="bg-white rounded-[24px] p-8 border border-zinc-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
            <div className="w-12 h-12 rounded-full bg-zinc-50 flex items-center justify-center mb-6">
              <f.icoon className="w-5 h-5 text-zinc-400" />
            </div>
            <h3 className="text-lg font-medium text-zinc-900 mb-2">{f.titel}</h3>
            <p className="text-zinc-500 leading-relaxed">{f.omschrijving}</p>
          </div>
        ))}
      </div>
      
      <div className="mt-16 text-center">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-100 text-zinc-600 text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-[#0EA5E9] animate-pulse"></span>
          In ontwikkeling — opvolger van de huidige rapportenmodule
        </span>
      </div>
    </div>
  );
}
