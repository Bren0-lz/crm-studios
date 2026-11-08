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
 * guarda; o que ainda não foi informado fica em branco. CPF, WhatsApp e contato de emergência
 * são obrigatórios (CD1).
 */
export function LeadConvertModal({
  lead,
  eyebrow = "CRM comercial",
  title = "Converter lead em cliente",
  confirmLabel = "Converter em cliente",
  onClose,
  onConfirm,
}: {
  lead: Lead;
  /** Módulo de origem (ex.: "Eventos"); o padrão é o CRM comercial. */
  eyebrow?: string;
  title?: string;
  confirmLabel?: string;
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
    residenceType: lead.residenceType ?? "",
    address: lead.address ?? "",
    addressNumber: lead.addressNumber ?? "",
    complement: lead.complement ?? "",
    buildingName: lead.buildingName ?? "",
    block: lead.block ?? "",
    floor: lead.floor ?? "",
    unit: lead.unit ?? "",
    referencePoint: lead.referencePoint ?? "",
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
    ...(form.whatsapp?.trim() ? [] : ["WhatsApp"]),
    ...(form.emergencyContactName?.trim()
      ? []
      : ["Nome do contato de emergência"]),
    ...(form.emergencyContactPhone?.trim()
      ? []
      : ["Telefone do contato de emergência"]),
  ];

  return (
    <ActionModal
      eyebrow={eyebrow}
      title={title}
      subtitle={`${lead.fullName} · ${formatPhone(lead.phone)}`}
      confirmLabel={confirmLabel}
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
          <label>
            WhatsApp
            <PhoneInput
              required
              value={form.whatsapp ?? ""}
              onChange={(digits) => field("whatsapp", digits)}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="form-fieldset emergency-fieldset span-2">
        <legend>Contato de emergência</legend>
        <div className="form-fieldset-grid">
          <label>
            Nome
            <input
              autoComplete="off"
              maxLength={160}
              placeholder="Ex.: Maria Souza (mãe)"
              required
              value={form.emergencyContactName ?? ""}
              onChange={(event) =>
                field("emergencyContactName", event.target.value)
              }
            />
          </label>
          <label>
            Telefone
            <PhoneInput
              required
              value={form.emergencyContactPhone ?? ""}
              onChange={(digits) => field("emergencyContactPhone", digits)}
            />
          </label>
        </div>
        {/* Quem não tem contato de emergência repete o próprio nome e telefone. */}
        <button
          className="secondary-button"
          type="button"
          disabled={!form.fullName?.trim() && !form.phone?.trim()}
          onClick={() =>
            setForm((current) => ({
              ...current,
              emergencyContactName: current.fullName ?? "",
              emergencyContactPhone: current.phone ?? "",
            }))
          }
        >
          Usar os dados do cliente
        </button>
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
