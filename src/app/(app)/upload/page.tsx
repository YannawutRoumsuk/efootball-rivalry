import { UserPlus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { UploadFlow } from "@/components/upload/upload-flow";
import { getAiConfig } from "@/lib/env";
import { requirePageContext } from "@/lib/server/context";

export const metadata = { title: "Upload match" };

export default async function UploadPage() {
  const ctx = await requirePageContext();
  if (ctx.roster.length < 2 || !ctx.me) {
    return (
      <EmptyState
        icon={UserPlus}
        title="Not enough players yet"
        description="Matches need at least two players. Set PLAYER_1_PIN and PLAYER_2_PIN on the server."
        action={
          <Button asChild className="h-11">
            <Link href="/settings">Open room settings</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="New result" title="Upload match" description="Screenshot → AI reads it → you confirm who played and the numbers → saved for everyone." />
      <UploadFlow roster={ctx.roster} meId={ctx.me.id} aiEnabled={getAiConfig() !== null} />
    </div>
  );
}
