import {
  autoCampaignInputSchema,
  autoCampaignStepLabel,
  autoCampaignTriggerDescriptions,
  autoCampaignTriggerLabels,
  type AutoCampaign,
} from "@crm/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { api } from "../../../api";
import { Modal, ModalCancelButton } from "../../../shared/components/Modal";
import { useFormDirty } from "../../../shared/workflows/useDirtyGuard";
import { MessageBodyEditor } from "../campaigns/MessageBodyEditor";
import {
  autoCampaignDraft,
  autoCampaignEditorVariables,
  autoCampaignInput,
  autoCampaignTriggers,
  newStepKey,
  offsetUnit,
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
  const triggers = autoCampaignTriggers.filter(
    (trigger) =>
      trigger !== "overdue_payment" ||
      canSeeFinance ||
      campaign?.trigger === trigger,
  );
  const variables = autoCampaignEditorVariables[draft.trigger];

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
