import { useNavigatieBewaking } from "@/context/navigatie-bewaking";
import type { NavigatieRouteMatch } from "@/lib/navigatie-register";
import {
  HierarchischeNavigatieWeergave,
  type NavigatieKruimel,
} from "./hierarchische-navigatie-weergave";

export interface NavigatieModel {
  terugLabel: string;
  terugPad: string;
  kruimels: NavigatieKruimel[];
  laden?: boolean;
}

export function getalId(match: NavigatieRouteMatch): number {
  const id = Number(match.params.id);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

export function gebouwPad(id: number): string {
  return `/gebouwen/${id}`;
}

export function gebouwKruimels(
  id: number,
  naam: string,
  huidige: NavigatieKruimel[],
): NavigatieKruimel[] {
  return [
    { label: "Gebouwen", pad: "/gebouwen" },
    { label: naam, pad: `${gebouwPad(id)}?tab=project` },
    ...huidige,
  ];
}

export function NavigatieUitvoer({
  model,
  compact = false,
}: {
  model: NavigatieModel;
  compact?: boolean;
}) {
  const { instroom, requestNavigatie } = useNavigatieBewaking();
  return (
    <HierarchischeNavigatieWeergave
      {...model}
      compact={compact}
      instroom={instroom}
      onNavigeer={requestNavigatie}
    />
  );
}