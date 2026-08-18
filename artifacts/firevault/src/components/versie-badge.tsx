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

  // UITROL_BEWAKING_01: de API meldt of productie achterloopt op de laatst
  // gemelde uitrol (main). Zichtbaar in de balk waar je dagelijks langskomt.
  const achterloop = data.achterloop === true;

  const regels = [`Web: ${webLabel}`, `API: ${apiLabel}`];
  if (mismatch) regels.unshift("Let op: web en API draaien niet dezelfde versie.");
  if (achterloop) {
    regels.unshift(
      `Let op: productie loopt achter — verwacht commit ${data.verwacht_commit || "?"} is niet uitgerold. Zie het actiepunt in de werkbak.`,
    );
  }
  const titel = regels.join("\n");

  return (
    <span
      title={titel}
      data-testid="versie-badge"
      className={`hidden sm:inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-none select-all ${
        achterloop
          ? "border-amber-500 bg-amber-100 text-amber-700"
          : "border-border text-muted-foreground"
      }`}
    >
      {(mismatch || achterloop) && <TriangleAlert className="h-3 w-3 text-amber-600" />}
      v{data.versie}
    </span>
  );
}
