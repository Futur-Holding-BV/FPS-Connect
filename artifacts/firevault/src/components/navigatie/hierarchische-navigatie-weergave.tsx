import * as React from "react";
import { ArrowLeft, CornerUpLeft } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export interface NavigatieKruimel {
  label: string;
  pad?: string;
}

export interface NavigatieInstroom {
  label: string;
  pad: string;
}

export interface HierarchischeNavigatieWeergaveProps {
  terugLabel: string;
  terugPad: string;
  kruimels: NavigatieKruimel[];
  instroom?: NavigatieInstroom | null;
  compact?: boolean;
  laden?: boolean;
  onNavigeer: (
    pad: string,
    opties?: { vervang?: boolean; wisInstroom?: boolean }
  ) => void;
}

export function HierarchischeNavigatieWeergave({
  terugLabel,
  terugPad,
  kruimels,
  instroom,
  compact = false,
  laden = false,
  onNavigeer,
}: HierarchischeNavigatieWeergaveProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 w-full",
        compact ? "py-1" : "py-2",
        laden && "opacity-60 pointer-events-none"
      )}
      data-testid="nav-hierarchy-container"
    >
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        <button
          onClick={() => onNavigeer(terugPad)}
          className={cn(
            "inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1"
          )}
          title={`Terug naar ${terugLabel}`}
          type="button"
          data-testid="button-nav-terug"
        >
          <ArrowLeft className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
          <span className="hidden sm:inline">Terug naar {terugLabel}</span>
        </button>

        <div
          className="h-4 w-px bg-border shrink-0 hidden sm:block"
          aria-hidden="true"
        />

        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className={cn(compact && "text-xs sm:gap-1.5")}>
            {kruimels.map((kruimel, index) => {
              const isLaatste = index === kruimels.length - 1;
              const hasPad = Boolean(kruimel.pad);
              const isClickable = !isLaatste && hasPad;

              return (
                <React.Fragment key={`${kruimel.label}-${index}`}>
                  <BreadcrumbItem>
                    {isClickable ? (
                      <BreadcrumbLink asChild>
                        <button
                          type="button"
                          onClick={() => onNavigeer(kruimel.pad!)}
                          data-testid={`link-breadcrumb-${index}`}
                          className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        >
                          {kruimel.label}
                        </button>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage
                        className={cn(
                          "font-semibold text-foreground",
                          compact && "text-xs"
                        )}
                        data-testid="text-breadcrumb-current"
                      >
                        {kruimel.label}
                      </BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {!isLaatste && <BreadcrumbSeparator />}
                </React.Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {instroom && (
        <div className="flex items-center shrink-0">
          <button
            onClick={() => onNavigeer(instroom.pad, { wisInstroom: true })}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compact ? "px-1.5 py-0.5" : "px-2 py-1"
            )}
            title={`Terug naar instroom: ${instroom.label}`}
            type="button"
            data-testid="button-nav-instroom"
          >
            <CornerUpLeft className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[200px] sm:max-w-[250px]">
              Terug naar <span className="font-medium">{instroom.label}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
