"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api/envelope";
import { safeNextPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

interface SeatOption {
  key: "a" | "b";
  name: string;
}

/** Room code (APP_PIN) → pick which player you are. */
export function LoginForm({ next, initialError }: { next: string | null; initialError?: string | null }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [seats, setSeats] = useState<SeatOption[] | null>(null);
  const [pending, setPending] = useState<"pin" | "a" | "b" | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function checkPin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending("pin");
    try {
      const res = await apiFetch<{ players: SeatOption[] }>("/api/auth/pin", { method: "POST", body: JSON.stringify({ pin }) });
      setSeats(res.players);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setPin("");
    } finally {
      setPending(null);
    }
  }

  async function choose(key: "a" | "b") {
    setError(null);
    setPending(key);
    try {
      await apiFetch("/api/auth/pin", { method: "POST", body: JSON.stringify({ pin, player: key }) });
      router.replace(safeNextPath(next));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setPending(null);
    }
  }

  if (seats) {
    return (
      <div className="space-y-4">
        <p className="font-display text-lg font-semibold">Who are you?</p>
        <div className="grid grid-cols-2 gap-3">
          {seats.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={pending !== null}
              onClick={() => choose(s.key)}
              className={cn(
                "flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-4 transition-all active:scale-[0.98] disabled:opacity-60",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                s.key === "a" ? "border-player-a/50 hover:bg-player-a/10" : "border-player-b/50 hover:bg-player-b/10",
              )}
            >
              {pending === s.key ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <span className={cn("eyebrow", s.key === "a" ? "text-player-a" : "text-player-b")}>Player {s.key.toUpperCase()}</span>
              )}
              <span className="max-w-full truncate font-display text-xl font-bold">{s.name}</span>
            </button>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button
          type="button"
          onClick={() => {
            setSeats(null);
            setPin("");
          }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Different code
        </button>
        <p className="text-xs text-muted-foreground">You can rename players later in the Room page.</p>
      </div>
    );
  }

  return (
    <form onSubmit={checkPin} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pin">Room code</Label>
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
      <Button type="submit" disabled={pending !== null || pin.length < 4} className="h-12 w-full text-base">
        {pending === "pin" && <Loader2 className="animate-spin" />} Enter
      </Button>
    </form>
  );
}
