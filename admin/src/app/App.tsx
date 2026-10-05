import { useMemo } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { firebaseApi } from "../api";
import { RoleGate } from "../auth/RoleGate";
import { useFirebaseSession } from "../auth/session";
import type { FirebaseServices } from "../firebase";
import { firebasePanelApi } from "../panelApi";
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
  const panel = useMemo(() => firebasePanelApi(services), [services]);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={300}>
        <RoleGate session={session} actions={actions} environment={environment}>
          {({ role, user }) => (
            <AdminProvider api={api} panel={panel} role={role}>
              <Shell role={role} user={user} actions={actions} environment={environment} />
            </AdminProvider>
          )}
        </RoleGate>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
