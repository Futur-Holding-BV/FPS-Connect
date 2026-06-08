import { useParams, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Plattegrond() {
  const { id, verdiepingId } = useParams<{ id: string, verdiepingId: string }>();

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col">
      <div className="flex items-center gap-4 mb-4">
        <Link href={`/gebouwen/${id}`}>
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plattegrond</h1>
        </div>
      </div>
      
      <div className="flex-1 bg-muted rounded-lg border relative overflow-hidden flex items-center justify-center">
        <div className="text-muted-foreground">
          Interactieve SVG Plattegrond
        </div>
      </div>
    </div>
  );
}
