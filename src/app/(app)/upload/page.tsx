import { UserPlus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { UploadFlow } from "@/components/upload/upload-flow";
import { getAiConfig } from "@/lib/env";
import { getRivalryContext } from "@/lib/server/context";

export const metadata = { title: "Upload match" };

export default async function UploadPage() {
  const ctx = (await getRivalryContext())!;
  if (!ctx.pair || !ctx.me) {
    return (
      <EmptyState
        icon={UserPlus}
        title="Your friend hasn't joined yet"
        description="Matches need both players. Share your invite from the Room page first."
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
      <PageHeader eyebrow="New result" title="Upload match" description="Screenshot → AI reads it → you confirm sides and numbers → saved for both of you." />
      <UploadFlow pair={ctx.pair} me={ctx.me} aiEnabled={getAiConfig() !== null} />
    </div>
  );
}
