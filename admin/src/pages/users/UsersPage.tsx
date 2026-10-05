import { useCallback, useEffect, useState } from "react";
import { Flag, Flame, Search, UserRound, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdmin } from "../../app/context";
import { navigate, paths } from "../../app/router";
import { readableError, type ReadableError } from "../../errors";
import { ago, compact } from "../../components/panel/format";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../../components/panel/page";
import type { UserFilter, UserRow } from "../../panelApi";

const PAGE = 25;

export function UserAvatar({ row }: { row: Pick<UserRow, "displayName" | "uid" | "isAnonymous"> }) {
  const text = (row.displayName ?? row.uid).slice(0, 2).toUpperCase();
  return (
    <Avatar className="size-9">
      <AvatarFallback className={row.isAnonymous ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}>
        {row.isAnonymous ? <UserRound className="size-4" /> : text}
      </AvatarFallback>
    </Avatar>
  );
}

export function UsersPage() {
  const { panel } = useAdmin();
  const [filter, setFilter] = useState<UserFilter>("all");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<ReadableError | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(
    async (after: string | null) => {
      setBusy(true);
      setError(null);
      try {
        const page = await panel.searchUsers({
          query: submitted || undefined,
          filter,
          after,
          pageSize: PAGE,
        });
        setRows((current) => (after ? [...(current ?? []), ...page.items] : page.items));
        setNext(page.next);
      } catch (caught) {
        setError(readableError(caught));
      } finally {
        setBusy(false);
      }
    },
    [panel, submitted, filter],
  );
  useEffect(() => {
    // Effects may not set state synchronously; start the fetch next tick.
    const handle = setTimeout(() => void fetchPage(null), 0);
    return () => clearTimeout(handle);
  }, [fetchPage]);

  return (
    <div>
      <PageHeader
        title="Users"
        description="Find a devotee by user ID, email or display name. Credentials and tokens are never shown."
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <form
          className="relative flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(query.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search users"
            placeholder="User ID, email or display name — press Enter"
            className="pl-9"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!event.target.value) setSubmitted("");
            }}
          />
        </form>
        <Tabs value={filter} onValueChange={(value) => setFilter(value as UserFilter)}>
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="signedIn">Signed in</TabsTrigger>
            <TabsTrigger value="guests">Guests</TabsTrigger>
            <TabsTrigger value="flagged">Flagged</TabsTrigger>
            <TabsTrigger value="disabled">Disabled</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {error && <ErrorState error={error} onRetry={() => void fetchPage(null)} />}
      {rows === null && !error && <LoadingState rows={8} />}
      {rows && rows.length === 0 && (
        <EmptyState icon={Users} title="No users found" text={submitted ? "No account matches that search." : "Nobody in this list yet."} />
      )}
      {rows && rows.length > 0 && (
        <>
          {/* Phones: cards. Larger screens: a table. */}
          <div className="space-y-2 md:hidden">
            {rows.map((row) => (
              <Card key={row.uid} className="p-0">
                <a href={paths.user(row.uid)} className="flex items-center gap-3 p-3">
                  <UserAvatar row={row} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.displayName ?? (row.isAnonymous ? "Guest" : "No name")}</p>
                    <p className="truncate text-xs text-muted-foreground">Lv {row.level} · {compact(row.totalXp)} XP · {ago(row.lastActiveAt)}</p>
                  </div>
                  {row.flagged && <Flag className="size-4 text-destructive" />}
                </a>
              </Card>
            ))}
          </div>
          <Card className="hidden overflow-hidden p-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Devotee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Level · XP</TableHead>
                  <TableHead className="text-right">Streak</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.uid} className="cursor-pointer" onClick={() => navigate(paths.user(row.uid))}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar row={row} />
                        <div className="min-w-0">
                          <a href={paths.user(row.uid)} className="block truncate font-medium hover:underline" onClick={(event) => event.stopPropagation()}>
                            {row.displayName ?? (row.isAnonymous ? "Guest" : "No name")}
                          </a>
                          <p className="truncate font-mono text-xs text-muted-foreground">{row.uid}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.isAnonymous ? "outline" : "secondary"}>{row.isAnonymous ? "Guest" : "Google"}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.level} · {compact(row.totalXp)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.currentStreak > 0 ? <span className="inline-flex items-center gap-1"><Flame className="size-3.5 text-kumkum" />{row.currentStreak}</span> : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{ago(row.lastActiveAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{ago(row.createdAt)}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      {row.flagged && <Badge variant="destructive">Flagged</Badge>}
                      {row.disabled && <Badge variant="outline">Disabled</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {next && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" disabled={busy} onClick={() => void fetchPage(next)}>
                {busy ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
