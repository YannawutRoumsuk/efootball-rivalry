import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="panel flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-5 flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 max-w-md text-sm text-muted-foreground">{description}</div>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
