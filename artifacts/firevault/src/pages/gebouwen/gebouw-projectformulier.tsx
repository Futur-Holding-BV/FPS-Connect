import { useEffect, useState } from "react";
import {
  useGetGebouwEmailSamenvatting,
  useUpdateGebouwEmailSamenvatting,
  useGenerateGebouwEmailSamenvatting,
  getGetGebouwEmailSamenvattingQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, ClipboardList, Building2, Phone, Handshake, ListChecks,
  CheckSquare, FileText, AlertTriangle, Users, ShieldCheck, Save,
  RefreshCw, Loader2, Pencil,
} from "lucide-react";
import { ContactpersoonRij } from "./gebouw-emails";

type VeldSleutel =
  | "opdrachtomschrijving"
  | "opdrachtgever"
  | "contactgegevens"
  | "afspraken"
  | "actiepunten"
  | "besluiten"
  | "tekeningen"
  | "risicos";

type FormState = Record<VeldSleutel, string>;

const VELDEN: { sleutel: VeldSleutel; titel: string; icoon: React.ReactNode; rijen: number }[] = [
  { sleutel: "opdrachtomschrijving", titel: "Opdrachtomschrijving", icoon: <ClipboardList className="h-4 w-4" />, rijen: 3 },
  { sleutel: "opdrachtgever", titel: "Opdrachtgever", icoon: <Building2 className="h-4 w-4" />, rijen: 2 },
  { sleutel: "contactgegevens", titel: "Contactgegevens", icoon: <Phone className="h-4 w-4" />, rijen: 2 },
  { sleutel: "afspraken", titel: "Gemaakte afspraken", icoon: <Handshake className="h-4 w-4" />, rijen: 3 },
  { sleutel: "actiepunten", titel: "Openstaande actiepunten", icoon: <ListChecks className="h-4 w-4" />, rijen: 3 },
  { sleutel: "besluiten", titel: "Besluiten", icoon: <CheckSquare className="h-4 w-4" />, rijen: 2 },
  { sleutel: "tekeningen", titel: "Tekeningen / bijlagen", icoon: <FileText className="h-4 w-4" />, rijen: 2 },
  { sleutel: "risicos", titel: "Risico's en aandachtspunten", icoon: <AlertTriangle className="h-4 w-4" />, rijen: 2 },
];

const leegFormulier = (): FormState => ({
  opdrachtomschrijving: "",
  opdrachtgever: "",
  contactgegevens: "",
  afspraken: "",
  actiepunten: "",
  besluiten: "",
  tekeningen: "",
  risicos: "",
});

function datum(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("nl-NL");
}

export function Projectformulier({
  gebouwId,
  isBeheerder,
}: {
  gebouwId: number;
  isBeheerder: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: samenvatting, isLoading } = useGetGebouwEmailSamenvatting(gebouwId);
  const update = useUpdateGebouwEmailSamenvatting();
  const genereer = useGenerateGebouwEmailSamenvatting();

  const [form, setForm] = useState<FormState>(leegFormulier);
  const [bewerken, setBewerken] = useState(false);
  const [versie, setVersie] = useState<string | null>(null);

  // Synchroniseer formulier met server-data wanneer een nieuwe versie binnenkomt
  // (en de beheerder niet midden in een bewerking zit).
  useEffect(() => {
    if (!samenvatting) return;
    const stempel = `${samenvatting.id}:${samenvatting.bijgewerkt_op}`;
    if (stempel === versie) return;
    if (bewerken) return;
    setForm({
      opdrachtomschrijving: samenvatting.opdrachtomschrijving ?? "",
      opdrachtgever: samenvatting.opdrachtgever ?? "",
      contactgegevens: samenvatting.contactgegevens ?? "",
      afspraken: samenvatting.afspraken ?? "",
      actiepunten: samenvatting.actiepunten ?? "",
      besluiten: samenvatting.besluiten ?? "",
      tekeningen: samenvatting.tekeningen ?? "",
      risicos: samenvatting.risicos ?? "",
    });
    setVersie(stempel);
  }, [samenvatting, versie, bewerken]);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getGetGebouwEmailSamenvattingQueryKey(gebouwId),
    });

  function veldWaarde(s: VeldSleutel): string {
    return form[s];
  }

  async function bewaar(bevestigen: boolean) {
    try {
      await update.mutateAsync({
        id: gebouwId,
        data: { ...form, geverifieerd: bevestigen },
      });
      await invalidate();
      setBewerken(false);
      setVersie(null);
      toast({
        title: bevestigen ? "Projectgegevens bevestigd" : "Projectgegevens opgeslagen",
      });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function herbereken() {
    try {
      await genereer.mutateAsync({ id: gebouwId });
      await invalidate();
      setBewerken(false);
      setVersie(null);
      toast({ title: "AI-suggesties bijgewerkt" });
    } catch {
      toast({ title: "Bijwerken mislukt", variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const heeftSamenvatting = !!samenvatting;
  const geverifieerd = samenvatting?.geverifieerd ?? false;
  const contactpersonen = samenvatting?.contactpersonen ?? [];
  const aantalEmails = samenvatting?.aantal_emails ?? 0;
  const bezig = update.isPending || genereer.isPending;

  // Voor monteurs/controleurs: alleen-lezen weergave van bevestigde gegevens.
  if (!isBeheerder) {
    const gevulde = VELDEN.filter((v) => (samenvatting?.[v.sleutel] ?? "").trim());
    if (gevulde.length === 0 && contactpersonen.length === 0) return null;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" /> Projectinformatie
            {geverifieerd && (
              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs font-normal">
                <ShieldCheck className="h-3 w-3 mr-1" /> Gecontroleerd
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {gevulde.map((v) => (
            <div key={v.sleutel}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-0.5">
                {v.icoon} {v.titel}
              </div>
              <p className="text-sm whitespace-pre-wrap text-foreground/80">
                {samenvatting?.[v.sleutel]}
              </p>
            </div>
          ))}
          {contactpersonen.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                <Users className="h-4 w-4" /> Contactpersonen
              </div>
              <ul className="space-y-2">
                {contactpersonen.map((c, i) => (
                  <ContactpersoonRij
                    key={`${c.naam}-${c.email ?? i}`}
                    contact={c}
                    gebouwId={gebouwId}
                    isBeheerder={false}
                  />
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Projectformulier
              {heeftSamenvatting && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {aantalEmails} {aantalEmails === 1 ? "e-mail" : "e-mails"}
                </Badge>
              )}
            </CardTitle>
            {geverifieerd ? (
              <p className="flex items-center gap-1.5 text-xs text-green-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Gecontroleerd
                {samenvatting?.gecontroleerd_door ? ` door ${samenvatting.gecontroleerd_door}` : ""}
                {" · "}{datum(samenvatting?.gecontroleerd_op)}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                {heeftSamenvatting
                  ? "Nog niet gecontroleerd — door AI aangevuld, controleer en bevestig."
                  : "Nog niet ingevuld — vul handmatig in of haal suggesties uit e-mails."}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!bewerken && (
              <Button size="sm" variant="outline" onClick={() => setBewerken(true)}>
                <Pencil className="h-3.5 w-3.5" /> Bewerken
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={herbereken}
              disabled={bezig}
              title="Velden opnieuw door AI laten invullen vanuit de gearchiveerde e-mails"
            >
              {genereer.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              AI-suggesties
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {bewerken ? (
          <>
            <div className="grid grid-cols-1 gap-3">
              {VELDEN.map((v) => (
                <div key={v.sleutel} className="space-y-1">
                  <Label className="flex items-center gap-1.5 text-xs">
                    {v.icoon} {v.titel}
                  </Label>
                  <Textarea
                    rows={v.rijen}
                    value={veldWaarde(v.sleutel)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [v.sleutel]: e.target.value }))
                    }
                    placeholder="Niet ingevuld"
                    className="text-sm resize-y"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBewerken(false);
                  setVersie(null);
                }}
                disabled={bezig}
              >
                Annuleren
              </Button>
              <Button variant="outline" size="sm" onClick={() => bewaar(false)} disabled={bezig}>
                {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Opslaan
              </Button>
              <Button size="sm" onClick={() => bewaar(true)} disabled={bezig}>
                <ShieldCheck className="h-3.5 w-3.5" /> Opslaan en bevestigen
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {VELDEN.filter((v) => (samenvatting?.[v.sleutel] ?? "").trim()).length === 0 &&
            contactpersonen.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nog geen projectgegevens. Klik op <span className="font-medium">Bewerken</span> om
                handmatig in te vullen, of haal suggesties uit de e-mails via{" "}
                <span className="font-medium">AI-suggesties</span>.
              </p>
            ) : (
              VELDEN.filter((v) => (samenvatting?.[v.sleutel] ?? "").trim()).map((v) => (
                <div key={v.sleutel}>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-0.5">
                    {v.icoon} {v.titel}
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-foreground/80">
                    {samenvatting?.[v.sleutel]}
                  </p>
                </div>
              ))
            )}

            {contactpersonen.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-1.5">
                  <Users className="h-4 w-4" /> Contactpersonen{" "}
                  <span className="font-normal text-muted-foreground">(uit e-mails)</span>
                </div>
                <ul className="space-y-2">
                  {contactpersonen.map((c, i) => (
                    <ContactpersoonRij
                      key={`${c.naam}-${c.email ?? i}`}
                      contact={c}
                      gebouwId={gebouwId}
                      isBeheerder={isBeheerder}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
