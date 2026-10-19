import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { ToastContext, type Toasts } from "./toast-context";

interface ToastItem {
  id: number;
  kind: "success" | "error";
  message: string;
}

/** Duração do aviso na tela; erros ficam mais tempo para dar tempo de ler. */
const DURATION = { success: 4000, error: 7000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback(
    (id: number) =>
      setItems((current) => current.filter((item) => item.id !== id)),
    [],
  );
  const push = useCallback(
    (kind: ToastItem["kind"], message: string) => {
      const id = nextId.current++;
      // No máximo 3 avisos ao mesmo tempo: o mais antigo sai.
      setItems((current) => [...current.slice(-2), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), DURATION[kind]);
    },
    [dismiss],
  );
  const value = useMemo<Toasts>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
    }),
    [push],
  );
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            className={`toast toast-${item.kind}`}
            role={item.kind === "error" ? "alert" : "status"}
          >
            {item.kind === "success" ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <AlertCircle size={18} aria-hidden="true" />
            )}
            <span>{item.message}</span>
            <button
              type="button"
              className="icon-button toast-close"
              aria-label="Fechar aviso"
              onClick={() => dismiss(item.id)}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
