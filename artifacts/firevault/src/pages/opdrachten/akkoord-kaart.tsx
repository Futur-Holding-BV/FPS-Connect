// AKKOORD_01 — akkoordpoort-kaart op de opdrachtpagina.
// Toont of de opdracht "werkbaar" is (akkoord vastgelegd op grond A/B/C),
// laat het akkoord vastleggen, condities bijwerken en (hoofdbeheerder)
// intrekken. AI leest een opdrachtbevestiging en stelt velden voor met
// vindplaats — de mens bevestigt (voorstellen-dan-bevestigen).
import { useState } from "react";
import {
  useGetOpdrachtAkkoord,
  useLegAkkoordVast,
  useTrekAkkoordIn,
  useUpdateOpdrachtCondities,
  useAkkoordAiVoorstel,
  getGetOpdrachtAkkoordQueryKey,
} from "@workspace/api-client-react";
import type { OpdrachtAkkoord, AkkoordVastleggenInputGrond } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { ShieldCheck, ShieldAlert, Sparkles, Undo2 } from "lucide-react";

const GROND_LABELS: Record<string, string> = {
  ondertekening: "A — Digitale ondertekening offerte",
  opdrachtbevestiging: "B — Opdrachtbevestiging van de klant",
  vrijgave_pl: "C — Vrijgave door projectleider",
};

type ConditieVeld =
  | "betaaltermijn_dagen" | "garantietermijn" | "meerwerk"
  | "oplevering" | "boete_korting" | "voorwaarden_tekst";

const CONDITIE_LABELS: Record<ConditieVeld, string> = {
  betaaltermijn_dagen: "Betaaltermijn (dagen)",
  garantietermijn: "Garantietermijn",
  meerwerk: "Meerwerkafspraak",
  oplevering: "Oplevering",
  boete_korting: "Boete/korting",
  voorwaarden_tekst: "Voorwaarden",
};

export function AkkoordKaart({ opdrachtId, kanSchrijven, isHoofdbeheerder }: {
  opdrachtId: number;
  kanSchrijven: boolean;
  isHoofdbeheerder: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: akkoord, isLoading } = useGetOpdrachtAkkoord(opdrachtId);
  const [open, setOpen] = useState(false);
  const [intrekOpen, setIntrekOpen] = useState(false);
  const [reden, setReden] = useState("");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getGetOpdrachtAkkoordQueryKey(opdrachtId) });

  const intrekken = useTrekAkkoordIn({
    mutation: {
      onSuccess: () => { invalidate(); setIntrekOpen(false); setReden(""); toast({ title: "Akkoord ingetrokken" }); },
      onError: (e: unknown) => toast({ title: "Intrekken mislukt", description: foutTekst(e), variant: "destructive" }),
    },
  });

  if (isLoading || !akkoord) return null;
  const heeftAkkoord = !!akkoord.akkoord_grond;

  return (
    <Card className={heeftAkkoord ? "border-emerald-200" : "border-amber-300 bg-amber-50/40"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          {heeftAkkoord ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-amber-600" />}
          Akkoord opdrachtgever
          {heeftAkkoord ? (
            <Badge variant="secondary" className="text-muted-foreground">
              {GROND_LABELS[akkoord.akkoord_grond!] ?? akkoord.akkoord_grond}
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200">Nog niet werkbaar</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!heeftAkkoord && (
          <p className="text-sm text-muted-foreground">
            Zonder vastgelegd akkoord kunnen er geen uren op deze opdracht geboekt worden en
            kan er niet ingekocht worden. Leg het akkoord vast op één van de drie gronden.
          </p>
        )}
        {heeftAkkoord && (
          <div className="text-sm space-y-1">
            {akkoord.akkoord_op && (
              <p className="text-muted-foreground">
                Vastgelegd op {new Date(akkoord.akkoord_op).toLocaleDateString("nl-NL")}
                {akkoord.akkoord_herkomst ? ` — ${akkoord.akkoord_herkomst}` : ""}
              </p>
            )}
            <ConditieOverzicht akkoord={akkoord} />
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          {!heeftAkkoord && kanSchrijven && (
            <Button size="sm" onClick={() => setOpen(true)}>Akkoord vastleggen</Button>
          )}
          {heeftAkkoord && isHoofdbeheerder && (
            <Button size="sm" variant="outline" onClick={() => setIntrekOpen(true)}>
              <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Intrekken
            </Button>
          )}
        </div>
      </CardContent>

      {open && (
        <AkkoordVastleggenDialog
          opdrachtId={opdrachtId}
          onClose={() => setOpen(false)}
          onDone={() => { invalidate(); setOpen(false); }}
        />
      )}

      <Dialog open={intrekOpen} onOpenChange={setIntrekOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Akkoord intrekken</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Intrekken maakt de opdracht weer niet-werkbaar. Geef een reden op (auditspoor).
          </p>
          <Textarea value={reden} onChange={(e) => setReden(e.target.value)} placeholder="Reden" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIntrekOpen(false)}>Annuleren</Button>
            <Button
              variant="destructive"
              disabled={!reden.trim() || intrekken.isPending}
              onClick={() => intrekken.mutate({ id: opdrachtId, data: { reden: reden.trim() } })}
            >
              Intrekken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ConditieOverzicht({ akkoord }: { akkoord: OpdrachtAkkoord }) {
  const items: Array<[string, string]> = [];
  if (akkoord.conditie_betaaltermijn_dagen != null) items.push(["Betaaltermijn", `${akkoord.conditie_betaaltermijn_dagen} dagen`]);
  if (akkoord.conditie_garantietermijn) items.push(["Garantie", akkoord.conditie_garantietermijn]);
  if (akkoord.conditie_meerwerk) items.push(["Meerwerk", akkoord.conditie_meerwerk]);
  if (akkoord.conditie_oplevering) items.push(["Oplevering", akkoord.conditie_oplevering]);
  if (akkoord.conditie_boete_korting) items.push(["Boete/korting", akkoord.conditie_boete_korting]);
  if (akkoord.conditie_voorwaarden_tekst) items.push(["Voorwaarden", akkoord.conditie_voorwaarden_tekst]);
  if (items.length === 0) return null;
  return (
    <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <p key={k}><span className="text-muted-foreground">{k}:</span> {v}</p>
      ))}
    </div>
  );
}

function foutTekst(e: unknown): string {
  const r = e as { response?: { data?: { error?: string } } };
  return r?.response?.data?.error ?? "Onbekende fout";
}

function AkkoordVastleggenDialog({ opdrachtId, onClose, onDone }: {
  opdrachtId: number; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [grond, setGrond] = useState<AkkoordVastleggenInputGrond>("opdrachtbevestiging");
  const [documentId, setDocumentId] = useState("");
  const [herkomst, setHerkomst] = useState("");
  const [condities, setCondities] = useState<Record<ConditieVeld, string>>({
    betaaltermijn_dagen: "", garantietermijn: "", meerwerk: "",
    oplevering: "", boete_korting: "", voorwaarden_tekst: "",
  });
  const [vindplaatsen, setVindplaatsen] = useState<Record<string, string>>({});
  const [onzeker, setOnzeker] = useState<string[]>([]);

  const aiVoorstel = useAkkoordAiVoorstel({
    mutation: {
      onSuccess: (r) => {
        if (!r.voorstel) { toast({ title: "Geen voorstel", description: "Het document leverde geen bruikbare velden op." }); return; }
        if (!r.is_opdrachtbevestiging) {
          toast({ title: "Let op", description: "De AI herkent dit document niet met zekerheid als opdrachtbevestiging.", variant: "destructive" });
        }
        const v = r.voorstel;
        setCondities((c) => ({
          ...c,
          betaaltermijn_dagen: v.betaaltermijn_dagen != null ? String(v.betaaltermijn_dagen) : c.betaaltermijn_dagen,
          garantietermijn: v.garantietermijn ?? c.garantietermijn,
          meerwerk: v.meerwerk ?? c.meerwerk,
          oplevering: v.oplevering ?? c.oplevering,
          boete_korting: v.boete_korting ?? c.boete_korting,
          voorwaarden_tekst: v.voorwaarden_tekst ?? c.voorwaarden_tekst,
        }));
        setVindplaatsen(v.vindplaatsen ?? {});
        setOnzeker(v.onzekere_velden ?? []);
        toast({ title: "AI-voorstel ingevuld", description: "Controleer de velden en bevestig zelf." });
      },
      onError: (e: unknown) => toast({ title: "AI-analyse mislukt", description: foutTekst(e), variant: "destructive" }),
    },
  });

  const vastleggen = useLegAkkoordVast({
    mutation: {
      onSuccess: () => { toast({ title: "Akkoord vastgelegd" }); onDone(); },
      onError: (e: unknown) => toast({ title: "Vastleggen mislukt", description: foutTekst(e), variant: "destructive" }),
    },
  });

  const docIdNum = parseInt(documentId, 10);

  const submit = () => {
    vastleggen.mutate({
      id: opdrachtId,
      data: {
        grond,
        document_id: grond === "opdrachtbevestiging" && !isNaN(docIdNum) ? docIdNum : null,
        herkomst: grond === "vrijgave_pl" ? (herkomst.trim() || null) : null,
        condities: {
          betaaltermijn_dagen: condities.betaaltermijn_dagen.trim() !== "" ? parseInt(condities.betaaltermijn_dagen, 10) : null,
          garantietermijn: condities.garantietermijn.trim() || null,
          meerwerk: condities.meerwerk.trim() || null,
          oplevering: condities.oplevering.trim() || null,
          boete_korting: condities.boete_korting.trim() || null,
          voorwaarden_tekst: condities.voorwaarden_tekst.trim() || null,
        },
      },
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Akkoord vastleggen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Grond</Label>
            <div className="space-y-1">
              {(Object.keys(GROND_LABELS) as AkkoordVastleggenInputGrond[]).map((g) => (
                <label key={g} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={grond === g} onChange={() => setGrond(g)} />
                  {GROND_LABELS[g]}
                </label>
              ))}
            </div>
            {grond === "ondertekening" && (
              <p className="text-xs text-muted-foreground">
                Alleen mogelijk als de gekoppelde offerte digitaal ondertekend is; dit wordt bij vastleggen gecontroleerd.
              </p>
            )}
          </div>

          {grond === "opdrachtbevestiging" && (
            <div className="space-y-1.5">
              <Label>Document-ID van de opdrachtbevestiging</Label>
              <div className="flex gap-2">
                <Input value={documentId} onChange={(e) => setDocumentId(e.target.value)} placeholder="bv. 123 (uit de documentbibliotheek)" />
                <Button
                  type="button" variant="outline" size="sm" className="shrink-0"
                  disabled={isNaN(docIdNum) || aiVoorstel.isPending}
                  onClick={() => aiVoorstel.mutate({ id: opdrachtId, data: { document_id: docIdNum } })}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  {aiVoorstel.isPending ? "Analyseren…" : "AI-voorstel"}
                </Button>
              </div>
            </div>
          )}

          {grond === "vrijgave_pl" && (
            <div className="space-y-1.5">
              <Label>Herkomst van de vrijgave (verplicht)</Label>
              <Input value={herkomst} onChange={(e) => setHerkomst(e.target.value)} placeholder='bv. "telefonisch akkoord J. Jansen 11-08"' />
            </div>
          )}

          <div className="space-y-2">
            <Label>Condities</Label>
            {(Object.keys(CONDITIE_LABELS) as ConditieVeld[]).map((veld) => (
              <div key={veld} className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-40 shrink-0">{CONDITIE_LABELS[veld]}</span>
                  <Input
                    className={onzeker.includes(veld) ? "border-amber-400 bg-amber-50" : ""}
                    value={condities[veld]}
                    onChange={(e) => setCondities((c) => ({ ...c, [veld]: e.target.value }))}
                  />
                </div>
                {vindplaatsen[veld] && (
                  <p className="text-[11px] text-amber-700 ml-[10.5rem]">Vindplaats: {vindplaatsen[veld]}</p>
                )}
              </div>
            ))}
            {onzeker.length > 0 && (
              <p className="text-xs text-amber-700">Geel gemarkeerde velden zijn AI-voorstellen waarover de AI onzeker is — controleer ze.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button
            onClick={submit}
            disabled={
              vastleggen.isPending ||
              (grond === "opdrachtbevestiging" && isNaN(docIdNum)) ||
              (grond === "vrijgave_pl" && !herkomst.trim())
            }
          >
            Vastleggen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AkkoordKaart;
