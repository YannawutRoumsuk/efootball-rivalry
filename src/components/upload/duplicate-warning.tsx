import { Copy } from "lucide-react";
import Link from "next/link";
import type { DuplicateCandidate } from "@/lib/domain/duplicates";

export function DuplicateWarning({ duplicates }: { duplicates: DuplicateCandidate[] }) {
  if (duplicates.length === 0) return null;
  return (
    <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4">
      <p className="flex items-center gap-2 font-semibold text-warning">
        <Copy className="size-4" aria-hidden /> Possible duplicate
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {duplicates.map((d) => (
          <li key={d.matchId}>
            {d.detail} —{" "}
            <Link href={`/matches/${d.matchId}`} target="_blank" className="font-semibold underline underline-offset-4">
              match #{d.matchNo}
            </Link>
            {d.status !== "confirmed" && <span className="text-muted-foreground"> ({d.status})</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        A matching score alone is never treated as a duplicate. Save anyway only if this really is a different match.
      </p>
    </div>
  );
}
