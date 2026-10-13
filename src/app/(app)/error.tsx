"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={TriangleAlert}
      title="Something went wrong"
      description={
        <>
          We couldn&apos;t load this page. Check your connection and try again.
          {error.digest && <span className="mt-2 block text-xs">Ref: {error.digest}</span>}
        </>
      }
      action={
        <Button onClick={reset} size="lg" className="h-11">
          <RotateCcw /> Try again
        </Button>
      }
    />
  );
}
