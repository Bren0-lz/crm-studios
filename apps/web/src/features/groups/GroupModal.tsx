import type { ReactNode } from "react";
import { Modal } from "../../shared/components/Modal";

export function GroupModal({
  title,
  subtitle,
  busy = false,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  busy?: boolean;
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
      onClose={onClose}
    >
      {children}
    </Modal>
  );
}
