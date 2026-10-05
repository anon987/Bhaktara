import { useState } from "react";
import { useAdmin } from "../app/context";
import {
  allowedTransitions,
  ContentStatus,
  gatedStatuses,
  permissions,
  ReadinessProblem,
  transitions,
} from "../domain";
import { readableError, ReadableError } from "../errors";
import {
  ErrorNotice,
  formatDate,
  localInputToIso,
  ProblemList,
  StatusBadge,
  TextField,
} from "../ui";

const moveLabels: Partial<Record<`${ContentStatus}>${ContentStatus}`, string>> = {
  "DRAFT>READY": "Move to READY",
  "DRAFT>ARCHIVED": "Archive",
  "READY>DRAFT": "Back to DRAFT",
  "READY>SCHEDULED": "Schedule",
  "READY>PUBLISHED": "Publish now",
  "SCHEDULED>READY": "Unschedule (back to READY)",
  "SCHEDULED>PUBLISHED": "Publish now",
  "PUBLISHED>DRAFT": "Unpublish (back to DRAFT)",
  "PUBLISHED>ARCHIVED": "Archive",
  "ARCHIVED>DRAFT": "Restore to DRAFT",
};
export const moveLabel = (from: ContentStatus, to: ContentStatus) =>
  moveLabels[`${from}>${to}`] ?? `Move to ${to}`;

type Props = {
  contentId: string;
  status: ContentStatus;
  scheduledAt: string | null;
  // Client-side readiness of the saved draft (same rules as the server).
  readiness: ReadinessProblem[];
  dirty: boolean;
  onMoved: (to: ContentStatus) => void;
};

// D-036 status moves. Buttons follow the role rules in src/domain/cms.ts;
// the server re-checks role, checklist and schedule and its refusal is shown
// as a readable list.
export function TransitionPanel({
  contentId,
  status,
  scheduledAt,
  readiness,
  dirty,
  onMoved,
}: Props) {
  const { api, role } = useAdmin();
  const [busy, setBusy] = useState<ContentStatus | null>(null);
  const [error, setError] = useState<ReadableError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [publishAt, setPublishAt] = useState("");

  const allowed = allowedTransitions(status, role);
  const forbidden = (Object.keys(transitions[status]) as ContentStatus[]).filter(
    (to) => !allowed.includes(to),
  );
  const needsReadiness = allowed.some((to) => gatedStatuses.includes(to));

  const move = async (to: ContentStatus) => {
    setBusy(to);
    setError(null);
    setDone(null);
    try {
      await api.transitionContent({
        contentId,
        to,
        scheduledAt: to === "SCHEDULED" ? localInputToIso(publishAt) : undefined,
      });
      setDone(`Moved from ${status} to ${to}.`);
      onMoved(to);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel" aria-labelledby="status-heading">
      <h2 id="status-heading">Status</h2>
      <p>
        <StatusBadge status={status} />
        {status === "SCHEDULED" && scheduledAt && (
          <span className="secondary">Publishes {formatDate(scheduledAt)}</span>
        )}
      </p>

      {needsReadiness && status === "DRAFT" && (
        <div className="readiness">
          {readiness.length ? (
            <>
              <p>
                <strong>Needed before READY ({readiness.length})</strong>
              </p>
              <ProblemList problems={readiness} />
            </>
          ) : (
            <p className="ok">All required fields and checklist items are complete.</p>
          )}
        </div>
      )}

      {allowed.includes("SCHEDULED") && (
        <TextField
          label="Publish time (your local time)"
          type="datetime-local"
          value={publishAt}
          onChange={setPublishAt}
          hint="Needed to schedule. It must be in the future."
        />
      )}

      {dirty && allowed.length > 0 && (
        <p className="notice">Save your changes before changing the status.</p>
      )}
      <div className="actions">
        {allowed.map((to) => (
          <button
            key={to}
            type="button"
            className={to === "PUBLISHED" || to === "READY" ? "primary" : undefined}
            disabled={dirty || busy !== null}
            onClick={() => move(to)}
          >
            {busy === to ? "Working…" : moveLabel(status, to)}
          </button>
        ))}
        {allowed.length === 0 && (
          <p className="muted">Your role cannot change the status of this item.</p>
        )}
      </div>
      {forbidden.length > 0 && (
        <p className="muted">
          {forbidden
            .map((to) => {
              const permission = transitions[status][to]!;
              return `${moveLabel(status, to)} needs ${permissions[permission].join(" or ")}`;
            })
            .join(". ")}
          .
        </p>
      )}

      <ErrorNotice error={error} />
      <p role="status" className="ok">
        {done}
      </p>
    </section>
  );
}
