import {
  patientFirstName,
  patientTagDisplayColor,
  planInstallmentSchedule,
  planPixChargeMessage,
  whatsappLink,
  withPlanFirstCharge,
} from "@crm/contracts";
import {
  isValidCpf,
  patientTagKey,
  type GroupClass,
  type GuidedPatientInput,
  type GuidedPatientNext,
  type Patient,
  type PatientInput,
  type PatientTag,
  withoutAutomaticPatientTags,
} from "@crm/contracts";
import { MessageCircle, Plus, Trash2 } from "lucide-react";
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { CpfInput } from "../../shared/components/CpfInput";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { TagChoice } from "../../shared/components/TagChoice";
import { tagColorLookup } from "../../shared/lib/formatting";
import { planKindLabels } from "../plans/index";
import { GuidedDemonstrationFields } from "./GuidedDemonstrationFields";
import { GuidedGroupField } from "./GuidedGroupField";
import { GuidedPlanFields } from "./GuidedPlanFields";
import {
  defaultGuidedDemonstration,
  defaultGuidedPlanEntry,
  defaultSingleForm,
  guidedNotice,
  guidedPlanKinds,
  guidedStepLabels,
  guidedStepOrder,
  guidedStepPermissions,
  guidedSubmitLabels,
  maxGuidedPlans,
  missingPlanFields,
} from "./model";
import { PatientTimelineSection } from "./PatientTimelineSection";
import { PatientProfileFields } from "./PatientProfileFields";
import type {
  GuidedPlanEntry,
  GuidedPlanForm,
  GuidedSingleEntry,
  GuidedSingleForm,
  PatientRegistrationResult,
} from "./types";

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
  /** `result` preserva os registros já criados para continuar sem repetir as operações. */
  onSaved: (
    patient: Patient,
    notice?: string,
    result?: PatientRegistrationResult,
  ) => void;
}) {
  const { can } = useAuthorization();
  const toast = useToast();
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
    // "Pagamento atrasado" é automática: não aparece para marcar nem desmarcar.
    tags: withoutAutomaticPatientTags(patient?.tags ?? []),
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
      color: patientTagDisplayColor(tag),
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
  // Planos do passo "Assinar um plano": o cliente pode assinar vários de uma vez.
  const nextPlanId = useRef(1);
  const [plans, setPlans] = useState<GuidedPlanEntry[]>(() => [
    defaultGuidedPlanEntry(0),
  ]);
  function updatePlan(id: number, patch: Partial<GuidedPlanEntry>) {
    setPlans((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  }
  function planFormSetter(
    id: number,
  ): Dispatch<SetStateAction<GuidedPlanForm>> {
    return (action) =>
      setPlans((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                form:
                  typeof action === "function" ? action(entry.form) : action,
              }
            : entry,
        ),
      );
  }
  // Serviços avulsos comprados junto com os planos (passo "Assinar um plano").
  const [singles, setSingles] = useState<GuidedSingleEntry[]>([]);
  function singleFormSetter(
    id: number,
  ): Dispatch<SetStateAction<GuidedSingleForm>> {
    return (action) =>
      setSingles((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                form:
                  typeof action === "function" ? action(entry.form) : action,
              }
            : entry,
        ),
      );
  }
  const [singleForm, setSingleForm] =
    useState<GuidedSingleForm>(defaultSingleForm);
  // Chave Pix da clínica para a cobrança do plano vendido no cadastro; `null` enquanto carrega.
  const sellsPlans = guidedSteps.some(
    (item) => item === "plan" || item === "single",
  );
  const [pixKey, setPixKey] = useState<string | null>(null);
  // Modelo da mensagem configurado pela clínica; vazio = texto padrão.
  const [pixTemplate, setPixTemplate] = useState("");
  useEffect(() => {
    if (!sellsPlans) return;
    let active = true;
    api
      .clinicBranding()
      .then((branding) => {
        if (!active) return;
        setPixKey(branding.pixKey ?? "");
        setPixTemplate(branding.pixMessageTemplate ?? "");
      })
      .catch(() => {
        if (active) setPixKey("");
      });
    return () => {
      active = false;
    };
  }, [sellsPlans]);
  // Cadastro salvo com plano no Pix: a cobrança fica à vista para enviar antes de fechar.
  const [pixCharge, setPixCharge] = useState<{
    patient: Patient;
    notice: string;
    result: PatientRegistrationResult;
    message: string;
  } | null>(null);
  // Turmas carregadas uma vez (sobrevivem à troca de opção); `null` enquanto não buscadas.
  const [groups, setGroups] = useState<GroupClass[] | null>(null);
  const dirty = useFormDirty({
    form,
    step,
    demonstration,
    plans,
    singles,
    singleForm,
  });
  // O que falta no cadastro e na etapa guiada escolhida: o botão fica desativado listando (QM14).
  const planLabel = (index: number) =>
    plans.length > 1 ? `Plano ${index + 1}` : "Plano";
  const singleLabel = (index: number) =>
    singles.length > 1 ? `Serviço avulso ${index + 1}` : "Serviço avulso";
  const missing = useMissingFields([
    ...(form.fullName.trim() ? [] : ["Nome completo"]),
    ...(form.cpf.trim() ? [] : ["CPF"]),
    ...(form.phone.trim() ? [] : ["Telefone"]),
    ...(step === "demonstration"
      ? [
          !demonstration.serviceId && "Serviço",
          !demonstration.professionalId && "Profissional",
          !demonstration.roomId && "Sala",
          !demonstration.startsAt && "Data e horário",
        ].filter((item): item is string => Boolean(item))
      : []),
    ...(step === "plan"
      ? plans.flatMap(({ form: plan }, index) =>
          missingPlanFields(plan).map((item) =>
            plans.length > 1 ? `${planLabel(index)}: ${item}` : item,
          ),
        )
      : []),
    ...(step === "plan"
      ? singles.flatMap(({ form: single }, index) =>
          missingPlanFields(single).map(
            (item) => `${singleLabel(index)}: ${item}`,
          ),
        )
      : []),
    ...(step === "single" ? missingPlanFields(singleForm) : []),
  ]);
  function guidedInput(): GuidedPatientInput | string {
    if (step === "demonstration") {
      if (!demonstration.startsAt)
        return "Informe a data e o horário da aula experimental.";
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
      (step === "plan" &&
        [...plans, ...singles].some((entry) => !entry.form.planTemplateId)) ||
      (step === "single" && !singleForm.planTemplateId)
    )
      return "Selecione um plano cadastrado.";
    if (step === "plan") {
      const groupIds = plans.map((entry) => entry.groupId).filter(Boolean);
      if (new Set(groupIds).size !== groupIds.length)
        return "A mesma turma foi escolhida em mais de um plano.";
      const [first, ...rest] = plans;
      return {
        next: "plan",
        patient: form,
        plan: withPlanFirstCharge(first!.form, slotsOf(first!.groupId)),
        ...(first!.groupId ? { groupId: first!.groupId } : {}),
        ...(rest.length || singles.length
          ? {
              additionalPlans: [
                ...rest.map((entry) => ({
                  plan: withPlanFirstCharge(entry.form, slotsOf(entry.groupId)),
                  ...(entry.groupId ? { groupId: entry.groupId } : {}),
                })),
                ...singles.map((entry) => ({
                  plan: { ...entry.form, kind: "single" as const },
                })),
              ],
            }
          : {}),
      };
    }
    if (step === "single")
      return { next: "single", patient: form, plan: singleForm };
    return { next: "none", patient: form };
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!isValidCpf(form.cpf)) {
      setError("Informe um CPF válido.");
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError("");
    if (patient) {
      setLoading(true);
      try {
        const saved = await api.updatePatient(patient.id, form);
        toast.success(
          `Cadastro de ${patientFirstName(saved.fullName)} atualizado.`,
        );
        onSaved(saved);
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
        const created = await api.createPatient(form);
        toast.success(
          `Cadastro de ${patientFirstName(created.fullName)} criado.`,
        );
        onSaved(created);
        return;
      }
      // O cadastro guiado já confirma num aviso detalhado na lista (savedNotice).
      const result = await api.createGuidedPatient(input);
      const notice = guidedNotice(result, groups ?? []);
      const registration = {
        ...result,
        group: groups?.find((group) => group.id === result.enrollment?.groupId),
      };
      // Vários planos no Pix: uma cobrança só, com os nomes e a soma dos valores.
      // A resposta vem na ordem do que foi enviado (principal e depois os adicionais).
      const sentPlans =
        input.next === "plan"
          ? [
              input.plan,
              ...(input.additionalPlans ?? []).map((entry) => entry.plan),
            ]
          : [input.plan];
      const createdPlans = [
        ...(result.plan ? [result.plan] : []),
        ...(result.additionalPlans ?? []).map((entry) => entry.plan),
      ];
      const pixPlans = createdPlans.filter(
        (plan) => plan.paymentMethod === "pix",
      );
      // 1º pagamento proporcional (turma) de cada item no Pix, somado.
      const pixFirstCharges = createdPlans.flatMap((plan, index) =>
        plan.paymentMethod === "pix"
          ? [
              {
                prorated:
                  sentPlans[index]?.firstInstallmentInCents !== undefined,
                amountInCents:
                  sentPlans[index]?.firstInstallmentInCents ??
                  planInstallmentSchedule(plan)[0]?.amountInCents ??
                  0,
              },
            ]
          : [],
      );
      if (pixPlans.length > 0 && pixKey) {
        const installments = pixPlans[0]!.installments;
        setPixCharge({
          patient: result.patient,
          notice,
          result: registration,
          message: planPixChargeMessage({
            patientName: result.patient.fullName,
            planName: pixPlans.map((plan) => plan.name).join(" + "),
            totalValueInCents: pixPlans.reduce(
              (sum, plan) => sum + plan.totalValueInCents,
              0,
            ),
            // Parcelas diferentes entre os planos: a mensagem cobra o total.
            installments: pixPlans.every(
              (plan) => plan.installments === installments,
            )
              ? installments
              : 1,
            totalSessions: pixPlans.reduce(
              (sum, plan) => sum + plan.totalSessions,
              0,
            ),
            pixKey,
            template: pixTemplate,
            firstChargeInCents: pixFirstCharges.some((item) => item.prorated)
              ? pixFirstCharges.reduce(
                  (sum, item) => sum + item.amountInCents,
                  0,
                )
              : undefined,
          }),
        });
        return;
      }
      onSaved(result.patient, notice, registration);
    } catch (cause) {
      // Tudo ou nada: nada foi gravado, o formulário continua preenchido.
      setError((cause as Error).message);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }
  if (pixCharge) {
    const finish = () =>
      onSaved(pixCharge.patient, pixCharge.notice, pixCharge.result);
    const phone = pixCharge.patient.whatsapp || pixCharge.patient.phone;
    return (
      <Modal
        eyebrow="Cadastro rápido"
        title="Enviar cobrança Pix"
        subtitle={`${pixCharge.notice} Envie a chave Pix para ${patientFirstName(pixCharge.patient.fullName)} pelo WhatsApp.`}
        onClose={finish}
      >
        <div className="form-grid">
          <label className="span-2">
            Mensagem
            <textarea readOnly rows={5} value={pixCharge.message} />
          </label>
          <div className="modal-actions span-2">
            <button type="button" className="secondary-button" onClick={finish}>
              Concluir
            </button>
            <a
              className="whatsapp-button"
              href={whatsappLink(phone, pixCharge.message)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} aria-hidden="true" />
              Enviar Pix pelo WhatsApp
            </a>
          </div>
        </div>
      </Modal>
    );
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
      dirty={dirty}
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
        <label className="span-2">
          Apelido
          <input
            maxLength={80}
            placeholder="Como o cliente prefere ser chamado"
            value={form.nickname ?? ""}
            onChange={(e) => field("nickname", e.target.value)}
          />
        </label>
        <label className="span-2">
          CPF
          <CpfInput
            required
            value={form.cpf}
            onChange={(digits) => field("cpf", digits)}
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
          Data de nascimento
          <input
            type="date"
            value={form.birthDate}
            onChange={(e) => field("birthDate", e.target.value)}
          />
        </label>
        {/* Cadastro rápido (U15): o essencial à vista; o restante fica recolhido. */}
        <details className="more-info span-2" open={Boolean(patient)}>
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
                    placeholder="Ex.: Maria Souza (mãe)"
                    value={form.emergencyContactName}
                    onChange={(e) =>
                      field("emergencyContactName", e.target.value)
                    }
                  />
                </label>
                <label>
                  Telefone
                  <PhoneInput
                    value={form.emergencyContactPhone ?? ""}
                    onChange={(digits) =>
                      field("emergencyContactPhone", digits)
                    }
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
                      color={patientTagDisplayColor(tag)}
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
          </div>
        </details>
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
            <legend>Aula experimental</legend>
            <GuidedDemonstrationFields
              value={demonstration}
              setValue={setDemonstration}
            />
          </fieldset>
        )}
        {step === "plan" &&
          plans.map((entry, index) => (
            <fieldset className="form-fieldset span-2" key={entry.id}>
              <legend>{planLabel(index)}</legend>
              <GuidedPlanFields
                form={entry.form}
                setForm={planFormSetter(entry.id)}
                onServiceChange={() => updatePlan(entry.id, { groupId: "" })}
                groupSlots={slotsOf(entry.groupId)}
                patientName={form.fullName}
                pixKey={pixKey}
                pixTemplate={pixTemplate}
                kindField={
                  <label>
                    Modelo
                    <select
                      value={entry.form.kind}
                      onChange={(e) => {
                        const kind = e.target.value as GuidedPlanForm["kind"];
                        updatePlan(entry.id, {
                          form: {
                            ...entry.form,
                            kind,
                            // Recorrente: uma cobrança por ciclo.
                            installments:
                              kind === "recurring"
                                ? 1
                                : entry.form.installments,
                            autoRenew:
                              kind === "recurring" &&
                              Boolean(entry.form.validUntil),
                          },
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
                  serviceIds={entry.form.services.map(
                    (service) => service.serviceId,
                  )}
                  value={entry.groupId}
                  onChange={(groupId) => updatePlan(entry.id, { groupId })}
                  groups={groups}
                  setGroups={setGroups}
                />
              </GuidedPlanFields>
              {plans.length > 1 && (
                <div className="guided-plan-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setPlans((current) =>
                        current.filter((item) => item.id !== entry.id),
                      )
                    }
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    {`Remover ${planLabel(index).toLowerCase()}`}
                  </button>
                </div>
              )}
            </fieldset>
          ))}
        {step === "plan" &&
          singles.map((entry, index) => (
            <fieldset className="form-fieldset span-2" key={entry.id}>
              <legend>{singleLabel(index)}</legend>
              <GuidedPlanFields
                form={entry.form}
                setForm={singleFormSetter(entry.id)}
                patientName={form.fullName}
                pixKey={pixKey}
                pixTemplate={pixTemplate}
              />
              <div className="guided-plan-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setSingles((current) =>
                      current.filter((item) => item.id !== entry.id),
                    )
                  }
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {`Remover ${singleLabel(index).toLowerCase()}`}
                </button>
              </div>
            </fieldset>
          ))}
        {step === "plan" && plans.length + singles.length < maxGuidedPlans && (
          <div className="page-actions span-2">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setPlans((current) => [
                  ...current,
                  defaultGuidedPlanEntry(nextPlanId.current++),
                ])
              }
            >
              <Plus size={16} aria-hidden="true" />
              Adicionar outro plano
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setSingles((current) => [
                  ...current,
                  { id: nextPlanId.current++, form: defaultSingleForm() },
                ])
              }
            >
              <Plus size={16} aria-hidden="true" />
              Adicionar serviço avulso
            </button>
          </div>
        )}
        {step === "single" && (
          <fieldset className="form-fieldset span-2">
            <legend>Serviço avulso</legend>
            <GuidedPlanFields
              form={singleForm}
              setForm={setSingleForm}
              patientName={form.fullName}
              pixKey={pixKey}
              pixTemplate={pixTemplate}
            />
          </fieldset>
        )}
        {error && <div className="form-error span-2">{error}</div>}
        {!editable && (
          <p className="muted-copy span-2">
            Seu acesso a Clientes é só de consulta: as alterações não podem ser
            salvas.
          </p>
        )}
        {editable && missing.hint}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={loading}>
            {editable ? "Cancelar" : "Fechar"}
          </ModalCancelButton>
          {editable && (
            <button
              className="primary-button"
              disabled={loading || missing.blocked}
              aria-describedby={missing.describedBy}
            >
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
