"use client";

import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api/envelope";

function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function run(fn: () => Promise<unknown>, success: string, after?: () => void) {
    setPending(true);
    try {
      await fn();
      toast.success(success);
      after?.();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }
  return { pending, run, router };
}

function InlineTextForm({ id, label, initial, max, endpoint, field, success }: {
  id: string;
  label: string;
  initial: string;
  max: number;
  endpoint: string;
  field: string;
  success: string;
}) {
  const [value, setValue] = useState(initial);
  const { pending, run } = useAction();
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(() => apiFetch(endpoint, { method: "PATCH", body: JSON.stringify({ [field]: value }) }), success);
  }
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} value={value} onChange={(e) => setValue(e.target.value)} maxLength={max} required className="h-11" />
        <Button type="submit" variant="secondary" className="h-11" disabled={pending || !value.trim() || value === initial}>
          {pending && <Loader2 className="animate-spin" />} Save
        </Button>
      </div>
    </form>
  );
}

export function ProfileNameForm({ initial }: { initial: string }) {
  return <InlineTextForm id="display-name" label="Your display name" initial={initial} max={40} endpoint="/api/profile" field="display_name" success="Name updated" />;
}

export function RoomNameForm({ initial }: { initial: string }) {
  return <InlineTextForm id="room-name" label="Room name" initial={initial} max={60} endpoint="/api/rivalry" field="name" success="Room renamed" />;
}

export function SignOutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <Button type="submit" variant="outline" className="h-10">
        <LogOut /> Switch player / sign out
      </Button>
    </form>
  );
}
