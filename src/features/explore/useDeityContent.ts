import { useEffect, useRef, useState } from "react";
import { useApp } from "../../app/providers/AppProvider";
import { Content, ContentType, Deity } from "../../domain/models";

// Explore asks at most this many deities at once whether they have content.
const CHECK_BATCH = 5;
// A deity's items: up to this many pages of the server's largest page size.
const ITEM_PAGE = 30;
const ITEM_PAGES = 3;

const matches = (item: Content, type: ContentType, deityId: string) =>
  item.type === type && item.deityIds.includes(deityId);

type Availability = {
  // Deity IDs known to have at least one published item of the type.
  ids: string[];
  // Still checking some deities.
  pending: boolean;
  // Every check that could have found something failed.
  failed: boolean;
};

// Which deities have at least one published item of `type`. The catalog
// answers for deities it already holds items of (it holds published content
// only, but not all of it); the rest are asked one `type + deityId` query each
// with a page size of one, a few at a time. Answers are kept per type for as
// long as the screen is mounted, so switching back is instant.
export function useDeitiesWithContent(type: ContentType) {
  const { catalog, searchContent } = useApp();
  const deities = catalog?.deities;
  const content = useRef<Content[]>([]);
  useEffect(() => {
    content.current = catalog?.content ?? [];
  }, [catalog]);
  const [results, setResults] = useState<
    Partial<Record<ContentType, Availability>>
  >({});
  const [attempt, setAttempt] = useState(0);
  const current = results[type];
  const known = current && !current.pending && !current.failed;
  useEffect(() => {
    if (!deities || known) return;
    let active = true;
    const found = new Set(
      deities
        .filter((deity) =>
          content.current.some((item) => matches(item, type, deity.id)),
        )
        .map((deity) => deity.id),
    );
    const unknown = deities.filter((deity) => !found.has(deity.id));
    const publish = (pending: boolean, failed: boolean) => {
      if (!active) return;
      const ids = deities
        .filter((deity) => found.has(deity.id))
        .map((deity) => deity.id);
      setResults((previous) => ({
        ...previous,
        [type]: { ids, pending, failed },
      }));
    };
    publish(unknown.length > 0, false);
    if (!unknown.length) return;
    (async () => {
      let errors = 0;
      for (let start = 0; start < unknown.length; start += CHECK_BATCH) {
        const batch = unknown.slice(start, start + CHECK_BATCH);
        const answers = await Promise.all(
          batch.map((deity: Deity) =>
            searchContent({ type, deityId: deity.id, limit: 1 }).then(
              ({ items }) =>
                items.some((item) => matches(item, type, deity.id)),
              () => null,
            ),
          ),
        );
        if (!active) return;
        answers.forEach((answer, index) => {
          if (answer) found.add(batch[index].id);
          if (answer === null) errors++;
        });
        const done = start + CHECK_BATCH >= unknown.length;
        publish(!done, done && errors > 0 && found.size === 0);
      }
    })();
    return () => {
      active = false;
    };
    // `known` is derived from `results`; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, deities, searchContent, attempt]);
  return {
    ids: current?.ids ?? [],
    pending: !current || current.pending,
    failed: !!current?.failed,
    retry: () => {
      setResults((previous) => ({ ...previous, [type]: undefined }));
      setAttempt((value) => value + 1);
    },
  };
}

// One deity's published items of one type, in the server's order (most
// popular first). If the server cannot be reached, the catalog's items of
// that deity and type are used when there are any.
export function useDeityItems(type: ContentType, deityId: string) {
  const { catalog, searchContent } = useApp();
  const ready = !!catalog;
  const [attempt, setAttempt] = useState(0);
  const key = `${type}:${deityId}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    items: Content[];
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    (async () => {
      const items: Content[] = [];
      let offset: number | undefined;
      let cursor: string | undefined;
      for (let page = 0; page < ITEM_PAGES; page++) {
        const next = await searchContent({
          type,
          deityId,
          limit: ITEM_PAGE,
          offset,
          cursor,
        });
        items.push(
          ...next.items.filter(
            (item) =>
              matches(item, type, deityId) &&
              !items.some((old) => old.id === item.id),
          ),
        );
        offset = next.nextOffset;
        cursor = next.nextCursor;
        if (offset === undefined && cursor === undefined) break;
      }
      return items;
    })().then(
      (items) => {
        if (active) setResult({ key, items, error: false });
      },
      () => {
        if (active) setResult({ key, items: [], error: true });
      },
    );
    return () => {
      active = false;
    };
  }, [key, ready, searchContent, type, deityId]);
  const current = result?.key === key ? result : null;
  const fallback =
    current?.error && catalog
      ? catalog.content.filter((item) => matches(item, type, deityId))
      : [];
  const items = current?.error ? fallback : (current?.items ?? []);
  return {
    items,
    status: !current
      ? ("loading" as const)
      : current.error && !items.length
        ? ("error" as const)
        : ("ready" as const),
    retry: () => setAttempt((value) => value + 1),
  };
}
