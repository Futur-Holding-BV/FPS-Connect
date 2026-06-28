import { useEffect, useRef } from "react";
import { useNavigatieBewaking } from "@/context/navigatie-bewaking";

type OpslaanFn = (() => void | Promise<void>) | null | undefined;

/**
 * Registreer dirty-state voor de navigatiebewaking.
 * Als dirty=true en de gebruiker op Terug klikt, verschijnt een bevestigingsdialoog.
 * Als onSave meegegeven is, verschijnt ook de knop "Opslaan en verlaten".
 *
 * Gebruik:
 *   useMeldDirty(isGewijzigd, () => opslaanMutatie.mutateAsync(data));
 *
 * Wordt automatisch opgeschoond bij unmount.
 */
export function useMeldDirty(dirty: boolean, onSave?: OpslaanFn) {
  const { meldDirty } = useNavigatieBewaking();

  const opslaanRef = useRef<OpslaanFn>(onSave);
  useEffect(() => { opslaanRef.current = onSave; });

  useEffect(() => {
    const fn: OpslaanFn = dirty ? (() => opslaanRef.current?.()) : null;
    meldDirty(dirty, fn);
    return () => { meldDirty(false, null); };
  }, [dirty, meldDirty]);
}
