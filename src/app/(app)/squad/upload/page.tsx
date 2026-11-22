import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { SquadUploadFlow } from "@/components/squad/squad-upload-flow";
import { getT } from "@/lib/i18n/server";
import { asUser, requirePageContext } from "@/lib/server/context";
import { loadAliases } from "@/lib/server/squad";

export async function generateMetadata() {
  return { title: (await getT())("squad.up.title") };
}

export default async function SquadUploadPage() {
  const [ctx, t] = await Promise.all([requirePageContext(), getT()]);
  const aliases = await asUser(ctx.userId, (tx) => loadAliases(tx, ctx.rivalry.id, ctx.roster));
  return (
    <div className="space-y-6">
      <Link href="/squad" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {t("squad.back")}
      </Link>
      <PageHeader eyebrow={t("squad.eyebrow")} title={t("squad.up.title")} />
      <SquadUploadFlow roster={ctx.roster} aliases={aliases} />
    </div>
  );
}
