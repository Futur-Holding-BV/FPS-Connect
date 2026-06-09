import { useRef, useState } from "react";
import {
  useListGebouwEmails,
  useCreateGebouwEmail,
  useDeleteGebouwEmail,
  getListGebouwEmailsQueryKey,
} from "@workspace/api-client-react";
import type { GebouwEmail } from "@workspace/api-client-react";
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
import { useToast } from "@/hooks/use-toast";
import {
  Mail, Upload, Loader2, Trash2, Paperclip, Sparkles, User, MapPin,
  Phone, FileText, ChevronRight,
} from "lucide-react";

function datum(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("nl-NL");
}

function bestandsUrl(objectPad: string | null | undefined): string | null {
  if (!objectPad) return null;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pad = objectPad.startsWith("/") ? objectPad : `/${objectPad}`;
  return `${base}${pad}`;
}

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
  const { uploadFile, isUploading } = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);

  const [bezig, setBezig] = useState(false);
  const [actief, setActief] = useState<GebouwEmail | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListGebouwEmailsQueryKey(gebouwId) });

  async function kiesBestand(file: File) {
    setBezig(true);
    try {
      const res = await uploadFile(file);
      if (!res?.objectPath) {
        toast({ title: "Uploaden mislukt", variant: "destructive" });
        return;
      }
      await maak.mutateAsync({
        id: gebouwId,
        data: { object_pad: res.objectPath, bestandsnaam: file.name },
      });
      await invalidate();
      toast({ title: "E-mail verwerkt", description: "AI-analyse voltooid." });
    } catch {
      toast({ title: "Verwerken mislukt", variant: "destructive" });
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
              accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook"
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
      <CardContent className="space-y-2">
        {isBeheerder && (
          <p className="text-xs text-muted-foreground">
            Upload een <code>.eml</code> of <code>.msg</code> bestand. De inhoud, afzender,
            NAW-gegevens en bijlagen worden automatisch met AI uitgelezen.
          </p>
        )}
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (emails ?? []).length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nog geen e-mails gearchiveerd.
          </div>
        ) : (
          <div className="divide-y">
            {(emails ?? []).map((e) => (
              <button
                key={e.id}
                onClick={() => setActief(e)}
                className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-muted/50 -mx-2 px-2 rounded"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{e.onderwerp || e.bestandsnaam}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                    {e.afzender && <span className="truncate">{e.afzender}</span>}
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
                    <Badge variant="secondary" className="gap-1">
                      <Sparkles className="h-3 w-3" /> AI
                    </Badge>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!actief} onOpenChange={(o) => !o && setActief(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {actief && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{actief.onderwerp || actief.bestandsnaam}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
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

                {actief.inhoud_tekst && (
                  <div>
                    <div className="font-medium mb-1 flex items-center gap-1.5"><User className="h-4 w-4" /> Berichttekst</div>
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto bg-muted/40 rounded p-3">
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
                                await invalidate();
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
