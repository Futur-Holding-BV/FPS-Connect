import { useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useListStudioWerkgevers, useListWerkgevers } from "@workspace/api-client-react";
import { useActiefStudioModel } from "@/hooks/use-actief-studio-model";
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type PrintData = {
  header: {
    id: number; naam: string; referentie: string | null; klant_naam: string | null;
    project_naam: string | null; status: string; omschrijving: string | null;
    opslag_ak: number; opslag_abk: number; opslag_risico: number; opslag_winst: number;
    korting: number; gebouw_naam: string | null; aangemaakt_op: string;
  };
  regels: {
    id: number; categorie: string; omschrijving: string; eenheid: string;
    hoeveelheid: number; tarief: number; mu_per_eenheid: number; arbeids_tarief: number;
    onderaanneming_bedrag: number; totaal: number; is_staartkosten: boolean;
    hoofdstuk: string; regelnummer: string | null;
    soort?: string; optioneel?: boolean; ouder_regel_id?: number | null;
  }[];
  totalen: {
    subtotaal: number; staarttotaal: number; ak_bedrag: number; abk_bedrag: number;
    risico_bedrag: number; winst_bedrag: number; korting_bedrag: number;
    eindtotaal: number; excl_btw: number; incl_btw: number;
    optioneel_totaal?: number;
  };
  fie?: {
    correctie_factor: number | null;
    gecorrigeerde_arbeid: number | null;
    gecorrigeerde_materiaal: number | null;
    totaal_arbeid: number | null;
    totaal_materiaal: number | null;
    advies_status: string | null;
    advies_tekst: string | null;
  } | null;
};

function formatBedrag(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function fmt2(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const HOOFDSTUK_OPTIES = [
  "Brandwerende doorvoeringen",
  "Deuren en kozijnen",
  "Wanden en plafonds",
  "Schachten",
  "Onderhoud",
  "Overige werkzaamheden",
];

export default function ModulesCalculatiePrint() {
  const [, params] = useRoute("/modules/calculatie/:id/print");
  const id = params?.id ? parseInt(params.id, 10) : null;

  const { data, isLoading, isError } = useQuery<PrintData>({
    queryKey: ["calc-print", id],
    queryFn: () => fetch(`/api/modules/calculaties/${id}/print-data`).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    }),
    enabled: id !== null,
  });

  // ── Document Studio — actief template + werkgever-branding ──────────────
  const { data: werkgevers }      = useListWerkgevers();
  const { data: studioWerkgevers } = useListStudioWerkgevers();

  const _actieveWerkgeverId = (() => {
    try { const v = localStorage.getItem("fps.actieve_werkgever"); return v ? Number(v) : null; } catch { return null; }
  })();
  const _actieveWerkgeverNaam = _actieveWerkgeverId
    ? ((werkgevers ?? []).find(w => w.id === _actieveWerkgeverId)?.naam ?? null)
    : null;
  const studioWerkgeverId = (
    (studioWerkgevers ?? []).find(w => _actieveWerkgeverNaam && w.naam === _actieveWerkgeverNaam)?.id
    ?? (studioWerkgevers ?? [])[0]?.id
    ?? null
  );
  const { model: actiefStudioModel, isLoading: modelLaden } = useActiefStudioModel(studioWerkgeverId, "calculatie");

  // Werkgever-branding: logo + bedrijfsgegevens (zelfde patroon als offerte/factuur print)
  const werkgever = _actieveWerkgeverNaam
    ? ((werkgevers ?? []).find(w => w.naam === _actieveWerkgeverNaam) ?? (werkgevers ?? [])[0] ?? null)
    : ((werkgevers ?? [])[0] ?? null);

  const accentKleur = (() => {
    if (!actiefStudioModel?.connect_template_json) return null;
    try {
      const tmpl = JSON.parse(actiefStudioModel.connect_template_json) as { kleurschema?: { primair?: string } };
      return tmpl.kleurschema?.primair ?? null;
    } catch { return null; }
  })();
  // Kleur-fallback-keten: studio-model → werkgever.primaire_kleur → FPS-merk
  const kleur = accentKleur ?? werkgever?.primaire_kleur ?? "#F23B0D";
  const _rawLogoUrl = (studioWerkgevers ?? []).find(w => w.id === studioWerkgeverId)?.logo_url ?? null;
  // Normaliseer: /objects/... → /api/storage/objects/..., bare key → /api/storage/objects/<key>
  const studioLogoUrl = _rawLogoUrl
    ? (_rawLogoUrl.startsWith("/") ? `/api/storage${_rawLogoUrl}` : `/api/storage/objects/${_rawLogoUrl}`)
    : null;

  // Branding-queries moeten ook klaar zijn voordat we printen (inclusief studio-model).
  const brandingLoaded = werkgevers !== undefined && studioWerkgevers !== undefined && !modelLaden;
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (data && brandingLoaded) {
      // Wacht iets langer zodat logo-afbeelding kan decoderen na het laden van branding-queries.
      const timer = setTimeout(() => window.print(), 800);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [data, brandingLoaded]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Calculatie laden...</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-destructive">Calculatie kon niet worden geladen.</p>
      </div>
    );
  }

  const { header, regels, totalen, fie } = data;
  // ADVIES_01 §6: alleen regel/materiaal tellen mee; optioneel apart.
  const teltMee = (r: { soort?: string }) => (r.soort ?? "regel") === "regel" || (r.soort ?? "regel") === "materiaal";
  const directeRegels = regels.filter((r) => !r.is_staartkosten && !r.optioneel);
  const staartRegels = regels.filter((r) => r.is_staartkosten && !r.optioneel);
  const optioneleRegels = regels.filter((r) => r.optioneel);

  const heeftLeereffect = fie?.correctie_factor != null && fie.correctie_factor !== 1.0;

  const adviesKleur: Record<string, string> = {
    goed: "bg-green-50 border-green-200 text-green-800",
    neutraal: "bg-slate-50 border-slate-200 text-slate-600",
    laag: "bg-amber-50 border-amber-200 text-amber-800",
  };

  const AdviesIcoon = ({ status }: { status: string }) => {
    if (status === "goed") return <TrendingUp className="h-3.5 w-3.5 text-green-600 shrink-0" />;
    if (status === "laag") return <TrendingDown className="h-3.5 w-3.5 text-amber-600 shrink-0" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  };

  const byHoofdstuk = HOOFDSTUK_OPTIES.map((h) => ({
    hoofdstuk: h,
    regels: directeRegels.filter((r) => (r.hoofdstuk ?? "Overige werkzaamheden") === h),
  })).filter((g) => g.regels.length > 0);

  const vandaag = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="bg-white min-h-screen font-sans text-[11px] print:text-[10px]">
      <style>{`
        @media print {
          @page { margin: 15mm 12mm; size: A4 portrait; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>

      <div className="max-w-[210mm] mx-auto px-8 py-6">
        {/* Kop */}
        <div
          className="flex justify-between items-start mb-6 border-b pb-4"
          style={{ borderColor: kleur }}
        >
          {/* Links: titel + metadata */}
          <div className="flex-1 min-w-0 pr-4">
            <div className="text-lg font-bold text-slate-900">Calculatie intern — {header.naam}</div>
            {header.referentie && <div className="text-muted-foreground mt-0.5">Referentie: {header.referentie}</div>}
            {actiefStudioModel && (
              <div
                className="inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded mt-1"
                style={{ backgroundColor: kleur + "18", color: kleur }}
              >
                Opmaak: {actiefStudioModel.werkgever_naam ?? werkgever?.naam ?? "FPS"}
              </div>
            )}
          </div>

          {/* Midden: bedrijfsgegevensblok */}
          {werkgever && (
            <div className="text-right text-[10px] text-slate-600 leading-snug mr-4 shrink-0">
              <div className="font-semibold text-slate-800">{werkgever.naam}</div>
              {werkgever.adres && <div>{werkgever.adres}</div>}
              {(werkgever.postcode || werkgever.plaats) && (
                <div>{[werkgever.postcode, werkgever.plaats].filter(Boolean).join("  ")}</div>
              )}
              {werkgever.telefoon && <div>{werkgever.telefoon}</div>}
              {werkgever.email && <div>{werkgever.email}</div>}
            </div>
          )}

          {/* Rechts: logo + printdatum/status */}
          <div className="text-right shrink-0 flex flex-col items-end gap-2">
            {studioLogoUrl && (
              <img
                src={studioLogoUrl}
                alt={werkgever?.naam ?? "Logo"}
                className="h-10 w-auto object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="text-muted-foreground text-[10px]">
              <div>Printdatum: {vandaag}</div>
              <div>Status: {header.status}</div>
            </div>
          </div>
        </div>

        {/* Projectgegevens */}
        <div className="grid grid-cols-3 gap-4 mb-6 p-3 bg-slate-50 rounded border text-xs">
          {header.klant_naam && (
            <div><span className="text-muted-foreground">Opdrachtgever:</span><br /><strong>{header.klant_naam}</strong></div>
          )}
          {header.gebouw_naam && (
            <div><span className="text-muted-foreground">Gebouw:</span><br /><strong>{header.gebouw_naam}</strong></div>
          )}
          {header.project_naam && (
            <div><span className="text-muted-foreground">Project:</span><br /><strong>{header.project_naam}</strong></div>
          )}
          {header.omschrijving && (
            <div className="col-span-3"><span className="text-muted-foreground">Omschrijving:</span><br />{header.omschrijving}</div>
          )}
        </div>

        {/* FIE Bedrijfskompas - Advies & Leereffect */}
        {fie && (
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className={cn("p-3 rounded border text-[11px] flex items-start gap-2", adviesKleur[fie.advies_status ?? ""] ?? adviesKleur.neutraal)}>
              <AdviesIcoon status={fie.advies_status ?? "neutraal"} />
              <div>
                <div className="font-bold mb-0.5 uppercase tracking-wide text-[9px]">Marge-advies</div>
                <div className="leading-snug">{fie.advies_tekst}</div>
              </div>
            </div>

            {heeftLeereffect && (fie.gecorrigeerde_arbeid != null || fie.gecorrigeerde_materiaal != null) && (
              <div className="p-3 rounded border border-amber-200 bg-amber-50 text-[11px]">
                <div className="flex items-center gap-1.5 text-amber-800 font-bold uppercase tracking-wide text-[9px] mb-2">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>Leereffect-correctie</span>
                  <span className="ml-auto inline-flex items-center rounded-full border border-amber-300 bg-white px-1.5 py-px text-[10px] font-bold text-amber-800 tabular-nums">
                    &times;{fie.correctie_factor!.toFixed(2)}
                  </span>
                </div>
                <div className="space-y-1">
                  {fie.totaal_arbeid != null && fie.gecorrigeerde_arbeid != null && (
                    <div className="flex justify-between text-amber-900/60">
                      <span>Arbeid (origineel)</span>
                      <span className="tabular-nums line-through">{formatBedrag(fie.totaal_arbeid)}</span>
                    </div>
                  )}
                  {fie.gecorrigeerde_arbeid != null && (
                    <div className="flex justify-between text-amber-900 font-semibold">
                      <span>Gecorrigeerde arbeid</span>
                      <span className="tabular-nums">{formatBedrag(fie.gecorrigeerde_arbeid)}</span>
                    </div>
                  )}
                  {fie.totaal_materiaal != null && fie.gecorrigeerde_materiaal != null && (
                    <div className="flex justify-between text-amber-900/60 mt-1 border-t border-amber-200/50 pt-1">
                      <span>Materiaal (origineel)</span>
                      <span className="tabular-nums line-through">{formatBedrag(fie.totaal_materiaal)}</span>
                    </div>
                  )}
                  {fie.gecorrigeerde_materiaal != null && (
                    <div className="flex justify-between text-amber-900 font-semibold">
                      <span>Gecorrigeerd materiaal</span>
                      <span className="tabular-nums">{formatBedrag(fie.gecorrigeerde_materiaal)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Regels per hoofdstuk */}
        {byHoofdstuk.map(({ hoofdstuk, regels: hRegels }) => (
          <div key={hoofdstuk} className="mb-4">
            <div
              className="px-3 py-1.5 font-semibold rounded-t border border-b-0 text-xs uppercase tracking-wide"
              style={{ backgroundColor: kleur + "18", color: kleur, borderColor: kleur + "30" }}
            >
              {hoofdstuk}
            </div>
            <table className="w-full border border-t-0 rounded-b text-[10px]">
              <thead className="bg-slate-50">
                <tr className="border-b">
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-6">#</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Omschrijving</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-12">Cat.</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-14">Hoev.</th>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-10">Eenh.</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-18">Tarief</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-14">MU</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-18">Arb.tarief</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-20">Totaal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {hRegels.map((r, i) => {
                  if (r.soort === "kop") {
                    return (
                      <tr key={r.id} className="bg-slate-50">
                        <td colSpan={9} className="px-2 py-1 font-bold uppercase tracking-wide">{r.omschrijving}</td>
                      </tr>
                    );
                  }
                  const tekst = r.soort === "tekst";
                  const stelpost = r.soort === "stelpost";
                  return (
                    <tr key={r.id} className={r.soort === "materiaal" ? "text-muted-foreground" : ""}>
                      <td className="px-2 py-1 text-muted-foreground">{r.regelnummer ?? i + 1}</td>
                      <td className={cn("px-2 py-1", tekst && "italic text-muted-foreground", r.soort === "materiaal" && "pl-5")}>{r.omschrijving}</td>
                      <td className="px-2 py-1 text-muted-foreground capitalize">{tekst ? "" : r.categorie.slice(0, 3)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{tekst ? "" : fmt2(r.hoeveelheid)}</td>
                      <td className="px-2 py-1 text-muted-foreground">{tekst ? "" : r.eenheid}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{tekst ? "" : r.tarief > 0 ? formatBedrag(r.tarief) : "—"}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{tekst ? "" : r.mu_per_eenheid > 0 ? fmt2(r.mu_per_eenheid) : "—"}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{tekst ? "" : r.arbeids_tarief > 0 ? formatBedrag(r.arbeids_tarief) : "—"}</td>
                      <td className="px-2 py-1 text-right tabular-nums font-medium">
                        {tekst ? "" : stelpost
                          ? <span>{formatBedrag(r.totaal)} <span className="text-[8px] text-amber-700">stelpost — telt niet mee</span></span>
                          : formatBedrag(r.totaal)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 bg-slate-50">
                  <td colSpan={8} className="px-2 py-1 text-right font-medium text-muted-foreground">Subtotaal {hoofdstuk}</td>
                  <td className="px-2 py-1 text-right font-bold tabular-nums">
                    {formatBedrag(hRegels.filter(teltMee).reduce((s, r) => s + r.totaal, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}

        {/* Staartkosten */}
        {staartRegels.length > 0 && (
          <div className="mb-4">
            <div
              className="px-3 py-1.5 font-semibold rounded-t border border-b-0 text-xs uppercase tracking-wide"
              style={{ backgroundColor: kleur + "18", color: kleur, borderColor: kleur + "30" }}
            >
              Staartkosten
            </div>
            <table className="w-full border border-t-0 rounded-b text-[10px]">
              <tbody className="divide-y">
                {staartRegels.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-1">{r.omschrijving}</td>
                    <td className="px-2 py-1 text-right font-medium tabular-nums">{formatBedrag(r.totaal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Optionele regels — apart aangeboden, telt niet mee in totaal */}
        {optioneleRegels.length > 0 && (
          <div className="mb-4">
            <div
              className="px-3 py-1.5 font-semibold rounded-t border border-b-0 text-xs uppercase tracking-wide"
              style={{ backgroundColor: kleur + "18", color: kleur, borderColor: kleur + "30" }}
            >
              Optioneel — telt niet mee in bovenstaand totaal
            </div>
            <table className="w-full border border-t-0 rounded-b text-[10px]">
              <tbody className="divide-y">
                {optioneleRegels.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-1">{r.regelnummer ? `${r.regelnummer} ` : ""}{r.omschrijving}</td>
                    <td className="px-2 py-1 text-right font-medium tabular-nums">{formatBedrag(r.totaal)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 bg-slate-50">
                  <td className="px-2 py-1 text-right font-medium text-muted-foreground">Optioneel subtotaal</td>
                  <td className="px-2 py-1 text-right font-bold tabular-nums">
                    {formatBedrag(totalen.optioneel_totaal ?? optioneleRegels.filter(teltMee).reduce((s, r) => s + r.totaal, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Totaaloverzicht */}
        <div className="ml-auto w-80 border rounded mt-4">
          <div
            className="px-3 py-1.5 font-semibold text-xs border-b uppercase tracking-wide"
            style={{ backgroundColor: kleur + "18", color: kleur, borderColor: kleur + "30" }}
          >
            Totaaloverzicht
          </div>
          <table className="w-full text-xs">
            <tbody>
              <tr className="border-b">
                <td className="px-3 py-1.5 text-muted-foreground">Directe kosten</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatBedrag(totalen.subtotaal)}</td>
              </tr>
              {totalen.staarttotaal > 0 && (
                <tr className="border-b">
                  <td className="px-3 py-1.5 text-muted-foreground">Staartkosten</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatBedrag(totalen.staarttotaal)}</td>
                </tr>
              )}
              <tr className="border-b">
                <td className="px-3 py-1.5 text-muted-foreground">AK ({header.opslag_ak}%)</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatBedrag(totalen.ak_bedrag)}</td>
              </tr>
              <tr className="border-b">
                <td className="px-3 py-1.5 text-muted-foreground">ABK ({header.opslag_abk}%)</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatBedrag(totalen.abk_bedrag)}</td>
              </tr>
              <tr className="border-b">
                <td className="px-3 py-1.5 text-muted-foreground">Risico ({header.opslag_risico}%)</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatBedrag(totalen.risico_bedrag)}</td>
              </tr>
              <tr className="border-b">
                <td className="px-3 py-1.5 text-muted-foreground">Winst ({header.opslag_winst}%)</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatBedrag(totalen.winst_bedrag)}</td>
              </tr>
              {totalen.korting_bedrag > 0 && (
                <tr className="border-b">
                  <td className="px-3 py-1.5 text-muted-foreground">Korting ({header.korting}%)</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-destructive">-{formatBedrag(totalen.korting_bedrag)}</td>
                </tr>
              )}
              <tr className="border-b bg-slate-50">
                <td className="px-3 py-2 font-semibold">Totaal excl. BTW</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-base">{formatBedrag(totalen.excl_btw)}</td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 text-muted-foreground">BTW 21%</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatBedrag(totalen.incl_btw - totalen.excl_btw)}</td>
              </tr>
              <tr className="text-white rounded-b" style={{ backgroundColor: kleur }}>
                <td className="px-3 py-2 font-semibold rounded-bl">Totaal incl. BTW</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold rounded-br">{formatBedrag(totalen.incl_btw)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t text-xs text-muted-foreground flex justify-between" style={{ borderColor: kleur + "30" }}>
          <span>{werkgever?.naam ?? "FPS Brandpreventie"} — Intern calculatieoverzicht</span>
          <span className="no-print">
            <button
              onClick={() => window.print()}
              className="text-blue-600 underline"
            >
              Afdrukken
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
