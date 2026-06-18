import React, { createContext, useCallback, useContext, useState } from "react";
import { controleerAchievements } from "@workspace/api-client-react";
import type { Achievement } from "@workspace/api-client-react";
import { AchievementCelebration } from "@/components/AchievementCelebration";
import { useAuth } from "./auth";

type AchievementContextType = {
  checkAchievements: () => Promise<void>;
};

const AchievementContext = createContext<AchievementContextType>({
  checkAchievements: async () => {},
});

export function AchievementProvider({ children }: { children: React.ReactNode }) {
  const [huidigAchievement, setHuidigAchievement] = useState<Achievement | null>(null);
  const { gebruiker } = useAuth();

  const checkAchievements = useCallback(async () => {
    try {
      const result = await controleerAchievements();
      if (result.nieuw.length > 0) {
        // Toon de hoogst behaalde achievement van deze sessie
        const hoogste = result.nieuw[result.nieuw.length - 1];
        setHuidigAchievement(hoogste ?? null);
      }
    } catch {
      // achievement check is niet-kritiek
    }
  }, []);

  function dismissAchievement() {
    setHuidigAchievement(null);
  }

  return (
    <AchievementContext.Provider value={{ checkAchievements }}>
      {children}
      {huidigAchievement && (
        <AchievementCelebration
          achievement={huidigAchievement}
          naam={gebruiker?.naam ?? ""}
          onDismiss={dismissAchievement}
        />
      )}
    </AchievementContext.Provider>
  );
}

export function useAchievement() {
  return useContext(AchievementContext);
}
