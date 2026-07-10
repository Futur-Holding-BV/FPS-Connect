import { useState } from "react";
import {
  useGetMagazijnDashboard,
  useGetMagazijnInstellingen,
  useUpdateMagazijnInstellingen,
  useListMagazijnSnoozes,
  useSnoozeMagazijnArtikel,
  useVerwijderMagazijnSnooze,
  getGetMagazijnInstellingenQueryKey,
  getListMagazijnSnoozesQueryKey,
  getGetMagazijnDashboardQueryKey,
  getGetMagazijnSignaleringQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { AlertTriangle, Package, Archive, ShoppingCart, TrendingUp, Euro, Clock, Settings2, X } from "lucide-react";
import { Link } from "wouter";

function StatKaart({
  titel, waarde, icoon: Icoon, kleur, link,
}: {
  titel: string;
  waarde: string;
  icoon: React.ElementType;
  kleur: string;
  link?: string;
}) {
  const inhoud = (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-lg ${kleur}`}>
            <Icoon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{titel}</p>
            <p className="text-2xl font-bold">{waarde}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (link) return <Link href={link}>{inhoud}</Link>;
  return inhoud;
}

function formatBedrag(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function InstellingenKaart() {
  const { data } = useGetMagazijnInstellingen();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uur, setUur] = useState<string | null>(null);
  const [minuut, setMinuut] = useState<string | null>(null);
  const [marge, setMarge] = useState<string | null>(null);

  const mutatie = useUpdateMagazijnInstellingen({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMagazijnInstellingenQueryKey() });
        setUur(null);
        setMinuut(null);
        setMarge(null);
        toast({ title: "Instellingen opgeslagen" });
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  if (!data) return null;

  const huidigUur = uur ?? String(data.signalering_uur);
  const huidigMinuut = minuut ?? String(data.signalering_minuut).padStart(2, "0");
  const huidigMarge = marge ?? String(data.signalering_marge);

  const opslaan = () => {
    mutatie.mutate({
      data: {
        signalering_uur: Number(huidigUur),
        signalering_minuut: Number(huidigMinuut),
        signalering_marge: Number(huidigMarge),
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          Signalering-instellingen
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Tijdstip waarop de dagelijkse e-mail met kritieke artikelen wordt verstuurd, en een marge bovenop de
          minimumvoorraad om eerder gewaarschuwd te worden.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="signalering-uur">Uur</Label>
            <Input
              id="signalering-uur"
              type="number"
              min={0}
              max={23}
              className="w-20"
              value={huidigUur}
              onChange={(e) => setUur(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="signalering-minuut">Minuut</Label>
            <Input
              id="signalering-minuut"
              type="number"
              min={0}
              max={59}
              className="w-20"
              value={huidigMinuut}
              onChange={(e) => setMinuut(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="signalering-marge">Marge (extra buffer)</Label>
            <Input
              id="signalering-marge"
              type="number"
              min={0}
              className="w-28"
              value={huidigMarge}
              onChange={(e) => setMarge(e.target.value)}
            />
          </div>
          <Button onClick={opslaan} disabled={mutatie.isPending}>
            Opslaan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SnoozeKnop({ artikelId, artikelNaam }: { artikelId: number; artikelNaam: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalideer = () => {
    queryClient.invalidateQueries({ queryKey: getListMagazijnSnoozesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMagazijnDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMagazijnSignaleringQueryKey() });
  };

  const mutatie = useSnoozeMagazijnArtikel({
    mutation: {
      onSuccess: () => {
        invalideer();
        setOpen(false);
        toast({ title: `Signalering voor "${artikelNaam}" tijdelijk onderdrukt` });
      },
      onError: () => toast({ title: "Snoozen mislukt", variant: "destructive" }),
    },
  });

  const snooze = (dagen: number) => {
    mutatie.mutate({ id: artikelId, data: { dagen } });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Signalering-mail tijdelijk uitzetten">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2" align="end">
        <p className="text-sm font-medium">Mail onderdrukken voor</p>
        <div className="flex flex-col gap-1">
          <Button variant="outline" size="sm" onClick={() => snooze(7)} disabled={mutatie.isPending}>7 dagen</Button>
          <Button variant="outline" size="sm" onClick={() => snooze(14)} disabled={mutatie.isPending}>14 dagen</Button>
          <Button variant="outline" size="sm" onClick={() => snooze(30)} disabled={mutatie.isPending}>30 dagen</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GesnoozedeArtikelen() {
  const { data } = useListMagazijnSnoozes();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalideer = () => {
    queryClient.invalidateQueries({ queryKey: getListMagazijnSnoozesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMagazijnDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMagazijnSignaleringQueryKey() });
  };

  const mutatie = useVerwijderMagazijnSnooze({
    mutation: {
      onSuccess: () => {
        invalideer();
        toast({ title: "Snooze opgeheven" });
      },
      onError: () => toast({ title: "Opheffen mislukt", variant: "destructive" }),
    },
  });

  if (!data || data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Tijdelijk onderdrukte signaleringen
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{s.artikel_naam}</p>
                <p className="text-xs text-muted-foreground">
                  Onderdrukt tot {new Date(s.gesnoozed_tot).toLocaleDateString("nl-NL")}
                  {s.reden ? ` — ${s.reden}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="Snooze opheffen"
                onClick={() => mutatie.mutate({ id: s.artikel_id })}
                disabled={mutatie.isPending}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function MagazijnDashboard() {
  const { heeftNiveau } = useBevoegdheid();
  const kanLezen = heeftNiveau("magazijn", 1);
  const kanSnoozen = heeftNiveau("magazijn", 2);
  const kanBeheren = heeftNiveau("magazijn", 4);
  const { data, isLoading } = useGetMagazijnDashboard();

  if (!kanLezen) return <div className="p-6"><p className="text-muted-foreground">Geen toegang tot magazijn.</p></div>;
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Magazijn dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Magazijn dashboard</h1>

      {/* Stat-kaarten */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatKaart
          titel="Totale voorraadwaarde"
          waarde={formatBedrag(data?.totaal_waarde ?? 0)}
          icoon={Euro}
          kleur="bg-blue-100 text-blue-700"
          link="/magazijn/voorraad"
        />
        <StatKaart
          titel="Onder minimumvoorraad"
          waarde={String(data?.artikelen_onder_minimum ?? 0)}
          icoon={AlertTriangle}
          kleur={(data?.artikelen_onder_minimum ?? 0) > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}
          link="/magazijn/voorraad"
        />
        <StatKaart
          titel="Gereserveerd"
          waarde={String(data?.totaal_gereserveerd ?? 0)}
          icoon={Archive}
          kleur="bg-amber-100 text-amber-700"
          link="/magazijn/reserveringen"
        />
        <StatKaart
          titel="Besteld / onderweg"
          waarde={String(data?.totaal_besteld ?? 0)}
          icoon={ShoppingCart}
          kleur="bg-purple-100 text-purple-700"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kritieke artikelen */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Kritieke voorraad
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.kritieke_artikelen ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Alle artikelen boven minimumvoorraad.</p>
            ) : (
              <div className="space-y-2">
                {data!.kritieke_artikelen.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <Link href={`/magazijn/artikelen/${a.id}`} className="text-sm font-medium hover:underline">
                      {a.naam}
                    </Link>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs">
                        {a.hoeveelheid} / {a.minimum_voorraad} {a.eenheid}
                      </Badge>
                      {kanSnoozen && a.id !== undefined && (
                        <SnoozeKnop artikelId={a.id} artikelNaam={a.naam ?? ""} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Meest verbruikt */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Meest verbruikt (30 dagen)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.meest_verbruikt ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen uitgifte geregistreerd.</p>
            ) : (
              <div className="space-y-2">
                {data!.meest_verbruikt.map((a, i) => (
                  <div key={a.artikel_id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                      <span className="text-sm font-medium">{a.naam}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {a.totaal} {a.eenheid}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {kanSnoozen && <GesnoozedeArtikelen />}
      {kanBeheren && <InstellingenKaart />}
    </div>
  );
}
