import { useParams } from "wouter";

/**
 * Leest het gebouw-ID uit de URL-parameters op een consistente manier.
 *
 * Ondersteunde parameternamen: `:id` (standaard voor gebouw-detailpagina's)
 * en `:gebouwId` (voor submodule-routes met een eigen `:id`-segment).
 *
 * Gebruik:
 *   const gebouwId = useGebouwId();
 *   const { data } = useListOpnames(gebouwId ? { gebouw_id: gebouwId } : skipToken);
 */
export function useGebouwId(): number | null {
  const params = useParams<{ id?: string; gebouwId?: string }>();
  const raw = params.id ?? params.gebouwId;
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}
