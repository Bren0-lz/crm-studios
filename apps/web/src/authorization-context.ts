import { createContext, useContext } from "react";
import type { AppModule, PermissionKey, UserSummary } from "@crm/contracts";

export interface Authorization {
  user: UserSummary | null;
  checking: boolean;
  setUser: (user: UserSummary | null) => void;
  logout: () => void;
  can: (...permissions: PermissionKey[]) => boolean;
  canView: (module: AppModule) => boolean;
  canEdit: (...modules: AppModule[]) => boolean;
}
export const AuthorizationContext = createContext<Authorization | null>(null);

export function useAuthorization() {
  const value = useContext(AuthorizationContext);
  if (!value) throw new Error("AuthorizationProvider ausente");
  return value;
}
