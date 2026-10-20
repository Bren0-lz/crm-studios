import type { ReactNode } from "react";
import { Modal } from "../../shared/components/Modal";

export function GroupModal({
  title,
  subtitle,
  busy = false,
  dirty = false,
  inactive = false,
  initialFocus = "input, select, textarea",
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  busy?: boolean;
  /** Formulário alterado: Esc e X perguntam "Descartar alterações?". */
  dirty?: boolean;
  inactive?: boolean;
  initialFocus?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      eyebrow="Turmas"
      title={title}
      subtitle={subtitle}
      wide
      initialFocus={initialFocus}
      busy={busy}
      inactive={inactive}
      dirty={dirty}
      onClose={onClose}
    >
      {children}
    </Modal>
  );
}
