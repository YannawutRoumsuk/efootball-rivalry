import { UserPlus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { UploadFlow } from "@/components/upload/upload-flow";
import { getT } from "@/lib/i18n/server";
import { requirePageContext } from "@/lib/server/context";

export async function generateMetadata() {
  return { title: (await getT())("upload.title") };
}

export default async function UploadPage() {
  const [ctx, t] = await Promise.all([requirePageContext(), getT()]);
  if (ctx.roster.length < 2 || !ctx.me) {
    return (
      <EmptyState
        icon={UserPlus}
        title={t("upload.notEnough.title")}
        description={t("upload.notEnough.body")}
        action={
          <Button asChild className="h-11">
            <Link href="/settings">{t("upload.notEnough.cta")}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("upload.eyebrow")} title={t("upload.title")} description={t("upload.desc")} />
      <UploadFlow roster={ctx.roster} meId={ctx.me.id} />
    </div>
  );
}
