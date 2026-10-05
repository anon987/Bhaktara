import { useMemo } from "react";
import { firebaseApi } from "../api";
import { RoleGate } from "../auth/RoleGate";
import { useFirebaseSession } from "../auth/session";
import type { FirebaseServices } from "../firebase";
import { AdminProvider } from "./context";
import { Shell } from "./Shell";

export function App({
  services,
  environment,
}: {
  services: FirebaseServices;
  environment: string;
}) {
  const [session, actions] = useFirebaseSession(services.auth);
  const api = useMemo(() => firebaseApi(services), [services]);
  return (
    <RoleGate session={session} actions={actions} environment={environment}>
      {({ role, user }) => (
        <AdminProvider api={api} role={role}>
          <Shell role={role} user={user} actions={actions} environment={environment} />
        </AdminProvider>
      )}
    </RoleGate>
  );
}
