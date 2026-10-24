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
import { PatientProfileFields } from "../patients/index";

/**
 * Conversão do lead: o mesmo cadastro do "Novo cliente", já preenchido com o que o lead
 * guarda; o que ainda não foi informado fica em branco. O CPF é obrigatório.
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
    fullName: lead.fullName,
    cpf: lead.cpf ?? "",
    phone: lead.phone,
    whatsapp: lead.whatsapp ?? "",
    email: lead.email ?? "",
    birthDate: lead.birthDate ?? "",
    postalCode: lead.postalCode ?? "",
    address: lead.address ?? "",
    neighborhood: lead.neighborhood ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    occupation: lead.occupation ?? "",
    source: lead.source ?? "",
    gender: lead.gender ?? "",
    clientSince: lead.clientSince ?? "",
    imageConsent: lead.imageConsent ?? false,
    emergencyContactName: lead.emergencyContactName ?? "",
    emergencyContactPhone: lead.emergencyContactPhone ?? "",
    notes: lead.notes ?? "",
  });
  const dirty = useFormDirty(form);
  const field = <K extends keyof LeadConversionInput>(
    key: K,
    value: LeadConversionInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const missing = [
    ...(form.fullName?.trim() ? [] : ["Nome completo"]),
    ...(form.cpf.trim() ? [] : ["CPF"]),
    ...(form.phone?.trim() ? [] : ["Telefone"]),
  ];

  return (
    <ActionModal
      eyebrow="CRM comercial"
      title="Converter lead em cliente"
      subtitle={`${lead.fullName} · ${formatPhone(lead.phone)}`}
      effect={`Confira o cadastro: os dados do lead já vieram preenchidos. Se já houver um cliente com o mesmo telefone, e-mail ou CPF, o lead é ligado a ele; senão, um cadastro novo é criado. O lead vai para a coluna ${columnLabel}.`}
      confirmLabel="Converter em cliente"
      validate={() => (!isValidCpf(form.cpf) ? "Informe um CPF válido." : "")}
      missing={missing}
      dirty={dirty}
      onConfirm={() => onConfirm(form)}
      onClose={onClose}
    >
      <label className="span-2">
        Nome completo
        <input
          required
          maxLength={160}
          value={form.fullName ?? ""}
          onChange={(event) => field("fullName", event.target.value)}
        />
      </label>
      <label className="span-2">
        CPF
        <CpfInput
          required
          value={form.cpf}
          onChange={(cpf) => field("cpf", cpf)}
        />
      </label>
      <fieldset className="form-fieldset span-2">
        <legend>Contato</legend>
        <div className="form-fieldset-grid">
          <label>
            Telefone
            <PhoneInput
              required
              value={form.phone ?? ""}
              onChange={(digits) => field("phone", digits)}
            />
          </label>
          <div className="field-with-hint">
            <label>
              WhatsApp
              <PhoneInput
                value={form.whatsapp ?? ""}
                onChange={(digits) => field("whatsapp", digits)}
              />
            </label>
            <small className="field-hint">
              Em branco, as mensagens usam o telefone de contato.
            </small>
          </div>
        </div>
      </fieldset>
      <label>
        E-mail
        <input
          type="email"
          value={form.email ?? ""}
          onChange={(event) => field("email", event.target.value)}
        />
      </label>
      <label>
        Data de nascimento
        <input
          type="date"
          value={form.birthDate ?? ""}
          onChange={(event) => field("birthDate", event.target.value)}
        />
      </label>
      <details className="more-info span-2" open>
        <summary>Mais informações</summary>
        <div className="form-grid">
          <PatientProfileFields
            form={form}
            onChange={(key, value) =>
              setForm((current) => ({ ...current, [key]: value }))
            }
          />
          <fieldset className="form-fieldset emergency-fieldset span-2">
            <legend>Contato de emergência</legend>
            <div className="form-fieldset-grid">
              <label>
                Nome
                <input
                  autoComplete="off"
                  maxLength={120}
                  placeholder="Ex.: Maria Souza (mãe)"
                  value={form.emergencyContactName ?? ""}
                  onChange={(event) =>
                    field("emergencyContactName", event.target.value)
                  }
                />
              </label>
              <label>
                Telefone
                <PhoneInput
                  value={form.emergencyContactPhone ?? ""}
                  onChange={(digits) => field("emergencyContactPhone", digits)}
                />
              </label>
            </div>
          </fieldset>
          <label className="span-2">
            Observações
            <textarea
              rows={3}
              maxLength={2000}
              value={form.notes ?? ""}
              onChange={(event) => field("notes", event.target.value)}
            />
          </label>
        </div>
      </details>
    </ActionModal>
  );
}
