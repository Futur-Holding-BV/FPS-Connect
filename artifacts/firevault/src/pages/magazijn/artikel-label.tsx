import { useRoute, Link } from "wouter";
import { useGetMagazijnArtikel, useListMagazijnLocaties } from "@workspace/api-client-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Tag, Barcode, Info } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

// ── Dymo LabelWriter 450 — ondersteunde labelformaten ─────────────────────────
// De afmetingen komen overeen met gangbare Dymo-labelrollen. Kies het formaat
// dat in uw Dymo-rol zit; de CSS @page-regel past zich automatisch aan.

type LabelFormaat = {
  id: string;
  label: string;
  breedte: number;
  hoogte: number;
  qrGrootte: number;
  fontKop: number;
  fontSub: number;
  fontKlein: number;
};

const LABEL_FORMATEN: LabelFormaat[] = [
  {
    id: "89x36",
    label: "89 × 36 mm — Standaard planksticker (Dymo LW)",
    breedte: 89, hoogte: 36,
    qrGrootte: 82, fontKop: 12, fontSub: 10, fontKlein: 9,
  },
  {
    id: "89x28",
    label: "89 × 28 mm — Smal adresetiket (Dymo 99010)",
    breedte: 89, hoogte: 28,
    qrGrootte: 62, fontKop: 10, fontSub: 9, fontKlein: 8,
  },
  {
    id: "57x32",
    label: "57 × 32 mm — Productetiket (Dymo 30334)",
    breedte: 57, hoogte: 32,
    qrGrootte: 68, fontKop: 10, fontSub: 9, fontKlein: 8,
  },
  {
    id: "54x25",
    label: "54 × 25 mm — Compact label",
    breedte: 54, hoogte: 25,
    qrGrootte: 52, fontKop: 9, fontSub: 8, fontKlein: 7.5,
  },
];

// ── Barcode-labelformaten ───────────────────────────────────────────────────
// Barcodes (Code 128) zijn breder dan hoog; kies bij voorkeur een breed formaat.
export type BarcodeLabelFormaat = {
  id: string;
  label: string;
  breedte: number;
  hoogte: number;
  barcodeHoogte: number;
  fontNaam: number;
  fontSub: number;
};

export const BARCODE_FORMATEN: BarcodeLabelFormaat[] = [
  {
    id: "100x50",
    label: "100 × 50 mm — Standaard productlabel",
    breedte: 100, hoogte: 50,
    barcodeHoogte: 22, fontNaam: 11, fontSub: 9,
  },
  {
    id: "89x36",
    label: "89 × 36 mm — Planksticker (Dymo LW)",
    breedte: 89, hoogte: 36,
    barcodeHoogte: 14, fontNaam: 9, fontSub: 7.5,
  },
  {
    id: "148x105",
    label: "148 × 105 mm — A6 (standaard printer)",
    breedte: 148, hoogte: 105,
    barcodeHoogte: 40, fontNaam: 16, fontSub: 12,
  },
  {
    id: "57x32",
    label: "57 × 32 mm — Compact productetiket",
    breedte: 57, hoogte: 32,
    barcodeHoogte: 11, fontNaam: 8, fontSub: 7,
  },
];

// 1 mm ≈ 3.78px bij 96 dpi — schaalfactor voor de schermpreview
export const MM_TO_PX = 3.78;

// ── QR-label inhoud ────────────────────────────────────────────────────────
function ArtikelLabelInhoud({
  artikel,
  fmt,
}: {
  artikel: {
    id: number;
    naam: string;
    code?: string | null;
    leverancier_naam?: string | null;
    leveranciers_artikel_nr?: string | null;
    barcode?: string | null;
    eenheid: string;
    merk?: string | null;
  };
  fmt: LabelFormaat;
}) {
  const qrUrl = `${window.location.origin}/magazijn/artikelen/${artikel.id}`;
  const breedte = fmt.breedte * MM_TO_PX;
  const hoogte = fmt.hoogte * MM_TO_PX;
  const pad = Math.round(hoogte * 0.06);
  const kloof = Math.round(hoogte * 0.08);

  return (
    <div
      className="artikel-label"
      style={{
        width: breedte,
        height: hoogte,
        border: "1.5px solid #cbd5e1",
        borderRadius: 3,
        backgroundColor: "#ffffff",
        fontFamily: "Inter, Arial, sans-serif",
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        boxSizing: "border-box",
        padding: pad,
        gap: kloof,
      }}
    >
      {/* QR-code — links */}
      <div style={{ flexShrink: 0, lineHeight: 0 }}>
        <QRCodeSVG value={qrUrl} size={fmt.qrGrootte} level="M" includeMargin={false} />
      </div>

      {/* Scheidingslijn */}
      <div style={{ width: 1, alignSelf: "stretch", backgroundColor: "#e2e8f0", flexShrink: 0 }} />

      {/* Artikel-info — rechts */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Naam */}
        <div
          style={{
            fontSize: fmt.fontKop,
            fontWeight: 700,
            color: "#0f172a",
            lineHeight: 1.15,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {artikel.naam}
        </div>

        {/* Code + merk */}
        {(artikel.code || artikel.merk) && (
          <div style={{ fontSize: fmt.fontSub, color: "#475569", lineHeight: 1.2 }}>
            {artikel.code && <span style={{ fontWeight: 600, color: "#1e293b" }}>{artikel.code}</span>}
            {artikel.code && artikel.merk && <span style={{ margin: "0 4px", color: "#94a3b8" }}>·</span>}
            {artikel.merk && <span>{artikel.merk}</span>}
          </div>
        )}

        {/* Leverancier + art.nr. */}
        {artikel.leverancier_naam && (
          <div
            style={{
              fontSize: fmt.fontKlein,
              color: "#475569",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.3,
            }}
          >
            {artikel.leverancier_naam}
            {artikel.leveranciers_artikel_nr && (
              <span
                style={{
                  marginLeft: 5,
                  fontWeight: 600,
                  color: "#1e293b",
                  backgroundColor: "#f1f5f9",
                  padding: "0 3px",
                  borderRadius: 2,
                }}
              >
                #{artikel.leveranciers_artikel_nr}
              </span>
            )}
          </div>
        )}

        {/* Barcode + eenheid */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
          {artikel.barcode && (
            <div
              style={{
                fontSize: fmt.fontKlein - 0.5,
                color: "#64748b",
                fontVariantNumeric: "tabular-nums",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {artikel.barcode}
            </div>
          )}
          <div
            style={{
              marginLeft: "auto",
              fontSize: fmt.fontKlein,
              fontWeight: 700,
              color: "#0f172a",
              backgroundColor: "#f1f5f9",
              border: "1px solid #e2e8f0",
              padding: "1px 4px",
              borderRadius: 2,
              flexShrink: 0,
            }}
          >
            {artikel.eenheid}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Barcode-component (Code 128) ───────────────────────────────────────────
function BarcodeSVG({ waarde, hoogte, fontGrootte }: { waarde: string; hoogte: number; fontGrootte: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && waarde) {
      try {
        JsBarcode(ref.current, waarde, {
          format: "CODE128",
          width: 1.6,
          height: hoogte,
          displayValue: true,
          fontSize: fontGrootte,
          margin: 4,
          fontOptions: "",
          font: "Arial",
          textAlign: "center",
          textPosition: "bottom",
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch {
        // Ongeldige barcodewaarde — toon niets
      }
    }
  }, [waarde, hoogte, fontGrootte]);
  return <svg ref={ref} style={{ display: "block" }} />;
}

// ── Barcode-label inhoud ───────────────────────────────────────────────────
export function BarcodeLabelInhoud({
  artikel,
  fmt,
  locatieNaam,
}: {
  artikel: {
    id: number;
    naam: string;
    code?: string | null;
    barcode?: string | null;
    eenheid: string;
    merk?: string | null;
    locatie_id?: number | null;
  };
  fmt: BarcodeLabelFormaat;
  locatieNaam?: string | null;
}) {
  const barcodeWaarde = artikel.barcode || artikel.code || "";
  const breedte = fmt.breedte * MM_TO_PX;
  const hoogte = fmt.hoogte * MM_TO_PX;
  const pad = Math.max(4, Math.round(hoogte * 0.05));

  return (
    <div
      className="artikel-label"
      style={{
        width: breedte,
        height: hoogte,
        border: "1.5px solid #cbd5e1",
        borderRadius: 3,
        backgroundColor: "#ffffff",
        fontFamily: "Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        boxSizing: "border-box",
        padding: pad,
        gap: 2,
      }}
    >
      {/* Naam */}
      <div
        style={{
          fontSize: fmt.fontNaam,
          fontWeight: 700,
          color: "#0f172a",
          lineHeight: 1.2,
          textAlign: "center",
          width: "100%",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {artikel.naam}
      </div>

      {/* Barcode */}
      {barcodeWaarde ? (
        <div style={{ lineHeight: 0, marginTop: 2 }}>
          <BarcodeSVG
            waarde={barcodeWaarde}
            hoogte={fmt.barcodeHoogte * MM_TO_PX}
            fontGrootte={fmt.fontSub}
          />
        </div>
      ) : (
        <div
          style={{
            fontSize: fmt.fontSub,
            color: "#94a3b8",
            textAlign: "center",
            padding: "4px 0",
          }}
        >
          Geen artikelcode beschikbaar
        </div>
      )}

      {/* Locatie (optioneel) */}
      {locatieNaam && (
        <div
          style={{
            fontSize: fmt.fontSub - 1,
            color: "#475569",
            textAlign: "center",
            marginTop: 1,
          }}
        >
          Locatie: {locatieNaam}
        </div>
      )}
    </div>
  );
}

// ── Hoofdpagina ────────────────────────────────────────────────────────────
type Modus = "qr" | "barcode";

export default function MagazijnArtikelLabelPagina() {
  const [, params] = useRoute("/magazijn/artikelen/:id/label");
  const artikelId = Number(params?.id ?? 0);

  const initModus: Modus = new URLSearchParams(window.location.search).get("type") === "barcode" ? "barcode" : "qr";
  const [modus, setModus] = useState<Modus>(initModus);

  const [geselecteerdQrFormaat, setGeselecteerdQrFormaat] = useState("89x36");
  const [geselecteerdBarcodeFormaat, setGeselecteerdBarcodeFormaat] = useState("100x50");
  const [aantalLabels, setAantalLabels] = useState(1);

  const { data: artikel, isLoading } = useGetMagazijnArtikel(artikelId);
  const { data: locaties = [] } = useListMagazijnLocaties();

  const qrFmt = LABEL_FORMATEN.find((f) => f.id === geselecteerdQrFormaat) ?? LABEL_FORMATEN[0]!;
  const barcodeFmt = BARCODE_FORMATEN.find((f) => f.id === geselecteerdBarcodeFormaat) ?? BARCODE_FORMATEN[0]!;
  const activeFmt = modus === "qr" ? qrFmt : barcodeFmt;

  const labels = Array.from({ length: Math.max(1, Math.min(aantalLabels, 20)) });

  const locatieNaam = artikel?.locatie_id
    ? (locaties.find((l) => l.id === artikel.locatie_id)?.naam ?? null)
    : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <p>Artikel laden…</p>
      </div>
    );
  }

  if (!artikel) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">Artikel niet gevonden.</p>
          <Link href="/magazijn/artikelen">
            <Button variant="link" className="pl-0">
              <ArrowLeft className="h-4 w-4 mr-1" /> Terug naar overzicht
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const barcodeWaarde = artikel.barcode || artikel.code || "";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── @page CSS voor labelafmetingen ──────────────────────────────── */}
      <style>{`
        @media print {
          @page {
            size: ${activeFmt.breedte}mm ${activeFmt.hoogte}mm;
            margin: 0;
          }
          body {
            margin: 0;
            background: white;
          }
          .no-print { display: none !important; }
          .artikel-label {
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-after: always;
            page-break-inside: avoid;
            width: ${activeFmt.breedte}mm !important;
            height: ${activeFmt.hoogte}mm !important;
            padding: 2mm !important;
            gap: 2mm !important;
          }
          .print-container {
            padding: 0 !important;
            gap: 0 !important;
            background: white !important;
            display: block !important;
          }
        }
      `}</style>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="no-print bg-white border-b px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/magazijn/artikelen/${artikelId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Terug
            </Button>
          </Link>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{artikel.naam}</p>
            {artikel.code && <p className="text-xs text-muted-foreground">{artikel.code}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
          {/* Modus-schakelaar */}
          <div className="flex items-center border rounded overflow-hidden text-xs">
            <button
              className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${modus === "qr" ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:bg-muted/50"}`}
              onClick={() => setModus("qr")}
            >
              <Tag className="h-3.5 w-3.5" />
              QR-label
            </button>
            <button
              className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${modus === "barcode" ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:bg-muted/50"}`}
              onClick={() => setModus("barcode")}
            >
              <Barcode className="h-3.5 w-3.5" />
              Barcode
            </button>
          </div>

          {/* Formaat-keuze */}
          {modus === "qr" ? (
            <select
              className="text-xs border rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-ring"
              value={geselecteerdQrFormaat}
              onChange={(e) => setGeselecteerdQrFormaat(e.target.value)}
            >
              {LABEL_FORMATEN.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          ) : (
            <select
              className="text-xs border rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-ring"
              value={geselecteerdBarcodeFormaat}
              onChange={(e) => setGeselecteerdBarcodeFormaat(e.target.value)}
            >
              {BARCODE_FORMATEN.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          )}

          {/* Aantal */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Aantal:</label>
            <input
              type="number"
              min={1}
              max={20}
              value={aantalLabels}
              onChange={(e) => setAantalLabels(Math.max(1, Math.min(20, Number(e.target.value))))}
              className="text-xs border rounded px-2 py-1.5 w-14 text-center focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" />
            Afdrukken
          </Button>
        </div>
      </div>

      {/* ── Instructiebalk ───────────────────────────────────────────────── */}
      <div className="no-print bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-start gap-2.5 text-xs text-amber-800">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        {modus === "qr" ? (
          <span>
            Klik op <strong>Afdrukken</strong>, selecteer uw <strong>Dymo LabelWriter 450</strong> als printer en
            stel het papierformaat in op <strong>{qrFmt.breedte} × {qrFmt.hoogte} mm</strong>.
            Zet marges op <strong>0 mm</strong>. De QR-code leidt direct naar de artikelpagina in FPS Connect.
          </span>
        ) : (
          <span>
            {barcodeWaarde
              ? <>
                  Barcode (Code 128) op basis van{" "}
                  <strong>{artikel.barcode ? "het barcodesveld" : "de artikelcode"}</strong> ({barcodeWaarde}).
                  Klik op <strong>Afdrukken</strong> en stel het papierformaat in op{" "}
                  <strong>{barcodeFmt.breedte} × {barcodeFmt.hoogte} mm</strong>.
                  Zet marges op <strong>0 mm</strong>.
                </>
              : <span className="text-red-700 font-medium">
                  Dit artikel heeft geen artikelcode of barcode. Vul eerst een artikelcode of barcode in via de detailpagina.
                </span>
            }
          </span>
        )}
      </div>

      {/* ── Labelpreview ─────────────────────────────────────────────────── */}
      <div className="print-container p-8 flex flex-col items-center gap-5">
        {modus === "qr"
          ? labels.map((_, i) => (
              <ArtikelLabelInhoud key={i} artikel={artikel} fmt={qrFmt} />
            ))
          : labels.map((_, i) => (
              <BarcodeLabelInhoud key={i} artikel={artikel} fmt={barcodeFmt} locatieNaam={locatieNaam} />
            ))
        }

        {/* Toelichting onder preview — alleen op scherm */}
        <div className="no-print mt-2 text-xs text-muted-foreground text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            {modus === "qr" ? <Tag className="h-3.5 w-3.5" /> : <Barcode className="h-3.5 w-3.5" />}
            <span>
              Preview op schermschaal — afdruk past op {activeFmt.breedte} × {activeFmt.hoogte} mm label
            </span>
          </div>
          {aantalLabels > 1 && (
            <p>{aantalLabels} identieke labels worden afgedrukt (elk op een apart etiket)</p>
          )}
        </div>
      </div>
    </div>
  );
}
