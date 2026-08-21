import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetVeiligheidMeldingen } from "@workspace/api-client-react";
import { AlertTriangle, X, ArrowRight, ShieldAlert, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useNavigatieBewaking } from "@/context/navigatie-bewaking";

const SESSION_BANNER_KEY = "fps.veiligheidsmelding.banner_verborgen";
const SESSION_MODAL_KEY  = "fps.veiligheidsmelding.modal_getoond";

function isVerborgen(): boolean {
  try { return sessionStorage.getItem(SESSION_BANNER_KEY) === "1"; } catch { return false; }
}
function setVerborgen() {
  try { sessionStorage.setItem(SESSION_BANNER_KEY, "1"); } catch {}
}
function isModalGetoond(): boolean {
  try { return sessionStorage.getItem(SESSION_MODAL_KEY) === "1"; } catch { return false; }
}
function setModalGetoond() {
  try { sessionStorage.setItem(SESSION_MODAL_KEY, "1"); } catch {}
}

export function VeiligheidMeldingBanner() {
  const [locatie] = useLocation();
  const { requestNavigatie } = useNavigatieBewaking();
  const [verborgen, setVerborgenState] = useState(isVerborgen);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: meldingen, refetch } = useGetVeiligheidMeldingen();

  // Poll elke 2 minuten
  useEffect(() => {
    const timer = setInterval(() => void refetch(), 120_000);
    return () => clearInterval(timer);
  }, [refetch]);

  const urgente = (meldingen ?? []).filter(
    (m) =>
      m.status !== "afgehandeld" &&
      (m.prioriteit === "hoog" || m.prioriteit === "kritiek"),
  );
  const kritiekeOpen = urgente.filter((m) => m.prioriteit === "kritiek");

  // Toon modal één keer per sessie als er kritieke meldingen zijn
  useEffect(() => {
    if (kritiekeOpen.length > 0 && !isModalGetoond()) {
      setModalOpen(true);
      setModalGetoond();
    }
  }, [kritiekeOpen.length]);

  // Wis banner-verbergen als er nieuwe meldingen zijn na verbergen
  const [voorgaandAantal, setVoorgaandAantal] = useState(urgente.length);
  useEffect(() => {
    if (urgente.length > voorgaandAantal) {
      setVerborgenState(false);
      try { sessionStorage.removeItem(SESSION_BANNER_KEY); } catch {}
    }
    setVoorgaandAantal(urgente.length);
  }, [urgente.length, voorgaandAantal]);

  const verbergBanner = useCallback(() => {
    setVerborgen();
    setVerborgenState(true);
  }, []);

  // Meest urgente melding voor weergave
  const meestUrgent = kritiekeOpen[0] ?? urgente[0];

  if (urgente.length === 0) return null;

  return (
    <>
      {/* ── Persistent banner ─── */}
      {!verborgen && (
        <div
          role="alert"
          className={cn(
            "w-full flex items-center gap-3 px-4 py-2.5 text-white shadow-sm border-b",
            kritiekeOpen.length > 0
              ? "bg-red-700 border-red-800"
              : "bg-orange-600 border-orange-700",
          )}
        >
          {kritiekeOpen.length > 0 ? (
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-100" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 text-orange-100" />
          )}

          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm">
              {urgente.length === 1
                ? "1 openstaande veiligheidsmelding vereist direct actie"
                : `${urgente.length} openstaande veiligheidsmeldingen vereisen direct actie`}
              {kritiekeOpen.length > 0 && (
                <span className="ml-2 uppercase tracking-wide text-[11px] font-bold bg-white/20 px-1.5 py-0.5 rounded">
                  Kritiek
                </span>
              )}
            </span>
            {meestUrgent && (
              <p className="text-xs text-white/80 truncate mt-0.5 hidden sm:block">
                {meestUrgent.omschrijving}
                {meestUrgent.locatie ? ` — ${meestUrgent.locatie}` : ""}
              </p>
            )}
          </div>

          <Button
            size="sm"
            variant="secondary"
            className="shrink-0 text-xs font-semibold bg-white/15 hover:bg-white/25 border border-white/30 text-white"
            onClick={() => requestNavigatie("/veiligheid/meldingen", {
              instroom: { label: "Veiligheidsmelding", pad: locatie },
            })}
          >
            Bekijk nu
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>

          {/* Verberg alleen voor niet-kritieke meldingen ook per sessie */}
          <button
            type="button"
            onClick={verbergBanner}
            title="Verberg banner voor deze sessie"
            className="shrink-0 rounded p-1 hover:bg-white/20 transition-colors"
          >
            <X className="h-4 w-4 text-white/80" />
          </button>
        </div>
      )}

      {/* ── Kritieke modal (eenmalig per sessie) ─── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md border-red-300">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <ShieldAlert className="h-5 w-5" />
              Kritieke veiligheidsmelding
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm font-medium text-slate-800">
              {kritiekeOpen.length === 1
                ? "Er is 1 kritieke veiligheidsmelding die directe actie vereist van de projectleider en werkvoorbereider."
                : `Er zijn ${kritiekeOpen.length} kritieke veiligheidsmeldingen die directe actie vereisen van de projectleider en werkvoorbereider.`}
            </p>
            <div className="space-y-2">
              {kritiekeOpen.slice(0, 3).map((m) => (
                <div
                  key={m.id}
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2"
                >
                  <p className="text-sm font-medium text-red-900 line-clamp-2">
                    {m.omschrijving}
                  </p>
                  {(m.locatie || m.project_naam) && (
                    <p className="text-xs text-red-700 mt-0.5">
                      {[m.locatie, m.project_naam].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              ))}
              {kritiekeOpen.length > 3 && (
                <p className="text-xs text-muted-foreground pl-1">
                  + {kritiekeOpen.length - 3} meer melding{kritiekeOpen.length - 3 !== 1 ? "en" : ""}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Sluiten
            </Button>
            <Button
              className="bg-red-700 hover:bg-red-800 text-white"
              onClick={() => {
                setModalOpen(false);
                requestNavigatie("/veiligheid/meldingen", {
                  instroom: { label: "Veiligheidsmelding", pad: locatie },
                });
              }}
            >
              <ArrowRight className="h-4 w-4 mr-1.5" />
              Ga naar meldingen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OpenMeldingenBadge() {
  const { data: meldingen, refetch } = useGetVeiligheidMeldingen();

  useEffect(() => {
    const timer = setInterval(() => void refetch(), 120_000);
    return () => clearInterval(timer);
  }, [refetch]);

  const aantalOpen = (meldingen ?? []).filter(
    (m) => m.status !== "afgehandeld",
  ).length;

  const aantalKritiek = (meldingen ?? []).filter(
    (m) => m.status !== "afgehandeld" && m.prioriteit === "kritiek",
  ).length;

  if (aantalOpen === 0) return null;

  return (
    <span
      className={cn(
        "ml-auto text-[10px] px-1.5 py-0 min-w-5 h-4 rounded-full font-semibold inline-flex items-center justify-center group-data-[collapsible=icon]:hidden",
        aantalKritiek > 0
          ? "bg-red-600 text-white"
          : "bg-orange-500 text-white",
      )}
    >
      {aantalOpen > 99 ? "99+" : aantalOpen}
    </span>
  );
}
