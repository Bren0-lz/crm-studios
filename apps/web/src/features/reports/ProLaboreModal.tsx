import {
  proLaboreBaseLabels,
  proLaboreSettingsInputSchema,
  type ProLaboreSettings,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";

/** Percentual de pró-labore do relatório financeiro (só o admin). */
export function ProLaboreModal({
  settings,
  onSaved,
  onClose,
}: {
  settings: ProLaboreSettings;
  onSaved: (settings: ProLaboreSettings) => void;
  onClose: () => void;
}) {
  const [percentage, setPercentage] = useState(
    String(settings.percentage).replace(".", ","),
  );
  const [base, setBase] = useState(settings.base);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const value = Number(percentage.replace(",", "."));
  const dirty =
    value !== settings.percentage || base !== settings.base || !percentage;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = proLaboreSettingsInputSchema.safeParse({
      percentage: percentage.trim() === "" ? Number.NaN : value,
      base,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.code === "invalid_type"
          ? "Informe o percentual do pró-labore."
          : (parsed.error.issues[0]?.message ?? "Percentual inválido."),
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      onSaved(await api.updateProLabore(parsed.data));
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      eyebrow="Relatórios"
      title="Configurar pró-labore"
      subtitle="Parte do resultado que o sócio retira para si. O restante aparece como lucro que fica no caixa da empresa."
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <fieldset className="form-fieldset span-2" disabled={saving}>
          <legend>Retirada do sócio</legend>
          <label>
            Percentual (%)
            <input
              autoFocus
              required
              inputMode="decimal"
              placeholder="Ex.: 30"
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
            />
          </label>
          <label>
            Calcular sobre
            <select
              value={base}
              onChange={(event) =>
                setBase(event.target.value as ProLaboreSettings["base"])
              }
            >
              {Object.entries(proLaboreBaseLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label.charAt(0).toUpperCase() + label.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <p className="muted-copy span-2">
            Sobre o lucro, nada é retirado em meses com prejuízo. Sobre as
            entradas, o valor acompanha o faturamento recebido no período.
          </p>
        </fieldset>
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
          <button className="primary-button" disabled={saving}>
            {saving ? "Salvando…" : "Salvar pró-labore"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
