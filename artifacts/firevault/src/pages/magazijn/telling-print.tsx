// Boekhouder-uitvoer van een vastgestelde voorraadtelling (Document Design System)
// Per artikel: aantal, grondslag, waarde; totaal onderaan; peildatum, wie geteld
// en wie vastgesteld heeft. Alles komt uit de bevroren tellingregels.
import { useEffect } from "react";
import { useRoute } from "wouter";
import { useGetVoorraadTelling } from "@workspace/api-client-react";
import { DocumentFrame } from "@/components/documentopmaak/DocumentFrame";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const GRONDSLAG_LABELS: Record<string, string> = {
  inkoopprijs: "Inkoopprijs",
  laatste_inkoopprijs: "Laatste inkoopprijs",
  gewogen_gemiddelde: "Gewogen gemiddelde inkoopprijs",
};

function formatBedrag(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function formatDatum(d: string) {
  const [j, m, dag] = d.split("-");
  return `${dag}-${m}-${j}`;
}

function formatDatumTijd(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function MagazijnTellingPrintPagina() {
  const [, params] = useRoute("/magazijn/tellingen/:id/print");
  const tellingId = Number(params?.id ?? 0);
  const { data: telling, isLoading } = useGetVoorraadTelling(tellingId);

  useEffect(() => {
    if (telling && telling.status === "vastgesteld") {
      document.documentElement.setAttribute("data-fps-print-ready", "1");
    }
  }, [telling]);

  if (isLoading) return <div className="p-10 text-center text-slate-500">Laden…</div>;
  if (!telling) return <div className="p-10 text-center text-slate-500">Telling niet gevonden.</div>;
  if (telling.status !== "vastgesteld") {
    return (
      <div className="p-10 text-center text-slate-500">
        Deze telling is nog niet vastgesteld — de boekhouder-uitvoer is alleen beschikbaar voor vastgestelde tellingen.
      </div>
    );
  }

  const regels = telling.regels ?? [];
  const totaalWaarde = regels.reduce((som, r) => som + (r.waarde ?? 0), 0);
  const zonderPrijs = regels.filter((r) => r.prijs == null).length;
  const tellers = [...new Set(regels.map((r) => r.geteld_door_naam).filter((n): n is string => !!n))];

  return (
    <div className="min-h-screen bg-slate-200 py-8 print:bg-white print:py-0">
      <div className="max-w-[210mm] mx-auto mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Afdrukken / PDF</Button>
      </div>

      <DocumentFrame paginaEinde={false} className="p-[18mm]">
        <div className="border-b-2 border-slate-900 pb-4 mb-6">
          <h1 className="text-2xl font-bold">Voorraadtelling</h1>
          <p className="text-sm text-slate-500 mt-1">
            Peildatum {formatDatum(telling.peildatum)}
            {telling.omschrijving ? ` — ${telling.omschrijving}` : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-8">
          <div className="flex justify-between border-b border-slate-100 py-1">
            <span className="text-slate-500">Waarderingsgrondslag</span>
            <span className="font-medium">{GRONDSLAG_LABELS[telling.grondslag] ?? telling.grondslag}</span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-1">
            <span className="text-slate-500">Status</span>
            <span className="font-medium">Vastgesteld (bevroren)</span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-1">
            <span className="text-slate-500">Geteld door</span>
            <span className="font-medium">{tellers.length > 0 ? tellers.join(", ") : "—"}</span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-1">
            <span className="text-slate-500">Vastgesteld door</span>
            <span className="font-medium">
              {telling.vastgesteld_door_naam ?? "—"} op {formatDatumTijd(telling.vastgesteld_op)}
            </span>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-2">Artikel</th>
              <th className="py-2 pr-2">Locatie</th>
              <th className="py-2 pr-2 text-right">Aantal</th>
              <th className="py-2 pr-2 text-right">Prijs ({GRONDSLAG_LABELS[telling.grondslag]?.toLowerCase() ?? telling.grondslag})</th>
              <th className="py-2 text-right">Waarde</th>
            </tr>
          </thead>
          <tbody>
            {regels.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-2">
                  {r.artikel_naam}
                  {r.artikel_code && <span className="text-slate-400 text-xs ml-1">({r.artikel_code})</span>}
                </td>
                <td className="py-1.5 pr-2 text-slate-500">{r.locatie_naam ?? "—"}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.geteld_aantal} {r.eenheid}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.prijs != null ? formatBedrag(r.prijs) : "—"}</td>
                <td className="py-1.5 text-right tabular-nums font-medium">{r.waarde != null ? formatBedrag(r.waarde) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900">
              <td colSpan={4} className="py-2 font-bold">Totale voorraadwaarde per {formatDatum(telling.peildatum)}</td>
              <td className="py-2 text-right tabular-nums font-bold">{formatBedrag(totaalWaarde)}</td>
            </tr>
          </tfoot>
        </table>

        {zonderPrijs > 0 && (
          <p className="text-xs text-slate-500 mt-4">
            Let op: {zonderPrijs} regel(s) zonder prijs volgens de gekozen grondslag; deze tellen niet mee in de totale waarde.
          </p>
        )}

        <p className="text-xs text-slate-400 mt-8">
          Alle aantallen, prijzen en waarden in dit overzicht zijn bevroren op het moment van vaststellen.
          Latere prijswijzigingen hebben geen invloed op deze telling. Verschillen ten opzichte van de
          administratie zijn geboekt als correctiemutaties met verwijzing naar telling #{telling.id}.
        </p>
      </DocumentFrame>
    </div>
  );
}
