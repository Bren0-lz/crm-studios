import { useLayoutEffect } from "react";
let bodyScrollLocks = 0;
let bodyPaddingRightBeforeLock = "";

export function useBodyScrollLock() {
  useLayoutEffect(() => {
    const body = document.body;
    if (bodyScrollLocks === 0) {
      bodyPaddingRightBeforeLock = body.style.paddingRight;
      const viewportWidth = document.documentElement.clientWidth;
      const scrollbarWidth = window.innerWidth - viewportWidth;
      // Compensa a barra de rolagem que some, para o layout não "pular" no desktop.
      if (viewportWidth > 0 && scrollbarWidth > 0)
        body.style.paddingRight = `${scrollbarWidth}px`;
      body.classList.add("modal-open");
      // V9: com o html sempre rolável, a trava precisa valer no html (o overflow do body
      // só passa para a janela quando o do html é "visible").
      document.documentElement.classList.add("modal-open");
    }
    bodyScrollLocks += 1;
    return () => {
      bodyScrollLocks -= 1;
      if (bodyScrollLocks === 0) {
        body.classList.remove("modal-open");
        document.documentElement.classList.remove("modal-open");
        body.style.paddingRight = bodyPaddingRightBeforeLock;
      }
    };
  }, []);
}
