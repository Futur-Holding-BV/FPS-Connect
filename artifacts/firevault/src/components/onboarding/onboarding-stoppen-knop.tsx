import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetHrmStatsQueryKey,
  getGetOnboardingContextQueryKey,
  getGetWizardStatusQueryKey,
  getListGebruikersQueryKey,
  getListMedewerkersQueryKey,
  useCancelOnboarding,
  useGetOnboardingContext,
} from "@workspace/api-client-react";
import type { OnboardingContext } from "@workspace/api-client-react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

function foutmelding(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  return (error as { data?: { error?: string } }).data?.error ?? null;
}

export function OnboardingStoppenKnop() {
  const zoekString = useSearch();
  const [, navigeer] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const annuleren = useCancelOnboarding();

  const userIdWaarde = new URLSearchParams(zoekString).get("userId");
  const userId =
    userIdWaarde !== null && /^\d+$/.test(userIdWaarde.trim())
      ? Number(userIdWaarde.trim())
      : null;
  const contextQuery = useGetOnboardingContext(userId ?? 0, {
    query: {
      enabled: userId !== null,
      retry: false,
      queryKey: getGetOnboardingContextQueryKey(userId ?? 0),
    },
  });
  const context = contextQuery.data as OnboardingContext | undefined;
  const medewerkerId = context?.concept_medewerker_id ?? null;
  const controleBezig = userId !== null && contextQuery.isFetching;

  async function stopOnboarding(): Promise<void> {
    if (controleBezig) return;

    try {
      const actueleContext =
        userId === null
          ? null
          : ((await contextQuery.refetch()).data as OnboardingContext | undefined);
      if (userId !== null && !actueleContext) {
        throw new Error(
          "De opgeslagen onboardinggegevens konden niet veilig worden gecontroleerd. Probeer het opnieuw.",
        );
      }
      const actueelMedewerkerId = actueleContext?.concept_medewerker_id ?? null;

      if (userId !== null) {
        await annuleren.mutateAsync({ id: userId });
        if (actueelMedewerkerId !== null) {
          queryClient.removeQueries({
            queryKey: getGetWizardStatusQueryKey(actueelMedewerkerId),
          });
        }
        queryClient.removeQueries({
          queryKey: getGetOnboardingContextQueryKey(userId),
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListMedewerkersQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListGebruikersQueryKey() }),
      ]);
      toast({
        title: "Onboarding gestopt",
        description:
          userId === null
            ? "Niet-opgeslagen invoer is gewist. Er was nog geen gebruikersaccount aangemaakt."
            : actueelMedewerkerId === null
              ? "De onboardinggegevens en het gekoppelde gebruikersaccount zijn verwijderd."
              : "Het medewerkerconcept, de onboardinggegevens en het gekoppelde gebruikersaccount zijn verwijderd.",
      });
      navigeer("/personeel?tab=medewerkers", { replace: true });
    } catch (error) {
      toast({
        title: "Onboarding stoppen mislukt",
        description:
          foutmelding(error) ??
          "De onboardinggegevens zijn niet verwijderd. Probeer het opnieuw.",
        variant: "destructive",
      });
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          data-testid="knop-onboarding-stoppen"
          onClick={() => {
            if (userId !== null) void contextQuery.refetch();
          }}
        >
          <X className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Onboarding stoppen</span>
          <span className="sm:hidden">Stoppen</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Onboarding stoppen en gegevens verwijderen?</AlertDialogTitle>
          <AlertDialogDescription>
            {controleBezig
              ? "De opgeslagen onboardinggegevens worden gecontroleerd…"
              : medewerkerId !== null
                ? "Het onafgeronde medewerkerconcept, alle ingevulde onboardinggegevens, gekoppelde onboardingdocumenten en het gebruikersaccount worden definitief verwijderd."
                : userId !== null
                  ? "Alle invoer in deze onboarding en het gekoppelde gebruikersaccount worden definitief verwijderd."
                  : "Alle invoer in deze nog niet opgeslagen onboarding gaat verloren. Er is nog geen gebruikersaccount aangemaakt."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Doorgaan met onboarding</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={controleBezig || annuleren.isPending}
            onClick={() => void stopOnboarding()}
            data-testid="knop-onboarding-stoppen-bevestigen"
          >
            {annuleren.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verwijderen…
              </>
            ) : (
              "Stoppen en verwijderen"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}