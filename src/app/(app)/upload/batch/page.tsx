import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { BatchImport } from "@/components/upload/batch-import";
import { getT } from "@/lib/i18n/server";
import { requirePageContext } from "@/lib/server/context";

export async function generateMetadata() {
  return { title: (await getT())("batch.title") };
}

export default async function BatchImportPage() {
  const [ctx, t] = await Promise.all([requirePageContext(), getT()]);
  if (ctx.roster.length < 2 || !ctx.me) redirect("/upload");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("batch.eyebrow")}
        title={t("batch.title")}
        description={t("batch.desc")}
      />
      <BatchImport roster={ctx.roster} meId={ctx.me.id} />
    </div>
  );
}
