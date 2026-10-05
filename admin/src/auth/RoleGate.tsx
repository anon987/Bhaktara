import { ReactNode, useState } from "react";
import { AdminRole, can } from "../domain";
import type { Session, SessionActions, SessionUser } from "./session";

// Roles that have at least one module in this app. MODERATOR and ANALYST are
// valid roles, but their modules (users, dashboard) are not built yet.
export const hasAdminModule = (role: AdminRole | null) =>
  can(role, "content.read") || can(role, "banner.read") || can(role, "audit.read");

type Props = {
  session: Session;
  actions: SessionActions;
  environment: string;
  children: (access: { role: AdminRole; user: SessionUser }) => ReactNode;
};

export function RoleGate({ session, actions, environment, children }: Props) {
  if (session.kind === "loading")
    return (
      <Panel environment={environment}>
        <p role="status">Checking your access…</p>
      </Panel>
    );

  if (session.kind === "signed-out")
    return (
      <Panel environment={environment}>
        <h1>Bhaktara Admin</h1>
        <p>Sign in with the Google account that holds your CMS role.</p>
        {session.error && (
          <p className="notice notice-error" role="alert">
            {session.error}
          </p>
        )}
        <button type="button" className="primary" onClick={() => actions.signIn()}>
          Sign in with Google
        </button>
      </Panel>
    );

  const { user, role, anonymous } = session;
  if (anonymous || !role || !hasAdminModule(role))
    return (
      <Panel environment={environment}>
        <h1>No access</h1>
        <p>
          You are signed in as <strong>{user.email ?? user.uid}</strong>
          {role ? (
            <>
              {" "}
              with the <strong>{role}</strong> role, which has no modules in this
              admin app yet.
            </>
          ) : (
            ", but this account has no CMS role."
          )}
        </p>
        <p>
          Ask a SUPER_ADMIN to grant you a role (in development:{" "}
          <code>npm run admin:grant-role -- --email {user.email ?? "you@example.com"} --role SUPER_ADMIN</code>
          ), then choose Refresh access.
        </p>
        <AccessActions actions={actions} />
      </Panel>
    );

  return <>{children({ role, user })}</>;
}

function AccessActions({ actions }: { actions: SessionActions }) {
  const [state, setState] = useState<"idle" | "refreshing" | "checked" | "failed">(
    "idle",
  );
  return (
    <>
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={state === "refreshing"}
          onClick={async () => {
            setState("refreshing");
            try {
              await actions.refresh();
              setState("checked");
            } catch {
              setState("failed");
            }
          }}
        >
          {state === "refreshing" ? "Refreshing…" : "Refresh access"}
        </button>
        <button type="button" onClick={() => actions.signOut()}>
          Sign out
        </button>
      </div>
      <p role="status" className="muted">
        {state === "checked" &&
          "Checked again: still no CMS access. Role changes can take a moment to apply."}
        {state === "failed" && "Could not refresh your access. Try again."}
      </p>
    </>
  );
}

function Panel({
  environment,
  children,
}: {
  environment: string;
  children: ReactNode;
}) {
  return (
    <main className="gate" id="main">
      <div className="gate-card">
        <p className="env-badge">{environment}</p>
        {children}
      </div>
    </main>
  );
}
