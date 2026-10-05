import { useCallback, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Award,
  Ban,
  Eraser,
  Flag,
  FlagOff,
  Flame,
  MessageSquarePlus,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAdmin } from "../../app/context";
import { navigate, paths } from "../../app/router";
import { can } from "../../domain";
import { ConfirmAction } from "../../components/panel/confirm";
import { ago, compact, formatDate } from "../../components/panel/format";
import { ErrorState, LoadingState, PageHeader } from "../../components/panel/page";
import { useAction } from "../../components/panel/useAction";
import { useLoad } from "../../useLoad";
import type { UserDetail } from "../../panelApi";
import { UserAvatar } from "./UsersPage";

function ReasonDialog({
  trigger,
  title,
  description,
  label,
  confirm,
  destructive,
  onSubmit,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  label: string;
  confirm: string;
  destructive?: boolean;
  onSubmit: (text: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setText(""); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">{label}</Label>
          <Textarea id="reason" value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} />
        </div>
        <DialogFooter>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!text.trim()}
            onClick={async () => {
              await onSubmit(text.trim());
              setOpen(false);
            }}
          >
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function UserDetailPage({ uid }: { uid: string }) {
  const { panel, role } = useAdmin();
  const [reload, setReload] = useState(0);
  const load = useCallback(() => panel.getUserDetail(uid), [panel, uid, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: user, error, loading } = useLoad<UserDetail>(load);
  const refresh = () => setReload((n) => n + 1);
  const moderate = useAction(
    async (input: Parameters<typeof panel.moderateUser>[0]) => {
      await panel.moderateUser(input);
      refresh();
    },
    { success: "Done" },
  );
  const disable = useAction(
    async (disabled: boolean, reason: string) => {
      await panel.setUserDisabled({ uid, disabled, reason });
      refresh();
    },
    { success: "Account updated" },
  );
  const [deleteReason, setDeleteReason] = useState("");
  const remove = useAction(
    async () => {
      await panel.deleteUserAccount({ uid, confirmUid: uid, reason: deleteReason || "Deleted from the admin panel" });
      navigate(paths.users);
    },
    { success: "User deleted" },
  );
  const canModerate = can(role, "user.moderate");
  const canManage = can(role, "user.manage");

  if (error) return <ErrorState error={error} onRetry={refresh} />;
  if (!user) return <LoadingState rows={6} />;
  const name = user.profile.displayName ?? (user.auth?.isAnonymous !== false ? "Guest devotee" : "No display name");
  const flagged = user.stats.flags.suspicious;
  const disabled = user.auth?.disabled === true;
  const days = new Map(user.days.map((day) => [day.day, day]));
  const today = new Date();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(today.getTime() - (41 - i) * 86400000);
    const key = date.toISOString().slice(0, 10);
    return { key, day: days.get(key) };
  });

  return (
    <div className={cn(loading && "opacity-70 transition-opacity")}>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => navigate(paths.users)}>
        <ArrowLeft /> All users
      </Button>
      <PageHeader
        title={name}
        description={<span className="font-mono text-xs">{user.uid}</span>}
        actions={
          <>
            {canModerate &&
              (flagged ? (
                <Button variant="outline" size="sm" onClick={() => void moderate.run({ uid, action: "unflag" })}>
                  <FlagOff /> Unflag
                </Button>
              ) : (
                <ReasonDialog
                  trigger={<Button variant="outline" size="sm"><Flag /> Flag</Button>}
                  title="Flag this user"
                  description="Flagged users appear on the dashboard for review. XP is not removed."
                  label="Why?"
                  confirm="Flag"
                  onSubmit={(reason) => moderate.run({ uid, action: "flag", reason })}
                />
              ))}
            {canModerate && user.profile.displayName && (
              <ConfirmAction
                trigger={<Button variant="outline" size="sm"><Eraser /> Reset name</Button>}
                title="Reset the display name?"
                description="The name is removed; the user can choose a new one."
                confirmLabel="Reset"
                onConfirm={() => moderate.run({ uid, action: "resetDisplayName" })}
              />
            )}
            {canModerate && (
              <ReasonDialog
                trigger={<Button variant="outline" size="sm"><MessageSquarePlus /> Note</Button>}
                title="Add an internal note"
                description="Only staff see notes."
                label="Note"
                confirm="Add note"
                onSubmit={(note) => moderate.run({ uid, action: "note", note })}
              />
            )}
            {canManage && user.auth && (
              <ReasonDialog
                trigger={
                  <Button variant="outline" size="sm">
                    {disabled ? <UserCheck /> : <Ban />} {disabled ? "Enable" : "Disable"}
                  </Button>
                }
                title={disabled ? "Enable sign-in" : "Disable sign-in"}
                description={disabled ? "The user can sign in again." : "The user is signed out and cannot sign in until enabled."}
                label="Reason (kept in the audit log)"
                confirm={disabled ? "Enable" : "Disable"}
                destructive={!disabled}
                onSubmit={(reason) => disable.run(!disabled, reason)}
              />
            )}
            {canManage && (
              <ConfirmAction
                trigger={<Button variant="destructive" size="sm"><Trash2 /> Delete</Button>}
                title="Delete this user and all their data?"
                description={
                  <>
                    <p>Removes the sign-in account, profile, practice history, badges, favorites and notes. Ledger lines are kept without the user&apos;s name. This cannot be undone.</p>
                    <Label htmlFor="delete-reason" className="pt-2">Reason</Label>
                    <Input id="delete-reason" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} />
                  </>
                }
                confirmLabel="Delete forever"
                destructive
                typeToConfirm={uid}
                onConfirm={() => remove.run()}
              />
            )}
          </>
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <UserAvatar row={{ uid, displayName: user.profile.displayName, isAnonymous: user.auth?.isAnonymous !== false }} />
        <Badge variant={user.auth?.isAnonymous === false ? "secondary" : "outline"}>{user.auth?.isAnonymous === false ? "Signed in" : "Guest"}</Badge>
        {flagged && <Badge variant="destructive">Flagged{user.stats.flags.reason ? `: ${user.stats.flags.reason}` : ""}</Badge>}
        {disabled && <Badge variant="outline">Disabled</Badge>}
        {user.auth?.role && <Badge><ShieldCheck className="mr-1 size-3" />{user.auth.role}</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-lg">Account</CardTitle></CardHeader>
          <CardContent>
            <Fact label="Sign-in" value={user.auth ? (user.auth.providers.length ? user.auth.providers.join(", ") : "anonymous") : "no account"} />
            <Fact label="Email" value={user.auth?.email ?? "—"} />
            <Fact label="Language" value={user.profile.language ?? "—"} />
            <Fact label="Timezone" value={user.profile.timezone} />
            <Fact label="Joined" value={formatDate(user.profile.createdAt ?? user.auth?.createdAt)} />
            <Fact label="Last active" value={ago(user.profile.lastActiveAt)} />
            <Fact label="Last sign-in" value={formatDate(user.auth?.lastSignInAt)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">Practice</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted/60 p-3"><p className="font-display text-2xl">{user.stats.level}</p><p className="text-xs text-muted-foreground">Level</p></div>
              <div className="rounded-xl bg-muted/60 p-3"><p className="font-display text-2xl">{compact(user.stats.totalXp)}</p><p className="text-xs text-muted-foreground">XP</p></div>
              <div className="rounded-xl bg-muted/60 p-3"><p className="flex items-center justify-center gap-1 font-display text-2xl"><Flame className="size-5 text-kumkum" />{user.stats.currentStreak}</p><p className="text-xs text-muted-foreground">Streak</p></div>
            </div>
            <Fact label="Rank" value={user.stats.rank.toLowerCase().replace("_", " ")} />
            <Fact label="Longest streak" value={`${user.stats.longestStreak} days`} />
            {Object.entries(user.stats.counters).map(([key, value]) => (
              <Fact key={key} label={key.replace(/([A-Z])/g, " $1").toLowerCase()} value={compact(Number(value))} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Last 6 weeks</CardTitle>
            <CardDescription>Each lamp is a day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map(({ key, day }) => (
                <div
                  key={key}
                  title={`${key}: ${day ? `${day.xp} XP${day.fullSadhana ? ", full Sadhana" : ""}` : "rest"}`}
                  className={cn(
                    "aspect-square rounded-md",
                    !day ? "bg-muted" : day.fullSadhana ? "bg-kumkum" : day.qualifying ? "bg-primary" : "bg-chart-2/50",
                  )}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" /> lamp lit</span>
              <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-kumkum" /> full Sadhana</span>
              <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-muted" /> rest</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Award className="size-5 text-primary" /> Milestones ({user.badges.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {user.badges.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : user.badges.map((badge) => (
              <Badge key={badge.id} variant="secondary" title={formatDate(badge.unlockedAt)}>{badge.id}</Badge>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">Staff notes</CardTitle></CardHeader>
          <CardContent>
            {user.notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes.</p> : (
              <ol className="space-y-3">
                {[...user.notes].reverse().map((note, index) => (
                  <li key={index} className="rounded-xl border p-3 text-sm">
                    <p>{note.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(note.at)} · {note.by.slice(0, 8)}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
