import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NavigationGuardContext } from "../../shared/lib/NavigationGuardContext";
import { SettingsPanelContext } from "../../shared/workflows/SettingsPanelContext";
import { UnsavedChangesModal } from "./UnsavedChangesModal";

export function useUnsavedChangesPrompt({
  section,
  dirty,
  busy = false,
  save,
  discard,
}: {
  section: string;
  dirty: boolean;
  busy?: boolean;
  save: () => Promise<void>;
  discard: () => void;
}) {
  const [pending, setPending] = useState<{ proceed: () => void } | null>(null);
  const navigate = useNavigate();
  const registerTabGuard = useContext(SettingsPanelContext)?.registerGuard;
  const registerGuard = useContext(NavigationGuardContext);
  useEffect(() => {
    if (!dirty && !busy) return;
    return registerGuard((to) => {
      if (busy) return true;
      setPending({ proceed: () => void navigate(to) });
      return true;
    });
  }, [dirty, busy, registerGuard, navigate]);
  const confirmLeave = useCallback(
    (proceed: () => void) => {
      if (busy) return;
      if (dirty) setPending({ proceed });
      else proceed();
    },
    [dirty, busy],
  );
  useEffect(() => {
    if (registerTabGuard) return registerTabGuard(confirmLeave);
  }, [registerTabGuard, confirmLeave]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const modal = pending && (
    <UnsavedChangesModal
      section={section}
      onSave={async () => {
        await save();
        setPending(null);
        pending.proceed();
      }}
      onDiscard={() => {
        discard();
        setPending(null);
        pending.proceed();
      }}
      onContinue={() => setPending(null)}
    />
  );
  return { confirmLeave, modal };
}
