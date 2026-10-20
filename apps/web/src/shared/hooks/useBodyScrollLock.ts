import { useLayoutEffect } from "react";
let bodyScrollLocks = 0;
let bodyPaddingRightBeforeLock = "";

export function useBodyScrollLock() {
  useLayoutEffect(() => {
    const body = document.body;
    if (bodyScrollLocks === 0) {
      bodyPaddingRightBeforeLock = body.style.paddingRight;
      // Com a calha estável e barra estilizada, clientWidth pode incluir a calha.
      const viewportWidth =
        document.documentElement.getBoundingClientRect().width;
      const scrollbarWidth = window.innerWidth - viewportWidth;
      // Compensa a barra de rolagem que some, para o layout não "pular" no desktop.
      if (viewportWidth > 0 && scrollbarWidth > 0)
        body.style.paddingRight = `${scrollbarWidth}px`;
      body.classList.add("modal-open");
      // A rolagem pertence ao html. Bloqueá-la só nele mantém o body sem overflow,
      // preservando a referência à janela do menu lateral e do cabeçalho sticky.
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
