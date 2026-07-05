import { useState, useRef } from "react";
import { Link } from "wouter";
import { Sparkles, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OneAdviescentrum() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-8">
          <ShieldCheck className="w-12 h-12 text-emerald-500" />
        </div>
        <h1 className="text-4xl font-semibold text-zinc-900 mb-4">Aanvraag ontvangen</h1>
        <p className="text-xl text-zinc-500 font-light mb-12">
          Onze brandpreventie experts en AI analyseren uw verzoek. U ontvangt spoedig een reactie.
        </p>
        <Link href="/one/dashboard">
          <button className="bg-zinc-900 hover:bg-zinc-800 text-white px-8 py-4 rounded-full font-medium transition-colors">
            Terug naar dashboard
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-12">
      <div className="mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0EA5E9]/10 text-[#0EA5E9] text-xs font-bold tracking-wider uppercase mb-6">
          <Sparkles className="w-3.5 h-3.5" /> Project aanvraag
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900 mb-6">
          Adviescentrum
        </h1>
        <p className="text-xl text-zinc-500 font-light leading-relaxed">
          Start een nieuwe brandpreventie workflow. Beschrijf uw behoefte en laat onze systemen de voorbereiding automatiseren.
        </p>
      </div>

      <div className="bg-white rounded-[32px] p-8 md:p-12 border border-zinc-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} className="space-y-8">
          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-900">Project omschrijving</label>
            <input 
              required
              type="text" 
              placeholder="Bijv. Vervangen brandwerende deuren vleugel B"
              className="w-full h-14 px-4 bg-zinc-50 border-0 rounded-2xl focus:ring-2 focus:ring-[#0EA5E9]/20 focus:bg-white transition-all text-[15px]"
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-900">Toelichting & Context</label>
            <textarea 
              required
              rows={6}
              placeholder="Beschrijf de huidige situatie, specifieke eisen of locatiedetails..."
              className="w-full p-4 bg-zinc-50 border-0 rounded-2xl focus:ring-2 focus:ring-[#0EA5E9]/20 focus:bg-white transition-all resize-none text-[15px]"
            ></textarea>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-zinc-100">
            <p className="text-sm text-zinc-500 hidden md:block">
              AI analyseert uw aanvraag voor de snelste opvolging.
            </p>
            <button 
              type="submit"
              className="group bg-[#0EA5E9] hover:bg-[#0284c7] text-white px-8 py-4 rounded-full font-medium transition-all flex items-center gap-2 shadow-[0_8px_20px_rgba(14,165,233,0.25)] hover:shadow-[0_12px_24px_rgba(14,165,233,0.35)] hover:-translate-y-0.5"
            >
              Aanvraag indienen
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
