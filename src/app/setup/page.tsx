import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";

export const metadata = { title: "Setup required" };
export const dynamic = "force-dynamic";

/** Shown when the deployment has no database configured yet. */
export default function SetupPage() {
  if (process.env.DATABASE_URL) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-4 py-10">
      <Logo />
      <h1 className="font-display text-3xl font-bold">Almost ready</h1>
      <p className="text-muted-foreground">
        This deployment isn&apos;t connected to a database yet. Set these environment variables and redeploy:
      </p>
      <ul className="panel space-y-2 p-4 font-mono text-sm">
        <li>DATABASE_URL (on Railway: {"${{Postgres.DATABASE_URL}}"})</li>
        <li>STORAGE_DIR (a mounted volume, e.g. /data/screenshots)</li>
        <li className="text-muted-foreground">OPENAI_API_KEY (optional — enables AI extraction)</li>
      </ul>
      <p className="text-sm text-muted-foreground">See README.md → “Deploying to Railway”.</p>
    </main>
  );
}
