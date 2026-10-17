import {
  isValidCpf,
  patientTagKey,
  type GroupClass,
  type GuidedPatientInput,
  type GuidedPatientNext,
  type Patient,
  type PatientInput,
  type PatientTag,
} from "@crm/contracts";
import { useRef, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { CpfInput } from "../../shared/components/CpfInput";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { TagChoice } from "../../shared/components/TagChoice";
import { tagColorLookup } from "../../shared/lib/formatting";
import { planKindLabels } from "../plans/index";
import { GuidedDemonstrationFields } from "./GuidedDemonstrationFields";
import { GuidedGroupField } from "./GuidedGroupField";
import { GuidedPlanFields } from "./GuidedPlanFields";
import {
  defaultGuidedDemonstration,
  defaultPlanTerms,
  guidedNotice,
  guidedPlanKinds,
  guidedStepLabels,
  guidedStepOrder,
  guidedStepPermissions,
  guidedSubmitLabels,
} from "./model";
import { PatientTimelineSection } from "./PatientTimelineSection";
import { PatientProfileFields } from "./PatientProfileFields";
import type { GuidedPlanForm, GuidedSingleForm } from "./types";

export function PatientModal({
  patient,
  configuredTags,
  onClose,
  onSaved,
}: {
  patient: Patient | undefined;
  /** Etiquetas configuradas: as únicas que podem ser escolhidas no cadastro. */
  configuredTags: { tags: PatientTag[] | null; error: string };
  onClose: () => void;
  /** `notice`: resumo do passo guiado (demonstração agendada, plano criado, turma/lista de espera). */
  onSaved: (patient: Patient, notice?: string) => void;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState<PatientInput>(() => ({
    ...patient,
    fullName: patient?.fullName ?? "",
    phone: patient?.phone ?? "",
    whatsapp: patient?.whatsapp ?? "",
    cpf: patient?.cpf ?? "",
    email: patient?.email ?? "",
    birthDate: patient?.birthDate ?? "",
    emergencyContactName: patient?.emergencyContactName ?? "",
    emergencyContactPhone: patient?.emergencyContactPhone ?? "",
    notes: patient?.notes ?? "",
    tags: patient?.tags ?? [],
  }));
  // O histórico usa acesso comercial: a fisioterapia não vê nem chama a rota.
  const showHistory = Boolean(patient) && can("patients.timeline");
  const editable = patient ? can("patients.update") : can("patients.create");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  function field<K extends keyof PatientInput>(key: K, value: PatientInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  const tagColor = tagColorLookup(configuredTags.tags);
  const configuredKeys = new Set(
    (configuredTags.tags ?? []).map((tag) => patientTagKey(tag.name)),
  );
  // Etiqueta que o cliente já tem e não está mais configurada aparece para poder ser retirada.
  const tagChoices = [
    ...(configuredTags.tags ?? []).map((tag) => ({
      name: tag.name,
      color: tag.color,
    })),
    ...form.tags
      .filter((tag) => !configuredKeys.has(patientTagKey(tag)))
      .map((tag) => ({ name: tag, color: tagColor(tag) })),
  ];
  function toggleTag(tag: string) {
    setForm((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag],
    }));
  }
  // Cadastro guiado (só na criação): cada opção aparece para quem edita o módulo afetado.
  const guidedSteps = patient
    ? []
    : guidedStepOrder.filter((step) => can(guidedStepPermissions[step]));
  const [step, setStep] = useState<GuidedPatientNext>("none");
  const [demonstration, setDemonstration] = useState(
    defaultGuidedDemonstration,
  );
  const [planForm, setPlanForm] = useState<GuidedPlanForm>(() => ({
    kind: "fixed_package",
    ...defaultPlanTerms(),
  }));
  const [singleForm, setSingleForm] = useState<GuidedSingleForm>(() => ({
    ...defaultPlanTerms(),
    name: "Serviço avulso",
    installments: 1,
    validUntil: "",
  }));
  const [groupId, setGroupId] = useState("");
  // Turmas carregadas uma vez (sobrevivem à troca de opção); `null` enquanto não buscadas.
  const [groups, setGroups] = useState<GroupClass[] | null>(null);
  function guidedInput(): GuidedPatientInput | string {
    if (step === "demonstration") {
      if (!demonstration.startsAt)
        return "Informe a data e o horário da aula de demonstração.";
      return {
        next: "demonstration",
        patient: form,
        appointment: {
          serviceId: demonstration.serviceId,
          professionalId: demonstration.professionalId,
          roomId: demonstration.roomId,
          startsAt: new Date(demonstration.startsAt).toISOString(),
          notes: demonstration.notes,
        },
      };
    }
    if (
      (step === "plan" && !planForm.planTemplateId) ||
      (step === "single" && !singleForm.planTemplateId)
    )
      return "Selecione um plano cadastrado.";
    if (step === "plan")
      return {
        next: "plan",
        patient: form,
        plan: planForm,
        ...(groupId ? { groupId } : {}),
      };
    if (step === "single")
      return { next: "single", patient: form, plan: singleForm };
    return { next: "none", patient: form };
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (form.cpf && !isValidCpf(form.cpf)) {
      setError("Informe um CPF válido.");
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError("");
    if (patient) {
      setLoading(true);
      try {
        onSaved(await api.updatePatient(patient.id, form));
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        submitting.current = false;
        setLoading(false);
      }
      return;
    }
    const input = guidedInput();
    if (typeof input === "string") {
      setError(input);
      submitting.current = false;
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (input.next === "none") {
        onSaved(await api.createPatient(form));
        return;
      }
      const result = await api.createGuidedPatient(input);
      onSaved(result.patient, guidedNotice(result, groups ?? []));
    } catch (cause) {
      // Tudo ou nada: nada foi gravado, o formulário continua preenchido.
      setError((cause as Error).message);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }
  return (
    <Modal
      eyebrow={patient ? "Clientes" : "Cadastro rápido"}
      title={patient ? "Editar cliente" : "Novo cliente"}
      subtitle={
        patient
          ? `Atualize o cadastro ${patient.recordNumber}.`
          : "Cadastre as informações essenciais. O restante pode ser completado depois."
      }
      busy={loading}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Nome completo
          <input
            required
            value={form.fullName}
            onChange={(e) => field("fullName", e.target.value)}
            autoFocus
          />
        </label>
        <fieldset className="form-fieldset span-2">
          <legend>Contato</legend>
          <div className="form-fieldset-grid">
            <div className="field-with-hint">
              <label>
                Telefone
                <PhoneInput
                  required
                  value={form.phone}
                  onChange={(digits) => field("phone", digits)}
                />
              </label>
            </div>
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
            value={form.email}
            onChange={(e) => field("email", e.target.value)}
          />
        </label>
        <label>
          CPF
          <CpfInput
            value={form.cpf ?? ""}
            onChange={(digits) => field("cpf", digits)}
          />
        </label>
        <label>
          Data de nascimento
          <input
            type="date"
            value={form.birthDate}
            onChange={(e) => field("birthDate", e.target.value)}
          />
        </label>
        <PatientProfileFields form={form} onChange={field} />
        <fieldset className="form-fieldset emergency-fieldset span-2">
          <legend>Contato de emergência</legend>
          <div className="form-fieldset-grid">
            <label>
              Nome
              <input
                autoComplete="off"
                placeholder="Ex.: Maria Souza (mãe)"
                value={form.emergencyContactName}
                onChange={(e) => field("emergencyContactName", e.target.value)}
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
        <fieldset className="form-fieldset span-2">
          <legend>Etiquetas</legend>
          {configuredTags.error ? (
            <p className="form-error">{`Não foi possível carregar as etiquetas: ${configuredTags.error}`}</p>
          ) : configuredTags.tags === null ? (
            <LoadingBlock />
          ) : tagChoices.length === 0 ? (
            <p className="muted-copy">
              Nenhuma etiqueta configurada. Cadastre as etiquetas em
              Configurações › Etiquetas.
            </p>
          ) : (
            <div className="tag-filter-list">
              {tagChoices.map((tag) => (
                <TagChoice
                  key={tag.name}
                  name={tag.name}
                  color={tag.color}
                  pressed={form.tags.includes(tag.name)}
                  disabled={!editable}
                  onToggle={() => toggleTag(tag.name)}
                />
              ))}
            </div>
          )}
        </fieldset>
        <label className="span-2">
          Observações
          <textarea
            value={form.notes}
            onChange={(e) => field("notes", e.target.value)}
            rows={3}
          />
        </label>
        {guidedSteps.length > 0 && (
          <fieldset className="form-fieldset span-2">
            <legend>O que o cliente vai fazer?</legend>
            <div className="form-fieldset-grid">
              {[...guidedSteps, "none" as const].map((value) => (
                <label className="checkbox-field" key={value}>
                  <input
                    type="radio"
                    name="guided-next-step"
                    value={value}
                    checked={step === value}
                    onChange={() => setStep(value)}
                  />
                  {guidedStepLabels[value]}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {step === "demonstration" && (
          <fieldset className="form-fieldset span-2">
            <legend>Aula de demonstração</legend>
            <GuidedDemonstrationFields
              value={demonstration}
              setValue={setDemonstration}
            />
          </fieldset>
        )}
        {step === "plan" && (
          <fieldset className="form-fieldset span-2">
            <legend>Plano</legend>
            <GuidedPlanFields
              form={planForm}
              setForm={setPlanForm}
              onServiceChange={() => setGroupId("")}
              kindField={
                <label>
                  Modelo
                  <select
                    value={planForm.kind}
                    onChange={(e) => {
                      const kind = e.target.value as GuidedPlanForm["kind"];
                      setPlanForm({
                        ...planForm,
                        kind,
                        // Recorrente: uma cobrança por ciclo.
                        installments:
                          kind === "recurring" ? 1 : planForm.installments,
                        autoRenew:
                          kind === "recurring" && Boolean(planForm.validUntil),
                      });
                    }}
                  >
                    {guidedPlanKinds.map((kind) => (
                      <option value={kind} key={kind}>
                        {planKindLabels[kind]}
                      </option>
                    ))}
                  </select>
                </label>
              }
            >
              <GuidedGroupField
                serviceIds={planForm.services.map((entry) => entry.serviceId)}
                value={groupId}
                onChange={setGroupId}
                groups={groups}
                setGroups={setGroups}
              />
            </GuidedPlanFields>
          </fieldset>
        )}
        {step === "single" && (
          <fieldset className="form-fieldset span-2">
            <legend>Serviço avulso</legend>
            <GuidedPlanFields form={singleForm} setForm={setSingleForm} />
          </fieldset>
        )}
        {error && <div className="form-error span-2">{error}</div>}
        {!editable && (
          <p className="muted-copy span-2">
            Seu acesso a Clientes é só de consulta: as alterações não podem ser
            salvas.
          </p>
        )}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={loading}
          >
            {editable ? "Cancelar" : "Fechar"}
          </button>
          {editable && (
            <button className="primary-button" disabled={loading}>
              {loading
                ? "Salvando…"
                : patient
                  ? "Salvar alterações"
                  : guidedSubmitLabels[step]}
            </button>
          )}
        </div>
      </form>
      {showHistory && patient && (
        <PatientTimelineSection patientId={patient.id} />
      )}
    </Modal>
  );
}
