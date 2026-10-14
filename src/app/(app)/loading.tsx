import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="…">
      <Skeleton className="h-56 w-full rounded-xl sm:h-64" />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-80 rounded-xl lg:col-span-3" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
