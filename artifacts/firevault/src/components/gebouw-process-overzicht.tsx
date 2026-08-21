import { useGetGebouwProcessStatus } from "@workspace/api-client-react";
import { ProcesBalk } from "./proces-balk";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Euro } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FinancialMetric {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
}

export function GebouwProcessOverzicht({
  gebouwId,
  financialMetrics
}: {
  gebouwId: number;
  financialMetrics: FinancialMetric[];
}) {
  const { data, isLoading, isError } = useGetGebouwProcessStatus(gebouwId);

  if (isLoading) {
    return (
      <div data-testid="server-process-overview" className="h-[120px] flex items-center justify-center border rounded-lg bg-card">
        <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div data-testid="server-process-overview" className="p-4 border border-destructive/50 rounded-lg text-destructive text-sm bg-card">
        Fout bij laden processtatus.
      </div>
    );
  }

  const { fasen, huidige_stap, all_afgerond } = data;

  const stappen = fasen.map(f => ({ sleutel: f.sleutel, label: f.label }));
  
  const huidigeFase = fasen.find(f => f.sleutel === huidige_stap) || fasen.find(f => f.toestand === "actief");
  
  const toekomstigeFasen = fasen.filter(f => f.toestand === "toekomstig");

  return (
    <div data-testid="server-process-overview" className="flex flex-col md:flex-row gap-4 border rounded-lg bg-card p-3 shadow-sm items-start overflow-hidden w-full">
      
      {/* Kolom 1: Actueel (a & b) */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div data-testid="process-current-step">
          <span className="text-xs font-semibold text-muted-foreground mb-1.5 block">Projectflow</span>
          <ProcesBalk 
            stappen={stappen} 
            huidige={all_afgerond ? "ALLES_AFGEROND" : (huidige_stap ?? "ONBEKEND")} 
          />
          {huidigeFase && (
            <div className="mt-2 text-sm font-medium text-slate-800">
              Huidige stap: {huidigeFase.label}
            </div>
          )}
        </div>

        <div data-testid="process-open-action" className="mt-1">
          {all_afgerond ? (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-md">
              <CheckCircle2 className="h-4 w-4" />
              Alle fasen succesvol afgerond
            </div>
          ) : huidigeFase ? (
            <div className={cn("rounded-md px-3 py-2 flex flex-col gap-1 items-start", huidigeFase.blocker_message ? "bg-amber-50 border border-amber-200" : "bg-slate-50 border border-slate-200")}>
              {huidigeFase.blocker_message && (
                <div className="flex items-start gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-sm text-amber-900 font-medium">
                    {huidigeFase.blocker_message}
                  </div>
                </div>
              )}
              {huidigeFase.action_path && huidigeFase.action_label && (
                <div className={huidigeFase.blocker_message ? "pl-6" : ""}>
                  <a href={huidigeFase.action_path} className={cn("inline-flex items-center gap-1 font-semibold text-xs border px-2 py-0.5 rounded-sm transition-colors", huidigeFase.blocker_message ? "text-amber-700 hover:text-amber-900 border-amber-300 bg-amber-100/50 hover:bg-amber-100" : "text-primary hover:text-primary/80 border-primary/30 bg-primary/5 hover:bg-primary/10")}>
                    {huidigeFase.action_label} <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Kolom 2: Financieel (c) */}
      <div 
        data-testid="process-financial" 
        className="w-full md:w-56 shrink-0 rounded-md border bg-slate-50/50 p-2.5 flex flex-col gap-2"
        style={{ borderTop: "3px solid hsl(var(--hoofdstuk-financieel))" }}
      >
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full flex shrink-0" style={{ backgroundColor: "hsl(var(--hoofdstuk-financieel))" }} />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
            <Euro className="h-3.5 w-3.5" /> Financieel
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
          {financialMetrics.map((metric, i) => (
            <div key={i}>
              <p className="text-[10px] text-muted-foreground">{metric.label}</p>
              <div className="text-sm font-semibold tabular-nums text-slate-900">{metric.value}</div>
              {metric.subtext && <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{metric.subtext}</p>}
            </div>
          ))}
          {financialMetrics.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Geen financiële data beschikbaar.</p>
          )}
        </div>
      </div>

      {/* Kolom 3: Toekomstig (d) */}
      <div data-testid="process-future-phases" className="w-full md:w-64 shrink-0 flex flex-col gap-1.5 md:border-l border-t md:border-t-0 md:pl-4 pt-3 md:pt-0 mt-2 md:mt-0">
        <span className="text-xs font-semibold text-muted-foreground mb-0.5">Verwachte stappen</span>
        {toekomstigeFasen.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {toekomstigeFasen.map(f => (
              <div key={f.sleutel} className="text-xs text-slate-500 border border-slate-100 bg-slate-50/50 rounded px-2 py-1.5 opacity-70">
                <div className="font-medium text-slate-600 flex items-center justify-between">
                  {f.label}
                </div>
                {f.blocker_message && <div className="mt-0.5 text-[10px] leading-tight italic">{f.blocker_message}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic bg-slate-50/50 border border-slate-100 rounded px-2 py-1.5">
            Geen toekomstige stappen
          </div>
        )}
      </div>
    </div>
  );
}
