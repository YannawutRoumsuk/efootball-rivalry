"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api/envelope";
import { safeNextPath } from "@/lib/safe-redirect";

/** Each player types their own numeric code and is signed in as themselves. */
export function LoginForm({ next, initialError }: { next: string | null; initialError?: string | null }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await apiFetch<{ seat: number; name: string }>("/api/auth/pin", { method: "POST", body: JSON.stringify({ pin }) });
      router.replace(safeNextPath(next));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setPin("");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pin">Your player code</Label>
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="current-password"
          autoFocus
          maxLength={12}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          required
          className="h-14 text-center font-display text-3xl tracking-[0.5em]"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || pin.length < 4} className="h-12 w-full text-base">
        {pending && <Loader2 className="animate-spin" />} Enter
      </Button>
    </form>
  );
}
