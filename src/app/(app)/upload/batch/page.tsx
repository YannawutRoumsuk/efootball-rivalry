import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { BatchImport } from "@/components/upload/batch-import";
import { getAiConfig } from "@/lib/env";
import { requirePageContext } from "@/lib/server/context";

export const metadata = { title: "Batch import" };

export default async function BatchImportPage() {
  const ctx = await requirePageContext();
  if (ctx.roster.length < 2 || !ctx.me) redirect("/upload");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="History"
        title="Batch import"
        description="Upload old screenshots together. Each one is read separately, then you confirm sides, reorder, and import."
      />
      <BatchImport roster={ctx.roster} meId={ctx.me.id} aiEnabled={getAiConfig() !== null} />
    </div>
  );
}
