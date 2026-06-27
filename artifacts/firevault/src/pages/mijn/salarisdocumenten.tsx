import { FileText, Download, Lock } from "lucide-react";
import { useGetMijnSalarisdocumenten } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const MAANDEN = [
  "", "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",
];

const TYPE_LABELS: Record<string, string> = {
  loonstrook: "Loonstrook",
  jaaropgave: "Jaaropgave",
  arbeidscontract: "Arbeidscontract",
  overig: "Document",
};

function fmtDatum(d: string) {
  return new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
}

async function downloadDoc(docId: number) {
  const res = await fetch(`/api/mijn/salarisdocumenten/${docId}/download-url`, { credentials: "include" });
  if (res.ok) {
    const { url } = await res.json() as { url: string };
    window.open(url, "_blank");
  }
}

export default function MijnSalarisdocumentenPagina() {
  const { data: documenten, isLoading, isError } = useGetMijnSalarisdocumenten();

  const gegroepeerd: Record<number, typeof documenten> = {};
  for (const doc of documenten ?? []) {
    const jaar = doc.periode_jaar ?? 0;
    if (!gegroepeerd[jaar]) gegroepeerd[jaar] = [];
    gegroepeerd[jaar]!.push(doc);
  }
  const jaren = Object.keys(gegroepeerd).map(Number).sort((a, b) => b - a);

  if (isLoading) {
    return (
      <div className="p-6 text-center text-muted-foreground">Laden...</div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Lock className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p>Geen toegang tot salarisdocumenten.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Mijn salarisdocumenten</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Uw persoonlijke loonstroken, jaaropgaven en andere documenten.
        </p>
      </div>

      {(!documenten || documenten.length === 0) ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Er zijn nog geen salarisdocumenten beschikbaar.</p>
          </CardContent>
        </Card>
      ) : (
        jaren.map((jaar) => (
          <Card key={jaar}>
            <CardHeader>
              <CardTitle className="text-base">{jaar === 0 ? "Overige documenten" : String(jaar)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(gegroepeerd[jaar] ?? []).sort((a, b) => {
                const ma = a.periode_maand ?? 0;
                const mb = b.periode_maand ?? 0;
                return mb - ma;
              }).map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">
                        {TYPE_LABELS[doc.type] ?? doc.type}
                        {doc.periode_maand ? ` — ${MAANDEN[doc.periode_maand]}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Beschikbaar gesteld op {fmtDatum(doc.bijgewerkt_op)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">{TYPE_LABELS[doc.type] ?? doc.type}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void downloadDoc(doc.id)}
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Downloaden
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
