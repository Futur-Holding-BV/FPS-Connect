import { useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";

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
  }[];
  totalen: {
    subtotaal: number; staarttotaal: number; ak_bedrag: number; abk_bedrag: number;
    risico_bedrag: number; winst_bedrag: number; korting_bedrag: number;
    eindtotaal: number; excl_btw: number; incl_btw: number;
  };
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
    queryFn: () => fetch(`/api/modules/calculaties/${id}/print-data`).then((r) => r.json()),
    enabled: id !== null,
  });

  useEffect(() => {
    if (data) {
      setTimeout(() => window.print(), 400);
    }
  }, [data]);

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

  const { header, regels, totalen } = data;
  const directeRegels = regels.filter((r) => !r.is_staartkosten);
  const staartRegels = regels.filter((r) => r.is_staartkosten);

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
        <div className="flex justify-between items-start mb-6 border-b pb-4">
          <div>
            <div className="text-lg font-bold text-slate-900">Calculatie intern — {header.naam}</div>
            {header.referentie && <div className="text-muted-foreground mt-0.5">Referentie: {header.referentie}</div>}
          </div>
          <div className="text-right text-muted-foreground">
            <div>Printdatum: {vandaag}</div>
            <div>Status: {header.status}</div>
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

        {/* Regels per hoofdstuk */}
        {byHoofdstuk.map(({ hoofdstuk, regels: hRegels }) => (
          <div key={hoofdstuk} className="mb-4">
            <div className="bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 rounded-t border border-b-0 text-xs uppercase tracking-wide">
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
                {hRegels.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-2 py-1 text-muted-foreground">{r.regelnummer ?? i + 1}</td>
                    <td className="px-2 py-1">{r.omschrijving}</td>
                    <td className="px-2 py-1 text-muted-foreground capitalize">{r.categorie.slice(0, 3)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmt2(r.hoeveelheid)}</td>
                    <td className="px-2 py-1 text-muted-foreground">{r.eenheid}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.tarief > 0 ? formatBedrag(r.tarief) : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.mu_per_eenheid > 0 ? fmt2(r.mu_per_eenheid) : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.arbeids_tarief > 0 ? formatBedrag(r.arbeids_tarief) : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums font-medium">{formatBedrag(r.totaal)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 bg-slate-50">
                  <td colSpan={8} className="px-2 py-1 text-right font-medium text-muted-foreground">Subtotaal {hoofdstuk}</td>
                  <td className="px-2 py-1 text-right font-bold tabular-nums">
                    {formatBedrag(hRegels.reduce((s, r) => s + r.totaal, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}

        {/* Staartkosten */}
        {staartRegels.length > 0 && (
          <div className="mb-4">
            <div className="bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 rounded-t border border-b-0 text-xs uppercase tracking-wide">
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

        {/* Totaaloverzicht */}
        <div className="ml-auto w-80 border rounded mt-4">
          <div className="bg-slate-50 px-3 py-1.5 font-semibold text-xs border-b uppercase tracking-wide">Totaaloverzicht</div>
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
              <tr className="bg-slate-900 text-white rounded-b">
                <td className="px-3 py-2 font-semibold rounded-bl">Totaal incl. BTW</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold rounded-br">{formatBedrag(totalen.incl_btw)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t text-xs text-muted-foreground flex justify-between">
          <span>FPS Brandpreventie — Intern calculatieoverzicht</span>
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
