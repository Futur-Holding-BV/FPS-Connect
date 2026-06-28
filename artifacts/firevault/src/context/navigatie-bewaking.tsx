import { createContext, useContext, useState, useCallback, useRef } from "react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type OpslaanFn = (() => void | Promise<void>) | null;

interface NavigatieBewakingCtxType {
  isDirty: boolean;
  meldDirty: (dirty: boolean, onSave?: OpslaanFn) => void;
  requestTerug: () => void;
}

const NavigatieBewakingCtx = createContext<NavigatieBewakingCtxType | null>(null);

export function NavigatieBewakingProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const [heeftOpslaanFn, setHeeftOpslaanFn] = useState(false);
  const opslaanRef = useRef<OpslaanFn>(null);
  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [bezig, setBezig] = useState(false);

  const meldDirty = useCallback((dirty: boolean, onSave?: OpslaanFn) => {
    setIsDirty(dirty);
    setHeeftOpslaanFn(dirty && !!onSave);
    opslaanRef.current = dirty ? (onSave ?? null) : null;
  }, []);

  const requestTerug = useCallback(() => {
    if (!isDirty) {
      window.history.back();
      return;
    }
    setDialoogOpen(true);
  }, [isDirty]);

  async function handleOpslaanEnVerlaten() {
    if (opslaanRef.current) {
      setBezig(true);
      try {
        await opslaanRef.current();
      } finally {
        setBezig(false);
      }
    }
    setIsDirty(false);
    setDialoogOpen(false);
    window.history.back();
  }

  function handleVerlaten() {
    setIsDirty(false);
    setDialoogOpen(false);
    window.history.back();
  }

  return (
    <NavigatieBewakingCtx.Provider value={{ isDirty, meldDirty, requestTerug }}>
      {children}
      <AlertDialog
        open={dialoogOpen}
        onOpenChange={(open) => { if (!bezig) setDialoogOpen(open); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Niet-opgeslagen wijzigingen</AlertDialogTitle>
            <AlertDialogDescription>
              {heeftOpslaanFn
                ? "Wilt u de wijzigingen opslaan voordat u de pagina verlaat?"
                : "U heeft niet-opgeslagen wijzigingen. Als u verdergaat, gaan deze verloren."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bezig}>Annuleren</AlertDialogCancel>
            <Button variant="outline" onClick={handleVerlaten} disabled={bezig}>
              Verlaten
            </Button>
            {heeftOpslaanFn && (
              <AlertDialogAction onClick={handleOpslaanEnVerlaten} disabled={bezig}>
                {bezig ? "Opslaan..." : "Opslaan en verlaten"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NavigatieBewakingCtx.Provider>
  );
}

export function useNavigatieBewaking(): NavigatieBewakingCtxType {
  const ctx = useContext(NavigatieBewakingCtx);
  if (!ctx) throw new Error("useNavigatieBewaking: geen NavigatieBewakingProvider gevonden");
  return ctx;
}
