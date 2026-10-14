"use client";

import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api/envelope";
import { useI18n, useT } from "@/lib/i18n/client";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/core";
import { errorText } from "@/lib/i18n/errors";
import { applyTheme, THEME_COOKIE, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

function useAction() {
  const router = useRouter();
  const t = useT();
  const [pending, setPending] = useState(false);
  async function run(fn: () => Promise<unknown>, success: string, after?: () => void) {
    setPending(true);
    try {
      await fn();
      toast.success(success);
      after?.();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? errorText(err, t) : t("settings.failed"));
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
  const t = useT();
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
          {pending && <Loader2 className="animate-spin" />} {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

export function ProfileNameForm({ initial }: { initial: string }) {
  const t = useT();
  return (
    <InlineTextForm id="display-name" label={t("settings.yourName")} initial={initial} max={40} endpoint="/api/profile" field="display_name" success={t("settings.nameUpdated")} />
  );
}

export function RoomNameForm({ initial }: { initial: string }) {
  const t = useT();
  return <InlineTextForm id="room-name" label={t("settings.groupName")} initial={initial} max={60} endpoint="/api/rivalry" field="name" success={t("settings.groupRenamed")} />;
}

export function SignOutButton() {
  const t = useT();
  return (
    <form action="/api/auth/logout" method="post">
      <Button type="submit" variant="outline" className="h-10">
        <LogOut /> {t("settings.signOut")}
      </Button>
    </form>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border bg-card p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              value === o.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Language and theme, stored in cookies so server-rendered pages match. */
export function AppearanceSettings({ theme: initialTheme }: { theme: Theme }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [theme, setTheme] = useState(initialTheme);
  return (
    <div className="space-y-4">
      <Segmented<Locale>
        label={t("settings.language")}
        value={locale}
        options={[
          { value: "th", label: "ไทย" },
          { value: "en", label: "English" },
        ]}
        onChange={(next) => {
          writeCookie(LOCALE_COOKIE, next);
          document.documentElement.lang = next;
          router.refresh();
        }}
      />
      <Segmented<Theme>
        label={t("settings.theme")}
        value={theme}
        options={[
          { value: "light", label: t("settings.light") },
          { value: "dark", label: t("settings.dark") },
        ]}
        onChange={(next) => {
          applyTheme(next);
          writeCookie(THEME_COOKIE, next);
          setTheme(next);
          router.refresh();
        }}
      />
    </div>
  );
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
