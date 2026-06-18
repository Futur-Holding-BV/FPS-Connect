import { useMemo, useRef, useState } from "react";
import {
  useListGebouwEmails,
  useCreateGebouwEmail,
  useDeleteGebouwEmail,
  useGetGebouwEmailSamenvatting,
  useGenerateGebouwEmailSamenvatting,
  useCreateGebouwPartij,
  getListGebouwEmailsQueryKey,
  getGetGebouwEmailSamenvattingQueryKey,
  getListGebouwPartijenQueryKey,
} from "@workspace/api-client-react";
import type { GebouwEmail, EmailContactpersoon } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Mail, Upload, Loader2, Trash2, Paperclip, Sparkles, User, MapPin,
  Phone, FileText, ChevronRight, ListChecks, RefreshCw, Building2,
  ClipboardList, AlertTriangle, CheckSquare, Handshake, Users, UserPlus, Check,
  ArrowDownUp, Search,
} from "lucide-react";

const ROL_LABELS: Record<string, string> = {
  opdrachtgever: "Opdrachtgever",
  gebruiker: "Gebruiker",
  installateur: "Installateur",
  aannemer: "Aannemer",
  eigenaar: "Eigenaar",
  aanvrager: "Aanvrager",
};

// Rollen die als partij kunnen worden opgeslagen (moeten overeenkomen met de
// backend PARTIJ_TYPES).
const PARTIJ_ROLLEN = new Set([
  "opdrachtgever",
  "gebruiker",
  "installateur",
  "aannemer",
  "eigenaar",
  "aanvrager",
]);

function rolLabel(rol: string): string {
  return ROL_LABELS[rol] ?? rol;
}

function datum(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("nl-NL");
}

function bestandsUrl(objectPad: string | null | undefined): string | null {
  if (!objectPad) return null;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pad = objectPad.startsWith("/") ? objectPad : `/${objectPad}`;
  return `${base}/api/storage${pad}`;
}

// ── Centrale projectsamenvatting ────────────────────────────────────────────

export function ProjectSamenvatting({ gebouwId, isBeheerder }: { gebouwId: number; isBeheerder: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: samenvatting, isLoading, error } = useGetGebouwEmailSamenvatting(gebouwId);
  const genereer = useGenerateGebouwEmailSamenvatting();

  const bezig = genereer.isPending;

  async function herbereken() {
    try {
      await genereer.mutateAsync({ id: gebouwId });
      queryClient.invalidateQueries({ queryKey: getGetGebouwEmailSamenvattingQueryKey(gebouwId) });
      toast({ title: "Projectsamenvatting bijgewerkt" });
    } catch {
      toast({ title: "Bijwerken mislukt", variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  const geenSamenvatting = !samenvatting || (error && (error as { status?: number }).status === 404);

  if (geenSamenvatting) {
    if (!isBeheerder) return null;
    return (
      <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Geen projectsamenvatting</span> — upload een e-mail om automatisch een samenvatting te genereren.
        </div>
      </div>
    );
  }

  const velden: { icoon: React.ReactNode; titel: string; waarde: string | null | undefined }[] = [
    { icoon: <ClipboardList className="h-4 w-4" />, titel: "Opdrachtomschrijving", waarde: samenvatting.opdrachtomschrijving },
    { icoon: <Building2 className="h-4 w-4" />, titel: "Opdrachtgever", waarde: samenvatting.opdrachtgever },
    { icoon: <Phone className="h-4 w-4" />, titel: "Contactgegevens", waarde: samenvatting.contactgegevens },
    { icoon: <Handshake className="h-4 w-4" />, titel: "Gemaakte afspraken", waarde: samenvatting.afspraken },
    { icoon: <ListChecks className="h-4 w-4" />, titel: "Openstaande actiepunten", waarde: samenvatting.actiepunten },
    { icoon: <CheckSquare className="h-4 w-4" />, titel: "Besluiten", waarde: samenvatting.besluiten },
    { icoon: <FileText className="h-4 w-4" />, titel: "Tekeningen / bijlagen", waarde: samenvatting.tekeningen },
    { icoon: <AlertTriangle className="h-4 w-4" />, titel: "Risico's en aandachtspunten", waarde: samenvatting.risicos },
  ].filter((v) => v.waarde);

  const contactpersonen = samenvatting.contactpersonen ?? [];

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-primary/15">
        <div className="flex items-center gap-2 text-primary font-semibold text-sm">
          <Sparkles className="h-4 w-4" />
          AI-projectsamenvatting
          <Badge variant="secondary" className="text-xs font-normal">
            {samenvatting.aantal_emails} {samenvatting.aantal_emails === 1 ? "e-mail" : "e-mails"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:block">
            Bijgewerkt {datum(samenvatting.bijgewerkt_op)}
          </span>
          {isBeheerder && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={herbereken} disabled={bezig}>
              {bezig
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              Bijwerken
            </Button>
          )}
        </div>
      </div>
      {velden.length === 0 && contactpersonen.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">
          Geen relevante informatie gevonden in de e-mails.
        </div>
      ) : (
        <div className="divide-y divide-primary/10">
          {velden.map((v) => (
            <div key={v.titel} className="px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-1">
                {v.icoon} {v.titel}
              </div>
              <div className="text-sm text-foreground/80 whitespace-pre-wrap">{v.waarde}</div>
            </div>
          ))}
          {contactpersonen.length > 0 && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-2">
                <Users className="h-4 w-4" /> Contactpersonen
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
    </div>
  );
}

export function ContactpersoonRij({
  contact,
  gebouwId,
  isBeheerder,
}: {
  contact: EmailContactpersoon;
  gebouwId: number;
  isBeheerder: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const maakPartij = useCreateGebouwPartij();
  const [toegevoegd, setToegevoegd] = useState(false);

  const kanToevoegen = isBeheerder && PARTIJ_ROLLEN.has(contact.rol);

  async function toevoegenAlsPartij() {
    try {
      await maakPartij.mutateAsync({
        id: gebouwId,
        data: {
          type: contact.rol,
          naam: contact.naam,
          organisatie: contact.organisatie ?? undefined,
          email: contact.email ?? undefined,
          telefoon: contact.telefoon ?? undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListGebouwPartijenQueryKey(gebouwId) });
      setToegevoegd(true);
      toast({ title: "Toegevoegd als opdrachtgever", description: `${contact.naam} (${rolLabel(contact.rol)})` });
    } catch {
      toast({ title: "Toevoegen mislukt", variant: "destructive" });
    }
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-primary/10 bg-background/50 px-3 py-2">
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{contact.naam}</span>
          <Badge variant="secondary" className="text-xs font-normal">{rolLabel(contact.rol)}</Badge>
        </div>
        {contact.organisatie && (
          <div className="text-xs text-muted-foreground">{contact.organisatie}</div>
        )}
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:underline">
              <Mail className="h-3 w-3" /> {contact.email}
            </a>
          )}
          {contact.telefoon && (
            <a href={`tel:${contact.telefoon}`} className="flex items-center gap-1 hover:underline">
              <Phone className="h-3 w-3" /> {contact.telefoon}
            </a>
          )}
        </div>
      </div>
      {kanToevoegen && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs shrink-0"
          onClick={toevoegenAlsPartij}
          disabled={maakPartij.isPending || toegevoegd}
        >
          {toegevoegd ? (
            <><Check className="h-3.5 w-3.5" /> Toegevoegd</>
          ) : maakPartij.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <><UserPlus className="h-3.5 w-3.5" /> Toevoegen</>
          )}
        </Button>
      )}
    </li>
  );
}

// ── Hoofdcomponent ──────────────────────────────────────────────────────────

export default function GebouwEmails({
  gebouwId,
  isBeheerder,
}: {
  gebouwId: number;
  isBeheerder: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: emails, isLoading } = useListGebouwEmails(gebouwId);
  const maak = useCreateGebouwEmail();
  const verwijder = useDeleteGebouwEmail();
  const { uploadFile, isUploading } = useUpload({ gebouw_id: gebouwId, bestand_type: "bijlage" });
  const fileRef = useRef<HTMLInputElement>(null);

  const [bezig, setBezig] = useState(false);
  const [actief, setActief] = useState<GebouwEmail | null>(null);
  const [sortering, setSortering] = useState("datum_nieuw");
  const [zoek, setZoek] = useState("");
  const [toonAlles, setToonAlles] = useState(false);

  const gesorteerd = useMemo(() => {
    const tekst = (s: string | null | undefined) => (s ?? "").toLowerCase();
    const tijd = (s: string | null | undefined) => {
      const t = s ? new Date(s).getTime() : NaN;
      return Number.isNaN(t) ? 0 : t;
    };
    const q = zoek.trim().toLowerCase();
    let lijst = [...(emails ?? [])];
    if (q) {
      lijst = lijst.filter((e) =>
        [e.onderwerp, e.afzender, e.ontvanger, e.bestandsnaam].some((v) =>
          tekst(v).includes(q),
        ),
      );
    }
    switch (sortering) {
      case "datum_oud":
        lijst.sort((a, b) => tijd(a.datum) - tijd(b.datum));
        break;
      case "afzender":
        lijst.sort((a, b) => tekst(a.afzender).localeCompare(tekst(b.afzender), "nl"));
        break;
      case "ontvanger":
        lijst.sort((a, b) => tekst(a.ontvanger).localeCompare(tekst(b.ontvanger), "nl"));
        break;
      default:
        lijst.sort((a, b) => tijd(b.datum) - tijd(a.datum));
        break;
    }
    return lijst;
  }, [emails, sortering, zoek]);

  const LIMIET = 5;
  const aanZoeken = zoek.trim().length > 0;
  const zichtbaar = aanZoeken || toonAlles ? gesorteerd : gesorteerd.slice(0, LIMIET);

  const invalideer = () => {
    queryClient.invalidateQueries({ queryKey: getListGebouwEmailsQueryKey(gebouwId) });
    queryClient.invalidateQueries({ queryKey: getGetGebouwEmailSamenvattingQueryKey(gebouwId) });
  };

  async function kiesBestand(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "eml" && ext !== "msg") {
      toast({
        title: "Bestandstype niet ondersteund",
        description: "Upload een .eml- of .msg-bestand. Andere bestandstypen worden niet geaccepteerd.",
        variant: "destructive",
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setBezig(true);
    try {
      const res = await uploadFile(file);
      if (!res?.objectPath) {
        toast({ title: "Uploaden mislukt", description: "Het bestand kon niet worden opgeslagen. Probeer opnieuw.", variant: "destructive" });
        return;
      }
      await maak.mutateAsync({
        id: gebouwId,
        data: { object_pad: res.objectPath, bestandsnaam: file.name },
      });
      invalideer();
      toast({ title: "E-mail verwerkt", description: "De e-mail is verwerkt. De AI-samenvatting wordt op de achtergrond bijgewerkt." });
    } catch {
      toast({ title: "Verwerken mislukt", description: "Er is een fout opgetreden. Controleer of het bestand een geldig .eml- of .msg-bestand is.", variant: "destructive" });
    } finally {
      setBezig(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const drukBezig = bezig || isUploading || maak.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" /> E-mailarchief
        </CardTitle>
        {isBeheerder && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".eml,.msg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) kiesBestand(f);
              }}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={drukBezig}>
              {drukBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {drukBezig ? "Verwerken…" : "E-mail uploaden"}
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isBeheerder && (
          <p className="text-xs text-muted-foreground -mt-2">
            Ondersteunde bestandstypen: <code className="bg-muted px-1 rounded">.eml</code> en <code className="bg-muted px-1 rounded">.msg</code>. Bijlagen worden automatisch uitgelezen. Andere bestandstypen worden geweigerd.
          </p>
        )}

        {/* E-maillijst */}
        <div>
          {(emails ?? []).length > 0 && (
            <div className="mb-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Gearchiveerde e-mails (
                {aanZoeken
                  ? `${gesorteerd.length} van ${(emails ?? []).length}`
                  : (emails ?? []).length}
                )
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={zoek}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      setZoek(v);
                      if (!v.trim()) setToonAlles(false);
                    }}
                    placeholder="Zoek op onderwerp, afzender of ontvanger…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Select value={sortering} onValueChange={setSortering}>
                  <SelectTrigger className="h-8 w-full text-xs sm:w-[210px]" aria-label="Sorteren">
                    <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="datum_nieuw">Datum (nieuwste eerst)</SelectItem>
                    <SelectItem value="datum_oud">Datum (oudste eerst)</SelectItem>
                    <SelectItem value="afzender">Afzender (A–Z)</SelectItem>
                    <SelectItem value="ontvanger">Ontvanger (A–Z)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (emails ?? []).length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nog geen e-mails gearchiveerd.
            </div>
          ) : gesorteerd.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Geen e-mails gevonden voor "{zoek.trim()}".
            </div>
          ) : (
            <div className="space-y-2.5">
              {zichtbaar.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setActief(e)}
                  className="w-full flex items-center justify-between gap-3 text-left rounded-lg border bg-card p-3.5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.onderwerp || e.bestandsnaam}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                      {e.afzender && (
                        <span className="truncate">
                          <span className="font-medium text-foreground/70">Van:</span> {e.afzender}
                        </span>
                      )}
                      {e.ontvanger && (
                        <span className="truncate">
                          <span className="font-medium text-foreground/70">Aan:</span> {e.ontvanger}
                        </span>
                      )}
                      <span>{datum(e.datum)}</span>
                      {(e.bijlagen?.length ?? 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />{e.bijlagen?.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {e.ai_omschrijving && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Sparkles className="h-3 w-3" /> AI
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
              {!aanZoeken && gesorteerd.length > LIMIET && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => setToonAlles((v) => !v)}
                >
                  {toonAlles
                    ? "Toon minder"
                    : `Toon alle ${gesorteerd.length} e-mails`}
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>

      {/* E-mail detail dialoog */}
      <Dialog open={!!actief} onOpenChange={(o) => !o && setActief(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby="email-detail-inhoud">
          {actief && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{actief.onderwerp || actief.bestandsnaam}</DialogTitle>
              </DialogHeader>
              <div id="email-detail-inhoud" className="space-y-4 text-sm">
                <div className="grid gap-1 text-muted-foreground">
                  {actief.afzender && <div><span className="font-medium text-foreground">Van:</span> {actief.afzender}</div>}
                  {actief.ontvanger && <div><span className="font-medium text-foreground">Aan:</span> {actief.ontvanger}</div>}
                  <div><span className="font-medium text-foreground">Datum:</span> {datum(actief.datum)}</div>
                </div>

                {actief.ai_omschrijving && (
                  <AiBlok titel="Samenvatting" icoon={<Sparkles className="h-4 w-4" />} tekst={actief.ai_omschrijving} />
                )}
                {actief.ai_naw && (
                  <AiBlok titel="NAW-gegevens" icoon={<MapPin className="h-4 w-4" />} tekst={actief.ai_naw} />
                )}
                {actief.ai_contactinfo && (
                  <AiBlok titel="Contactinformatie" icoon={<Phone className="h-4 w-4" />} tekst={actief.ai_contactinfo} />
                )}
                {actief.ai_tekeningen && (
                  <AiBlok titel="Genoemde tekeningen" icoon={<FileText className="h-4 w-4" />} tekst={actief.ai_tekeningen} />
                )}
                {actief.ai_actiepunten && (
                  <AiBlok titel="Openstaande actiepunten" icoon={<ListChecks className="h-4 w-4" />} tekst={actief.ai_actiepunten} />
                )}

                {actief.inhoud_tekst && (
                  <div>
                    <div className="font-medium mb-1 flex items-center gap-1.5"><User className="h-4 w-4" /> Berichttekst</div>
                    <div className="text-sm text-foreground/80 whitespace-pre-wrap break-words max-h-72 overflow-y-auto bg-muted/40 rounded p-3 leading-relaxed">
                      {actief.inhoud_tekst}
                    </div>
                  </div>
                )}

                {(actief.bijlagen?.length ?? 0) > 0 && (
                  <div>
                    <div className="font-medium mb-1 flex items-center gap-1.5"><Paperclip className="h-4 w-4" /> Bijlagen</div>
                    <div className="space-y-1">
                      {actief.bijlagen?.map((b) => {
                        const url = bestandsUrl(b.object_pad);
                        return (
                          <div key={b.id} className="flex items-center justify-between gap-2 text-xs bg-muted/40 rounded px-3 py-2">
                            <span className="truncate">{b.bestandsnaam}</span>
                            {url ? (
                              <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex-shrink-0">
                                Downloaden
                              </a>
                            ) : (
                              <span className="text-muted-foreground flex-shrink-0">Niet beschikbaar</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {isBeheerder && (
                  <div className="flex justify-end pt-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive">
                          <Trash2 className="h-4 w-4" /> Verwijderen
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>E-mail verwijderen?</AlertDialogTitle>
                          <AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuleren</AlertDialogCancel>
                          <AlertDialogAction
                            disabled={verwijder.isPending}
                            onClick={async () => {
                              try {
                                await verwijder.mutateAsync({ id: gebouwId, emailId: actief.id });
                                invalideer();
                                setActief(null);
                                toast({ title: "E-mail verwijderd" });
                              } catch {
                                toast({ title: "Verwijderen mislukt", variant: "destructive" });
                              }
                            }}
                          >
                            Verwijderen
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AiBlok({ titel, icoon, tekst }: { titel: string; icoon: React.ReactNode; tekst: string }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="font-medium mb-1 flex items-center gap-1.5 text-primary">{icoon} {titel}</div>
      <div className="text-xs text-foreground/80 whitespace-pre-wrap">{tekst}</div>
    </div>
  );
}
