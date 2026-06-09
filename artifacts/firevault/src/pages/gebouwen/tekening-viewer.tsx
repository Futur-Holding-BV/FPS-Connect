import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function isPdf(url: string): boolean {
  return /\.pdf(\?|$)/i.test(url);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  naam: string;
}

export function TekeningViewer({ open, onOpenChange, url, naam }: Props) {
  const bron = url ? `/api/storage${url}` : "";
  const pdf = isPdf(url);

  const [laden, setLaden] = useState(false);
  const [beeld, setBeeld] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [aantalPaginas, setAantalPaginas] = useState(1);
  const [fout, setFout] = useState(false);

  // Reset bij openen of wisselen van tekening
  useEffect(() => {
    if (open) {
      setPagina(1);
      setBeeld(null);
      setFout(false);
      setAantalPaginas(1);
    }
  }, [open, url]);

  // PDF-pagina renderen naar afbeelding
  useEffect(() => {
    if (!open || !pdf || !bron) return;
    let geannuleerd = false;
    const taak = pdfjsLib.getDocument({ url: bron });
    let renderTaak: ReturnType<pdfjsLib.PDFPageProxy["render"]> | null = null;
    (async () => {
      setLaden(true);
      setFout(false);
      try {
        const doc = await taak.promise;
        if (geannuleerd) return;
        setAantalPaginas(doc.numPages);
        const veilig = Math.min(Math.max(1, pagina), doc.numPages);
        const p = await doc.getPage(veilig);
        if (geannuleerd) return;
        const viewport = p.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Geen canvas context");
        renderTaak = p.render({ canvasContext: ctx, viewport, canvas });
        await renderTaak.promise;
        if (geannuleerd) return;
        setBeeld(canvas.toDataURL("image/png"));
      } catch {
        if (!geannuleerd) setFout(true);
      } finally {
        if (!geannuleerd) setLaden(false);
      }
    })();
    return () => {
      geannuleerd = true;
      renderTaak?.cancel();
      taak.destroy();
    };
  }, [open, pdf, bron, pagina]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base">
            <span className="truncate">{naam || "Tekening"}</span>
            {bron && (
              <a
                href={bron}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Nieuw tabblad
              </a>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Weergave van de tekening, passend en gecentreerd in beeld.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto bg-slate-100 flex items-center justify-center p-4">
          {pdf ? (
            laden ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Tekening laden...
              </div>
            ) : fout ? (
              <p className="text-sm text-muted-foreground">
                De tekening kon niet worden geladen.
              </p>
            ) : beeld ? (
              <div className="relative inline-block max-w-full max-h-full">
                <img
                  src={beeld}
                  alt={naam}
                  className="max-w-full max-h-full object-contain shadow-sm bg-white"
                />
                <img
                  src="/logo-fps.png"
                  alt="FPS Brandpreventie"
                  className="pointer-events-none absolute top-2 right-2 h-8 w-auto object-contain"
                />
              </div>
            ) : null
          ) : bron ? (
            <div className="relative inline-block max-w-full max-h-full">
              <img
                src={bron}
                alt={naam}
                className="max-w-full max-h-full object-contain shadow-sm bg-white"
                onError={() => setFout(true)}
              />
              <img
                src="/logo-fps.png"
                alt="FPS Brandpreventie"
                className="pointer-events-none absolute top-2 right-2 h-8 w-auto object-contain"
              />
            </div>
          ) : null}
          {!pdf && fout && (
            <p className="text-sm text-muted-foreground">
              De tekening kon niet worden geladen.
            </p>
          )}
        </div>

        {pdf && aantalPaginas > 1 && (
          <div className="flex items-center justify-center gap-3 border-t py-2 flex-shrink-0">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              Pagina {pagina} van {aantalPaginas}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPagina((p) => Math.min(aantalPaginas, p + 1))}
              disabled={pagina >= aantalPaginas}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
