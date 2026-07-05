import React, { createContext, useContext, useState } from "react";

export type UitvoeringTheme = {
  achtergrond: string;
  tekst: string;
  kaart: string;
  kaartTekst: string;
  accent: string;
  accentTekst: string;
  rand: string;
  gedemptTekst: string;
  gevaar: string;
  succes: string;
  waarschuwing: string;
};

const NORMAAL_THEME: UitvoeringTheme = {
  achtergrond: "#F6F7F9",
  tekst: "#1A1D23",
  kaart: "#FFFFFF",
  kaartTekst: "#1A1D23",
  accent: "#F23B0D",
  accentTekst: "#FFFFFF",
  rand: "#E2E5EA",
  gedemptTekst: "#6B7280",
  gevaar: "#E5484D",
  succes: "#22A06B",
  waarschuwing: "#E8870E",
};

const HOOG_CONTRAST_THEME: UitvoeringTheme = {
  achtergrond: "#000000",
  tekst: "#FFFFFF",
  kaart: "#1A1A1A",
  kaartTekst: "#FFFFFF",
  accent: "#F23B0D",
  accentTekst: "#FFFFFF",
  rand: "#333333",
  gedemptTekst: "#AAAAAA",
  gevaar: "#FF4444",
  succes: "#00CC66",
  waarschuwing: "#FF9900",
};

type UitvoeringThemeContextType = {
  theme: UitvoeringTheme;
  hoogContrast: boolean;
  setHoogContrast: (aan: boolean) => void;
};

const UitvoeringThemeContext = createContext<UitvoeringThemeContextType>({
  theme: NORMAAL_THEME,
  hoogContrast: false,
  setHoogContrast: () => undefined,
});

export function UitvoeringThemeProvider({ children }: { children: React.ReactNode }) {
  const [hoogContrast, setHoogContrast] = useState(false);

  return (
    <UitvoeringThemeContext.Provider
      value={{
        theme: hoogContrast ? HOOG_CONTRAST_THEME : NORMAAL_THEME,
        hoogContrast,
        setHoogContrast,
      }}
    >
      {children}
    </UitvoeringThemeContext.Provider>
  );
}

export function useUitvoeringTheme(): UitvoeringThemeContextType {
  return useContext(UitvoeringThemeContext);
}
