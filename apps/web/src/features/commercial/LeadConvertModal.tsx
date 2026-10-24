import {
  type Lead,
  type LeadConversionInput,
  formatPhone,
  isValidCpf,
} from "@crm/contracts";
import { useState } from "react";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { ActionModal } from "../../shared/components/ActionModal";
import { CpfInput } from "../../shared/components/CpfInput";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { formatCep, lookupCep } from "../../shared/lib/cep";

/**
 * Conversão do lead: CPF, contato de emergência e endereço (que o lead não guarda) são
 * pedidos aqui; o CPF é obrigatório para cadastrar o cliente.
 */
export function LeadConvertModal({
  lead,
  columnLabel = "Ganhos",
  onClose,
  onConfirm,
}: {
  lead: Lead;
  /** Nome atual da coluna de ganhos (a clínica pode renomear). */
  columnLabel?: string;
  onClose: () => void;
  onConfirm: (input: LeadConversionInput) => Promise<void>;
}) {
  const [form, setForm] = useState<LeadConversionInput>({
    cpf: lead.cpf ?? "",
    emergencyContactName: lead.emergencyContactName ?? "",
    emergencyContactPhone: lead.emergencyContactPhone ?? "",
    postalCode: lead.postalCode ?? "",
    address: lead.address ?? "",
    neighborhood: lead.neighborhood ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
  });
  const [cepStatus, setCepStatus] = useState("");
  const dirty = useFormDirty(form);
  const field = <K extends keyof LeadConversionInput>(
    key: K,
    value: LeadConversionInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  async function changeCep(value: string) {
    const formatted = formatCep(value);
    field("postalCode", formatted);
    if (formatted.replace(/\D/g, "").length !== 8) {
      setCepStatus("");
      return;
    }
    setCepStatus("Buscando endereço…");
    try {
      const found = await lookupCep(formatted);
      if (!found) {
        setCepStatus("CEP não encontrado. Preencha o endereço manualmente.");
        return;
      }
      setForm((current) => ({
        ...current,
        ...(found.address ? { address: found.address } : {}),
        ...(found.neighborhood ? { neighborhood: found.neighborhood } : {}),
        ...(found.city ? { city: found.city } : {}),
        ...(found.state ? { state: found.state } : {}),
      }));
      setCepStatus("Endereço preenchido pelo CEP. Confira o número.");
    } catch {
      setCepStatus("Não foi possível consultar o CEP. Preencha manualmente.");
    }
  }

  return (
    <ActionModal
      eyebrow="CRM comercial"
      title="Converter lead em cliente"
      subtitle={`${lead.fullName} · ${formatPhone(lead.phone)}`}
      effect={`${lead.fullName} passa a ser cliente: se já houver um cliente com o mesmo telefone, e-mail ou CPF, o lead é ligado a ele; senão, um cadastro novo é criado. Os agendamentos experimentais vão para o cliente e o lead vai para a coluna ${columnLabel}. O CPF é obrigatório; os demais dados abaixo são opcionais e completam o cadastro.`}
      validate={() => (!isValidCpf(form.cpf) ? "Informe um CPF válido." : "")}
      missing={form.cpf.trim() ? [] : ["CPF"]}
      dirty={dirty}
      onConfirm={() => onConfirm(form)}
      onClose={onClose}
    >
      <label>
        CPF
        <CpfInput
          required
          value={form.cpf ?? ""}
          onChange={(cpf) => field("cpf", cpf)}
        />
      </label>
      <label>
        Contato de emergência
        <input
          maxLength={120}
          value={form.emergencyContactName ?? ""}
          onChange={(event) =>
            field("emergencyContactName", event.target.value)
          }
        />
      </label>
      <label>
        Telefone de emergência
        <PhoneInput
          value={form.emergencyContactPhone ?? ""}
          onChange={(value) => field("emergencyContactPhone", value)}
        />
      </label>
      <div className="field-with-hint">
        <label>
          CEP
          <input
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            maxLength={9}
            value={form.postalCode ?? ""}
            onChange={(event) => void changeCep(event.target.value)}
          />
        </label>
        {cepStatus && (
          <small className="field-hint" role="status">
            {cepStatus}
          </small>
        )}
      </div>
      <label className="span-2">
        Endereço
        <input
          maxLength={300}
          value={form.address ?? ""}
          onChange={(event) => field("address", event.target.value)}
        />
      </label>
      <label>
        Bairro
        <input
          maxLength={100}
          value={form.neighborhood ?? ""}
          onChange={(event) => field("neighborhood", event.target.value)}
        />
      </label>
      <label>
        Cidade
        <input
          maxLength={100}
          value={form.city ?? ""}
          onChange={(event) => field("city", event.target.value)}
        />
      </label>
      <label>
        UF
        <input
          maxLength={2}
          value={form.state ?? ""}
          onChange={(event) => field("state", event.target.value.toUpperCase())}
        />
      </label>
    </ActionModal>
  );
}
