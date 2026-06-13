import React from "react";
import { DocumentFrame, DocumentVoet, resolveAssetUrl } from "./DocumentFrame";
import { BaseDocumentProps } from "./types";
import { AlertTriangle, ClipboardList } from "lucide-react";

export function ChecklistpaginaC({ meta, mij }: BaseDocumentProps) {
  return (
    <DocumentFrame>
      <div className="bg-slate-100 px-12 py-6 border-b border-slate-300 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <img src={resolveAssetUrl(mij.logoUrl)} alt={mij.naam} className="h-10 object-contain" />
          <div className="h-10 border-l border-slate-300"></div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              {meta.titel}
            </h1>
            <p className="text-xs text-slate-500 font-medium">Kenmerk: {meta.kenmerk} • Auteur: {meta.auteur}</p>
          </div>
        </div>
        <div className="text-right text-sm font-semibold bg-white px-4 py-2 border border-slate-200 rounded">
          {meta.datum}
        </div>
      </div>

      <div className="px-12 py-8 flex-1 text-sm text-slate-800">
        <div className="bg-amber-50 border border-amber-200 rounded p-4 mb-8 flex gap-4 text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p>
            <strong>Belangrijk:</strong> Voer deze LMRA (Laatste Minuut Risico Analyse) uit direct vóór aanvang van de werkzaamheden. Bij het aanvinken van één of meerdere "Nee" opties mogen de werkzaamheden niet starten totdat de situatie is opgelost.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 border border-slate-200 rounded p-4 bg-slate-50">
          <div>
            <span className="text-xs text-slate-500 block mb-1">Project</span>
            <strong className="text-slate-900">{meta.projectNaam}</strong>
          </div>
          <div>
            <span className="text-xs text-slate-500 block mb-1">Uitvoerende monteur</span>
            <strong className="text-slate-900">{meta.auteur}</strong>
          </div>
        </div>

        <h2 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-200 pb-2">1. Werkplek & Omgeving</h2>
        
        <table className="w-full mb-8">
          <tbody className="divide-y divide-slate-200">
            {[
              "Is de werkplek veilig bereikbaar en opgeruimd?",
              "Is er voldoende verlichting om veilig te kunnen werken?",
              "Zijn de vluchtwegen vrij van obstakels?",
              "Zijn er andere werkzaamheden in de buurt die gevaar opleveren?",
            ].map((q, i) => (
              <tr key={i} className="group hover:bg-slate-50">
                <td className="py-3 pr-4 font-medium">{q}</td>
                <td className="py-3 w-32 text-right">
                  <div className="inline-flex gap-4">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" name={`q1_${i}`} className="w-4 h-4 text-primary" />
                      <span>Ja</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" name={`q1_${i}`} className="w-4 h-4 text-primary" />
                      <span>Nee</span>
                    </label>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-200 pb-2">2. Middelen & Materialen</h2>
        
        <table className="w-full mb-8">
          <tbody className="divide-y divide-slate-200">
            {[
              "Zijn de juiste persoonlijke beschermingsmiddelen (PBM) aanwezig?",
              "Is het gereedschap gekeurd en in goede staat?",
              "Is de juiste steiger/hoogwerker of ladder aanwezig en gekeurd?",
            ].map((q, i) => (
              <tr key={i} className="group hover:bg-slate-50">
                <td className="py-3 pr-4 font-medium">{q}</td>
                <td className="py-3 w-32 text-right">
                  <div className="inline-flex gap-4">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" name={`q2_${i}`} className="w-4 h-4 text-primary" />
                      <span>Ja</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" name={`q2_${i}`} className="w-4 h-4 text-primary" />
                      <span>Nee</span>
                    </label>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border border-slate-300 rounded p-4 mt-8 h-32">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-2">Opmerkingen / Geconstateerde afwijkingen</span>
        </div>
      </div>

      <DocumentVoet meta={meta} mij={mij} />
    </DocumentFrame>
  );
}
