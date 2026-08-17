import React from "react";
import { DocumentFrame, DocumentVoet, resolveAssetUrl } from "./DocumentFrame";
import { BaseDocumentProps, WerkmaatschappijInfo } from "./types";

// ─── FactuurTemplateA ──────────────────────────────────────────────────────────
// A4-factuurlay-out met briefhoofd, adresblok, regelstabel en betalingsinstructie.
// Ontvanger, kleuren en logo-positie zijn instelbaar via props; briefpapier
// (achtergrondafbeelding) wordt optioneel over de koptekst gelegd.

export interface FactuurRij {
  omschrijving: string;
  hoeveelheid?: number | null;
  eenheid?: string | null;
  stukprijs?: string | null;
  bedragExclBtw?: string | null;
  btwPercentage?: number | null;
  btwBedrag?: string | null;
}

export interface FactuurDebiteur {
  naam: string;
  tav?: string | null;
  adres?: string | null;
  postcodeWoonplaats?: string | null;
}

export interface FactuurData {
  nummer: string;
  datum: string;
  vervaldatum?: string | null;
  referentie?: string | null;
  kenmerk?: string | null;
  /** Wat de debiteur bij de betaling moet vermelden; valt terug op het factuurnummer. */
  betalingskenmerk?: string | null;
  type?: "inkoop" | "verkoop" | string | null;
}

export interface FactuurTemplateProps {
  mij: WerkmaatschappijInfo;
  factuur: FactuurData;
  debiteur: FactuurDebiteur;
  regels: FactuurRij[];
  totalen: {
    exclBtw: number;
    btwBedrag: number;
    inclBtw: number;
    btwPercentage: number;
  };
  accentKleur?: string;
  logoPositie?: "links" | "rechts" | "midden";
  briefpapierUrl?: string | null;
  betalingstermijn?: number | null;
  // Meta voor voettekst
  meta?: Partial<BaseDocumentProps["meta"]>;
}

function euro(bedrag: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(bedrag ?? 0);
}

function euroStr(v?: string | null) {
  if (!v) return "—";
  const n = parseFloat(v);
  if (Number.isNaN(n)) return v;
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

export function FactuurTemplateA({
  mij,
  factuur,
  debiteur,
  regels,
  totalen,
  accentKleur = "#F23B0D",
  logoPositie = "rechts",
  briefpapierUrl,
  betalingstermijn = 30,
  meta,
}: FactuurTemplateProps) {
  const voetMeta = {
    titel: "Factuur",
    projectNaam: debiteur.naam,
    projectNummer: factuur.nummer,
    klantNaam: debiteur.naam,
    auteur: mij.naam,
    datum: factuur.datum,
    versie: "1",
    kenmerk: factuur.kenmerk ?? factuur.referentie ?? factuur.nummer,
    paginaNummer: 1,
    ...(meta ?? {}),
  };

  const logoNode = mij.logoUrl ? (
    <img src={resolveAssetUrl(mij.logoUrl)} alt={mij.naam} className="h-10 object-contain" />
  ) : null;

  return (
    <DocumentFrame paginaEinde={false}>
      {/* Koptekst: briefpapier of eigen opmaak */}
      <div
        className="relative px-12 pt-10 pb-8"
        style={{ borderBottom: `3px solid ${accentKleur}` }}
      >
        {briefpapierUrl && (
          <img
            src={resolveAssetUrl(briefpapierUrl)}
            alt="Briefpapier"
            className="absolute inset-0 w-full h-full object-cover object-top"
            style={{ opacity: 0.12 }}
          />
        )}

        <div className={`relative flex items-start gap-8 ${logoPositie === "links" ? "flex-row-reverse" : ""}`}>
          {/* Afzender (links of rechts afhankelijk van logo-positie) */}
          <div className="flex-1 text-[10px] leading-relaxed text-slate-600 min-w-0">
            <p className="font-bold text-slate-900 text-sm mb-0.5">{mij.naam}</p>
            {mij.adres && <p>{mij.adres}</p>}
            {mij.postcodeWoonplaats && <p>{mij.postcodeWoonplaats}</p>}
            {mij.telefoon && <p>{mij.telefoon}</p>}
            {mij.email && <p>{mij.email}</p>}
            {mij.website && <p>{mij.website}</p>}
            {mij.kvk && <p>KVK: {mij.kvk}</p>}
            {mij.btw && <p>BTW: {mij.btw}</p>}
            {mij.iban && <p>IBAN: {mij.iban}</p>}
          </div>

          {/* Logo + FACTUUR-label */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            {logoNode}
            <div
              className="text-2xl font-black tracking-widest uppercase"
              style={{ color: accentKleur }}
            >
              Factuur
            </div>
          </div>
        </div>
      </div>

      {/* Adresblok + Factuurgegevens */}
      <div className="px-12 pt-8 pb-4 grid grid-cols-2 gap-8">
        {/* Geadresseerde */}
        <div>
          <p className="text-[9px] uppercase tracking-widest font-semibold text-slate-400 mb-2">Aan</p>
          {debiteur.tav && <p className="text-xs text-slate-600">T.a.v. {debiteur.tav}</p>}
          <p className="text-sm font-bold text-slate-900">{debiteur.naam}</p>
          {debiteur.adres && <p className="text-xs text-slate-600">{debiteur.adres}</p>}
          {debiteur.postcodeWoonplaats && <p className="text-xs text-slate-600">{debiteur.postcodeWoonplaats}</p>}
        </div>

        {/* Factuurgegevens */}
        <div className="text-xs space-y-1.5">
          <div className="grid grid-cols-2 gap-x-4">
            <span className="text-slate-500">Factuurnummer</span>
            <span className="font-semibold text-slate-900">{factuur.nummer}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <span className="text-slate-500">Factuurdatum</span>
            <span className="font-semibold text-slate-900">{factuur.datum}</span>
          </div>
          {factuur.vervaldatum && (
            <div className="grid grid-cols-2 gap-x-4">
              <span className="text-slate-500">Vervaldatum</span>
              <span className="font-semibold text-slate-900">{factuur.vervaldatum}</span>
            </div>
          )}
          {betalingstermijn !== null && betalingstermijn !== undefined && !factuur.vervaldatum && (
            <div className="grid grid-cols-2 gap-x-4">
              <span className="text-slate-500">Betalingstermijn</span>
              <span className="font-semibold text-slate-900">{betalingstermijn} dagen</span>
            </div>
          )}
          {factuur.referentie && (
            <div className="grid grid-cols-2 gap-x-4">
              <span className="text-slate-500">Uw referentie</span>
              <span className="font-semibold text-slate-900">{factuur.referentie}</span>
            </div>
          )}
          {factuur.kenmerk && (
            <div className="grid grid-cols-2 gap-x-4">
              <span className="text-slate-500">Ons kenmerk</span>
              <span className="font-semibold text-slate-900">{factuur.kenmerk}</span>
            </div>
          )}
        </div>
      </div>

      {/* Regelstabel */}
      <div className="px-12 py-4 flex-1">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr
              className="text-white text-[10px] font-semibold tracking-wide uppercase"
              style={{ backgroundColor: accentKleur }}
            >
              <th className="px-3 py-2.5 text-left w-full">Omschrijving</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Aantal</th>
              <th className="px-3 py-2.5 text-left">Eenheid</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Prijs/e</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">BTW %</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Totaal</th>
            </tr>
          </thead>
          <tbody>
            {regels.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400 italic border-b border-slate-100">
                  Geen factuurregels
                </td>
              </tr>
            ) : regels.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className="px-3 py-2 text-slate-800">{r.omschrijving}</td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {r.hoeveelheid != null
                    ? new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(r.hoeveelheid)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-slate-500">{r.eenheid ?? "—"}</td>
                <td className="px-3 py-2 text-right text-slate-600">{euroStr(r.stukprijs)}</td>
                <td className="px-3 py-2 text-right text-slate-500">
                  {r.btwPercentage != null ? `${r.btwPercentage}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right font-medium text-slate-800">{euroStr(r.bedragExclBtw)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totaalblok */}
        <div className="mt-4 flex justify-end">
          <div className="w-64 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotaal excl. BTW</span>
              <span className="font-medium">{euro(totalen.exclBtw)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">BTW {totalen.btwPercentage}%</span>
              <span className="font-medium">{euro(totalen.btwBedrag)}</span>
            </div>
            <div
              className="flex justify-between pt-1.5 border-t-2 font-bold text-sm"
              style={{ borderColor: accentKleur, color: accentKleur }}
            >
              <span>Totaal incl. BTW</span>
              <span>{euro(totalen.inclBtw)}</span>
            </div>
          </div>
        </div>

        {/* Betalingsinstructie */}
        {mij.iban && (
          <div
            className="mt-6 rounded-sm px-4 py-3 text-xs"
            style={{ backgroundColor: accentKleur + "12", borderLeft: `3px solid ${accentKleur}` }}
          >
            <p className="font-semibold text-slate-800 mb-1">Betalingsinstructie</p>
            <p className="text-slate-600">
              Gelieve het bedrag van{" "}
              <strong>{euro(totalen.inclBtw)}</strong>{" "}
              {betalingstermijn
                ? `binnen ${betalingstermijn} dagen `
                : ""}
              over te maken op{" "}
              <strong>{mij.iban}</strong>{" "}
              ten name van <strong>{mij.naam}</strong>
              {(factuur.betalingskenmerk || factuur.nummer) &&
                `, onder vermelding van ${factuur.betalingskenmerk ?? `factuurnummer ${factuur.nummer}`}`}.
            </p>
          </div>
        )}
      </div>

      <DocumentVoet meta={voetMeta} mij={mij} />
    </DocumentFrame>
  );
}

const STANDAARD_HERO = "project-foto.jpg";

export function VoorbladA({ meta, mij }: BaseDocumentProps) {
  return (
    <DocumentFrame bleed>
      <div className="relative h-[160mm] w-full bg-slate-100">
        <img src={resolveAssetUrl(meta.heroImageUrl ?? STANDAARD_HERO)} alt="Project" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-slate-900/20" />
        
        <div className="absolute top-12 right-12 bg-white p-6 shadow-lg rounded-sm">
          <img src={resolveAssetUrl(mij.logoUrl)} alt={mij.naam} className="h-12 object-contain" />
        </div>
        
        {meta.klantLogoUrl && (
          <div className="absolute bottom-12 left-16 bg-white p-6 shadow-lg rounded-sm">
            <img src={resolveAssetUrl(meta.klantLogoUrl)} alt={meta.klantNaam} className="h-16 object-contain" />
          </div>
        )}
      </div>

      <div className="flex-1 bg-primary text-white p-16 flex flex-col justify-between">
        <div>
          <h2 className="text-primary-foreground/80 font-semibold tracking-widest uppercase text-sm mb-4">
            {meta.titel}
          </h2>
          <h1 className="text-5xl font-bold leading-tight mb-6">
            {meta.projectNaam}
          </h1>
          {meta.ondertitel && (
            <p className="text-xl text-primary-foreground/90 font-light max-w-2xl">
              {meta.ondertitel}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-8 text-sm text-primary-foreground/90">
          <div>
            <strong className="block text-white mb-1">Opdrachtgever</strong>
            {meta.klantNaam}
          </div>
          <div>
            <strong className="block text-white mb-1">Datum</strong>
            {meta.datum}
          </div>
          <div>
            <strong className="block text-white mb-1">Kenmerk</strong>
            {meta.projectNummer} / {meta.kenmerk}
          </div>
          <div>
            <strong className="block text-white mb-1">Opgesteld door</strong>
            {meta.auteur}
          </div>
        </div>
      </div>
    </DocumentFrame>
  );
}

export function InhoudspaginaA({ meta, mij }: BaseDocumentProps) {
  return (
    <DocumentFrame>
      <div className="bg-slate-900 text-white px-16 py-8 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">{meta.projectNaam}</h2>
          <div className="text-slate-400 text-sm mt-1 flex space-x-4">
            <span>{meta.projectNummer}</span>
            <span>•</span>
            <span>{meta.klantNaam}</span>
          </div>
        </div>
        <img src={resolveAssetUrl(mij.logoUrl)} alt={mij.naam} className="h-8 object-contain brightness-0 invert" />
      </div>

      <div className="px-16 py-16 flex-1">
        <h1 className="text-3xl font-bold text-slate-900 mb-12">Inhoudsopgave</h1>
        
        <div className="space-y-6 text-sm">
          {[
            { n: "1", t: "Inleiding en leeswijzer", p: 3 },
            { n: "2", t: "Projectgegevens", p: 4 },
            { n: "3", t: "Uitgangspunten brandveiligheid", p: 6 },
            { n: "4", t: "Overzicht voorzieningen", p: 8 },
            { n: "5", t: "Fotoreportage en logboek", p: 12 },
            { n: "6", t: "Garantieverklaring", p: 24 },
            { n: "7", t: "Bijlagen", p: 26 },
          ].map(row => (
            <div key={row.n} className="flex items-end">
              <div className="w-8 font-bold text-primary">{row.n}</div>
              <div className="flex-1 font-medium">{row.t}</div>
              <div className="flex-1 border-b border-dotted border-slate-300 mx-4 mb-1"></div>
              <div className="w-8 text-right text-slate-500">{row.p}</div>
            </div>
          ))}
        </div>
      </div>

      <DocumentVoet meta={meta} mij={mij} />
    </DocumentFrame>
  );
}

export function HoofdstukpaginaA({ meta, mij }: BaseDocumentProps) {
  return (
    <DocumentFrame bleed>
      <div className="relative h-[80mm] w-full bg-slate-900 text-white">
        <img src={resolveAssetUrl(meta.heroImageUrl ?? STANDAARD_HERO)} alt="Project" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 to-transparent" />
        
        <div className="absolute top-8 right-16">
          <img src={resolveAssetUrl(mij.logoUrl)} alt={mij.naam} className="h-8 object-contain brightness-0 invert" />
        </div>

        <div className="absolute bottom-12 left-16">
          <div className="text-primary font-bold tracking-widest uppercase text-sm mb-2">Hoofdstuk 4</div>
          <h1 className="text-4xl font-bold">Overzicht voorzieningen</h1>
        </div>
      </div>

      <div className="px-16 py-12 flex-1 text-sm leading-relaxed text-slate-700">
        <p className="mb-6">
          In dit hoofdstuk treft u een gedetailleerd overzicht aan van alle gerealiseerde brandwerende voorzieningen op locatie <strong>{meta.projectNaam}</strong>. De gegevens zijn geëxporteerd uit ons digitaal logboek en bevatten locatiegegevens, producttypes, en fotobewijs van de montage.
        </p>

        <div className="border border-slate-200 rounded-sm overflow-hidden mb-8">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-900 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3">Spot</th>
                <th className="p-3">Type voorziening</th>
                <th className="p-3">Locatie</th>
                <th className="p-3">Werendheid</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="p-3 font-medium text-slate-900">B-001</td>
                <td className="p-3">Branddeur</td>
                <td className="p-3">Begane grond, Hal</td>
                <td className="p-3">EI 60</td>
                <td className="p-3 text-green-600 font-medium">Gereed</td>
              </tr>
              <tr>
                <td className="p-3 font-medium text-slate-900">B-002</td>
                <td className="p-3">Doorvoering</td>
                <td className="p-3">Schacht A</td>
                <td className="p-3">EI 60</td>
                <td className="p-3 text-green-600 font-medium">Gereed</td>
              </tr>
              <tr>
                <td className="p-3 font-medium text-slate-900">B-003</td>
                <td className="p-3">Brandklep</td>
                <td className="p-3">Techniekruimte</td>
                <td className="p-3">EI 120</td>
                <td className="p-3 text-amber-500 font-medium">Concept</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          Voor technische specificaties en certificaten van de toegepaste producten, verwijzen wij u naar Bijlage B (Productcertificaten). Alle werkzaamheden zijn uitgevoerd conform het Bouwbesluit en de richtlijnen van de fabrikant.
        </p>
      </div>

      <DocumentVoet meta={meta} mij={mij} />
    </DocumentFrame>
  );
}
