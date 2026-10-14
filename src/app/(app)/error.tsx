"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={TriangleAlert}
      title={t("error.title")}
      description={
        <>
          {t("error.body")}
          {error.digest && <span className="mt-2 block text-xs">{t("error.ref", { d: error.digest })}</span>}
        </>
      }
      action={
        <Button onClick={reset} size="lg" className="h-11">
          <RotateCcw /> {t("error.retry")}
        </Button>
      }
    />
  );
}
