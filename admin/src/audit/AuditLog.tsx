import { useCallback, useState } from "react";
import type { AuditCursor, AuditRow } from "../api";
import { useAdmin } from "../app/context";
import { paths } from "../app/router";
import { ErrorNotice, formatDate, Pager } from "../ui";
import { useLoad } from "../useLoad";

const PAGE_SIZE = 25;

const summary = (value: unknown) =>
  value === null || value === undefined ? "—" : JSON.stringify(value, null, 1);

// Doc 09 §16: read-only, newest first. Entries are written by the Cloud
// Functions in the same transaction as each change (and by grant-role).
export function AuditLog() {
  const { api } = useAdmin();
  const [cursors, setCursors] = useState<(AuditCursor | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [reloads, setReloads] = useState(0);
  const load = useCallback(
    () => api.listAudit({ after: cursors[page], pageSize: PAGE_SIZE }),
    // reloads: Refresh re-runs the query for page 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, cursors, page, reloads],
  );
  const { data, error, loading } = useLoad(load);
  const rows: AuditRow[] = data?.items ?? [];
  const next: AuditCursor | null = data?.next ?? null;

  return (
    <section aria-labelledby="audit-heading">
      <div className="page-header">
        <h1 id="audit-heading" tabIndex={-1}>
          Audit log
        </h1>
        <button
          type="button"
          onClick={() => {
            setCursors([null]);
            setPage(0);
            setReloads((value) => value + 1);
          }}
        >
          Refresh
        </button>
      </div>
      <ErrorNotice error={error} />
      <p role="status" className="muted">
        {loading ? "Loading…" : `Newest first · page ${page + 1}`}
      </p>
      <table className="table audit" aria-busy={loading}>
        <caption className="visually-hidden">Admin changes, newest first</caption>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Who</th>
            <th scope="col">Action</th>
            <th scope="col">Entity</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt)}</td>
              <td>
                <code>{row.adminUid}</code>
              </td>
              <td>{row.action}</td>
              <td>
                {row.entity}{" "}
                {row.entity === "content" ? (
                  <a href={paths.contentEdit(row.entityId)}>{row.entityId}</a>
                ) : (
                  <code>{row.entityId}</code>
                )}
              </td>
              <td>
                <pre>{summary(row.beforeSummary)}</pre>
              </td>
              <td>
                <pre>{summary(row.afterSummary)}</pre>
              </td>
            </tr>
          ))}
          {!loading && !rows.length && !error && (
            <tr>
              <td colSpan={6} className="muted">
                No audit entries yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <Pager
        page={page}
        hasNext={next !== null}
        busy={loading}
        onPrevious={() => setPage((value) => Math.max(0, value - 1))}
        onNext={() => {
          if (next === null) return;
          setCursors((value) => [...value.slice(0, page + 1), next]);
          setPage((value) => value + 1);
        }}
      />
    </section>
  );
}
