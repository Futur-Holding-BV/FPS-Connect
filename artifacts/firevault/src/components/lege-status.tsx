import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface LegeStatusProps {
  icoon?: LucideIcon;
  titel: string;
  beschrijving?: string;
  actieLabel?: string;
  actieHref?: string;
  actieOnClick?: () => void;
  secondairActieLabel?: string;
  secondairActieHref?: string;
  secondairActieOnClick?: () => void;
  variant?: "pagina" | "kaart" | "inline";
  className?: string;
}

export function LegeStatus({
  icoon: Icoon,
  titel,
  beschrijving,
  actieLabel,
  actieHref,
  actieOnClick,
  secondairActieLabel,
  secondairActieHref,
  secondairActieOnClick,
  variant = "pagina",
  className,
}: LegeStatusProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "pagina" && "py-20 px-4",
        variant === "kaart" && "py-12 px-4",
        variant === "inline" && "py-8 px-4",
        className,
      )}
    >
      {Icoon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Icoon className="h-7 w-7 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{titel}</h3>
      {beschrijving && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{beschrijving}</p>
      )}
      {(actieLabel || secondairActieLabel) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {actieLabel && actieHref && (
            <Button asChild size="sm">
              <Link href={actieHref}>{actieLabel}</Link>
            </Button>
          )}
          {actieLabel && actieOnClick && (
            <Button size="sm" onClick={actieOnClick}>
              {actieLabel}
            </Button>
          )}
          {secondairActieLabel && secondairActieHref && (
            <Button asChild variant="outline" size="sm">
              <Link href={secondairActieHref}>{secondairActieLabel}</Link>
            </Button>
          )}
          {secondairActieLabel && secondairActieOnClick && (
            <Button variant="outline" size="sm" onClick={secondairActieOnClick}>
              {secondairActieLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
