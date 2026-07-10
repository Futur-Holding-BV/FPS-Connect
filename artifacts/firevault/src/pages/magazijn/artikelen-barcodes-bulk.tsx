import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Info } from "lucide-react";
import { BARCODE_FORMATEN, BarcodeLabelInhoud, MM_TO_PX, type BarcodeLabelFormaat } from "@/pages/magazijn/artikel-label";

type BulkArtikel = {
  id: number;
  naam: string;
  code?: string | null;
  barcode?: string | null;
  eenheid: string;
};

const OPSLAG_SLEUTEL = "fps_magazijn_barcodes_bulk";

export default function MagazijnArtikelenBarcodesBulkPagina() {
  const [artikelen, setArtikelen] = useState<BulkArtikel[]>([]);
  const [geselecteerdFormaat, setGeselecteerdFormaat] = useState("100x50");

  useEffect(() => {
    try {
      const ruw = sessionStorage.getItem(OPSLAG_SLEUTEL);
      if (ruw) setArtikelen(JSON.parse(ruw));
    } catch {
      setArtikelen([]);
    }
  }, []);

  const fmt: BarcodeLabelFormaat = BARCODE_FORMATEN.find(f => f.id === geselecteerdFormaat) ?? BARCODE_FORMATEN[0]!;
  const zonderCode = artikelen.filter(a => !a.barcode && !a.code);

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @media print {
          @page { size: ${fmt.breedte}mm ${fmt.hoogte}mm; margin: 0; }
          body { margin: 0; background: white; }
          .no-print { display: none !important; }
          .artikel-label {
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-after: always;
            page-break-inside: avoid;
            width: ${fmt.breedte}mm !important;
            height: ${fmt.hoogte}mm !important;
            padding: 2mm !important;
            gap: 2mm !important;
          }
          .print-container { padding: 0 !important; gap: 0 !important; background: white !important; display: block !important; }
        }
      `}</style>

      <div className="no-print bg-white border-b px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/magazijn/artikelen">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Terug
            </Button>
          </Link>
          <p className="font-semibold text-sm">{artikelen.length} barcodelabels</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <select
            className="text-xs border rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-ring"
            value={geselecteerdFormaat}
            onChange={e => setGeselecteerdFormaat(e.target.value)}
          >
            {BARCODE_FORMATEN.map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          <Button size="sm" onClick={() => window.print()} disabled={artikelen.length === 0}>
            <Printer className="h-4 w-4 mr-1.5" />
            Alles afdrukken
          </Button>
        </div>
      </div>

      {zonderCode.length > 0 && (
        <div className="no-print bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-start gap-2.5 text-xs text-amber-800">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            {zonderCode.length} van de geselecteerde artikelen {zonderCode.length === 1 ? "heeft" : "hebben"} geen artikelcode
            of barcode en {zonderCode.length === 1 ? "toont" : "tonen"} een leeg barcodevak: {zonderCode.map(a => a.naam).join(", ")}.
          </span>
        </div>
      )}

      {artikelen.length === 0 ? (
        <div className="no-print p-12 text-center text-muted-foreground">
          <p>Geen artikelen geselecteerd. Ga terug naar het overzicht en selecteer artikelen om barcodes af te drukken.</p>
        </div>
      ) : (
        <div className="print-container p-8 flex flex-col items-center gap-5">
          {artikelen.map(a => (
            <BarcodeLabelInhoud key={a.id} artikel={a} fmt={fmt} />
          ))}
        </div>
      )}
    </div>
  );
}

export function bewaarBulkBarcodeSelectie(artikelen: BulkArtikel[]) {
  sessionStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(artikelen));
}
