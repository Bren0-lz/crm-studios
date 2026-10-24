import type {
  PatientOption,
  PatientTab,
  Product,
  PatientTabCloseInput,
  TabAppointmentOption,
  Professional,
  Room,
  Service,
} from "@crm/contracts";
import { patientFirstName } from "@crm/contracts";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { ActionModal } from "../../shared/components/ActionModal";
import { FixedPatient } from "../../shared/components/FixedPatient";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { useToast } from "../../shared/feedback/toast-context";
import { currency, localIsoDate, shortDate } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { AppointmentForm } from "../agenda/index";

type AddMode = "product" | "service" | "appointment";

const statusLabel: Record<PatientTab["status"], string> = {
  open: "Aberta",
  closed: "Fechada",
  cancelled: "Cancelada",
};

/**
 * Comanda em um modal só: sem `tab`, começa escolhendo o cliente e, ao abrir, segue no
 * mesmo modal para lançar produtos e atendimentos e fechar a cobrança.
 */
export function PatientTabModal({
  tab,
  products,
  fixedPatient,
  onOpened,
  onClose,
  onChanged,
}: {
  tab?: PatientTab | undefined;
  products: Product[];
  /** Ficha do cliente: a comanda nova já vem com o cliente definido. */
  fixedPatient?: PatientOption | undefined;
  onOpened?: (tab: PatientTab) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [created, setCreated] = useState<PatientTab | null>(null);
  const current = tab ?? created;
  return current ? (
    <TabEditor
      tab={current}
      products={products}
      onClose={onClose}
      onChanged={onChanged}
    />
  ) : (
    <TabOpening
      fixedPatient={fixedPatient}
      onClose={onClose}
      onOpened={async (opened) => {
        setCreated(opened);
        onOpened?.(opened);
        await onChanged();
      }}
    />
  );
}

function TabOpening({
  fixedPatient,
  onClose,
  onOpened,
}: {
  fixedPatient: PatientOption | undefined;
  onClose: () => void;
  onOpened: (tab: PatientTab) => Promise<void>;
}) {
  const toast = useToast();
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState(fixedPatient?.id ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = useFormDirty({ patientId, notes });
  useEffect(() => {
    if (fixedPatient) return;
    let alive = true;
    api
      .patientOptions()
      .then((items) => {
        if (alive) setPatients(items);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [fixedPatient]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const opened = await api.openPatientTab({ patientId, notes });
      toast.success(
        `Comanda de ${patientFirstName(opened.patientName)} aberta.`,
      );
      await onOpened(opened);
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Nova comanda"
      subtitle="Junte produtos e atendimentos do cliente e cobre tudo de uma vez no fechamento."
      busy={busy}
      dirty={dirty}
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={submit}>
        {error && <ErrorBanner error={error} />}
        {fixedPatient ? (
          <FixedPatient patient={fixedPatient} />
        ) : (
          <PatientPicker
            patients={patients}
            value={patientId}
            onChange={setPatientId}
            required
          />
        )}
        <label>
          Observações
          <textarea
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <div className="modal-actions">
          <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
          <button className="primary-button" disabled={busy || !patientId}>
            Abrir comanda
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TabEditor({
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
  const closeMissingId = useId();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [adding, setAdding] = useState<AddMode>("product"),
    [closing, setClosing] = useState(false),
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
  // O que falta para fechar: "Confirmar fechamento" fica desativado listando os campos.
  const closeMissing = closeInput.dueDate ? [] : ["Vencimento"];
  // Comanda reserva estoque: não deixa pedir mais do que o saldo (no ajuste, o que já está
  // reservado no item volta a contar como disponível).
  const stockOf = (id: string) =>
    products.find((item) => item.id === id)?.currentStock ?? 0;
  const editingItem = tab.items.find((item) => item.id === editing);
  const editStock = editingItem
    ? editingItem.quantity + stockOf(editingItem.productId)
    : 0;
  const productMissing = useMissingFields([
    ...(productId ? [] : ["Produto"]),
    ...(productId && quantity > stockOf(productId)
      ? [`quantidade dentro do estoque (${stockOf(productId)} disponível)`]
      : []),
  ]);
  const editMissing = useMissingFields(
    editingItem && quantity > editStock
      ? [`quantidade dentro do estoque (${editStock} disponível)`]
      : [],
  );
  const serviceMissing = useMissingFields(appointmentId ? [] : ["Atendimento"]);
  const editable = tab.status === "open" && can("patients.tabs_items");
  const services = tab.services ?? [];
  const hasLines = tab.items.length > 0 || services.length > 0;
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
      setClosing(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function startEditing(item: PatientTab["items"][number]) {
    setClosing(false);
    setEditing(item.id);
    setQuantity(item.quantity);
    setPrice(item.unitPriceInCents);
  }
  useEffect(() => {
    if (adding === "product") return;
    let alive = true;
    const load =
      adding === "service"
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
  }, [adding, tab.id, dates.from, dates.to]);
  return (
    <Modal
      title={`Comanda · ${tab.patientName}`}
      subtitle={`Aberta em ${shortDate.format(new Date(tab.openedAt))}`}
      busy={busy}
      onClose={onClose}
    >
      <fieldset disabled={busy} className="form-fields tab-sheet">
        <section className="tab-section" aria-label="Itens da comanda">
          <div className="tab-section-head">
            <h3>Itens</h3>
            <span
              className={`status-pill ${tab.status === "open" ? "scheduled" : tab.status === "closed" ? "completed" : "cancelled"}`}
            >
              {statusLabel[tab.status]}
            </span>
          </div>
          {tab.notes && <p className="tab-notes">{tab.notes}</p>}
          {hasLines ? (
            <ul className="patient-tab-items">
              {tab.items.map((item) => (
                <li key={item.id}>
                  <div className="patient-tab-item-main">
                    <strong>{item.productName}</strong>
                    <span>
                      Produto · {item.quantity} ×{" "}
                      {currency.format(item.unitPriceInCents / 100)}
                    </span>
                  </div>
                  <div className="patient-tab-item-side">
                    <span className="patient-tab-amount">
                      {currency.format(item.totalInCents / 100)}
                    </span>
                    {editable && (
                      <>
                        <button
                          type="button"
                          className="icon-button button-sm"
                          aria-label="Ajustar item"
                          title="Ajustar item"
                          onClick={() => startEditing(item)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button button-sm"
                          aria-label="Remover"
                          title="Remover"
                          onClick={() =>
                            void act(
                              () => api.removePatientTabItem(tab.id, item.id),
                              "Item removido; estoque restituído.",
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
              {services.map((item) => (
                <li key={item.id}>
                  <div className="patient-tab-item-main">
                    <strong>{item.serviceName}</strong>
                    <span>Atendimento · {item.professionalName}</span>
                  </div>
                  <div className="patient-tab-item-side">
                    <span className="patient-tab-amount">
                      {currency.format(item.amountInCents / 100)}
                    </span>
                    {editable && (
                      <button
                        type="button"
                        className="icon-button button-sm"
                        aria-label="Remover serviço"
                        title="Remover serviço"
                        onClick={() =>
                          void act(
                            () => api.removePatientTabService(tab.id, item.id),
                            "Serviço removido. O atendimento permanece na agenda.",
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tab-empty">
              {editable
                ? "Nenhum item ainda. Adicione produtos do estoque ou atendimentos da agenda abaixo."
                : "Nenhum item lançado."}
            </p>
          )}
          <p className="tab-total">
            Total <strong>{currency.format(tab.totalInCents / 100)}</strong>
          </p>
        </section>

        {editable && editingItem && (
          <section className="tab-section tab-box">
            <h3>Ajustar {editingItem.productName}</h3>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void act(
                  () =>
                    api.updatePatientTabItem(tab.id, editingItem.id, {
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
                  max={editStock}
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
              {editMissing.hint}
              <div className="tab-form-actions span-2">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditing(null)}
                >
                  Cancelar ajuste
                </button>
                <button
                  className="primary-button"
                  disabled={editMissing.blocked}
                  aria-describedby={editMissing.describedBy}
                >
                  Salvar item
                </button>
              </div>
            </form>
          </section>
        )}

        {editable && !editingItem && !closing && (
          <section className="tab-section tab-box">
            <div className="tab-section-head">
              <h3>Adicionar</h3>
              <div className="segmented" role="group" aria-label="Tipo de item">
                <button
                  type="button"
                  className="segment-button"
                  aria-pressed={adding === "product"}
                  onClick={() => setAdding("product")}
                >
                  Produto
                </button>
                <button
                  type="button"
                  className="segment-button"
                  aria-pressed={adding === "service"}
                  onClick={() => setAdding("service")}
                >
                  Atendimento agendado
                </button>
                {can("agenda.create") && (
                  <button
                    type="button"
                    className="segment-button"
                    aria-pressed={adding === "appointment"}
                    onClick={() => setAdding("appointment")}
                  >
                    Novo agendamento
                  </button>
                )}
              </div>
            </div>
            {adding === "product" && (
              <form
                className="form-grid tab-product-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(
                    () =>
                      api.addPatientTabItem(tab.id, { productId, quantity }),
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
                        <option
                          key={item.id}
                          value={item.id}
                          disabled={item.currentStock <= 0}
                        >
                          {item.name} ·{" "}
                          {item.currentStock > 0
                            ? `${item.currentStock} em estoque`
                            : "sem estoque"}
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
                    max={productId ? stockOf(productId) : undefined}
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(Number(event.target.value))
                    }
                  />
                </label>
                {productMissing.hint}
                <div className="tab-form-actions span-2">
                  <button
                    className="secondary-button"
                    disabled={productMissing.blocked}
                    aria-describedby={productMissing.describedBy}
                  >
                    <Plus size={18} /> Adicionar produto
                  </button>
                </div>
              </form>
            )}
            {adding === "service" && (
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
                <label className="span-2">
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
                <p className="field-hint span-2">
                  Atendimentos cobertos por plano vigente não podem ser cobrados
                  novamente.
                </p>
                {serviceMissing.hint}
                <div className="tab-form-actions span-2">
                  <button
                    className="secondary-button"
                    disabled={serviceMissing.blocked}
                    aria-describedby={serviceMissing.describedBy}
                  >
                    <Plus size={18} /> Vincular atendimento
                  </button>
                </div>
              </form>
            )}
            {adding === "appointment" && references && (
              <AppointmentForm
                {...references}
                patients={[]}
                fixedPatient={{
                  id: tab.patientId,
                  fullName: tab.patientName,
                  tags: [],
                }}
                onCancel={() => setAdding("product")}
                onBusyChange={setBusy}
                onSubmit={async (input, recurrence) => {
                  if (recurrence)
                    throw new Error(
                      "Agende um atendimento por item da comanda.",
                    );
                  await api.createPatientTabAppointment(tab.id, input);
                  await onChanged();
                  setAdding("product");
                  setNotice("Atendimento agendado e adicionado à comanda.");
                }}
              />
            )}
          </section>
        )}

        {closing && (
          <section className="tab-section tab-box">
            <h3>Fechamento</h3>
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
              <p className="field-hint span-2">
                {closeInput.settlement === "paid"
                  ? `Registra ${currency.format(tab.totalInCents / 100)} como recebido no Financeiro.`
                  : `Gera uma conta a receber de ${currency.format(tab.totalInCents / 100)} no Financeiro.`}
              </p>
              {closeMissing.length > 0 && (
                <p className="field-hint span-2" id={closeMissingId}>
                  Falta: {closeMissing.join(", ")}.
                </p>
              )}
            </form>
          </section>
        )}

        <div className="tab-bottom">
          {/* Avisos com altura reservada logo acima do rodapé: não deslocam os botões (QM5). */}
          <div className="tab-messages" aria-live="polite">
            {error && <ErrorBanner error={error} />}
            {notice && <p role="status">{notice}</p>}
          </div>
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
              {closing ? (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setClosing(false)}
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    form={closeFormId}
                    className="primary-button"
                    disabled={closeMissing.length > 0}
                    aria-describedby={
                      closeMissing.length > 0 ? closeMissingId : undefined
                    }
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
                    onClick={() => {
                      setEditing(null);
                      setClosing(true);
                    }}
                  >
                    Fechar comanda
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </fieldset>
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
            setClosing(false);
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
