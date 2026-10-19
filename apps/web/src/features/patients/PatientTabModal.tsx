import type {
  PatientTab,
  Product,
  PatientTabCloseInput,
  TabAppointmentOption,
  Professional,
  Room,
  Service,
} from "@crm/contracts";
import { useEffect, useId, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { Modal } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { currency, localIsoDate, shortDate } from "../../shared/lib/formatting";
import { AppointmentForm } from "../agenda/index";

export function PatientTabModal({
  tab,
  products,
  onClose,
  onChanged,
}: {
  tab: PatientTab;
  products: Product[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { can } = useAuthorization();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [productId, setProductId] = useState(""),
    [quantity, setQuantity] = useState(1),
    [editing, setEditing] = useState<string | null>(null),
    [price, setPrice] = useState(0);
  const closeFormId = useId();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [mode, setMode] = useState<
      "items" | "services" | "appointment" | "close"
    >("items"),
    [options, setOptions] = useState<TabAppointmentOption[]>([]),
    [appointmentId, setAppointmentId] = useState("");
  const [dates, setDates] = useState(() => ({
    from: localIsoDate(),
    to: localIsoDate(new Date(Date.now() + 90 * 86400000)),
  }));
  const [references, setReferences] = useState<{
    professionals: Professional[];
    rooms: Room[];
    services: Service[];
  } | null>(null);
  const [closeInput, setCloseInput] = useState<PatientTabCloseInput>({
    settlement: "receivable",
    dueDate: localIsoDate(),
    paymentMethod: "pix",
  });
  const editable = tab.status === "open" && can("patients.tabs_items");
  async function act(action: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await onChanged();
      setNotice(message);
      setEditing(null);
      setMode("items");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (mode !== "services" && mode !== "appointment") return;
    let alive = true;
    const load =
      mode === "services"
        ? api
            .tabAppointmentOptions(
              tab.id,
              `${dates.from}T00:00:00.000Z`,
              `${dates.to}T23:59:59.999Z`,
            )
            .then((data) => {
              if (alive) setOptions(data);
            })
        : Promise.all([api.professionals(), api.rooms(), api.services()]).then(
            ([professionals, rooms, services]) => {
              if (alive) setReferences({ professionals, rooms, services });
            },
          );
    load.catch((cause: Error) => {
      if (alive) setError(cause.message);
    });
    return () => {
      alive = false;
    };
  }, [mode, tab.id, dates.from, dates.to]);
  return (
    <Modal
      title={`Comanda · ${tab.patientName}`}
      subtitle={`${tab.status === "open" ? "Aberta" : tab.status === "closed" ? "Fechada" : "Cancelada"} · Total ${currency.format(tab.totalInCents / 100)}`}
      busy={busy}
      onClose={onClose}
    >
      {/* Área de avisos sempre presente, com altura reservada: avisos não deslocam os botões (QM5). */}
      <div className="tab-messages" aria-live="polite">
        {error && <ErrorBanner error={error} />}
        {notice && <p role="status">{notice}</p>}
      </div>
      <div className="clinical-form">
        <fieldset disabled={busy} className="form-fields">
          <h3>Produtos</h3>
          {tab.items.map((item) => (
            <div className="table-row" key={item.id}>
              <strong>{item.productName}</strong>
              <span>
                {item.quantity} × {currency.format(item.unitPriceInCents / 100)}
              </span>
              <span className="numeric-value">
                {currency.format(item.totalInCents / 100)}
              </span>
              {editable && (
                <>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setEditing(item.id);
                      setQuantity(item.quantity);
                      setPrice(item.unitPriceInCents);
                    }}
                  >
                    Ajustar item
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      void act(
                        () => api.removePatientTabItem(tab.id, item.id),
                        "Item removido; estoque restituído.",
                      )
                    }
                  >
                    Remover
                  </button>
                </>
              )}
            </div>
          ))}
          {editing && (
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void act(
                  () =>
                    api.updatePatientTabItem(tab.id, editing, {
                      quantity,
                      unitPriceInCents: price,
                    }),
                  "Item atualizado.",
                );
              }}
            >
              <label>
                Quantidade
                <input
                  type="number"
                  min={1}
                  max={10000}
                  required
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
              </label>
              <CurrencyField
                label="Preço unitário"
                value={price}
                onChange={setPrice}
              />
              <button className="primary-button">Salvar item</button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditing(null)}
              >
                Cancelar ajuste
              </button>
            </form>
          )}
          <h3>Serviços</h3>
          {tab.services?.map((item) => (
            <div className="table-row" key={item.id}>
              <strong>{item.serviceName}</strong>
              <span>{item.professionalName}</span>
              <span className="numeric-value">
                {currency.format(item.amountInCents / 100)}
              </span>
              {editable && (
                <button
                  className="secondary-button"
                  onClick={() =>
                    void act(
                      () => api.removePatientTabService(tab.id, item.id),
                      "Serviço removido. O atendimento permanece na agenda.",
                    )
                  }
                >
                  Remover serviço
                </button>
              )}
            </div>
          ))}
          {editable && !editing && (
            <div className="page-actions">
              <button
                className="secondary-button"
                onClick={() => setMode("items")}
              >
                Adicionar produto
              </button>
              <button
                className="secondary-button"
                onClick={() => setMode("services")}
              >
                Vincular atendimento
              </button>
              {can("agenda.create") && (
                <button
                  className="secondary-button"
                  onClick={() => setMode("appointment")}
                >
                  Agendar serviço avulso
                </button>
              )}
            </div>
          )}
          {editable && mode === "items" && !editing && (
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void act(
                  () => api.addPatientTabItem(tab.id, { productId, quantity }),
                  "Produto reservado na comanda.",
                );
              }}
            >
              <label>
                Produto
                <select
                  required
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {products
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.currentStock} em estoque
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Quantidade
                <input
                  type="number"
                  required
                  min={1}
                  max={10000}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
              </label>
              <button className="primary-button">Adicionar produto</button>
            </form>
          )}
          {editable && mode === "services" && (
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void act(
                  () => api.addPatientTabService(tab.id, { appointmentId }),
                  "Serviço adicionado à comanda.",
                );
              }}
            >
              <label>
                De
                <input
                  type="date"
                  value={dates.from}
                  onChange={(event) =>
                    setDates({ ...dates, from: event.target.value })
                  }
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  min={dates.from}
                  value={dates.to}
                  onChange={(event) =>
                    setDates({ ...dates, to: event.target.value })
                  }
                />
              </label>
              <label>
                Atendimento
                <select
                  required
                  value={appointmentId}
                  onChange={(event) => setAppointmentId(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {options.map((item) => (
                    <option key={item.id} value={item.id}>
                      {shortDate.format(new Date(item.startsAt))} ·{" "}
                      {item.serviceName} · {item.professionalName}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">
                Serviços cobertos por plano vigente não podem ser cobrados
                novamente.
              </p>
              <button className="primary-button">Vincular atendimento</button>
            </form>
          )}
          {mode === "appointment" && references && (
            <AppointmentForm
              {...references}
              patients={[]}
              fixedPatient={{
                id: tab.patientId,
                fullName: tab.patientName,
                tags: [],
              }}
              onCancel={() => setMode("items")}
              onBusyChange={setBusy}
              onSubmit={async (input, recurrence) => {
                if (recurrence)
                  throw new Error("Agende um atendimento por item da comanda.");
                await api.createPatientTabAppointment(tab.id, input);
                await onChanged();
                setMode("items");
                setNotice("Atendimento agendado e adicionado à comanda.");
              }}
            />
          )}
          {mode === "close" && (
            <form
              id={closeFormId}
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void act(
                  () => api.closePatientTab(tab.id, closeInput),
                  "Comanda fechada com cobrança consolidada.",
                );
              }}
            >
              <label>
                Cobrança
                <select
                  value={closeInput.settlement}
                  onChange={(event) =>
                    setCloseInput({
                      ...closeInput,
                      settlement: event.target
                        .value as PatientTabCloseInput["settlement"],
                    })
                  }
                >
                  <option value="receivable">Conta a receber</option>
                  <option value="paid">Pagamento recebido</option>
                </select>
              </label>
              <label>
                Vencimento
                <input
                  type="date"
                  required
                  value={closeInput.dueDate}
                  onChange={(event) =>
                    setCloseInput({
                      ...closeInput,
                      dueDate: event.target.value,
                    })
                  }
                />
              </label>
              {closeInput.settlement === "paid" && (
                <label>
                  Forma de pagamento
                  <select
                    value={closeInput.paymentMethod}
                    onChange={(event) =>
                      setCloseInput({
                        ...closeInput,
                        paymentMethod: event.target
                          .value as PatientTabCloseInput["paymentMethod"],
                      })
                    }
                  >
                    <option value="pix">Pix</option>
                    <option value="card">Cartão</option>
                    <option value="cash">Dinheiro</option>
                    <option value="bank_transfer">Transferência</option>
                    <option value="boleto">Boleto</option>
                    <option value="other">Outro</option>
                  </select>
                </label>
              )}
            </form>
          )}
          {/* Rodapé fixo: destrutivo à esquerda, ação principal sempre por último à direita (QM5). */}
          <div className="modal-actions tab-footer">
            <div className="tab-footer-danger">
              {tab.status !== "cancelled" && can("patients.tabs_cancel") && (
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => setConfirmingCancel(true)}
                >
                  Cancelar comanda
                </button>
              )}
            </div>
            <div className="tab-footer-main">
              {mode === "close" ? (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setMode("items")}
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    form={closeFormId}
                    className="primary-button"
                  >
                    Confirmar fechamento
                  </button>
                </>
              ) : (
                tab.status === "open" &&
                can("patients.tabs_close") && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setMode("close")}
                  >
                    Fechar comanda
                  </button>
                )
              )}
            </div>
          </div>
        </fieldset>
      </div>
      {confirmingCancel && (
        <ActionModal
          eyebrow="Comanda"
          title="Cancelar comanda"
          subtitle={`${tab.patientName} · Total ${currency.format(tab.totalInCents / 100)}`}
          effect="Cancelar esta comanda restitui os produtos reservados. Uma cobrança paga exige estorno prévio no Financeiro."
          confirmLabel="Cancelar comanda"
          danger
          onClose={() => setConfirmingCancel(false)}
          onConfirm={async () => {
            setError("");
            setNotice("");
            await api.cancelPatientTab(tab.id);
            setConfirmingCancel(false);
            setEditing(null);
            setMode("items");
            try {
              await onChanged();
              setNotice("Comanda cancelada; estoque restituído.");
            } catch (cause) {
              setError((cause as Error).message);
            }
          }}
        />
      )}
    </Modal>
  );
}
