import { useMemo, useState } from "react";
import { useListCrmContactpersonen } from "@workspace/api-client-react";
import { Building2 } from "lucide-react";

const BESLISROL_LABELS: Record<string, string> = {
  beslisser: "Beslisser",
  beinvloeder: "Beinvloeder",
  inkoper: "Inkoper",
  technisch_adviseur: "Technisch adviseur",
  projectmanager: "Projectmanager",
  onbekend: "Onbekend",
};

const BESLISROL_KLEUR: Record<string, string> = {
  beslisser: "#dc2626",
  beinvloeder: "#ea580c",
  inkoper: "#ca8a04",
  technisch_adviseur: "#2563eb",
  projectmanager: "#7c3aed",
  onbekend: "#64748b",
};

const STERKTE_STIJL: Record<string, { breedte: number; streep: string; opaciteit: number; label: string }> = {
  sterk: { breedte: 3, streep: "0", opaciteit: 0.9, label: "Sterk" },
  normaal: { breedte: 2, streep: "0", opaciteit: 0.6, label: "Normaal" },
  zwak: { breedte: 1.5, streep: "4 3", opaciteit: 0.45, label: "Zwak" },
  onbekend: { breedte: 1, streep: "2 4", opaciteit: 0.3, label: "Onbekend" },
};

function initialen(naam: string): string {
  const delen = naam.trim().split(/\s+/);
  if (delen.length === 1) return delen[0].slice(0, 2).toUpperCase();
  return (delen[0][0] + delen[delen.length - 1][0]).toUpperCase();
}

export function CrmRelatienetwerk({ klantId, klantNaam }: { klantId: number; klantNaam: string }) {
  const { data: contacten = [], isLoading } = useListCrmContactpersonen(klantId);
  const [actief, setActief] = useState<number | null>(null);

  const breedte = 640;
  const hoogte = 380;
  const cx = breedte / 2;
  const cy = hoogte / 2;

  const knopen = useMemo(() => {
    const n = contacten.length;
    if (n === 0) return [];
    const straalX = breedte / 2 - 90;
    const straalY = hoogte / 2 - 60;
    return contacten.map((c, i) => {
      const hoek = (i / n) * Math.PI * 2 - Math.PI / 2;
      return {
        contact: c,
        x: cx + Math.cos(hoek) * straalX,
        y: cy + Math.sin(hoek) * straalY,
      };
    });
  }, [contacten, cx, cy]);

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  }
  if (contacten.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nog geen contactpersonen om een netwerk te tonen.</p>
    );
  }

  const aanwezigeRollen = Array.from(
    new Set(contacten.map((c) => (c.beslisrol as string | null) ?? "onbekend")),
  );

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relatienetwerk</p>
      <div className="overflow-hidden rounded-lg border bg-white">
        <svg viewBox={`0 0 ${breedte} ${hoogte}`} className="h-auto w-full" role="img" aria-label={`Relatienetwerk van ${klantNaam}`}>
          {knopen.map(({ contact, x, y }) => {
            const sterkte = (contact.relatiesterkte as string | null) ?? "onbekend";
            const stijl = STERKTE_STIJL[sterkte] ?? STERKTE_STIJL.onbekend;
            const isActief = actief === contact.id;
            return (
              <line
                key={`lijn-${contact.id}`}
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={isActief ? "#f23b0d" : "#94a3b8"}
                strokeWidth={stijl.breedte}
                strokeDasharray={stijl.streep}
                strokeOpacity={isActief ? 1 : stijl.opaciteit}
              />
            );
          })}

          {/* Centrale organisatie-knoop */}
          <g>
            <circle cx={cx} cy={cy} r={40} fill="#212631" />
            <text x={cx} y={cy - 2} textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="600">
              {klantNaam.length > 14 ? klantNaam.slice(0, 13) + "…" : klantNaam}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" fill="#94a3b8" fontSize="8">
              Organisatie
            </text>
          </g>

          {/* Contactpersoon-knopen */}
          {knopen.map(({ contact, x, y }) => {
            const rol = (contact.beslisrol as string | null) ?? "onbekend";
            const kleur = BESLISROL_KLEUR[rol] ?? BESLISROL_KLEUR.onbekend;
            const isActief = actief === contact.id;
            return (
              <g
                key={`knoop-${contact.id}`}
                onMouseEnter={() => setActief(contact.id)}
                onMouseLeave={() => setActief((a) => (a === contact.id ? null : a))}
                style={{ cursor: "pointer" }}
              >
                <circle cx={x} cy={y} r={isActief ? 26 : 22} fill={kleur} stroke="#ffffff" strokeWidth={2} />
                <text x={x} y={y + 4} textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="600">
                  {initialen(contact.naam)}
                </text>
                <text x={x} y={y + 38} textAnchor="middle" fill="#334155" fontSize="10" fontWeight="500">
                  {contact.naam.length > 18 ? contact.naam.slice(0, 17) + "…" : contact.naam}
                </text>
                {contact.functie ? (
                  <text x={x} y={y + 50} textAnchor="middle" fill="#94a3b8" fontSize="8">
                    {contact.functie.length > 22 ? contact.functie.slice(0, 21) + "…" : contact.functie}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {aanwezigeRollen.map((rol) => (
          <span key={rol} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BESLISROL_KLEUR[rol] ?? BESLISROL_KLEUR.onbekend }} />
            {BESLISROL_LABELS[rol] ?? rol}
          </span>
        ))}
        <span className="mx-1 text-muted-foreground/50">|</span>
        <span>Lijndikte = relatiesterkte</span>
      </div>
    </div>
  );
}
