import {
  type Lead,
  type LeadConversionInput,
  formatPhone,
  isValidCpf,
  leadMissingRegistrationFields,
  leadRegistrationRequestMessage,
  whatsappLink,
} from "@crm/contracts";
import { Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { ActionModal } from "../../shared/components/ActionModal";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useToast } from "../../shared/feedback/toast-context";
import { copyText } from "../communications/index";
import { CpfInput } from "../../shared/components/CpfInput";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { PatientProfileFields } from "../patients/index";

/**
 * Conversão do lead: o mesmo cadastro do "Novo cliente", já preenchido com o que o lead
 * guarda; o que ainda não foi informado fica em branco. CPF, WhatsApp e contato de emergência
 * são obrigatórios (CD1).
 *
 * Antes do formulário, se faltar algum dado do cadastro, aparece a mensagem pronta para pedir
 * tudo ao lead de uma vez (copiar ou abrir no WhatsApp); "Preencher cadastro" segue (CV1).
 */
export function LeadConvertModal(props: LeadConvertModalProps) {
  const [step, setStep] = useState<"request" | "form">(() =>
    leadMissingRegistrationFields(props.lead).length > 0 ? "request" : "form",
  );
  return step === "request" ? (
    <LeadRegistrationRequest {...props} onContinue={() => setStep("form")} />
  ) : (
    <LeadConvertForm {...props} />
  );
}

interface LeadConvertModalProps {
  lead: Lead;
  /** Módulo de origem (ex.: "Eventos"); o padrão é o CRM comercial. */
  eyebrow?: string;
  title?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (input: LeadConversionInput) => Promise<void>;
}

function LeadRegistrationRequest({
  lead,
  eyebrow = "CRM comercial",
  title = "Converter lead em cliente",
  onClose,
  onContinue,
}: LeadConvertModalProps & { onContinue: () => void }) {
  const toast = useToast();
  const [message, setMessage] = useState(() =>
    leadRegistrationRequestMessage(lead),
  );
  const [error, setError] = useState("");
  const phone = lead.whatsapp?.trim() || lead.phone?.trim() || "";
  async function copy() {
    try {
      await copyText(message);
      setError("");
      toast.success("Mensagem copiada.");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <Modal
      eyebrow={eyebrow}
      title={title}
      subtitle={`${lead.fullName} · ${formatPhone(lead.phone)}`}
      initialFocus="textarea"
      onClose={onClose}
    >
      <div className="form-grid">
        <p className="span-2">
          Faltam dados para o cadastro. Envie o pedido ao lead e, com as
          respostas, preencha o cadastro.
        </p>
        <label className="span-2">
          Mensagem para o lead
          <textarea
            rows={10}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          <ModalCancelButton>Voltar</ModalCancelButton>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void copy()}
          >
            <Copy size={16} aria-hidden="true" />
            Copiar mensagem
          </button>
          {phone && (
            <a
              className="whatsapp-button"
              href={whatsappLink(phone, message)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} aria-hidden="true" />
              Enviar pelo WhatsApp
            </a>
          )}
          <button className="primary-button" type="button" onClick={onContinue}>
            Preencher cadastro
          </button>
        </div>
      </div>
    </Modal>
  );
}

function LeadConvertForm({
  lead,
  eyebrow = "CRM comercial",
  title = "Converter lead em cliente",
  confirmLabel = "Converter em cliente",
  onClose,
  onConfirm,
}: LeadConvertModalProps) {
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
