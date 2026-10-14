"use client";

import { Copy } from "lucide-react";
import Link from "next/link";
import type { DuplicateCandidate } from "@/lib/domain/duplicates";
import { useT } from "@/lib/i18n/client";

export function DuplicateWarning({ duplicates }: { duplicates: DuplicateCandidate[] }) {
  const t = useT();
  if (duplicates.length === 0) return null;
  return (
    <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4">
      <p className="flex items-center gap-2 font-semibold text-warning">
        <Copy className="size-4" aria-hidden /> {t("dup.title")}
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {duplicates.map((d) => (
          <li key={d.matchId}>
            {t(`dup.${d.reason}`)} —{" "}
            <Link href={`/matches/${d.matchId}`} target="_blank" className="font-semibold underline underline-offset-4">
              {t("card.match", { n: d.matchNo })}
            </Link>
            {d.status !== "confirmed" && <span className="text-muted-foreground"> ({t(`status.${d.status}`)})</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{t("dup.note")}</p>
    </div>
  );
}
