import { type Lead, formatPhone } from "@crm/contracts";
import { ActionModal } from "../../shared/components/ActionModal";

export function LeadConvertModal({
  lead,
  onClose,
  onConfirm,
}: {
  lead: Lead;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <ActionModal
      eyebrow="CRM comercial"
      title="Converter lead em cliente"
      subtitle={`${lead.fullName} · ${formatPhone(lead.phone)}`}
      effect={`${lead.fullName} passa a ser cliente: se já houver um cliente com o mesmo telefone ou e-mail, o lead é ligado a ele; senão, um cadastro novo é criado com nome, telefone e e-mail do lead. Os agendamentos experimentais vão para o cliente e o lead vai para a coluna Ganhos.`}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
