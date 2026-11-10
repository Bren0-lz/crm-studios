import { trashKindLabels, type TrashKind } from "@crm/contracts";
import { api } from "../../api";
import { ActionModal } from "../../shared/components/ActionModal";

const effects: Record<TrashKind, string> = {
  patients:
    "O cliente sai das listas, buscas e agendamentos e vai para a lixeira de Clientes. Atendimentos, planos e financeiro dele ficam guardados.",
  leads:
    "O lead sai do funil e vai para a lixeira do Comercial, com contatos e tarefas.",
  appointments:
    "O atendimento sai da agenda e libera o horário. Ele vai para a lixeira da Agenda.",
  "patient-plans":
    "O plano sai da ficha do cliente e da lista de planos e vai para a lixeira de Planos.",
};

/** Confirma o envio de um item para a lixeira do tópico; quem vê a lixeira pode restaurar. */
export function SendToTrashModal({
  kind,
  id,
  title,
  onClose,
  onDone,
}: {
  kind: TrashKind;
  id: string;
  title: string;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <ActionModal
      eyebrow={trashKindLabels[kind]}
      title="Excluir"
      subtitle={title}
      effect={effects[kind]}
      confirmLabel="Enviar para a lixeira"
      danger
      onConfirm={async () => {
        await api.sendToTrash(kind, id);
        onDone();
      }}
      onClose={onClose}
    />
  );
}
