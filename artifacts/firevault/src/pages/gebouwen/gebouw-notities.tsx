// NOTITIE_01 — aantekeningenblok op de gebouwpagina.
// Eén handeling: typen en versturen. Losse regels, nieuwste bovenaan,
// nooit overschrijven. Doorgehaalde regels blijven zichtbaar.
import { useState } from "react";
import {
  useListGebouwNotities,
  getListGebouwNotitiesQueryKey,
  useCreateGebouwNotitie,
  useUpdateGebouwNotitie,
  useDeleteGebouwNotitie,
  type GebouwNotitie,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { StickyNote, Loader2, Send, Pencil, X, Check, Phone, Mail, Footprints } from "lucide-react";

const TYPE_OPTIES = [
  { waarde: "algemeen", label: "Algemeen" },
  { waarde: "telefoon", label: "Telefoon" },
  { waarde: "bezoek", label: "Bezoek" },
  { waarde: "mail", label: "Mail" },
] as const;

function TypeIcoon({ type }: { type: string }) {
  if (type === "telefoon") return <Phone className="h-3 w-3" aria-hidden />;
  if (type === "mail") return <Mail className="h-3 w-3" aria-hidden />;
  if (type === "bezoek") return <Footprints className="h-3 w-3" aria-hidden />;
  return null;
}

function formateerMoment(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" })} ${d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function GebouwNotities({ gebouwId }: { gebouwId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { heeftNiveau } = useBevoegdheid();
  const magDoorhalen = heeftNiveau("gebouwen", 4);

  const { data: notities, isLoading } = useListGebouwNotities(gebouwId, {
    query: { queryKey: getListGebouwNotitiesQueryKey(gebouwId) },
  });
  const aanmaken = useCreateGebouwNotitie();
  const bijwerken = useUpdateGebouwNotitie();
  const doorhalen = useDeleteGebouwNotitie();

  const [tekst, setTekst] = useState("");
  const [type, setType] = useState<string>("algemeen");
  const [bellerNaam, setBellerNaam] = useState("");
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [bewerkTekst, setBewerkTekst] = useState("");

  function ververs() {
    void queryClient.invalidateQueries({ queryKey: getListGebouwNotitiesQueryKey(gebouwId) });
  }

  function verstuur() {
    const schoon = tekst.trim();
    if (schoon === "" || aanmaken.isPending) return;
    aanmaken.mutate(
      {
        id: gebouwId,
        data: {
          tekst: schoon,
          type: type as "telefoon" | "bezoek" | "mail" | "algemeen",
          beller_naam: type === "telefoon" && bellerNaam.trim() !== "" ? bellerNaam.trim() : null,
        },
      },
      {
        onSuccess: () => {
          setTekst("");
          setBellerNaam("");
          setType("algemeen");
          ververs();
        },
        onError: () =>
          toast({ title: "Aantekening niet opgeslagen", variant: "destructive" }),
      },
    );
  }

  function bewaarBewerking(notitie: GebouwNotitie) {
    const schoon = bewerkTekst.trim();
    if (schoon === "" || bijwerken.isPending) return;
    bijwerken.mutate(
      { notitieId: notitie.id, data: { tekst: schoon } },
      {
        onSuccess: () => {
          setBewerkId(null);
          ververs();
        },
        onError: (fout) => {
          setBewerkId(null);
          ververs();
          const bericht =
            (fout as { message?: string })?.message ??
            "Aanpassen kan alleen binnen 15 minuten door de schrijver.";
          toast({ title: "Niet aangepast", description: bericht, variant: "destructive" });
        },
      },
    );
  }

  function haalDoor(notitie: GebouwNotitie) {
    doorhalen.mutate(
      { notitieId: notitie.id },
      {
        onSuccess: () => ververs(),
        onError: () => toast({ title: "Doorhalen mislukt", variant: "destructive" }),
      },
    );
  }

  return (
    <Card data-testid="card-gebouw-notities">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <StickyNote className="h-4 w-4" aria-hidden />
          Aantekeningen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                verstuur();
              }
            }}
            placeholder="Typ een aantekening en druk op Enter…"
            rows={2}
            data-testid="input-notitie-tekst"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-8 w-32" data-testid="select-notitie-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIES.map((t) => (
                  <SelectItem key={t.waarde} value={t.waarde}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {type === "telefoon" && (
              <Input
                value={bellerNaam}
                onChange={(e) => setBellerNaam(e.target.value)}
                placeholder="Naam beller (optioneel)"
                className="h-8 w-48"
                data-testid="input-notitie-beller"
              />
            )}
            <Button
              size="sm"
              onClick={verstuur}
              disabled={tekst.trim() === "" || aanmaken.isPending}
              data-testid="button-notitie-versturen"
            >
              {aanmaken.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              Versturen
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : !notities || notities.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-notities-leeg">
            Nog geen aantekeningen bij dit gebouw.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="lijst-notities">
            {notities.map((n) => (
              <li
                key={n.id}
                className="rounded-md border px-3 py-2"
                data-testid={`notitie-${n.id}`}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-semibold text-foreground cursor-default" data-testid={`notitie-${n.id}-initialen`}>
                        {n.initialen}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{n.gebruiker_naam}</TooltipContent>
                  </Tooltip>
                  <span>{formateerMoment(n.aangemaakt_op)}</span>
                  {n.type !== "algemeen" && (
                    <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
                      <TypeIcoon type={n.type} />
                      {TYPE_OPTIES.find((t) => t.waarde === n.type)?.label ?? n.type}
                      {n.type === "telefoon" && n.beller_naam ? ` · ${n.beller_naam}` : ""}
                    </Badge>
                  )}
                  {n.bewerkt_op && !n.verwijderd && <span className="italic">(aangepast)</span>}
                  <span className="ml-auto flex items-center gap-1">
                    {n.mag_bewerken && bewerkId !== n.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setBewerkId(n.id);
                          setBewerkTekst(n.tekst);
                        }}
                        aria-label="Aantekening aanpassen"
                        data-testid={`button-notitie-${n.id}-bewerken`}
                      >
                        <Pencil className="h-3 w-3" aria-hidden />
                      </Button>
                    )}
                    {magDoorhalen && !n.verwijderd && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => haalDoor(n)}
                        aria-label="Aantekening doorhalen"
                        data-testid={`button-notitie-${n.id}-doorhalen`}
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </Button>
                    )}
                  </span>
                </div>
                {bewerkId === n.id ? (
                  <div className="mt-1 flex items-center gap-2">
                    <Textarea
                      value={bewerkTekst}
                      onChange={(e) => setBewerkTekst(e.target.value)}
                      rows={2}
                      className="text-sm"
                      data-testid={`input-notitie-${n.id}-bewerk`}
                    />
                    <Button
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => bewaarBewerking(n)}
                      disabled={bijwerken.isPending}
                      aria-label="Opslaan"
                      data-testid={`button-notitie-${n.id}-opslaan`}
                    >
                      <Check className="h-3 w-3" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setBewerkId(null)}
                      aria-label="Annuleren"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </Button>
                  </div>
                ) : (
                  <p
                    className={`mt-1 whitespace-pre-wrap text-sm ${n.verwijderd ? "text-muted-foreground line-through" : ""}`}
                    data-testid={`notitie-${n.id}-tekst`}
                  >
                    {n.tekst}
                  </p>
                )}
                {n.verwijderd && (
                  <p className="mt-0.5 text-xs italic text-muted-foreground">
                    Doorgehaald door {n.verwijderd_door_naam ?? "onbekend"}
                    {n.verwijderd_op ? ` op ${formateerMoment(n.verwijderd_op)}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
