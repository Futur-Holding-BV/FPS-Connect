import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import {
  useGetGebouwPublicatieStatus,
  useGetGebouwPublicatiePreview,
  usePubliceerGebouw,
  useIntrekkenGebouwPublicatie,
  getGetGebouwPublicatieStatusQueryKey,
  getGetGebouwPublicatiePreviewQueryKey,
  getGetGebouwProcessStatusQueryKey,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

interface Props {
  gebouwId: number;
}

export function GebouwPublicatieKaart({ gebouwId }: Props) {
  const { data: statusData, isLoading: statusLaden } = useGetGebouwPublicatieStatus(gebouwId);
  const { data: previewData, isLoading: previewLaden } = useGetGebouwPublicatiePreview(gebouwId);
  const { heeftNiveau } = useBevoegdheid();
  const magActieUitvoeren = heeftNiveau("gebouwen", 2);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [notitie, setNotitie] = useState("");
  const [uitklapOpen, setUitklapOpen] = useState(false);

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: getGetGebouwPublicatieStatusQueryKey(gebouwId) });
    queryClient.invalidateQueries({ queryKey: getGetGebouwPublicatiePreviewQueryKey(gebouwId) });
    queryClient.invalidateQueries({ queryKey: getGetGebouwProcessStatusQueryKey(gebouwId) });
  };

  const publiceerMutatie = usePubliceerGebouw({
    mutation: {
      onSuccess: () => {
        toast({ title: "Gepubliceerd", description: "Het gebouw is klaargezet om naar buiten te gaan." });
        invalidateQueries();
        setUitklapOpen(false);
        setNotitie("");
      },
      onError: (err: any) => {
        const melding = err?.data?.error || err?.response?.data?.error || err?.message || "Publicatie kon niet worden doorgevoerd.";
        toast({ title: "Mislukt", description: melding, variant: "destructive" });
      },
    },
  });

  const intrekkenMutatie = useIntrekkenGebouwPublicatie({
    mutation: {
      onSuccess: () => {
        toast({ title: "Ingetrokken", description: "Het gebouw staat niet langer klaar om naar buiten te gaan." });
        invalidateQueries();
        setUitklapOpen(false);
        setNotitie("");
      },
      onError: (err: any) => {
        const melding = err?.data?.error || err?.response?.data?.error || err?.message || "Publicatie kon niet worden ingetrokken.";
        toast({ title: "Mislukt", description: melding, variant: "destructive" });
      },
    },
  });

  const bezig = publiceerMutatie.isPending || intrekkenMutatie.isPending;
  const isLoading = statusLaden || previewLaden;

  const datumFmt = (iso: string | null | undefined) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Externe publicatie
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <Skeleton className="h-8 w-full" />}

        {!isLoading && statusData && previewData && (
          <>
            <div className="flex items-center gap-2">
              {statusData.gepubliceerd ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <Badge className="bg-green-100 text-green-800 border-green-200 text-xs font-medium">
                    Gepubliceerd
                  </Badge>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-slate-400 shrink-0" />
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Niet gepubliceerd
                  </Badge>
                </>
              )}
            </div>

            {statusData.gepubliceerd && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                {statusData.gepubliceerd_op && (
                  <p>Gepubliceerd op {datumFmt(statusData.gepubliceerd_op)}</p>
                )}
                {statusData.gepubliceerd_door_naam && (
                  <p>Door {statusData.gepubliceerd_door_naam}</p>
                )}
                {statusData.notitie && (
                  <p className="italic">{statusData.notitie}</p>
                )}
              </div>
            )}

            {!statusData.gepubliceerd && statusData.ingetrokken_op && (
              <p className="text-xs text-muted-foreground">
                Ingetrokken op {datumFmt(statusData.ingetrokken_op)}
              </p>
            )}

            {magActieUitvoeren && (
              <>
                {!uitklapOpen ? (
                  <div className="space-y-2">
                    {!statusData.gepubliceerd && previewData.blocker && !previewData.mag_publiceren && (
                      <div data-testid="publicatie-blocker" className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 mt-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="font-medium">{previewData.blocker.message}</div>
                        </div>
                        {previewData.blocker.action_path && previewData.blocker.action_label && (
                          <div className="pl-6 mt-1.5">
                            <a href={previewData.blocker.action_path} className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900 font-semibold text-xs border border-amber-300 bg-amber-100/50 hover:bg-amber-100 px-2 py-0.5 rounded-sm transition-colors">
                              {previewData.blocker.action_label} <ArrowRight className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                    <Button
                      data-testid="publicatie-open-preview"
                      variant={statusData.gepubliceerd ? "outline" : "default"}
                      size="sm"
                      className="w-full gap-1.5 text-xs"
                      onClick={() => setUitklapOpen(true)}
                      disabled={!statusData.gepubliceerd && !previewData.mag_publiceren}
                    >
                      {statusData.gepubliceerd ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5" />
                          Publicatie intrekken
                        </>
                      ) : (
                        <>
                          <Globe className="h-3.5 w-3.5" />
                          Klaarzetten voor extern
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div data-testid="publicatie-preview" className="space-y-3 mt-2 rounded-md border p-3 bg-slate-50">
                    <h4 className="font-semibold text-sm text-slate-800">
                      {statusData.gepubliceerd ? "Bevestig intrekking" : "Bevestig publicatie"}
                    </h4>

                    {!statusData.gepubliceerd ? (
                      <div className="text-xs text-slate-600 space-y-2">
                        <p><strong>Bestemming:</strong> {previewData.bestemming}</p>
                        <p><strong>Opdrachtgever:</strong> {previewData.opdrachtgever || "Onbekend"}</p>
                        <div>
                          <strong>Ontvangers:</strong>
                          {previewData.ontvangers.length > 0 ? (
                            <ul className="list-disc pl-4 mt-1 space-y-0.5">
                              {previewData.ontvangers.map((o, idx) => (
                                <li key={idx}>
                                  {o.naam} {o.email ? `(${o.email})` : ""} {o.organisatie ? `- ${o.organisatie}` : ""}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="italic ml-1">Geen ontvangers geconfigureerd</span>
                          )}
                        </div>
                        <div>
                          <strong>Gedeelde data:</strong>
                          {previewData.content_items.length > 0 ? (
                            <ul className="list-disc pl-4 mt-1 space-y-0.5">
                              {previewData.content_items.map((c, idx) => (
                                <li key={idx}>{c.label} ({c.type})</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="italic ml-1">Geen data items geselecteerd</span>
                          )}
                        </div>
                        <div className="p-2 bg-blue-50 border border-blue-100 rounded text-blue-800">
                          {previewData.gevolg_tekst}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-600 space-y-2">
                        <div className="p-2 bg-amber-50 border border-amber-100 rounded text-amber-800">
                          {previewData.intrekking_gevolg_tekst}
                        </div>
                        <p className="italic text-muted-foreground">Bronbestanden en documenten blijven bewaard in FPS Connect, maar zijn extern niet meer inzichtelijk.</p>
                      </div>
                    )}

                    <Textarea
                      placeholder="Optionele opmerking bij deze actie"
                      value={notitie}
                      onChange={(e) => setNotitie(e.target.value)}
                      rows={2}
                      className="text-xs resize-none bg-white"
                    />
                    <div className="flex gap-2 pt-1">
                      <Button
                        data-testid={statusData.gepubliceerd ? "publicatie-withdraw-confirm" : "publicatie-confirm"}
                        size="sm"
                        variant={statusData.gepubliceerd ? "destructive" : "default"}
                        className="flex-1 text-xs gap-1"
                        disabled={bezig}
                        onClick={() => {
                          if (statusData.gepubliceerd) {
                            intrekkenMutatie.mutate({ id: gebouwId, data: { notitie: notitie || null } });
                          } else {
                            publiceerMutatie.mutate({ id: gebouwId, data: { notitie: notitie || null } });
                          }
                        }}
                      >
                        {bezig && <Loader2 className="h-3 w-3 animate-spin" />}
                        {statusData.gepubliceerd ? "Intrekken bevestigen" : "Publiceren bevestigen"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                        disabled={bezig}
                        onClick={() => { setUitklapOpen(false); setNotitie(""); }}
                      >
                        Annuleren
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
