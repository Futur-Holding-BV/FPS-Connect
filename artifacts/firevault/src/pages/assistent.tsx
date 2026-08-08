// ASSISTENT_01 §3 — op de telefoon is de assistent een eigen scherm,
// geen zwevend venster over de inhoud heen.
import { AssistentInhoud } from "@/components/assistent-inhoud";

export default function AssistentPagina() {
  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] -m-3 md:m-0 md:h-[calc(100dvh-10rem)] md:border md:rounded-lg md:overflow-hidden">
      <AssistentInhoud />
    </div>
  );
}
