import { Award, Trophy } from "lucide-react";
import { useGetHallOfFame } from "@workspace/api-client-react";
import type { HallOfFameEntry } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

function achievementKleur(beloning: string | null | undefined): string {
  if (!beloning) return "#6b7280";
  if (beloning.includes("Legende")) return "#F23B0D";
  if (beloning.includes("Diamanten")) return "#4FC3F7";
  if (beloning.includes("Kristallen")) return "#00CED1";
  if (beloning.includes("Gouden")) return "#FFD700";
  if (beloning.includes("Zilveren")) return "#C0C0C0";
  if (beloning.includes("Bronzen")) return "#CD7F32";
  if (beloning.includes("Speciale")) return "#9B59B6";
  return "#6b7280";
}

function isTrophy(beloning: string | null | undefined): boolean {
  if (!beloning) return false;
  return (
    beloning.includes("beker") ||
    beloning.includes("Kristallen") ||
    beloning.includes("Diamanten") ||
    beloning.includes("Legende")
  );
}

function positieBadge(positie: number) {
  if (positie === 1) return { label: "1", achtergrond: "#FFD700", tekst: "#1a1a1a" };
  if (positie === 2) return { label: "2", achtergrond: "#C0C0C0", tekst: "#1a1a1a" };
  if (positie === 3) return { label: "3", achtergrond: "#CD7F32", tekst: "#1a1a1a" };
  return null;
}

function RijEntry({ entry }: { entry: HallOfFameEntry }) {
  const kleur = achievementKleur(entry.beloning);
  const badge = positieBadge(entry.positie);
  const isTop3 = entry.positie <= 3;

  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-colors ${
        isTop3 ? "bg-muted/60" : "hover:bg-muted/40"
      }`}
    >
      {badge ? (
        <div
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ background: badge.achtergrond, color: badge.tekst }}
        >
          {badge.label}
        </div>
      ) : (
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm text-muted-foreground font-medium bg-muted">
          {entry.positie}
        </div>
      )}

      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
        style={{
          background: `${kleur}22`,
          border: `1.5px solid ${kleur}`,
        }}
      >
        {isTrophy(entry.beloning) ? (
          <Trophy className="h-4 w-4" style={{ color: kleur }} />
        ) : (
          <Award className="h-4 w-4" style={{ color: kleur }} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {entry.medewerker_id ? (
          <Link
            href={`/personeel/${entry.medewerker_id}`}
            className="font-medium hover:underline underline-offset-2 truncate block"
          >
            {entry.naam}
          </Link>
        ) : (
          <span className="font-medium truncate block">{entry.naam}</span>
        )}
        {entry.rang ? (
          <span className="text-xs" style={{ color: kleur }}>
            {entry.rang}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Geen rang</span>
        )}
      </div>

      <div className="flex-shrink-0 text-right">
        <span className="text-sm font-semibold tabular-nums">
          {entry.spots_count.toLocaleString("nl-NL")}
        </span>
        <span className="text-xs text-muted-foreground ml-1">
          {entry.spots_count === 1 ? "Spot" : "Spots"}
        </span>
      </div>
    </div>
  );
}

export default function HallOfFamePagina() {
  const { data: ranglijst, isLoading, isError } = useGetHallOfFame();

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-[#FFD700]" />
        <div>
          <h1 className="text-2xl font-bold">Hall of Fame</h1>
          <p className="text-sm text-muted-foreground">
            Ranglijst monteurs op het aantal geplaatste Spots
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ranglijst</CardTitle>
        </CardHeader>
        <CardContent className="px-2">
          {isLoading && (
            <div className="space-y-2 px-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          )}

          {isError && (
            <p className="text-sm text-destructive px-4 py-8 text-center">
              Ranglijst kon niet worden geladen.
            </p>
          )}

          {!isLoading && !isError && (!ranglijst || ranglijst.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nog geen Spots geplaatst.</p>
            </div>
          )}

          {!isLoading && !isError && ranglijst && ranglijst.length > 0 && (
            <div className="space-y-1">
              {ranglijst.map((entry) => (
                <RijEntry key={entry.gebruiker_id} entry={entry} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
