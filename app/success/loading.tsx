import { PageSkeleton } from "@/components/ui/skeleton";

export default function SuccessLoading() {
  return (
    <div className="min-h-screen bg-mist px-4 py-12">
      <PageSkeleton className="mx-auto max-w-lg" />
    </div>
  );
}
