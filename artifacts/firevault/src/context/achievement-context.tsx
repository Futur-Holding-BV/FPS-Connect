import { Award, Trophy, X } from "lucide-react";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useControleerAchievements } from "@workspace/api-client-react";
import type { Achievement } from "@workspace/api-client-react";
import { useAuth } from "./auth-context";

type AchievementContextType = {
  checkAchievements: () => Promise<void>;
};

const AchievementContext = createContext<AchievementContextType>({
  checkAchievements: async () => {},
});

function achievementKleur(beloning: string): string {
  if (beloning.includes("Legende")) return "#F23B0D";
  if (beloning.includes("Diamanten")) return "#4FC3F7";
  if (beloning.includes("Kristallen")) return "#00CED1";
  if (beloning.includes("Gouden")) return "#FFD700";
  if (beloning.includes("Zilveren")) return "#C0C0C0";
  if (beloning.includes("Bronzen")) return "#CD7F32";
  if (beloning.includes("Speciale")) return "#9B59B6";
  return "#888";
}

function isTrophy(beloning: string): boolean {
  return (
    beloning.includes("beker") ||
    beloning.includes("Kristallen") ||
    beloning.includes("Diamanten") ||
    beloning.includes("Legende")
  );
}

function AchievementToastItem({
  achievement,
  naam,
  onDismiss,
}: {
  achievement: Achievement;
  naam: string;
  onDismiss: () => void;
}) {
  const [, navigate] = useLocation();
  const kleur = achievementKleur(achievement.beloning);

  function handleKlik() {
    onDismiss();
    if (achievement.medewerker_id) {
      navigate(`/personeel/${achievement.medewerker_id}`);
    }
  }

  return (
    <div
      onClick={handleKlik}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleKlik()}
      className="flex items-start gap-3 rounded-xl p-4 shadow-2xl cursor-pointer transition-colors"
      style={{
        background: "#1a1f2b",
        border: `1.5px solid ${kleur}`,
        minWidth: 288,
        maxWidth: 360,
      }}
    >
      <div
        className="flex-shrink-0 mt-0.5 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: `${kleur}22`, border: `2px solid ${kleur}` }}
      >
        {isTrophy(achievement.beloning) ? (
          <Trophy className="h-5 w-5" style={{ color: kleur }} />
        ) : (
          <Award className="h-5 w-5" style={{ color: kleur }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white leading-snug">
          {naam} heeft{" "}
          {achievement.spots_mijlpaal === 999
            ? "de 999e"
            : `de ${achievement.spots_mijlpaal}e`}{" "}
          Spot geplaatst
        </p>
        <p className="text-xs text-gray-400 mt-0.5">Nieuwe rang</p>
        <p className="text-sm font-semibold mt-0.5" style={{ color: kleur }}>
          {achievement.rang}
        </p>
        <p className="text-xs mt-0.5" style={{ color: kleur + "99" }}>
          {achievement.beloning}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
        aria-label="Sluiten"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AchievementProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Achievement[]>([]);
  const { gebruiker } = useAuth();
  const controleer = useControleerAchievements();
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((a) => a.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const checkAchievements = useCallback(async () => {
    try {
      const result = await controleer.mutateAsync();
      if (!result.nieuw.length) return;
      setToasts((prev) => [...prev, ...result.nieuw]);
      for (const a of result.nieuw) {
        const t = setTimeout(() => dismissToast(a.id), 5000);
        timers.current.set(a.id, t);
      }
    } catch {
      // achievement check is niet-kritiek
    }
  }, [controleer, dismissToast]);

  return (
    <AchievementContext.Provider value={{ checkAchievements }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-auto">
          {toasts.map((a) => (
            <AchievementToastItem
              key={a.id}
              achievement={a}
              naam={gebruiker?.naam ?? "Gebruiker"}
              onDismiss={() => dismissToast(a.id)}
            />
          ))}
        </div>
      )}
    </AchievementContext.Provider>
  );
}

export function useAchievement() {
  return useContext(AchievementContext);
}
