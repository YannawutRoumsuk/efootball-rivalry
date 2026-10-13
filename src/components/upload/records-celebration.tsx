import { Trophy } from "lucide-react";
import type { NewRecord } from "@/lib/domain/records";

export function RecordsCelebration({ records }: { records: NewRecord[] }) {
  if (records.length === 0) return null;
  return (
    <ul className="space-y-2">
      {records.map((r, i) => (
        <li
          key={r.kind + i}
          className="animate-rise flex items-center gap-3 rounded-xl border border-gold/40 bg-gradient-to-r from-gold/15 to-transparent px-4 py-3"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <Trophy className="size-5 shrink-0 text-gold" aria-hidden />
          <div>
            <p className="font-display text-sm font-bold text-gold uppercase tracking-wide">{r.title}</p>
            <p className="text-sm">{r.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
