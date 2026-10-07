import { createContext, ReactNode, useContext } from "react";
import type { AdminApi } from "../api";
import type { AdminRole } from "../domain";
import type { PanelApi } from "../panelApi";

type AdminContextValue = { api: AdminApi; panel: PanelApi; role: AdminRole };

const AdminContext = createContext<AdminContextValue | null>(null);

// Screens that predate the panel API are tested without one.
const missingPanel = new Proxy({} as PanelApi, {
  get: (_target, name) => () =>
    Promise.reject(new Error(`Panel API "${String(name)}" is not available here.`)),
});

export function AdminProvider({
  api,
  panel = missingPanel,
  role,
  children,
}: { api: AdminApi; panel?: PanelApi; role: AdminRole; children: ReactNode }) {
  return (
    <AdminContext.Provider value={{ api, panel, role }}>{children}</AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminProvider");
  return value;
}
