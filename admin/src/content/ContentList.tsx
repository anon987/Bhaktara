import { useCallback, useState } from "react";
import type { ContentRow } from "../api";
import { useAdmin } from "../app/context";
import { paths } from "../app/router";
import {
  can,
  ContentStatus,
  contentStatuses,
  ContentType,
  contentTypes,
} from "../domain";
import { ErrorNotice, formatDate, Pager, StatusBadge } from "../ui";
import { useLoad } from "../useLoad";

const PAGE_SIZE = 25;

export function ContentList() {
  const { api, role } = useAdmin();
  const [status, setStatus] = useState<ContentStatus | "">("");
  const [type, setType] = useState<ContentType | "">("");
  // cursors[n] is the ID after which page n starts.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);
  const load = useCallback(
    () =>
      api.listContent({
        status: status || undefined,
        type: type || undefined,
        after: cursors[page],
        pageSize: PAGE_SIZE,
      }),
    [api, status, type, page, cursors],
  );
  const { data, error, loading } = useLoad(load);
  const rows: ContentRow[] = data?.items ?? [];
  const next = data?.next ?? null;

  const resetPaging = () => {
    setCursors([null]);
    setPage(0);
  };

  return (
    <section aria-labelledby="content-heading">
      <div className="page-header">
        <h1 id="content-heading" tabIndex={-1}>
          Content
        </h1>
        {can(role, "content.edit") && (
          <a className="button primary" href={paths.contentNew}>
            New content
          </a>
        )}
      </div>

      <form className="filters" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="filter-status">Status</label>
          <select
            id="filter-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ContentStatus | "");
              resetPaging();
            }}
          >
            <option value="">All statuses</option>
            {contentStatuses.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-type">Type</label>
          <select
            id="filter-type"
            value={type}
            onChange={(event) => {
              setType(event.target.value as ContentType | "");
              resetPaging();
            }}
          >
            <option value="">All types</option>
            {contentTypes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </form>

      <ErrorNotice error={error} />
      <p role="status" className="muted">
        {loading ? "Loading…" : `${rows.length} item${rows.length === 1 ? "" : "s"} on this page`}
      </p>

      <table className="table" aria-busy={loading}>
        <caption className="visually-hidden">Content items, ordered by ID</caption>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Title</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <a href={paths.contentEdit(row.id)}>{row.id}</a>
              </td>
              <td>
                {row.title.en || <span className="muted">(no English title)</span>}
                {row.title.hi && (
                  <span className="secondary" lang="hi">
                    {row.title.hi}
                  </span>
                )}
              </td>
              <td>{row.type}</td>
              <td>
                <StatusBadge status={row.status} />
                {row.status === "SCHEDULED" && row.scheduledAt && (
                  <span className="secondary">{formatDate(row.scheduledAt)}</span>
                )}
              </td>
              <td>{formatDate(row.updatedAt)}</td>
            </tr>
          ))}
          {!loading && !rows.length && !error && (
            <tr>
              <td colSpan={5} className="muted">
                No content matches these filters.
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
