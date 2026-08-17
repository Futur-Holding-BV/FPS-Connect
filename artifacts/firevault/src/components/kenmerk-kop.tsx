// NUMMER_01 — Prominente kenmerk-weergave voor detailpagina's onder Projectaanpak.
// Toont het unieke, automatisch berekende volgkenmerk (bv. BP-G156/C590/O405)
// zoals dat ook op de uitgaande documenten (offerte, factuur) staat.
// Het kenmerk wordt server-side berekend uit de actuele keten en is niet bewerkbaar.

interface KenmerkKopProps {
  /** Het berekende kenmerk, bv. "BP-G156/C590". Zonder waarde wordt niets getoond. */
  kenmerk?: string | null;
  /** Optionele toelichting in de tooltip, standaard de documentverwijzing. */
  toelichting?: string;
}

export function KenmerkKop({ kenmerk, toelichting }: KenmerkKopProps) {
  if (!kenmerk) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-sm font-bold tracking-wide text-foreground select-all shrink-0"
      title={toelichting ?? "Uniek kenmerk — staat ook op de uitgaande documenten (offerte/factuur). Automatisch berekend, niet bewerkbaar."}
      data-testid="kenmerk-kop"
    >
      <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-muted-foreground">Kenmerk</span>
      {kenmerk}
    </span>
  );
}
