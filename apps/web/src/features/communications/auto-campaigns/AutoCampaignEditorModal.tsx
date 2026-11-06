import {
  appointmentLocationVariables,
  fillAutoCampaignMessage,
  autoCampaignCooldownUnitLabels,
  autoCampaignInputSchema,
  autoCampaignStepLabel,
  autoCampaignTriggerDescriptions,
  autoCampaignTriggerLabels,
  type AutoCampaign,
  type PlanTemplate,
} from "@crm/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../../../api";
import { Modal, ModalCancelButton } from "../../../shared/components/Modal";
import { MoneyInput } from "../../../shared/components/MoneyInput";
import { useFormDirty } from "../../../shared/workflows/useDirtyGuard";
import { WhatsappBubble } from "../campaigns/WhatsappBubble";
import { MessageBodyEditor } from "../campaigns/MessageBodyEditor";
import { DiscountScopeFields } from "./DiscountScopeFields";
import {
  autoCampaignDraft,
  autoCampaignEditorVariables,
  autoCampaignInput,
  autoCampaignTriggers,
  discountScopeError,
  cooldownUnits,
  newStepKey,
  offsetUnit,
  promotionAllowsFixedDate,
  promotionValidityHint,
  type AutoCampaignDraft,
  type StepDraft,
} from "./model";

/** Cria ou edita uma campanha automática: evento + uma mensagem por momento. */
export function AutoCampaignEditorModal({
  campaign,
  canSeeFinance,
  onClose,
  onSaved,
}: {
  campaign?: AutoCampaign | undefined;
  canSeeFinance: boolean;
  onClose: () => void;
  onSaved: (campaign: AutoCampaign) => void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState<AutoCampaignDraft>(() =>
    autoCampaignDraft(campaign),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = useFormDirty(draft);
  const plans = usePlanTemplates(
    draft.promotional &&
      draft.discount &&
      draft.discountOnPlans &&
      draft.planScope === "selected",
  );
  const triggers = autoCampaignTriggers.filter(
    (trigger) =>
      trigger !== "overdue_payment" ||
      canSeeFinance ||
      campaign?.trigger === trigger,
  );
  const variables = autoCampaignEditorVariables[draft.trigger];
  const location = useAppointmentLocation(
    draft.trigger === "appointment_upcoming",
  );
  const fixedDateAllowed = promotionAllowsFixedDate(draft.trigger);
  const validityMode = fixedDateAllowed ? draft.validityMode : "days";
  const offsets = draft.steps
    .filter((step) => step.offset !== "")
    .map((step) => Number(step.offset));

  function updateStep(key: string, change: Partial<StepDraft>) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.key === key ? { ...step, ...change } : step,
      ),
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const scopeError = discountScopeError(draft);
    if (scopeError) {
      setError(scopeError);
      return;
    }
    const parsed = autoCampaignInputSchema.safeParse(autoCampaignInput(draft));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revise os campos.");
      return;
    }
    setSaving(true);
    try {
      const input = autoCampaignInput(draft);
      onSaved(
        campaign
          ? await api.updateAutoCampaign(campaign.id, input)
          : await api.createAutoCampaign(input),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a campanha.",
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      wide
      eyebrow="Campanhas automáticas"
      title={
        campaign ? "Editar campanha automática" : "Nova campanha automática"
      }
      subtitle="Escolha o evento e escreva uma mensagem para cada momento. Quem se encaixar aparece sozinho na lista do dia."
      busy={saving}
      dirty={dirty}
      initialFocus="input[name='auto-campaign-name']"
      onClose={onClose}
    >
      <form id={formId} className="form-grid" onSubmit={submit}>
        <label>
          Nome da campanha
          <input
            name="auto-campaign-name"
            required
            maxLength={80}
            value={draft.name}
            placeholder="Ex.: Aniversariantes"
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
        </label>
        <label>
          Evento
          <select
            value={draft.trigger}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                trigger: event.target.value as AutoCampaignDraft["trigger"],
              }))
            }
          >
            {triggers.map((trigger) => (
              <option key={trigger} value={trigger}>
                {autoCampaignTriggerLabels[trigger]}
              </option>
            ))}
          </select>
          <span className="field-hint">
            {autoCampaignTriggerDescriptions[draft.trigger]}
          </span>
        </label>
        <label className="checkbox-field span-2">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                active: event.target.checked,
              }))
            }
          />
          Campanha ativa (aparece na lista do dia e nas notificações)
        </label>
        <label className="checkbox-field span-2">
          <input
            type="checkbox"
            checked={draft.promotional}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                promotional: event.target.checked,
              }))
            }
          />
          Campanha promocional (ao agendar, dá para marcar que o atendimento é
          desta campanha)
        </label>
        {draft.promotional && (
          <>
            {fixedDateAllowed && (
              <fieldset className="form-fieldset span-2">
                <legend>Validade da promoção</legend>
                <div className="form-fieldset-grid">
                  <label className="checkbox-field">
                    <input
                      type="radio"
                      name={`${formId}-validity`}
                      checked={validityMode === "days"}
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          validityMode: "days",
                        }))
                      }
                    />
                    Dias após o evento
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="radio"
                      name={`${formId}-validity`}
                      checked={validityMode === "date"}
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          validityMode: "date",
                        }))
                      }
                    />
                    Até uma data
                  </label>
                </div>
              </fieldset>
            )}
            {validityMode === "date" ? (
              <label className="span-2">
                Promoção válida até
                <input
                  type="date"
                  required
                  value={draft.validUntil}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      validUntil: event.target.value,
                    }))
                  }
                />
                <span className="field-hint">
                  Vale para todos que receberem a mensagem, até essa data.
                </span>
              </label>
            ) : (
              <label className="span-2">
                {draft.trigger === "birthday"
                  ? "Validade da promoção (dias após o aniversário)"
                  : "Validade da promoção (dias após o evento)"}
                <input
                  type="number"
                  min={1}
                  max={365}
                  required
                  value={draft.validDays}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      validDays: event.target.value,
                    }))
                  }
                />
                {Number(draft.validDays) > 0 && (
                  <span className="field-hint">
                    {promotionValidityHint(
                      draft.trigger,
                      offsets,
                      Number(draft.validDays),
                    )}
                  </span>
                )}
              </label>
            )}
            <label className="checkbox-field span-2">
              <input
                type="checkbox"
                checked={draft.discount}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    discount: event.target.checked,
                  }))
                }
              />
              Dar desconto nesta campanha
            </label>
            {draft.discount && (
              <>
                <fieldset className="form-fieldset span-2">
                  <legend>Tipo de desconto</legend>
                  <div className="form-fieldset-grid">
                    <label className="checkbox-field">
                      <input
                        type="radio"
                        name={`${formId}-discount-type`}
                        checked={draft.discountType === "percentage"}
                        onChange={() =>
                          setDraft((current) => ({
                            ...current,
                            discountType: "percentage",
                          }))
                        }
                      />
                      Porcentagem (%)
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="radio"
                        name={`${formId}-discount-type`}
                        checked={draft.discountType === "amount"}
                        onChange={() =>
                          setDraft((current) => ({
                            ...current,
                            discountType: "amount",
                          }))
                        }
                      />
                      Valor (R$)
                    </label>
                  </div>
                </fieldset>
                {draft.discountType === "percentage" ? (
                  <label className="span-2">
                    Porcentagem de desconto (%)
                    <input
                      inputMode="decimal"
                      autoComplete="off"
                      required
                      placeholder="Ex.: 10"
                      value={draft.discountPercent}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          discountPercent: event.target.value.replace(
                            /[^\d.,]/g,
                            "",
                          ),
                        }))
                      }
                    />
                  </label>
                ) : (
                  <label className="span-2">
                    Valor do desconto (R$)
                    <MoneyInput
                      valueInCents={draft.discountAmountInCents}
                      onChange={(discountAmountInCents) =>
                        setDraft((current) => ({
                          ...current,
                          discountAmountInCents,
                        }))
                      }
                    />
                  </label>
                )}
                <DiscountScopeFields
                  formId={formId}
                  draft={draft}
                  setDraft={setDraft}
                  plans={plans}
                />
              </>
            )}
            <label className="checkbox-field span-2">
              <input
                type="checkbox"
                checked={draft.cooldown}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    cooldown: event.target.checked,
                  }))
                }
              />
              Depois de usar a promoção, deixar o cliente fora desta campanha
              por um tempo (ele continua nas outras)
            </label>
            {draft.cooldown && (
              <>
                <label>
                  Tempo fora da campanha
                  <input
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={draft.cooldownAmount}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        cooldownAmount: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Unidade
                  <select
                    value={draft.cooldownUnit}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        cooldownUnit: event.target
                          .value as AutoCampaignDraft["cooldownUnit"],
                      }))
                    }
                  >
                    {cooldownUnits.map((unit) => (
                      <option key={unit} value={unit}>
                        {autoCampaignCooldownUnitLabels[unit].plural}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </>
        )}
        <div className="span-2 auto-campaign-steps">
          <span className="filter-label">Mensagens</span>
          <p className="field-hint">
            Use os botões verdes para inserir os dados do cliente e do evento.
          </p>
          <ol className="auto-campaign-step-list">
            {draft.steps.map((step, index) => (
              <li key={step.key} className="auto-campaign-step">
                <div className="auto-campaign-step-head">
                  <label>
                    Quando
                    <span className="auto-campaign-offset">
                      <input
                        type="number"
                        min={0}
                        max={365}
                        required
                        aria-label={`Momento da mensagem ${index + 1}`}
                        value={step.offset}
                        onChange={(event) =>
                          updateStep(step.key, { offset: event.target.value })
                        }
                      />
                      <span>{offsetUnit(draft.trigger)}</span>
                    </span>
                  </label>
                  <span className="panel-context">
                    {step.offset !== "" &&
                      autoCampaignStepLabel(draft.trigger, Number(step.offset))}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remover mensagem ${index + 1}`}
                    disabled={draft.steps.length === 1}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        steps: current.steps.filter(
                          (item) => item.key !== step.key,
                        ),
                      }))
                    }
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
                <div className="field-with-hint">
                  <span id={`${formId}-message-${step.key}`}>
                    Mensagem {index + 1}
                  </span>
                  {/* Trocar o evento troca os códigos: o editor é recriado. */}
                  <MessageBodyEditor
                    key={`${step.key}-${draft.trigger}`}
                    labelId={`${formId}-message-${step.key}`}
                    value={step.message}
                    maxLength={1000}
                    placeholder="Olá, {{nome}}! …"
                    variables={variables}
                    toolbarLabel={`Inserir dados na mensagem ${index + 1}`}
                    disabled={saving}
                    onChange={(message) => updateStep(step.key, { message })}
                  />
                  {draft.trigger === "appointment_upcoming" && (
                    <>
                      {location.error && (
                        <p className="form-error" role="alert">
                          {location.error}
                        </p>
                      )}
                      {location.missing && (
                        <p className="field-hint" role="note">
                          Cadastre o endereço da unidade em Configurações
                        </p>
                      )}
                      <p className="field-hint">
                        Prévia ilustrativa. O endereço enviado será o da filial
                        do atendimento.
                      </p>
                      <WhatsappBubble
                        images={[]}
                        contactName="Maria Souza"
                        text={fillAutoCampaignMessage(
                          step.message,
                          "Maria Souza",
                          {
                            data: "23/10",
                            hora: "09:00",
                            servico: "Pilates",
                            ...location.vars,
                          },
                        )}
                      />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="secondary-button"
            disabled={draft.steps.length >= 10}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                steps: [
                  ...current.steps,
                  { key: newStepKey(), offset: "", message: "" },
                ],
              }))
            }
          >
            <Plus size={16} aria-hidden="true" />
            Adicionar mensagem
          </button>
        </div>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
        <button
          className="primary-button"
          type="submit"
          form={formId}
          disabled={saving}
        >
          {saving ? "Salvando…" : "Salvar campanha"}
        </button>
      </div>
    </Modal>
  );
}

/** Modelos de plano para escolher onde o desconto da promoção vale (só ao ligar o desconto). */
function usePlanTemplates(enabled: boolean) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; items: PlanTemplate[] }
  >({ status: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api
      .planTemplates()
      .then(
        (items) =>
          active &&
          setState({
            status: "ready",
            items: Array.isArray(items) ? items : [],
          }),
      )
      .catch(() => active && setState({ status: "error" }));
    return () => {
      active = false;
    };
  }, [enabled]);
  return state;
}

function useAppointmentLocation(enabled: boolean) {
  const [state, setState] = useState({
    missing: false,
    error: "",
    vars: appointmentLocationVariables(),
  });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api
      .branches()
      .then((branches) => {
        if (!active) return;
        const locations = branches.map(appointmentLocationVariables);
        setState({
          missing:
            locations.length === 0 || locations.some((item) => !item.endereco),
          error: "",
          vars:
            locations.find((item) => item.endereco) ??
            appointmentLocationVariables(),
        });
      })
      .catch(
        () =>
          active &&
          setState({
            missing: false,
            error:
              "Não foi possível verificar os endereços das unidades. Tente reabrir o editor.",
            vars: appointmentLocationVariables(),
          }),
      );
    return () => {
      active = false;
    };
  }, [enabled]);
  return state;
}
