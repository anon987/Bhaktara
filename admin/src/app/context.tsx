import { createContext, ReactNode, useContext } from "react";
import type { AdminApi } from "../api";
import type { AdminRole } from "../domain";

type AdminContextValue = { api: AdminApi; role: AdminRole };

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({
  api,
  role,
  children,
}: AdminContextValue & { children: ReactNode }) {
  return (
    <AdminContext.Provider value={{ api, role }}>{children}</AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminProvider");
  return value;
}
