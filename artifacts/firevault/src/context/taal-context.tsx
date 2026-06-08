import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RTL_TALEN,
  OPSLAG_SLEUTEL,
  STANDAARD_TAAL,
  isGeldigeTaal,
  type TaalCode,
} from "@/i18n/talen";

type TaalContextType = {
  taal: TaalCode;
  zetTaal: (code: TaalCode, expliciet?: boolean) => void;
  synchroniseerServerTaal: (code: TaalCode) => void;
};

const TaalContext = createContext<TaalContextType>({
  taal: STANDAARD_TAAL,
  zetTaal: () => {},
  synchroniseerServerTaal: () => {},
});

function pasRichtingToe(code: TaalCode) {
  const rtl = RTL_TALEN.includes(code);
  document.documentElement.dir = rtl ? "rtl" : "ltr";
  document.documentElement.lang = code;
}

export function TaalProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [taal, setTaal] = useState<TaalCode>(
    isGeldigeTaal(i18n.language) ? i18n.language : STANDAARD_TAAL,
  );
  const heeftExplicieteKeuze = useRef(false);

  useEffect(() => {
    pasRichtingToe(taal);
  }, [taal]);

  const pasTaalToe = useCallback(
    (code: TaalCode) => {
      void i18n.changeLanguage(code);
      localStorage.setItem(OPSLAG_SLEUTEL, code);
      setTaal(code);
    },
    [i18n],
  );

  const zetTaal = useCallback(
    (code: TaalCode, expliciet = false) => {
      if (!isGeldigeTaal(code)) return;
      if (expliciet) heeftExplicieteKeuze.current = true;
      pasTaalToe(code);
    },
    [pasTaalToe],
  );

  const synchroniseerServerTaal = useCallback(
    (code: TaalCode) => {
      if (heeftExplicieteKeuze.current) return;
      if (!isGeldigeTaal(code)) return;
      pasTaalToe(code);
    },
    [pasTaalToe],
  );

  return (
    <TaalContext.Provider value={{ taal, zetTaal, synchroniseerServerTaal }}>
      {children}
    </TaalContext.Provider>
  );
}

export function useTaal() {
  return useContext(TaalContext);
}
