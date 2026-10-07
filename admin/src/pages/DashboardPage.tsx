import { useCallback, useState } from "react";
import {
  AlertTriangle,
  CalendarHeart,
  Clock,
  Flame,
  Info,
  RefreshCw,
  Sparkles,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAdmin } from "../app/context";
import { paths } from "../app/router";
import { ago, compact, formatDate, formatDay } from "../components/panel/format";
import { ErrorState, PageHeader } from "../components/panel/page";
import { useLoad } from "../useLoad";
import type { DashboardData } from "../panelApi";

const chartConfig = {
  practised: { label: "Practised", color: "var(--chart-2)" },
  qualifying: { label: "Kept the streak", color: "var(--chart-1)" },
  fullSadhana: { label: "Full Sadhana", color: "var(--chart-3)" },
} satisfies ChartConfig;

const alertText: Record<string, (count?: number) => string> = {
  readyWaiting: (count) => `${count} content item${count === 1 ? "" : "s"} waiting in READY to be scheduled or published`,
  challengesShort: (count) => `Challenges are queued for only ${count} more day${count === 1 ? "" : "s"} (aim for 14+)`,
  flaggedUsers: (count) => `${count} flagged user${count === 1 ? "" : "s"} to review`,
  festivalsWithoutCollection: (count) => `${count} upcoming festival${count === 1 ? "" : "s"} without a linked collection`,
};
const alertLink: Record<string, string> = {
  readyWaiting: paths.content,
  challengesShort: paths.page("challenges"),
  flaggedUsers: paths.users,
  festivalsWithoutCollection: paths.page("festivals"),
};

const statusColor: Record<string, string> = {
  DRAFT: "bg-muted-foreground/40",
  READY: "bg-chart-2",
  SCHEDULED: "bg-chart-5",
  PUBLISHED: "bg-chart-4",
  ARCHIVED: "bg-border",
};

function greeting() {
  const hour = new Date().getHours();
  return hour < 4 ? "Shubh ratri" : hour < 12 ? "Suprabhat" : hour < 17 ? "Namaste" : "Shubh sandhya";
}

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Users;
  tone?: "default" | "saffron" | "kumkum";
}) {
  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className={cn(
          "absolute -right-6 -top-6 size-24 rounded-full opacity-15 blur-xl",
          tone === "saffron" ? "bg-chart-2" : tone === "kumkum" ? "bg-kumkum" : "bg-primary",
        )}
      />
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4 text-primary" /> {label}
        </CardDescription>
        <CardTitle className="font-display text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

export function DashboardPage() {
  const { panel } = useAdmin();
  const [force, setForce] = useState(0);
  const load = useCallback(() => panel.getDashboard(force > 0), [panel, force]);
  const { data, error, loading } = useLoad<DashboardData>(load);

  return (
    <div>
      <PageHeader
        eyebrow={greeting()}
        title="Dashboard"
        description="How Bhaktara is doing today: devotees, their practice and the content pipeline."
        actions={
          <>
            {data && (
              <span className="text-xs text-muted-foreground">
                <Clock className="mr-1 inline size-3" />
                Updated {ago(data.computedAt)}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => setForce((n) => n + 1)} disabled={loading}>
              <RefreshCw className={cn(loading && "animate-spin")} /> Refresh
            </Button>
          </>
        }
      />
      {error && <ErrorState error={error} onRetry={() => setForce((n) => n + 1)} />}
      {!data && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className={cn("h-32 rounded-xl", i >= 4 && "lg:col-span-2 h-64")} />
          ))}
        </div>
      )}
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Devotees" value={compact(data.users.total)} hint={`${compact(data.users.signedIn)} signed in · ${compact(data.users.guests)} guests`} icon={Users} />
            <Stat label="New this week" value={compact(data.users.new7)} hint={`${compact(data.users.new30)} in the last 30 days`} icon={UserPlus} tone="saffron" />
            <Stat label="Active today" value={compact(data.users.active1)} hint={`${compact(data.users.active7)} this week`} icon={Zap} />
            <Stat label="Lamps burning" value={compact(data.practice.activeStreaks)} hint={`Active streaks · ${compact(data.practice.xpToday)} XP given today`} icon={Flame} tone="kumkum" />
          </div>

          {!!data.unavailable?.length && (
            <p role="status" className="rounded-xl border border-dashed px-4 py-2 text-sm text-muted-foreground">
              Some figures could not be worked out just now and show as zero ({data.unavailable.join(", ")}). Try Refresh in a few minutes.
            </p>
          )}

          {data.alerts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Needs attention</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.alerts.map((alert) => (
                  <a
                    key={alert.key}
                    href={alertLink[alert.key]}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 text-sm transition-colors hover:bg-accent",
                      alert.level === "warn" ? "border-chart-2/40 bg-chart-2/5" : "bg-muted/40",
                    )}
                  >
                    {alert.level === "warn" ? <AlertTriangle className="size-4 shrink-0 text-chart-2" /> : <Info className="size-4 shrink-0 text-primary" />}
                    {alertText[alert.key]?.(alert.count) ?? alert.key}
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Daily practice</CardTitle>
                <CardDescription>Devotees who practised each day (04:00 IST days), last two weeks</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <AreaChart data={data.practice.series} margin={{ left: -16, right: 8 }}>
                    <defs>
                      {(["practised", "qualifying", "fullSadhana"] as const).map((key) => (
                        <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.5} />
                          <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.05} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(day: string) => day.slice(5)} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                    <Area dataKey="practised" type="monotone" stroke="var(--color-practised)" fill="url(#fill-practised)" strokeWidth={2} />
                    <Area dataKey="qualifying" type="monotone" stroke="var(--color-qualifying)" fill="url(#fill-qualifying)" strokeWidth={2} />
                    <Area dataKey="fullSadhana" type="monotone" stroke="var(--color-fullSadhana)" fill="url(#fill-fullSadhana)" strokeWidth={2} />
                    <ChartLegend content={<ChartLegendContent />} />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Content pipeline</CardTitle>
                <CardDescription>Items by workflow state</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(data.content.byStatus).map(([status, count]) => {
                  const total = Math.max(1, ...Object.values(data.content.byStatus));
                  return (
                    <a key={status} href={`${paths.content}`} className="block space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="capitalize">{status.toLowerCase()}</span>
                        <span className="tabular-nums text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className={cn("h-2 rounded-full", statusColor[status])} style={{ width: `${(count / total) * 100}%` }} />
                      </div>
                    </a>
                  );
                })}
                <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3 text-sm">
                  <span className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Challenges queued</span>
                  <Badge variant={data.challenges.daysQueued < 14 ? "destructive" : "secondary"}>{data.challenges.daysQueued} days</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Publishing this week</CardTitle>
                <CardDescription>Scheduled content for the next 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                {data.content.scheduledSoon.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing scheduled. Plan the week from the content library.</p>
                ) : (
                  <ul className="divide-y">
                    {data.content.scheduledSoon.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <a className="truncate font-medium hover:underline" href={paths.contentEdit(item.id)}>{item.title}</a>
                        <span className="shrink-0 text-xs text-muted-foreground">{(item.type ?? "untyped").toLowerCase()} · {formatDate(item.scheduledAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><CalendarHeart className="size-5 text-kumkum" /> Upcoming festivals</CardTitle>
                <CardDescription>Next 45 days</CardDescription>
              </CardHeader>
              <CardContent>
                {data.festivals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No festivals entered for the coming weeks.</p>
                ) : (
                  <ul className="divide-y">
                    {data.festivals.map((festival) => (
                      <li key={festival.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="truncate font-medium">{festival.name}</span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          {!festival.hasCollection && <Badge variant="outline">no collection</Badge>}
                          {formatDay(festival.date)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
