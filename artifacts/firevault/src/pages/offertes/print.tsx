import { useEffect } from "react";
import { useParams } from "wouter";
import {
  useGetOfferte,
  useListOfferteSecties,
  useListOfferteRegels,
  useListOfferteBijlagen,
  useListWerkgevers,
  useListStudioWerkgevers,
  useGetActiefDocumentStudioModel,
  getGetOfferteQueryKey,
  getListOfferteSectiesQueryKey,
  getListOfferteRegelsQueryKey,
  getListOfferteBijlagenQueryKey,
  getGetActiefDocumentStudioModelQueryKey,
} from "@workspace/api-client-react";
import { DocumentFrame, DocumentVoet } from "@/components/documentopmaak/DocumentFrame";
import { VoorbladA } from "@/components/documentopmaak/FamilieA";
import { CheckCircle2 } from "lucide-react";

function euro(bedrag: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(bedrag ?? 0);
}

function datumNl(iso?: string | null) {
  if (!iso) return new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export default function OffertePrintPagina() {
  const { id } = useParams<{ id: string }>();
  const offerteId = parseInt(id ?? "0", 10);

  const { data: offerte, isLoading: offerteLoading } = useGetOfferte(offerteId, {
    query: { queryKey: getGetOfferteQueryKey(offerteId), enabled: !!offerteId },
  });
  const { data: secties, isLoading: sectiesLoading } = useListOfferteSecties(offerteId, {
    query: { queryKey: getListOfferteSectiesQueryKey(offerteId), enabled: !!offerteId },
  });
  const { data: regels, isLoading: regelsLoading } = useListOfferteRegels(offerteId, {
    query: { queryKey: getListOfferteRegelsQueryKey(offerteId), enabled: !!offerteId },
  });
  const { data: bijlagen } = useListOfferteBijlagen(offerteId, {
    query: { queryKey: getListOfferteBijlagenQueryKey(offerteId), enabled: !!offerteId },
  });
  const { data: werkgevers } = useListWerkgevers();
  const { data: studioWerkgevers } = useListStudioWerkgevers();
  const studioWerkgeverId = (studioWerkgevers ?? [])[0]?.id ?? 0;
  const { data: actiefModel } = useGetActiefDocumentStudioModel(
    { werkgever_id: studioWerkgeverId, document_type: "offerte" },
    { query: {
      queryKey: getGetActiefDocumentStudioModelQueryKey({ werkgever_id: studioWerkgeverId, document_type: "offerte" }),
      enabled: !!studioWerkgeverId,
      retry: false,
    } },
  );

  const klaar = !offerteLoading && !sectiesLoading && !regelsLoading;

  useEffect(() => {
    if (klaar && offerte) {
      const timer = setTimeout(() => window.print(), 800);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [klaar, offerte?.id]);

  if (!klaar || !offerte) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Offerte laden…</p>
        </div>
      </div>
    );
  }

  const actieveSecties = [...(secties ?? [])].sort((a, b) => a.volgorde - b.volgorde).filter((s) => s.actief);
  const alleMaatregelen = (regels ?? []).filter((r) => r.categorie !== "algemene_kosten");
  const alleAlgemeenKosten = (regels ?? []).filter((r) => r.categorie === "algemene_kosten");
  const totaal = (regels ?? []).reduce((s, r) => s + (r.kosten ?? 0), 0);
  const btw = totaal * ((offerte.btw_percentage ?? 21) / 100);
  const inclBtw = totaal + btw;

  const presentatieNiveau: number = (offerte as any).presentatie_niveau ?? 3;

  const wBase = {
    toon_aantal: true, toon_eenheid: true, toon_prijs_per_eenheid: true, toon_ruimte: true,
    toon_subtotalen: true, toon_subtotaal_excl: true, toon_btw: true, toon_totaal_incl: true,
    groepering: "categorie" as "categorie" | "geen",
    optionele_posten: "altijd" as "altijd" | "samengevat" | "verbergen",
    alleen_totaal: false, titel: "Begroting",
    ...((offerte as any).begroting_weergave ?? {}),
  };

  const niveauOverrides = (() => {
    if (presentatieNiveau === 1) return { alleen_totaal: true, toon_subtotalen: true, toon_subtotaal_excl: true, toon_btw: true, toon_totaal_incl: true };
    if (presentatieNiveau === 2) return { toon_aantal: false, toon_eenheid: false, toon_prijs_per_eenheid: false };
    return {};
  })();

  const w = { ...wBase, ...niveauOverrides };

  function filterRegelNiveau(r: any) {
    const ovr = (r as any).weergave_override as string | null | undefined;
    if (ovr === "altijd") return true;
    if (ovr === "nooit") return false;
    return presentatieNiveau >= 1;
  }

  const maatregelen = (w.optionele_posten === "verbergen"
    ? alleMaatregelen.filter((r) => !r.is_optioneel) : alleMaatregelen).filter(filterRegelNiveau);
  const algemeenKosten = (w.optionele_posten === "verbergen"
    ? alleAlgemeenKosten.filter((r) => !r.is_optioneel) : alleAlgemeenKosten).filter(filterRegelNiveau);

  const VERVOLG_LABELS: Record<string, string> = {
    periodiek_onderhoud: "Periodiek onderhoud",
    jaarlijkse_inspectie: "Jaarlijkse inspectie",
    garantie: "Garantie",
    contactpersoon: "Vaste contactpersoon",
    bedankmail: "Opvolgingscontact na uitvoering",
  };
  const vervolgOpties: string[] = (offerte as any).vervolg_opties ?? [];
  const vervolgTekst: string = (offerte as any).vervolg_tekst ?? "";
  const heeftVervolg = vervolgOpties.length > 0 || !!vervolgTekst;

  const werkgever = (werkgevers ?? [])[0];
  const datum = datumNl((offerte as any).datum ?? offerte.aangemaakt_op);

  const templateJson = (() => {
    if (!actiefModel?.connect_template_json) return null;
    try { return JSON.parse(actiefModel.connect_template_json) as { kleurschema?: { primair?: string }; voettekst?: string | null }; }
    catch { return null; }
  })();
  const accentKleur = templateJson?.kleurschema?.primair ?? null;

  const mij = {
    naam: werkgever?.naam ?? "FPS Brandpreventie",
    logoUrl: (studioWerkgevers ?? [])[0]?.logo_url ?? "/fps-logo.png",
    primaireKleur: accentKleur ?? undefined,
    adres: [werkgever?.adres].filter(Boolean).join("") || "",
    postcodeWoonplaats: [werkgever?.postcode, werkgever?.plaats].filter(Boolean).join("  ") || "",
    website: werkgever?.website ?? "",
    email: werkgever?.email ?? "",
    telefoon: werkgever?.telefoon ?? "",
    kvk: werkgever?.kvk ?? "",
  };

  const meta = {
    titel: "Offerte",
    projectNaam: offerte.titel,
    projectNummer: offerte.offertenummer ?? `OFF-${offerte.id}`,
    kenmerk: (offerte as any).ons_kenmerk ?? "",
    klantNaam: offerte.opdrachtgever ?? "",
    datum,
    auteur: (offerte as any).behandeld_door_naam ?? mij.naam,
    versie: "1",
    paginaNummer: 1,
  };

  const betalingstermijn = (offerte as any).betalingstermijn_dagen ?? 30;
  const betaalwijze = (offerte as any).betaalwijze;
  const voorwaardenTekst = (offerte as any).voorwaarden_snapshot ?? (offerte as any).voorwaarden ?? "";
  const factuurSchema = (offerte as any).factuur_schema;

  return (
    <div
      className="min-h-screen bg-slate-100 py-8 print:bg-white print:p-0"
      style={accentKleur ? { "--color-primary": accentKleur } as React.CSSProperties : undefined}
    >
      {actiefModel && (
        <div className="max-w-[210mm] mx-auto mb-2 px-1 print:hidden">
          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded px-2 py-0.5 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Opmaak: Model 0 — {actiefModel.werkgever_naam ?? mij.naam}
          </span>
        </div>
      )}
      <VoorbladA meta={meta} mij={mij} />

      {actieveSecties.map((s, idx) => (
        <DocumentFrame key={s.id} paginaEinde={idx < actieveSecties.length - 1 || (regels ?? []).length > 0}>
          <div className="bg-slate-900 text-white px-16 py-6 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold">{offerte.titel}</h2>
              <div className="text-slate-400 text-xs mt-0.5">{meta.projectNummer} — {offerte.opdrachtgever}</div>
            </div>
            <img
              src={mij.logoUrl}
              alt={mij.naam}
              className="h-7 object-contain brightness-0 invert"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="px-16 py-12 flex-1">
            <h1 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b border-slate-200">
              {s.titel}
            </h1>
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {s.inhoud ?? ""}
            </div>
          </div>
          <DocumentVoet meta={{ ...meta, paginaNummer: idx + 2 }} mij={mij} />
        </DocumentFrame>
      ))}

      {(regels ?? []).length > 0 && (
        <DocumentFrame paginaEinde={!!voorwaardenTekst || (bijlagen ?? []).length > 0}>
          <div className="bg-slate-900 text-white px-16 py-6 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold">{offerte.titel}</h2>
              <div className="text-slate-400 text-xs mt-0.5">{meta.projectNummer} — {offerte.opdrachtgever}</div>
            </div>
            <img
              src={mij.logoUrl}
              alt={mij.naam}
              className="h-7 object-contain brightness-0 invert"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="px-16 py-12 flex-1">
            <h1 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b border-slate-200">
              {w.titel || "Begroting"}
            </h1>

            {w.alleen_totaal ? (
              <div className="flex justify-between items-center text-lg font-bold border-t-2 border-slate-300 pt-4">
                <span>{w.titel || "Begroting"}</span>
                <span className="text-primary">{euro(inclBtw)}</span>
              </div>
            ) : (
              <>
                {(() => {
                  const alleRegels = w.groepering === "geen"
                    ? (w.optionele_posten === "verbergen"
                        ? (regels ?? []).filter((r) => !r.is_optioneel)
                        : (regels ?? []))
                    : null;

                  function RegelRijPrint({ r }: { r: any }) {
                    return (
                      <tr className="border-b border-slate-100">
                        <td className="py-2 px-3">
                          <div>{r.maatregel}</div>
                          {w.toon_ruimte && r.ruimte && <div className="text-xs text-slate-400">{r.ruimte}</div>}
                          {r.is_optioneel && <div className="text-xs text-amber-600">Optioneel</div>}
                        </td>
                        {w.toon_aantal && <td className="py-2 px-3 text-right">{r.aantal}</td>}
                        {w.toon_eenheid && <td className="py-2 px-3 text-right text-slate-500">{r.eenheid}</td>}
                        {w.toon_prijs_per_eenheid && <td className="py-2 px-3 text-right">{euro(r.prijs_per_eenheid)}</td>}
                        <td className="py-2 px-3 text-right font-medium">{euro(r.kosten)}</td>
                      </tr>
                    );
                  }

                  const subtotaalMaatregelen = alleMaatregelen.reduce((s, r) => s + (r.kosten ?? 0), 0);
                  const subtotaalAlgemeen = alleAlgemeenKosten.reduce((s, r) => s + (r.kosten ?? 0), 0);

                  return (
                    <div className="mb-6">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="text-left py-2 px-3 font-semibold">Maatregel</th>
                            {w.toon_aantal && <th className="text-right py-2 px-3 font-semibold w-24">Aantal</th>}
                            {w.toon_eenheid && <th className="text-right py-2 px-3 font-semibold w-24">Eenheid</th>}
                            {w.toon_prijs_per_eenheid && <th className="text-right py-2 px-3 font-semibold w-28">Prijs/eh.</th>}
                            <th className="text-right py-2 px-3 font-semibold w-28">Totaal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {alleRegels ? (
                            alleRegels.map((r) => <RegelRijPrint key={r.id} r={r} />)
                          ) : (
                            <>
                              {maatregelen.length > 0 && (
                                <>
                                  <tr className="bg-slate-50">
                                    <td colSpan={1 + (w.toon_aantal ? 1 : 0) + (w.toon_eenheid ? 1 : 0) + (w.toon_prijs_per_eenheid ? 1 : 0) + 1}
                                      className="py-1.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                      Maatregelen
                                    </td>
                                  </tr>
                                  {w.optionele_posten === "samengevat" ? (
                                    <>
                                      {maatregelen.filter((r) => !r.is_optioneel).map((r) => <RegelRijPrint key={r.id} r={r} />)}
                                      {alleMaatregelen.some((r) => r.is_optioneel) && (
                                        <tr className="border-b border-slate-100">
                                          <td colSpan={1 + (w.toon_aantal ? 1 : 0) + (w.toon_eenheid ? 1 : 0) + (w.toon_prijs_per_eenheid ? 1 : 0) + 1}
                                            className="py-2 px-3 text-xs text-amber-700 italic">
                                            + {alleMaatregelen.filter((r) => r.is_optioneel).length} optionele post(en) — op verzoek beschikbaar
                                          </td>
                                        </tr>
                                      )}
                                    </>
                                  ) : (
                                    maatregelen.map((r) => <RegelRijPrint key={r.id} r={r} />)
                                  )}
                                  {w.toon_subtotalen && (
                                    <tr className="bg-slate-50/50">
                                      <td colSpan={1 + (w.toon_aantal ? 1 : 0) + (w.toon_eenheid ? 1 : 0) + (w.toon_prijs_per_eenheid ? 1 : 0)}
                                        className="py-1.5 px-3 text-right text-xs text-slate-500">Subtotaal maatregelen</td>
                                      <td className="py-1.5 px-3 text-right text-sm font-semibold">{euro(subtotaalMaatregelen)}</td>
                                    </tr>
                                  )}
                                </>
                              )}
                              {algemeenKosten.length > 0 && (
                                <>
                                  <tr className="bg-slate-50">
                                    <td colSpan={1 + (w.toon_aantal ? 1 : 0) + (w.toon_eenheid ? 1 : 0) + (w.toon_prijs_per_eenheid ? 1 : 0) + 1}
                                      className="py-1.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                      Algemene kosten
                                    </td>
                                  </tr>
                                  {w.optionele_posten === "samengevat" ? (
                                    <>
                                      {algemeenKosten.filter((r) => !r.is_optioneel).map((r) => <RegelRijPrint key={r.id} r={r} />)}
                                      {alleAlgemeenKosten.some((r) => r.is_optioneel) && (
                                        <tr className="border-b border-slate-100">
                                          <td colSpan={1 + (w.toon_aantal ? 1 : 0) + (w.toon_eenheid ? 1 : 0) + (w.toon_prijs_per_eenheid ? 1 : 0) + 1}
                                            className="py-2 px-3 text-xs text-amber-700 italic">
                                            + {alleAlgemeenKosten.filter((r) => r.is_optioneel).length} optionele post(en) — op verzoek beschikbaar
                                          </td>
                                        </tr>
                                      )}
                                    </>
                                  ) : (
                                    algemeenKosten.map((r) => <RegelRijPrint key={r.id} r={r} />)
                                  )}
                                  {w.toon_subtotalen && (
                                    <tr className="bg-slate-50/50">
                                      <td colSpan={1 + (w.toon_aantal ? 1 : 0) + (w.toon_eenheid ? 1 : 0) + (w.toon_prijs_per_eenheid ? 1 : 0)}
                                        className="py-1.5 px-3 text-right text-xs text-slate-500">Subtotaal algemene kosten</td>
                                      <td className="py-1.5 px-3 text-right text-sm font-semibold">{euro(subtotaalAlgemeen)}</td>
                                    </tr>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                <div className="border-t-2 border-slate-300 pt-4 space-y-1">
                  {w.toon_subtotaal_excl && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Subtotaal excl. btw</span>
                      <span className="font-medium">{euro(totaal)}</span>
                    </div>
                  )}
                  {w.toon_btw && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Btw {offerte.btw_percentage ?? 21}%</span>
                      <span className="font-medium">{euro(btw)}</span>
                    </div>
                  )}
                  {w.toon_totaal_incl && (
                    <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2 mt-2">
                      <span>Totaal incl. btw</span>
                      <span className="text-primary">{euro(inclBtw)}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="mt-8 grid grid-cols-2 gap-6 text-sm">
              <div className="rounded-md border border-slate-200 p-4 space-y-1">
                <div className="font-semibold text-slate-700 mb-2">Betaalcondities</div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Betalingstermijn</span>
                  <span>{betalingstermijn} dagen</span>
                </div>
                {betaalwijze && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Betaalwijze</span>
                    <span className="capitalize">{betaalwijze}</span>
                  </div>
                )}
                {(offerte as any).geldigheid_dagen && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Offerte geldig</span>
                    <span>{(offerte as any).geldigheid_dagen} dagen</span>
                  </div>
                )}
              </div>

              {factuurSchema?.termijnen && (
                <div className="rounded-md border border-slate-200 p-4 space-y-1">
                  <div className="font-semibold text-slate-700 mb-2">Factuurschema</div>
                  {(factuurSchema.termijnen as { beschrijving: string; percentage: number }[]).map((t, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-slate-500">{t.beschrijving}</span>
                      <span>{t.percentage}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DocumentVoet meta={{ ...meta, paginaNummer: actieveSecties.length + 2 }} mij={mij} />
        </DocumentFrame>
      )}

      {voorwaardenTekst && (
        <DocumentFrame paginaEinde={(bijlagen ?? []).length > 0}>
          <div className="bg-slate-900 text-white px-16 py-6 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold">{offerte.titel}</h2>
              <div className="text-slate-400 text-xs mt-0.5">{meta.projectNummer} — {offerte.opdrachtgever}</div>
            </div>
            <img
              src={mij.logoUrl}
              alt={mij.naam}
              className="h-7 object-contain brightness-0 invert"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="px-16 py-12 flex-1">
            <h1 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b border-slate-200">
              Algemene voorwaarden
            </h1>
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {voorwaardenTekst}
            </div>
          </div>
          <DocumentVoet meta={{ ...meta, paginaNummer: actieveSecties.length + 3 }} mij={mij} />
        </DocumentFrame>
      )}

      {heeftVervolg && (
        <DocumentFrame paginaEinde={(bijlagen ?? []).length > 0}>
          <div className="bg-slate-900 text-white px-16 py-6 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold">{offerte.titel}</h2>
              <div className="text-slate-400 text-xs mt-0.5">{meta.projectNummer} — {offerte.opdrachtgever}</div>
            </div>
            <img
              src={mij.logoUrl}
              alt={mij.naam}
              className="h-7 object-contain brightness-0 invert"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="px-16 py-12 flex-1">
            <h1 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b border-slate-200">
              Na uitvoering
            </h1>
            {vervolgOpties.length > 0 && (
              <div className="mb-6 space-y-2">
                {vervolgOpties.map((sleutel) => (
                  <div key={sleutel} className="flex items-center gap-3 text-sm text-slate-700">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span>{VERVOLG_LABELS[sleutel] ?? sleutel}</span>
                  </div>
                ))}
              </div>
            )}
            {vervolgTekst && (
              <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mt-4">
                {vervolgTekst}
              </div>
            )}
          </div>
          <DocumentVoet meta={{ ...meta, paginaNummer: actieveSecties.length + 2 }} mij={mij} />
        </DocumentFrame>
      )}

      {(bijlagen ?? []).length > 0 && (
        <DocumentFrame paginaEinde={false}>
          <div className="bg-slate-900 text-white px-16 py-6 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold">{offerte.titel}</h2>
              <div className="text-slate-400 text-xs mt-0.5">{meta.projectNummer} — {offerte.opdrachtgever}</div>
            </div>
            <img
              src={mij.logoUrl}
              alt={mij.naam}
              className="h-7 object-contain brightness-0 invert"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="px-16 py-12 flex-1">
            <h1 className="text-2xl font-bold text-slate-900 mb-6 pb-3 border-b border-slate-200">
              Bijlagen
            </h1>
            <div className="space-y-3">
              {(bijlagen ?? []).map((b, i) => (
                <div key={b.id} className="flex items-start gap-3 border-b border-slate-100 pb-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {i + 1}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{b.naam}</div>
                    {b.beschrijving && <div className="text-xs text-slate-500">{b.beschrijving}</div>}
                    {b.url && (
                      <div className="text-xs text-blue-600">{b.url}</div>
                    )}
                  </div>
                  <div className="ml-auto">
                    <span className="text-xs text-slate-400 border rounded px-1.5 py-0.5">{b.bijlage_type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DocumentVoet meta={{ ...meta, paginaNummer: actieveSecties.length + (voorwaardenTekst ? 4 : 3) }} mij={mij} />
        </DocumentFrame>
      )}
    </div>
  );
}
