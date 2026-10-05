import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RoleGate } from "./RoleGate";
import type { Session, SessionActions } from "./session";

const user = { uid: "u1", email: "op@example.com", displayName: "Operator" };
const actions = (): SessionActions => ({
  signIn: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  refresh: vi.fn(async () => {}),
});

function renderGate(session: Session, handlers = actions()) {
  render(
    <RoleGate session={session} actions={handlers} environment="Emulators · demo-bhaktara">
      {({ role }) => <p>Inside as {role}</p>}
    </RoleGate>,
  );
  return handlers;
}

describe("RoleGate", () => {
  it("shows a loading state while the session resolves", () => {
    renderGate({ kind: "loading" });
    expect(screen.getByRole("status")).toHaveTextContent("Checking your access");
    expect(screen.queryByText(/Inside as/)).not.toBeInTheDocument();
  });

  it("offers Google sign-in when signed out and shows sign-in errors", async () => {
    const handlers = renderGate({ kind: "signed-out", error: "Sign-in failed. Please try again." });
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in failed");
    await userEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
    expect(handlers.signIn).toHaveBeenCalledOnce();
  });

  it("shows a friendly no-access state without a role claim and refreshes access", async () => {
    const handlers = renderGate({ kind: "signed-in", user, role: null, anonymous: false });
    expect(screen.getByRole("heading", { name: "No access" })).toBeInTheDocument();
    expect(screen.getByText(/this account has no CMS role/)).toBeInTheDocument();
    expect(screen.queryByText(/Inside as/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Refresh access" }));
    expect(handlers.refresh).toHaveBeenCalledOnce();
    expect(await screen.findByText(/still no CMS access/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(handlers.signOut).toHaveBeenCalledOnce();
  });

  it("keeps roles without an admin module out (ANALYST, MODERATOR)", () => {
    renderGate({ kind: "signed-in", user, role: "ANALYST", anonymous: false });
    expect(screen.getByRole("heading", { name: "No access" })).toBeInTheDocument();
    expect(screen.getByText(/ANALYST/)).toBeInTheDocument();
  });

  it("never admits anonymous accounts, even with a role claim", () => {
    renderGate({ kind: "signed-in", user, role: "SUPER_ADMIN", anonymous: true });
    expect(screen.getByRole("heading", { name: "No access" })).toBeInTheDocument();
  });

  it.each(["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"] as const)(
    "lets %s through with its role",
    (role) => {
      renderGate({ kind: "signed-in", user, role, anonymous: false });
      expect(screen.getByText(`Inside as ${role}`)).toBeInTheDocument();
    },
  );
});
