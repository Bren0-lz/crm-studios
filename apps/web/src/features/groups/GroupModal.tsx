import type { ReactNode } from "react";
import { Modal } from "../../shared/components/Modal";

export function GroupModal({
  title,
  subtitle,
  busy = false,
  dirty = false,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  busy?: boolean;
  /** Formulário alterado: Esc e X perguntam "Descartar alterações?". */
  dirty?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      eyebrow="Turmas"
      title={title}
      subtitle={subtitle}
      wide
      initialFocus="input, select, textarea"
      busy={busy}
      dirty={dirty}
      onClose={onClose}
    >
      {children}
    </Modal>
  );
}
