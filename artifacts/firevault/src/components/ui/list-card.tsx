import { cn } from "@/lib/utils";
import React from "react";

export interface ListCardProps {
  onNavigate: () => void;
  statusKleur?: string;
  acties?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  gearchiveerd?: boolean;
}

/**
 * ListCard — centrale component voor alle lijstweergaven in FPS Connect.
 *
 * De volledige kaart is klikbaar (onClick + keyboard). Elementen met eigen
 * klikgedrag (actiemenu, knoppen) worden doorgegeven via `acties` en krijgen
 * automatisch stopPropagation.
 */
export function ListCard({
  onNavigate,
  statusKleur,
  acties,
  children,
  className,
  gearchiveerd = false,
}: ListCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNavigate();
        }
      }}
      className={cn(
        "group relative flex items-center gap-4 rounded-xl border bg-card px-5 py-4",
        "cursor-pointer shadow-sm",
        "hover:shadow-md hover:-translate-y-px hover:bg-muted/30",
        "transition-all duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        gearchiveerd && "opacity-60",
        className,
      )}
    >
      {/* Status-streep links */}
      {statusKleur && (
        <div
          className={cn(
            "absolute left-0 top-3 bottom-3 w-1 rounded-r-full",
            statusKleur,
          )}
        />
      )}

      {/* Inhoud */}
      <div className="flex-1 min-w-0">{children}</div>

      {/* Acties — stopPropagation zodat kaart niet opent */}
      {acties && (
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="shrink-0 flex items-center gap-1"
        >
          {acties}
        </div>
      )}
    </div>
  );
}
