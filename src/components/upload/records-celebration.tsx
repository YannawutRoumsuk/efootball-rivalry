"use client";

import { Trophy } from "lucide-react";
import type { NewRecord } from "@/lib/domain/records";
import { useT } from "@/lib/i18n/client";

export function RecordsCelebration({ records }: { records: NewRecord[] }) {
  const t = useT();
  if (records.length === 0) return null;
  return (
    <ul className="space-y-2">
      {records.map((r, i) => (
        <li key={r.kind + i} className="flex items-center gap-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3">
          <Trophy className="size-5 shrink-0 text-gold" aria-hidden />
          <div>
            <p className="text-sm font-semibold">{t(`newrec.${r.kind}`)}</p>
            <p className="text-sm text-muted-foreground">{t(`newrec.${r.kind}.detail`, r.params)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
