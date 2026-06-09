import { useParams, Link } from "wouter";
import { useGetVoorziening, getGetVoorzieningQueryKey } from "@workspace/api-client-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { useRef } from "react";

const TYPEN: Record<string, string> = {
  branddeur: "Branddeur",
  doorvoering: "Doorvoering",
  brandklep: "Brandklep",
  kitvoeg: "Kitvoeg",
  manchet: "Manchet",
  brandwerend_glas: "Brandwerend Glas",
  coating: "Coating/Bekleding",
  luik: "Luik",
  plaatconstructie: "Plaatconstructie",
  schuifdeur: "Schuifdeur",
  puiconstructie: "Puiconstructie",
  dakdoorvoer: "Dakdoorvoer",
};

const STATUSKLEUR: Record<string, { bg: string; text: string; label: string }> = {
  goedgekeurd:   { bg: "#dcfce7", text: "#166534", label: "Gereed" },
  afgekeurd:     { bg: "#fee2e2", text: "#991b1b", label: "Afgekeurd" },
  in_onderhoud:  { bg: "#ffedd5", text: "#9a3412", label: "In onderhoud" },
  in_uitvoering: { bg: "#dbeafe", text: "#1e40af", label: "In uitvoering" },
  concept:       { bg: "#f1f5f9", text: "#475569", label: "Concept" },
};

function QrLabel({ voorziening }: { voorziening: any }) {
  const qrUrl = `${window.location.origin}/voorzieningen/${voorziening.id}`;
  const status = STATUSKLEUR[voorziening.status ?? "concept"];

  return (
    <div
      className="qr-label"
      style={{
        width: 320,
        border: "2px solid #1e293b",
        borderRadius: 8,
        padding: "16px",
        backgroundColor: "#ffffff",
        fontFamily: "Inter, sans-serif",
        pageBreakInside: "avoid",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 10, borderBottom: "1.5px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: "#e8280a", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", letterSpacing: "-0.01em" }}>FPS Brandpreventie</span>
        </div>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 99,
          backgroundColor: status.bg,
          color: status.text,
        }}>
          {status.label}
        </span>
      </div>

      {/* QR + info naast elkaar */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {/* QR code */}
        <div style={{ flexShrink: 0, border: "1px solid #e2e8f0", borderRadius: 6, padding: 4, backgroundColor: "#fff" }}>
          <QRCodeSVG
            value={qrUrl}
            size={100}
            level="M"
            includeMargin={false}
          />
        </div>

        {/* Object info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            {voorziening.objectnummer}
          </div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2, marginBottom: 8 }}>
            {TYPEN[voorziening.type] ?? voorziening.type}
            {voorziening.classificatie && ` • EI ${voorziening.classificatie}`}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {voorziening.gebouw_naam && (
              <div style={{ display: "flex", gap: 4, fontSize: 11 }}>
                <span style={{ color: "#94a3b8", minWidth: 52 }}>Gebouw</span>
                <span style={{ color: "#1e293b", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{voorziening.gebouw_naam}</span>
              </div>
            )}
            {voorziening.verdieping_naam && (
              <div style={{ display: "flex", gap: 4, fontSize: 11 }}>
                <span style={{ color: "#94a3b8", minWidth: 52 }}>Verdieping</span>
                <span style={{ color: "#1e293b", fontWeight: 500 }}>{voorziening.verdieping_naam}</span>
              </div>
            )}
            {voorziening.ruimte && (
              <div style={{ display: "flex", gap: 4, fontSize: 11 }}>
                <span style={{ color: "#94a3b8", minWidth: 52 }}>Ruimte</span>
                <span style={{ color: "#1e293b", fontWeight: 500 }}>{voorziening.ruimte}</span>
              </div>
            )}
            {voorziening.installatie_datum && (
              <div style={{ display: "flex", gap: 4, fontSize: 11 }}>
                <span style={{ color: "#94a3b8", minWidth: 52 }}>Installatie</span>
                <span style={{ color: "#1e293b", fontWeight: 500 }}>
                  {new Date(voorziening.installatie_datum).toLocaleDateString("nl-NL")}
                </span>
              </div>
            )}
            {voorziening.volgende_inspectie && (
              <div style={{ display: "flex", gap: 4, fontSize: 11 }}>
                <span style={{ color: "#94a3b8", minWidth: 52 }}>Inspectie</span>
                <span style={{ color: "#1e293b", fontWeight: 500 }}>
                  {new Date(voorziening.volgende_inspectie).toLocaleDateString("nl-NL")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* URL footer */}
      <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
          {qrUrl}
        </span>
        <span style={{ fontSize: 9, color: "#cbd5e1" }}>fps-brandpreventie.nl</span>
      </div>
    </div>
  );
}

export default function VoorzieningQr() {
  const { id } = useParams<{ id: string }>();
  const printRef = useRef<HTMLDivElement>(null);
  const { data: voorziening, isLoading } = useGetVoorziening(Number(id), {
    query: { enabled: !!id, queryKey: getGetVoorzieningQueryKey(Number(id)) },
  });

  function afdrukken() {
    window.print();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Laden...
      </div>
    );
  }

  if (!voorziening) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center text-muted-foreground">
        Voorziening niet gevonden.
      </div>
    );
  }

  return (
    <>
      {/* Print-only stijlen */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: fixed; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 1.5cm; size: A4; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Navigatie — verborgen bij afdruk */}
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-3">
            <Link href={`/voorzieningen/${id}`}>
              <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">QR-label</h1>
              <p className="text-sm text-muted-foreground">{voorziening.objectnummer} — {TYPEN[voorziening.type ?? ""] ?? voorziening.type}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={afdrukken}>
              <Printer className="h-4 w-4 mr-2" /> Afdrukken
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="no-print">
          <p className="text-sm text-muted-foreground mb-4">
            Voorvertoning van het QR-label. Gebruik "Afdrukken" voor een fysiek label of sla op als PDF.
          </p>
          <div className="flex justify-center">
            <div ref={printRef}>
              <QrLabel voorziening={voorziening} />
            </div>
          </div>
        </div>

        {/* Velvel met meerdere labels (afdrukbaar) */}
        <div id="print-area" className="hidden print:block">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: 0 }}>
            {/* 6 kopieën per A4 vel */}
            {Array.from({ length: 6 }).map((_, i) => (
              <QrLabel key={i} voorziening={voorziening} />
            ))}
          </div>
        </div>

        {/* Uitleg scherm */}
        <div className="no-print grid grid-cols-3 gap-4 pt-4 border-t">
          {[
            { stap: "1", titel: "Afdrukken", tekst: "Klik op Afdrukken of gebruik Ctrl+P. Kies 'Opslaan als PDF' voor digitale opslag." },
            { stap: "2", titel: "Uitknippen", tekst: "Knip het label bij langs de rand. Het formaat is geschikt voor standaard labelprinters." },
            { stap: "3", titel: "Bevestigen", tekst: "Plak het label zichtbaar op of naast de voorziening. Gebruik een weersbestendige folie." },
          ].map((item) => (
            <div key={item.stap} className="bg-muted/40 rounded-lg p-4">
              <div className="text-2xl font-bold text-primary mb-1">{item.stap}</div>
              <div className="font-semibold text-sm mb-1">{item.titel}</div>
              <p className="text-xs text-muted-foreground">{item.tekst}</p>
            </div>
          ))}
        </div>

        {/* Bulk QR voor heel gebouw */}
        {voorziening.gebouw_naam && (
          <div className="no-print bg-muted/30 rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">Bulk QR-labels voor {voorziening.gebouw_naam}</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Genereer QR-labels voor alle voorzieningen in dit gebouw op een A4-vel.
              </p>
            </div>
            <Button variant="outline" size="sm" disabled>
              Binnenkort beschikbaar
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
