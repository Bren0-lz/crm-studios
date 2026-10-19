import type { Receivable, Payable, FinancialDatesInput } from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import {
  localIsoDate,
  toLocalDateTimeInput,
} from "../../shared/lib/formatting";
import { HelpTip } from "../../shared/components/HelpTip";
import { financeTermHelp } from "./model";
export function FinancialDatesModal({
  kind,
  entry,
  onClose,
  onSaved,
}: {
  kind: "receivable" | "payable";
  entry: Receivable | Payable;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [postedOn, setPostedOn] = useState(
      entry.postedOn ?? localIsoDate(new Date(entry.createdAt)),
    ),
    [dueDate, setDueDate] = useState(entry.dueDate),
    [paidAt, setPaidAt] = useState(
      entry.paidAt ? toLocalDateTimeInput(new Date(entry.paidAt)) : "",
    ),
    [availableAt, setAvailableAt] = useState(
      entry.cashAvailableAt
        ? toLocalDateTimeInput(new Date(entry.cashAvailableAt))
        : "",
    ),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty = useFormDirty({
    postedOn,
    dueDate,
    paidAt,
    availableAt,
    reason,
  });
  return (
    <Modal
      title="Datas financeiras"
      subtitle={entry.description}
      initialFocus="input"
      busy={busy}
      dirty={dirty}
      onClose={onClose}
    >
      <form
        className="clinical-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const input: FinancialDatesInput = {
              postedOn,
              dueDate,
              reason,
              ...(paidAt ? { paidAt: new Date(paidAt).toISOString() } : {}),
              ...(availableAt
                ? { availableAt: new Date(availableAt).toISOString() }
                : {}),
            };
            await api.setFinancialDates(kind, entry.id, input);
            await onSaved();
            onClose();
          } catch (cause) {
            setError((cause as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <ErrorBanner error={error} />}
        <fieldset disabled={busy} className="form-fields form-grid">
          <label>
            <span className="label-with-help">
              Lançamento
              <HelpTip term="Lançamento" text={financeTermHelp.posted} />
            </span>
            <input
              required
              type="date"
              value={postedOn}
              onChange={(event) => setPostedOn(event.target.value)}
            />
          </label>
          <label>
            Vencimento
            <input
              required
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          {entry.status === "paid" && (
            <label>
              Pagamento
              <input
                type="datetime-local"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </label>
          )}
          <label>
            <span className="label-with-help">
              Disponibilidade no caixa
              <HelpTip
                term="Disponibilidade no caixa"
                text={financeTermHelp.cashAvailable}
              />
            </span>
            <input
              type="datetime-local"
              value={availableAt}
              onChange={(event) => setAvailableAt(event.target.value)}
            />
          </label>
          <label>
            Motivo do ajuste
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <p className="muted-copy">
            A competência é editada na classificação. O ajuste de datas preserva
            os eventos financeiros originais.
          </p>
        </fieldset>
        <div className="modal-actions">
          <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
          <button className="primary-button" disabled={busy}>
            Salvar datas
          </button>
        </div>
      </form>
    </Modal>
  );
}
