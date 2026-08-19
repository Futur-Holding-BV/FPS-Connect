// Acceptatieregister (REGISTER_01) — één regel per acceptatiepunt per opdracht.
// Vervangt het te grove vinkje-per-opdracht: per punt is zichtbaar of het
// gehaald, niet gebouwd, gebouwd-maar-onbewezen of wachtend op René is.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAcceptatieregister,
  useUpdateAcceptatiePunt,
  getListAcceptatieregisterQueryKey,
  type AcceptatiePunt,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  CircleHelp,
  UserRound,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type Stand = "gehaald" | "niet_gebouwd" | "onbewezen" | "wacht_op_rene";

const STAND_META: Record<Stand, { label: string; icon: typeof CheckCircle2; klasse: string }> = {
  gehaald: { label: "Gehaald", icon: CheckCircle2, klasse: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  niet_gebouwd: { label: "Niet gebouwd", icon: XCircle, klasse: "border-red-200 bg-red-50 text-red-700" },
  onbewezen: { label: "Gebouwd, onbewezen", icon: CircleHelp, klasse: "border-amber-200 bg-amber-50 text-amber-700" },
  wacht_op_rene: { label: "Wacht op René", icon: UserRound, klasse: "border-sky-200 bg-sky-50 text-sky-700" },
};

const STAND_VOLGORDE: Stand[] = ["niet_gebouwd", "onbewezen", "wacht_op_rene", "gehaald"];

function StandBadge({ stand }: { stand: string }) {
  const meta = STAND_META[(stand as Stand) in STAND_META ? (stand as Stand) : "onbewezen"];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1 whitespace-nowrap ${meta.klasse}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

function PuntRij({ punt }: { punt: AcceptatiePunt }) {
  const queryClient = useQueryClient();
  const update = useUpdateAcceptatiePunt();
  const [bewerken, setBewerken] = useState(false);
  const [bewijs, setBewijs] = useState(punt.bewijs_vindplaats ?? "");

  const ververs = () => queryClient.invalidateQueries({ queryKey: getListAcceptatieregisterQueryKey() });

  function zetStand(stand: Stand) {
    if (update.isPending || punt.stand === stand) return;
    update.mutate({ id: punt.id, data: { stand } }, { onSuccess: ververs });
  }

  function bewaarBewijs() {
    if (update.isPending) return;
    update.mutate(
      { id: punt.id, data: { bewijs_vindplaats: bewijs.trim() || null } },
      { onSuccess: () => { setBewerken(false); ververs(); } },
    );
  }

  return (
    <div className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm">
            <span className="font-medium text-muted-foreground mr-2">{punt.punt_nummer}.</span>
            {punt.omschrijving}
          </p>
          {punt.toelichting && <p className="text-xs italic text-muted-foreground/80">{punt.toelichting}</p>}
          {punt.bewijs_vindplaats && !bewerken && (
            <p className="text-xs text-muted-foreground">
              Bewijs: <span className="font-mono">{punt.bewijs_vindplaats}</span>
            </p>
          )}
          {bewerken && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Input
                value={bewijs}
                onChange={(e) => setBewijs(e.target.value)}
                placeholder="Vindplaats van het bewijs (script, meetdocument…)"
                className="h-8 max-w-md text-xs"
              />
              <Button type="button" size="sm" variant="outline" disabled={update.isPending} onClick={bewaarBewijs}>
                Opslaan
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setBewerken(false)}>
                Annuleren
              </Button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <StandBadge stand={punt.stand} />
          <div className="flex items-center gap-1">
            {STAND_VOLGORDE.map((s) => {
              const meta = STAND_META[s];
              const Icon = meta.icon;
              return (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={punt.stand === s ? "secondary" : "ghost"}
                  className="h-7 px-1.5"
                  title={meta.label}
                  disabled={update.isPending}
                  onClick={() => zetStand(s)}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              );
            })}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setBewerken((b) => !b)}
            >
              Bewijs
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OpdrachtKaart({ code, punten }: { code: string; punten: AcceptatiePunt[] }) {
  const nietGehaald = punten.filter((p) => p.stand !== "gehaald").length;
  const [open, setOpen] = useState(nietGehaald > 0);
  return (
    <Card>
      <CardHeader className="cursor-pointer py-3" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-mono">{code}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {punten.length} punten
          </span>
          {nietGehaald > 0 ? (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
              {nietGehaald} niet gehaald
            </Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              Alles gehaald
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="divide-y pt-0">
          {punten.map((p) => (
            <PuntRij key={p.id} punt={p} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export default function Acceptatieregister() {
  const { data, isLoading } = useListAcceptatieregister();
  const [filter, setFilter] = useState("");

  const groepen = useMemo(() => {
    const m = new Map<string, AcceptatiePunt[]>();
    (data ?? []).forEach((p) => {
      const lijst = m.get(p.opdracht_code) ?? [];
      lijst.push(p);
      m.set(p.opdracht_code, lijst);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  const zichtbaar = groepen.filter(([code]) => code.toLowerCase().includes(filter.toLowerCase()));

  const tellers = useMemo(() => {
    const t = { gehaald: 0, niet_gebouwd: 0, onbewezen: 0, wacht_op_rene: 0 };
    (data ?? []).forEach((p) => {
      if (p.stand in t) t[p.stand as Stand]++;
    });
    return t;
  }, [data]);
  const nietGehaaldTotaal = (data?.length ?? 0) - tellers.gehaald;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-lg">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 data-paginatitel className="text-2xl font-bold tracking-tight">Acceptatieregister</h1>
          <p className="text-sm text-muted-foreground">
            Per opdracht elk acceptatiepunt met de werkelijke stand: gehaald, niet gebouwd, gebouwd
            maar onbewezen, of wachtend op een handeling van René
          </p>
        </div>
      </div>

      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="flex flex-wrap items-center gap-6 py-4">
          <div>
            <div className="text-3xl font-bold leading-none text-amber-700">{nietGehaaldTotaal}</div>
            <div className="text-xs text-muted-foreground">punten nog niet gehaald</div>
          </div>
          {STAND_VOLGORDE.map((s) => {
            const meta = STAND_META[s];
            const Icon = meta.icon;
            return (
              <div key={s} className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${meta.klasse.split(" ").pop()}`} />
                <span className="text-sm">
                  <span className="font-semibold">{tellers[s]}</span>{" "}
                  <span className="text-muted-foreground">{meta.label.toLowerCase()}</span>
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter op opdrachtcode…"
        className="max-w-xs"
      />

      {isLoading && <p className="text-sm text-muted-foreground">Laden…</p>}
      {zichtbaar.map(([code, punten]) => (
        <OpdrachtKaart key={code} code={code} punten={punten} />
      ))}
    </div>
  );
}
