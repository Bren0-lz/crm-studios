import {
  permissionCatalog,
  type PermissionKey,
  type UserSummary,
} from "@crm/contracts";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  clearSession,
  getStoredUser,
  hasSession,
  storeUser,
} from "../../api";
import {
  AuthorizationContext,
  type Authorization,
} from "../../authorization-context";

export function AuthorizationProvider({ children }: { children: ReactNode }) {
  const [user, updateUser] = useState<UserSummary | null>(() =>
    getStoredUser(),
  );
  const [checking, setChecking] = useState(hasSession);
  const generation = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const setUser = useCallback((fresh: UserSummary | null) => {
    generation.current++;
    pending.current = null;
    if (fresh) storeUser(fresh);
    else clearSession();
    updateUser(fresh);
    setChecking(false);
  }, []);
  const logout = useCallback(() => setUser(null), [setUser]);

  const refresh = useCallback(() => {
    if (!hasSession()) return;
    if (pending.current) return;
    const version = generation.current;
    const request = api
      .me()
      .then((fresh) => {
        if (generation.current !== version) return;
        storeUser(fresh);
        updateUser(fresh);
      })
      .catch(() => {
        if (generation.current === version) logout();
      })
      .finally(() => {
        if (pending.current === request) pending.current = null;
        if (generation.current === version) setChecking(false);
      });
    pending.current = request;
  }, [logout]);

  useEffect(() => {
    if (hasSession()) refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible" && hasSession()) refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("crm:access-denied", refresh);
    window.addEventListener("crm:session-ended", logout);
    const invalidate = () => {
      generation.current++;
      pending.current = null;
    };
    return () => {
      invalidate();
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("crm:access-denied", refresh);
      window.removeEventListener("crm:session-ended", logout);
    };
  }, [refresh, logout]);

  const can = useCallback(
    (...keys: PermissionKey[]) =>
      keys.every((key) => user?.permissions?.includes(key) ?? false),
    [user?.permissions],
  );
  const canView = useCallback(
    (module: import("@crm/contracts").AppModule) => can(`${module}.view`),
    [can],
  );
  const canEdit = useCallback(
    (...modules: import("@crm/contracts").AppModule[]) =>
      modules.every((module) =>
        permissionCatalog.some(
          (item) =>
            item.module === module &&
            item.legacyEdit.includes(module) &&
            can(item.key),
        ),
      ),
    [can],
  );
  const value: Authorization = {
    user,
    checking,
    setUser,
    logout,
    can,
    canView,
    // Used only to describe whether any editing controls exist; each control checks its action.
    canEdit,
  };
  return (
    <AuthorizationContext.Provider value={value}>
      {children}
    </AuthorizationContext.Provider>
  );
}
