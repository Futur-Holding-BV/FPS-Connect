import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useListWerkgevers, type Werkgever } from "@workspace/api-client-react";

const SLEUTEL = "fps.actieve_werkgever";

interface WerkmaatschappijContext {
  werkgevers: Werkgever[];
  actieveWerkgever: Werkgever | null;
  actieveWerkgeverId: number | null;
  setActieveWerkgeverId: (id: number) => void;
  isLoading: boolean;
}

const Ctx = createContext<WerkmaatschappijContext>({
  werkgevers: [],
  actieveWerkgever: null,
  actieveWerkgeverId: null,
  setActieveWerkgeverId: () => undefined,
  isLoading: true,
});

export function WerkmaatschappijProvider({ children }: { children: ReactNode }) {
  const { data: werkgevers = [], isLoading } = useListWerkgevers();

  const [actieveId, setActieveId] = useState<number | null>(() => {
    if (typeof localStorage === "undefined") return null;
    const opgeslagen = localStorage.getItem(SLEUTEL);
    return opgeslagen ? Number(opgeslagen) : null;
  });

  useEffect(() => {
    if (werkgevers.length === 0) return;
    if (actieveId !== null && werkgevers.some((w) => w.id === actieveId)) return;
    const eerste = werkgevers.find((w) => w.actief !== false) ?? werkgevers[0];
    setActieveId(eerste.id);
    localStorage.setItem(SLEUTEL, String(eerste.id));
  }, [werkgevers, actieveId]);

  function setActieveWerkgeverId(id: number) {
    setActieveId(id);
    localStorage.setItem(SLEUTEL, String(id));
  }

  const actieveWerkgever = werkgevers.find((w) => w.id === actieveId) ?? null;

  return (
    <Ctx.Provider value={{ werkgevers, actieveWerkgever, actieveWerkgeverId: actieveId, setActieveWerkgeverId, isLoading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWerkmaatschappij() {
  return useContext(Ctx);
}
