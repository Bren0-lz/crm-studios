import { createContext, useContext } from "react";

export interface Toasts {
  success: (message: string) => void;
  error: (message: string) => void;
}

/** Fora do provedor (testes de componente isolado) o toast não faz nada. */
export const ToastContext = createContext<Toasts>({
  success: () => undefined,
  error: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}
