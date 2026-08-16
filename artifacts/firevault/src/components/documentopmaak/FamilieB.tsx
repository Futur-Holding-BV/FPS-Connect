import React from "react";
import { DocumentFrame, DocumentVoet, resolveAssetUrl } from "./DocumentFrame";
import { BaseDocumentProps } from "./types";

export function VervolgpaginaB({ meta, mij }: BaseDocumentProps) {
  return (
    <DocumentFrame>
      <div className="border-t-4 border-primary px-16 py-10 flex justify-between items-start">
        <img src={resolveAssetUrl(mij.logoUrl)} alt={mij.naam} className="h-10 object-contain" />
        <div className="text-right text-xs text-slate-500 leading-relaxed">
          <div className="font-semibold text-slate-900">{mij.naam}</div>
          <div>{mij.adres}</div>
          <div>{mij.postcodeWoonplaats}</div>
          <div className="mt-2">KVK {mij.kvk}</div>
          {mij.btw && <div>BTW {mij.btw}</div>}
        </div>
      </div>

      <div className="px-16 py-4 flex-1 text-sm text-slate-800 leading-relaxed">
        <h1 className="text-2xl font-bold text-slate-900 mb-8 border-b border-slate-200 pb-4">
          {meta.titel}
        </h1>

        <div className="space-y-6">
          <p>
            <strong>De ondergetekenden:</strong>
          </p>
          <ol className="list-decimal pl-5 space-y-4">
            <li>
              De besloten vennootschap <strong>{mij.naam}</strong>, gevestigd te {mij.postcodeWoonplaats} aan de {mij.adres}, rechtsgeldig vertegenwoordigd door de directie, hierna te noemen: "Werkgever";
            </li>
            <li>
              De heer/mevrouw <strong>J. de Vries</strong>, geboren op 12 maart 1985 te Enschede, wonende aan de Hoofdstraat 1, 7511 AA Enschede, hierna te noemen: "Werknemer";
            </li>
          </ol>

          <p className="mt-8">
            <strong>Zijn het volgende overeengekomen:</strong>
          </p>

          <h3 className="font-bold text-slate-900 mt-6">Artikel 1 – Indiensttreding en Functie</h3>
          <p>
            Werknemer treedt per 1 januari 2026 in dienst bij Werkgever in de functie van <strong>Monteur Brandpreventie</strong>. De werkzaamheden worden verricht conform de geldende CAO en het bedrijfsreglement van {mij.naam}.
          </p>

          <h3 className="font-bold text-slate-900 mt-6">Artikel 2 – Arbeidsduur en Werktijden</h3>
          <p>
            De arbeidsduur bedraagt 40 uur per week. De reguliere werktijden zijn van maandag tot en met vrijdag, van 07:30 uur tot 16:30 uur, inclusief een onbetaalde pauze van 60 minuten.
          </p>

          <h3 className="font-bold text-slate-900 mt-6">Artikel 3 – Geheimhouding</h3>
          <p>
            De werknemer verplicht zich tot absolute geheimhouding van alle bedrijfsinformatie en klantgegevens waarvan hij/zij tijdens de uitoefening van de functie kennisneemt. Deze verplichting blijft ook na beëindiging van het dienstverband van kracht.
          </p>
        </div>

        <div className="mt-20 grid grid-cols-2 gap-16">
          <div>
            <p className="mb-12 font-medium">Namens {mij.naam}:</p>
            <div className="border-b border-slate-400 w-full mb-2"></div>
            <p className="text-xs text-slate-500">Datum: {meta.datum}</p>
          </div>
          <div>
            <p className="mb-12 font-medium">Werknemer:</p>
            <div className="border-b border-slate-400 w-full mb-2"></div>
            <p className="text-xs text-slate-500">Datum: .......................................</p>
          </div>
        </div>
      </div>

      <DocumentVoet meta={meta} mij={mij} />
    </DocumentFrame>
  );
}
