import { Component, type ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ReadableError } from "../../errors";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="flex flex-col gap-4 pb-6 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1.5">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        )}
        <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none md:text-[2.1rem]">
          {title}
        </h1>
        {description && <p className="max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function LoadingState({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ReadableError; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
      <div className="flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="size-4" />
        {error.title}
      </div>
      {error.message && <p className="text-sm text-muted-foreground">{error.message}</p>}
      {error.problems.length > 0 && (
        <ul className="list-inside list-disc text-sm text-muted-foreground">
          {error.problems.map((problem) => (
            <li key={`${problem.field}-${problem.message}`}>
              <span className="font-medium">{problem.field}</span>: {problem.message}
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  text,
  action,
}: {
  icon?: typeof Inbox;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {text && <p className="max-w-sm text-sm text-muted-foreground">{text}</p>}
      </div>
      {action}
    </div>
  );
}

// Keeps one broken page from blanking the whole panel: the sidebar and
// header stay usable and the page shows what went wrong.
export class PageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorState
        error={{ kind: "unknown", title: "This page hit a problem", message: this.state.error.message, problems: [] }}
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}
