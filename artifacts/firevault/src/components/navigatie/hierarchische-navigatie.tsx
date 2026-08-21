import { useLocation, useSearch } from "wouter";
import {
  getGetGebouwQueryKey,
  getGetInspectieQueryKey,
  getGetModCalculatieQueryKey,
  getGetOfferteQueryKey,
  getGetOpdrachtQueryKey,
  getGetOpnameQueryKey,
  getGetVoorzieningQueryKey,
  useGetGebouw,
  useGetInspectie,
  useGetModCalculatie,
  useGetOfferte,
  useGetOpdracht,
  useGetOpname,
  useGetVoorziening,
} from "@workspace/api-client-react";
import {
  type NavigatieRouteMatch,
  resolveerNavigatieRoute,
} from "@/lib/navigatie-register";
import {
  type NavigatieKruimel,
} from "./hierarchische-navigatie-weergave";
import {
  gebouwKruimels,
  gebouwPad,
  getalId,
  NavigatieUitvoer,
  type NavigatieModel,
} from "./hierarchische-navigatie-model";

function GeneriekeNavigatie({ match, locatie }: { match: NavigatieRouteMatch; locatie: string }) {
  const huidigPad = locatie.split(/[?#]/, 1)[0];
  const opModuleOverzicht = huidigPad === match.modulePad;
  const kruimels: NavigatieKruimel[] =
    match.sleutel === "dashboard"
      ? [{ label: "Dashboard" }]
      : opModuleOverzicht
        ? [{ label: "Dashboard", pad: "/" }, { label: match.moduleLabel }]
        : match.modulePad === "/"
          ? [{ label: "Dashboard", pad: "/" }, { label: match.huidigeLabel }]
          : [
              { label: match.moduleLabel, pad: match.modulePad },
              { label: match.huidigeLabel },
            ];
  return (
    <NavigatieUitvoer
      model={{
        terugLabel: match.terugLabel,
        terugPad: match.terugPad,
        kruimels,
      }}
    />
  );
}

function GebouwNavigatie({ match }: { match: NavigatieRouteMatch }) {
  const id = getalId(match);
  const { data, isLoading } = useGetGebouw(id, {
    query: { enabled: id > 0, queryKey: getGetGebouwQueryKey(id) },
  });
  const naam = (data as { naam?: string } | undefined)?.naam ?? "Gebouw";
  let model: NavigatieModel;
  if (match.tab === "project") {
    model = {
      terugLabel: "Gebouwen",
      terugPad: "/gebouwen",
      kruimels: [{ label: "Gebouwen", pad: "/gebouwen" }, { label: naam }],
    };
  } else if (match.tab === null || match.tab === "dashboard") {
    model = {
      terugLabel: "Gebouw",
      terugPad: `${gebouwPad(id)}?tab=project`,
      kruimels: gebouwKruimels(id, naam, [{ label: "Project" }]),
    };
  } else {
    model = {
      terugLabel: "Project",
      terugPad: gebouwPad(id),
      kruimels: gebouwKruimels(id, naam, [
        { label: "Project", pad: gebouwPad(id) },
        { label: match.huidigeLabel },
      ]),
    };
  }
  return <NavigatieUitvoer model={{ ...model, laden: isLoading }} />;
}

function CalculatieNavigatie({ match }: { match: NavigatieRouteMatch }) {
  const id = getalId(match);
  const { data, isLoading } = useGetModCalculatie(id, {
    query: { enabled: id > 0, queryKey: getGetModCalculatieQueryKey(id) },
  });
  const calculatie = data as { gebouw_id?: number | null; gebouw_naam?: string | null } | undefined;
  const gebouwId = calculatie?.gebouw_id ?? null;
  const model: NavigatieModel = gebouwId
    ? {
        terugLabel: "Project",
        terugPad: gebouwPad(gebouwId),
        kruimels: gebouwKruimels(gebouwId, calculatie?.gebouw_naam ?? "Gebouw", [
          { label: "Project", pad: gebouwPad(gebouwId) },
          { label: "Calculatie" },
        ]),
      }
    : {
        terugLabel: "Calculaties",
        terugPad: match.modulePad,
        kruimels: [{ label: "Calculaties", pad: match.modulePad }, { label: "Calculatie" }],
      };
  return <NavigatieUitvoer model={{ ...model, laden: isLoading }} />;
}

function OfferteNavigatie({ match }: { match: NavigatieRouteMatch }) {
  const id = getalId(match);
  const { data, isLoading } = useGetOfferte(id, {
    query: { enabled: id > 0, queryKey: getGetOfferteQueryKey(id) },
  });
  const offerte = data as {
    gebouw_id?: number | null;
    gebouw_naam?: string | null;
    calculatie_id?: number | null;
  } | undefined;
  const gebouwId = offerte?.gebouw_id ?? null;
  const calculatieId = offerte?.calculatie_id ?? null;
  const voorouders: NavigatieKruimel[] = gebouwId
    ? gebouwKruimels(gebouwId, offerte?.gebouw_naam ?? "Gebouw", [
        { label: "Project", pad: gebouwPad(gebouwId) },
      ])
    : [{ label: "Offertes", pad: "/offertes" }];
  if (calculatieId) {
    voorouders.push({ label: "Calculatie", pad: `/modules/calculatie/${calculatieId}` });
  }
  const model: NavigatieModel = {
    terugLabel: calculatieId ? "Calculatie" : gebouwId ? "Project" : "Offertes",
    terugPad: calculatieId
      ? `/modules/calculatie/${calculatieId}`
      : gebouwId
        ? gebouwPad(gebouwId)
        : "/offertes",
    kruimels: [...voorouders, { label: "Offerte" }],
  };
  return <NavigatieUitvoer model={{ ...model, laden: isLoading }} />;
}

function OpdrachtNavigatie({ match }: { match: NavigatieRouteMatch }) {
  const id = getalId(match);
  const { data, isLoading } = useGetOpdracht(id, {
    query: { enabled: id > 0, queryKey: getGetOpdrachtQueryKey(id) },
  });
  const opdracht = data as {
    gebouw_id?: number | null;
    gebouw_naam?: string | null;
    calculatie_id?: number | null;
    offerte_id?: number | null;
  } | undefined;
  const gebouwId = opdracht?.gebouw_id ?? null;
  const calculatieId = opdracht?.calculatie_id ?? null;
  const offerteId = opdracht?.offerte_id ?? null;
  const kruimels = gebouwId
    ? gebouwKruimels(gebouwId, opdracht?.gebouw_naam ?? "Gebouw", [
        { label: "Project", pad: gebouwPad(gebouwId) },
      ])
    : [{ label: "Offertes", pad: "/offertes" }];
  if (calculatieId) kruimels.push({ label: "Calculatie", pad: `/modules/calculatie/${calculatieId}` });
  if (offerteId) kruimels.push({ label: "Offerte", pad: `/offertes/${offerteId}` });
  kruimels.push({ label: "Opdracht" });
  return (
    <NavigatieUitvoer
      model={{
        terugLabel: offerteId ? "Offerte" : gebouwId ? "Project" : "Offertes",
        terugPad: offerteId ? `/offertes/${offerteId}` : gebouwId ? gebouwPad(gebouwId) : "/offertes",
        kruimels,
        laden: isLoading,
      }}
    />
  );
}

function VoorzieningNavigatie({ match }: { match: NavigatieRouteMatch }) {
  const id = getalId(match);
  const { data, isLoading } = useGetVoorziening(id, {
    query: { enabled: id > 0, queryKey: getGetVoorzieningQueryKey(id) },
  });
  const spot = data as { gebouw_id?: number; gebouw_naam?: string | null } | undefined;
  const gebouwId = spot?.gebouw_id ?? null;
  return (
    <NavigatieUitvoer
      model={{
        terugLabel: gebouwId ? "Uitvoering" : "Voorzieningen",
        terugPad: gebouwId ? `${gebouwPad(gebouwId)}?tab=uitvoering` : "/voorzieningen",
        kruimels: gebouwId
          ? gebouwKruimels(gebouwId, spot?.gebouw_naam ?? "Gebouw", [
              { label: "Project", pad: gebouwPad(gebouwId) },
              { label: "Uitvoering", pad: `${gebouwPad(gebouwId)}?tab=uitvoering` },
              { label: match.sleutel === "voorziening:qr" ? "QR-code" : "Spot" },
            ])
          : [{ label: "Voorzieningen", pad: "/voorzieningen" }, { label: "Spot" }],
        laden: isLoading,
      }}
    />
  );
}

function InspectieNavigatie({ match }: { match: NavigatieRouteMatch }) {
  const id = getalId(match);
  const { data, isLoading } = useGetInspectie(id, {
    query: { enabled: id > 0, queryKey: getGetInspectieQueryKey(id) },
  });
  const inspectie = data as {
    gebouw_id?: number | null;
    gebouw_naam?: string | null;
    voorziening_id?: number | null;
  } | undefined;
  const gebouwId = inspectie?.gebouw_id ?? null;
  const spotId = inspectie?.voorziening_id ?? null;
  return (
    <NavigatieUitvoer
      model={{
        terugLabel: spotId ? "Spot" : gebouwId ? "Uitvoering" : "Inspecties",
        terugPad: spotId
          ? `/voorzieningen/${spotId}`
          : gebouwId
            ? `${gebouwPad(gebouwId)}?tab=uitvoering`
            : "/inspecties",
        kruimels: gebouwId
          ? gebouwKruimels(gebouwId, inspectie?.gebouw_naam ?? "Gebouw", [
              { label: "Project", pad: gebouwPad(gebouwId) },
              { label: "Uitvoering", pad: `${gebouwPad(gebouwId)}?tab=uitvoering` },
              ...(spotId ? [{ label: "Spot", pad: `/voorzieningen/${spotId}` }] : []),
              { label: "Inspectie" },
            ])
          : [{ label: "Inspecties", pad: "/inspecties" }, { label: "Inspectie" }],
        laden: isLoading,
      }}
    />
  );
}

function OpnameNavigatie({ match }: { match: NavigatieRouteMatch }) {
  const id = getalId(match);
  const { data, isLoading } = useGetOpname(id, {
    query: { enabled: id > 0, queryKey: getGetOpnameQueryKey(id) },
  });
  const opname = data as { gebouw_id?: number | null; gebouw_naam?: string | null } | undefined;
  const gebouwId = opname?.gebouw_id ?? null;
  return (
    <NavigatieUitvoer
      model={{
        terugLabel: gebouwId ? "Project" : "Opnames",
        terugPad: gebouwId ? gebouwPad(gebouwId) : "/opname",
        kruimels: gebouwId
          ? gebouwKruimels(gebouwId, opname?.gebouw_naam ?? "Gebouw", [
              { label: "Project", pad: gebouwPad(gebouwId) },
              { label: "Opname" },
            ])
          : [{ label: "Opnames", pad: "/opname" }, { label: "Opname" }],
        laden: isLoading,
      }}
    />
  );
}

export function HierarchischeNavigatie({ compact = false }: { compact?: boolean }) {
  const [pad] = useLocation();
  const zoekdeel = useSearch();
  const locatie = `${pad}${zoekdeel ? `?${zoekdeel}` : ""}`;
  const match = resolveerNavigatieRoute(locatie);
  const props = { match };
  let inhoud;
  switch (match.resolver) {
    case "gebouw": inhoud = <GebouwNavigatie {...props} />; break;
    case "calculatie": inhoud = <CalculatieNavigatie {...props} />; break;
    case "offerte": inhoud = <OfferteNavigatie {...props} />; break;
    case "opdracht": inhoud = <OpdrachtNavigatie {...props} />; break;
    case "voorziening": inhoud = <VoorzieningNavigatie {...props} />; break;
    case "inspectie": inhoud = <InspectieNavigatie {...props} />; break;
    case "opname": inhoud = <OpnameNavigatie {...props} />; break;
    default: inhoud = <GeneriekeNavigatie match={match} locatie={locatie} />;
  }
  return <div className={compact ? "px-2" : "min-w-0 flex-1"}>{inhoud}</div>;
}