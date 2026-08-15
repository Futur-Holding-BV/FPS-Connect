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
} from "lucide-react";
import {
  useGetGebouwPublicatieStatus,
  usePubliceerGebouw,
  useIntrekkenGebouwPublicatie,
  getGetGebouwPublicatieStatusQueryKey,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  gebouwId: number;
}

export function GebouwPublicatieKaart({ gebouwId }: Props) {
  const { data, isLoading } = useGetGebouwPublicatieStatus(gebouwId);
  const { heeftNiveau } = useBevoegdheid();
  const magPubliceren = heeftNiveau("gebouwen", 2);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [notitie, setNotitie] = useState("");
  const [uitklapOpen, setUitklapOpen] = useState(false);

  const publiceerMutatie = usePubliceerGebouw({
    mutation: {
      onSuccess: () => {
        toast({ title: "Gepubliceerd", description: "Het gebouw is klaargezet om naar buiten te gaan." });
        queryClient.invalidateQueries({ queryKey: getGetGebouwPublicatieStatusQueryKey(gebouwId) });
        setUitklapOpen(false);
        setNotitie("");
      },
      onError: () => {
        toast({ title: "Mislukt", description: "Publicatie kon niet worden doorgevoerd.", variant: "destructive" });
      },
    },
  });

  const intrekkenMutatie = useIntrekkenGebouwPublicatie({
    mutation: {
      onSuccess: () => {
        toast({ title: "Ingetrokken", description: "Het gebouw staat niet langer klaar om naar buiten te gaan." });
        queryClient.invalidateQueries({ queryKey: getGetGebouwPublicatieStatusQueryKey(gebouwId) });
        setUitklapOpen(false);
        setNotitie("");
      },
      onError: () => {
        toast({ title: "Mislukt", description: "Publicatie kon niet worden ingetrokken.", variant: "destructive" });
      },
    },
  });

  const bezig = publiceerMutatie.isPending || intrekkenMutatie.isPending;

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

        {!isLoading && data && (
          <>
            <div className="flex items-center gap-2">
              {data.gepubliceerd ? (
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

            {data.gepubliceerd && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                {data.gepubliceerd_op && (
                  <p>Gepubliceerd op {datumFmt(data.gepubliceerd_op)}</p>
                )}
                {data.gepubliceerd_door_naam && (
                  <p>Door {data.gepubliceerd_door_naam}</p>
                )}
                {data.notitie && (
                  <p className="italic">{data.notitie}</p>
                )}
              </div>
            )}

            {!data.gepubliceerd && data.ingetrokken_op && (
              <p className="text-xs text-muted-foreground">
                Ingetrokken op {datumFmt(data.ingetrokken_op)}
              </p>
            )}

            {magPubliceren && (
              <>
                {!uitklapOpen ? (
                  <Button
                    variant={data.gepubliceerd ? "outline" : "default"}
                    size="sm"
                    className="w-full gap-1.5 text-xs"
                    onClick={() => setUitklapOpen(true)}
                  >
                    {data.gepubliceerd ? (
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
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Optionele opmerking bij deze actie"
                      value={notitie}
                      onChange={(e) => setNotitie(e.target.value)}
                      rows={2}
                      className="text-xs resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={data.gepubliceerd ? "destructive" : "default"}
                        className="flex-1 text-xs gap-1"
                        disabled={bezig}
                        onClick={() => {
                          if (data.gepubliceerd) {
                            intrekkenMutatie.mutate({ id: gebouwId, data: { notitie: notitie || null } });
                          } else {
                            publiceerMutatie.mutate({ id: gebouwId, data: { notitie: notitie || null } });
                          }
                        }}
                      >
                        {bezig && <Loader2 className="h-3 w-3 animate-spin" />}
                        {data.gepubliceerd ? "Bevestig intrekken" : "Bevestig publicatie"}
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
