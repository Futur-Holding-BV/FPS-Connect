import { useParams } from "wouter";
export default function InspectieDetail() {
  const { id } = useParams<{ id: string }>();
  return <div className="p-6">Inspectiedetail {id} (Work in progress)</div>;
}