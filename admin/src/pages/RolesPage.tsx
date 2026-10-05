import { useCallback, useState } from "react";
import { ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdmin } from "../app/context";
import { adminRoles, type AdminRole } from "../domain";
import { ConfirmAction } from "../components/panel/confirm";
import { ago } from "../components/panel/format";
import { SelectField } from "../components/panel/inputs";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../components/panel/page";
import { useAction } from "../components/panel/useAction";
import { useLoad } from "../useLoad";
import type { StaffRow } from "../panelApi";

const roleText: Record<AdminRole, string> = {
  SUPER_ADMIN: "Everything, including roles, users and config",
  CONTENT_ADMIN: "Content, publishing, Home, banners, catalogue",
  EDITOR: "Draft and edit content, upload media, move to READY",
  MODERATOR: "Users and display-name moderation",
  ANALYST: "Read-only dashboard and catalogue",
};

// Doc 09 §15. Roles are custom claims; the account must have signed in once.
export function RolesPage() {
  const { panel } = useAdmin();
  const [reload, setReload] = useState(0);
  const load = useCallback(() => panel.listAdmins(), [panel, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, error, loading } = useLoad<StaffRow[]>(load);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("EDITOR");
  const grant = useAction(
    async () => {
      await panel.setAdminRole({ email: email.trim(), role });
      setEmail("");
      setReload((n) => n + 1);
    },
    { success: "Role granted. They must sign out and in again." },
  );
  const revoke = useAction(
    async (staffEmail: string) => {
      await panel.setAdminRole({ email: staffEmail, role: null });
      setReload((n) => n + 1);
    },
    { success: "Role removed" },
  );

  return (
    <div>
      <PageHeader title="Staff roles" description="Who can use this panel, and what each role may do. Changes are audited." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          {error && <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />}
          {loading && !data && <LoadingState rows={3} />}
          {data && data.length === 0 && <EmptyState icon={ShieldCheck} title="No staff yet" />}
          {data && data.length > 0 && (
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Last sign-in</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((staff) => (
                    <TableRow key={staff.uid}>
                      <TableCell>
                        <p className="font-medium">{staff.email ?? staff.uid}</p>
                        {staff.displayName && <p className="text-xs text-muted-foreground">{staff.displayName}</p>}
                      </TableCell>
                      <TableCell><Badge>{staff.role.replace("_", " ")}</Badge>{staff.disabled && <Badge variant="outline" className="ml-1">disabled</Badge>}</TableCell>
                      <TableCell className="text-muted-foreground">{ago(staff.lastSignInAt)}</TableCell>
                      <TableCell className="text-right">
                        {staff.email && (
                          <ConfirmAction
                            trigger={<Button variant="ghost" size="sm" className="text-destructive"><UserMinus /> Remove</Button>}
                            title={`Remove ${staff.email}'s role?`}
                            description="They lose access to the panel at their next sign-in. You cannot remove your own role."
                            confirmLabel="Remove role"
                            destructive
                            onConfirm={() => revoke.run(staff.email!)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Grant a role</CardTitle>
              <CardDescription>The person must sign in to this panel once first.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void grant.run(); }}>
                <div className="space-y-2">
                  <Label htmlFor="staff-email">Google account email</Label>
                  <Input id="staff-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </div>
                <SelectField id="staff-role" label="Role" value={role} options={adminRoles.map((r) => ({ value: r, label: r.replace("_", " ") }))} onChange={setRole} />
                <p className="text-xs text-muted-foreground">{roleText[role]}</p>
                <Button type="submit" className="w-full" disabled={grant.busy || !email.trim()}><UserPlus /> Grant role</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg">Roles</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {adminRoles.map((r) => (
                <div key={r}>
                  <p className="font-medium">{r.replace("_", " ")}</p>
                  <p className="text-muted-foreground">{roleText[r]}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
