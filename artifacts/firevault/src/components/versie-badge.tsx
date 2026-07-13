import { useGetVersie } from "@workspace/api-client-react";
import { TriangleAlert } from "lucide-react";

// Bij de productie-build (deploy/Dockerfile.caddy) worden VITE_GIT_COMMIT en
// VITE_BUILD_TIJD in de webbundel gebakken. In dev zijn ze leeg.
const WEB_COMMIT: string = import.meta.env.VITE_GIT_COMMIT ?? "";
const WEB_BUILD_TIJD: string = import.meta.env.VITE_BUILD_TIJD ?? "";

export function VersieBadge() {
  const { data } = useGetVersie();
  if (!data) {
    return null;
  }

  const webLabel = WEB_COMMIT
    ? `${WEB_BUILD_TIJD ? WEB_BUILD_TIJD.slice(0, 10) : "?"} (${WEB_COMMIT})`
    : "dev";
  const apiLabel = `${data.gebouwd_op ? data.gebouwd_op.slice(0, 10) : "dev"} (${data.commit})`;
  const mismatch =
    WEB_COMMIT !== "" &&
    data.commit !== "onbekend" &&
    WEB_COMMIT !== data.commit;

  const titel = mismatch
    ? `Let op: web en API draaien niet dezelfde versie.\nWeb: ${webLabel}\nAPI: ${apiLabel}`
    : `Web: ${webLabel}\nAPI: ${apiLabel}`;

  return (
    <span
      title={titel}
      data-testid="versie-badge"
      className="hidden sm:inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground select-all"
    >
      {mismatch && <TriangleAlert className="h-3 w-3 text-amber-600" />}
      v{data.versie}
    </span>
  );
}
