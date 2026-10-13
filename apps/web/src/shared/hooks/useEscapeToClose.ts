import { useEffect, useRef } from "react";
import { escapeStack } from "../lib/formatting";

export function useEscapeToClose(onClose: () => void, busy: boolean) {
  const latest = useRef({ onClose, busy });
  useEffect(() => {
    latest.current = { onClose, busy };
  });
  useEffect(() => {
    const id = Symbol("dialog");
    escapeStack.push(id);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || escapeStack[escapeStack.length - 1] !== id)
        return;
      if (!latest.current.busy) latest.current.onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const index = escapeStack.indexOf(id);
      if (index >= 0) escapeStack.splice(index, 1);
    };
  }, []);
}
