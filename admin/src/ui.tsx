import { ReactNode, useId } from "react";
import type { ContentStatus } from "./domain";
import { fieldLabel, type Problem, type ReadableError } from "./errors";

export function ErrorNotice({ error }: { error: ReadableError | null }) {
  if (!error) return null;
  return (
    <div className="notice notice-error" role="alert">
      <p>
        <strong>{error.title}.</strong> {error.message}
      </p>
      <ProblemList problems={error.problems} />
    </div>
  );
}

export function ProblemList({ problems }: { problems: Problem[] }) {
  if (!problems.length) return null;
  return (
    <ul className="problems">
      {problems.map((problem, index) => (
        <li key={`${problem.field}-${index}`}>
          {problem.message.startsWith("Checklist:") ? (
            problem.message
          ) : (
            <>
              <span className="field-name">{fieldLabel(problem.field)}</span>:{" "}
              {problem.message}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export function StatusBadge({ status }: { status: ContentStatus | string }) {
  return <span className={`badge badge-${String(status).toLowerCase()}`}>{status}</span>;
}

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  multiline?: boolean;
  rows?: number;
  type?: "text" | "number" | "datetime-local" | "email";
  lang?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
};

// Label, hint and error are wired to the control for screen readers.
export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  multiline,
  rows = 3,
  type = "text",
  lang,
  required,
  placeholder,
  className,
}: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;
  const common = {
    id,
    value,
    lang,
    required,
    placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  };
  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {multiline ? (
        <textarea
          {...common}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...common}
          type={type}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint && (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="checkbox">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {hint && (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
export const formatDate = (iso: string | null | undefined) =>
  iso ? dateFormat.format(new Date(iso)) : "—";

// <input type="datetime-local"> works in local time without an offset.
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function Pager({
  page,
  hasNext,
  onPrevious,
  onNext,
  busy,
}: {
  page: number;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  busy?: boolean;
}) {
  return (
    <nav className="pager" aria-label="Pagination">
      <button type="button" onClick={onPrevious} disabled={busy || page === 0}>
        Previous
      </button>
      <span>Page {page + 1}</span>
      <button type="button" onClick={onNext} disabled={busy || !hasNext}>
        Next
      </button>
    </nav>
  );
}

// Turns the issues of a failed zod parse into a field → message map.
export function issuesByField(problems: Problem[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const problem of problems)
    result[problem.field] ??= problem.message;
  return result;
}
