import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface SignaalDoorklikProps {
  actiePad?: string | null;
  actieLabel?: string | null;
  className?: string;
  testId?: string;
  children: ReactNode;
}

export function SignaalDoorklik({
  actiePad,
  actieLabel,
  className,
  testId,
  children,
}: SignaalDoorklikProps) {
  const [, navigeer] = useLocation();

  if (!actiePad || !actieLabel) {
    return <div className={className}>{children}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => navigeer(actiePad)}
      className={cn(
        className,
        "transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      data-testid={testId}
      aria-label={actieLabel}
    >
      {children}
    </button>
  );
}