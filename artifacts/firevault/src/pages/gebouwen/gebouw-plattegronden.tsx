import { useRef, useState } from "react";
import { Link } from "wouter";
import { useUpdateVerdieping } from "@workspace/api-client-react";
import type { Verdieping } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Map, Loader2, Upload, ExternalLink } from "lucide-react";

export default function GebouwPlattegronden({
  gebouwId,
  verdiepingen = [],
  isBeheerder,
}: {
  gebouwId: number;
  verdiepingen?: Verdieping[];
  isBeheerder: boolean;
}) {
  const queryClient = useQueryClient();
  const updateVerdieping = useUpdateVerdieping();
  const { uploadFile } = useUpload();

  const inputRef = useRef<HTMLInputElement>(null);
  const doelId = useRef<number | null>(null);
  const [bezigId, setBezigId] = useState<number | null>(null);
  const [fout, setFout] = useState("");

  const gesorteerd = [...verdiepingen].sort((a, b) => a.niveau - b.niveau);

  function kiesVoor(verdiepingId: number) {
    setFout("");
    doelId.current = verdiepingId;
    inputRef.current?.click();
  }

  async function opBestand(file: File) {
    const vId = doelId.current;
    if (vId == null) return;
    setFout("");
    setBezigId(vId);
    try {
      const upload = await uploadFile(file);
      if (!upload) {
        setFout("Uploaden mislukt. Probeer het opnieuw.");
        return;
      }
      await updateVerdieping.mutateAsync({
        id: vId,
        data: { plattegrond_url: upload.objectPath },
      });
      queryClient.invalidateQueries();
    } catch {
      setFout("Uploaden mislukt. Probeer het opnieuw.");
    } finally {
      setBezigId(null);
      doelId.current = null;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Map className="h-5 w-5 text-primary" /> Plattegronden
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload een plattegrond per bouwlaag. De plattegrond wordt meteen de
          ondergrond voor het plaatsen van voorzieningen.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await opBestand(file);
            e.target.value = "";
          }}
        />

        {gesorteerd.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen bouwlagen. Maak eerst een bouwlaag aan in de sectie
            Bouwlagen, daarna kun je hier een plattegrond uploaden.
          </p>
        ) : (
          <ul className="space-y-2">
            {gesorteerd.map((v) => {
              const heeft = Boolean(v.plattegrond_url);
              const bezig = bezigId === v.id;
              return (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-2"
                >
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-medium text-sm truncate">{v.naam}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      niveau {v.niveau}
                    </Badge>
                    {heeft ? (
                      <Badge
                        variant="outline"
                        className="text-xs shrink-0 border-green-600 text-green-700"
                      >
                        Plattegrond aanwezig
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs shrink-0 text-muted-foreground"
                      >
                        Geen plattegrond
                      </Badge>
                    )}
                  </div>
                  {heeft ? (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-7"
                    >
                      <Link href={`/gebouwen/${gebouwId}/plattegrond/${v.id}`}>
                        <ExternalLink className="h-4 w-4 mr-1" /> Openen
                      </Link>
                    </Button>
                  ) : isBeheerder ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-7"
                      disabled={bezig}
                      onClick={() => kiesVoor(v.id)}
                    >
                      {bezig ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      Upload plattegrond
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {fout && <p className="text-sm text-destructive">{fout}</p>}
      </CardContent>
    </Card>
  );
}
