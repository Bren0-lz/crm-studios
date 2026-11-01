import {
  cnpjDigits,
  cpfDigits,
  formatCnpj,
  formatCpf,
  isValidCnpj,
  isValidCpf,
  type PaymentMethod,
  type Supplier,
  type SupplierBillingCycle,
  type SupplierInput,
  type SupplierTemplateSource,
} from "@crm/contracts";
import { MessageCircle, Plus } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { currency } from "../../shared/lib/formatting";
import {
  issueDocumentForSignature,
  SignatureSendStep,
  SignatureTemplateField,
  SupplierDocuments,
  useCanRequestSignature,
  useSignatureTemplates,
  type SignatureRequest,
} from "../contracts/index";
import { paymentMethodOptions } from "./model";
import { SupplierDocumentCheck } from "./SupplierDocumentCheck";
import {
  SupplierOrderFields,
  SupplierOrderProductModal,
} from "./SupplierOrderForm";
import { SupplierOrderHistory } from "./SupplierOrdersModal";
import { useSupplierOrderDraft } from "./supplier-order-draft";
import { supplierOrdersSummary, useSupplierOrders } from "./supplier-orders";

const emptySupplier: SupplierInput = {
  name: "",
  kind: "company",
  document: "",
  phone: "",
  whatsapp: "",
  email: "",
  billingCycle: "one_time",
  installments: 1,
  paymentTerms: "",
  orders: "",
  contracts: "",
  notes: "",
  active: true,
};

const billingCycleOptions: { value: SupplierBillingCycle; label: string }[] = [
  { value: "one_time", label: "Valor único" },
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "yearly", label: "Anual" },
];

export type SupplierModalTab = "dados" | "pedidos" | "documentos";

const tabLabels: Record<SupplierModalTab, string> = {
  dados: "Dados",
  pedidos: "Pedidos",
  documentos: "Documentos",
};

/** Campos que ficam no bloco recolhível "Contrato de serviço". */
const contractSources: SupplierTemplateSource[] = [
  "hiredOn",
  "contractAmountInCents",
  "paymentMethod",
];

function documentDigits(kind: SupplierInput["kind"], value: string) {
  return kind === "person" ? cpfDigits(value) : cnpjDigits(value);
}

/** Documento preenchido por completo, mas com dígitos verificadores errados. */
function invalidDocument(form: SupplierInput) {
  const digits = documentDigits(form.kind, form.document);
  if (!digits) return false;
  return form.kind === "person"
    ? digits.length !== 11 || !isValidCpf(digits)
    : digits.length !== 14 || !isValidCnpj(digits);
}

/** Algum dado de contratação ou pagamento preenchido: o bloco começa aberto. */
function hasContractData(form: SupplierInput) {
  return Boolean(
    form.hiredOn ||
    form.contractAmountInCents != null ||
    form.paymentMethod ||
    form.paymentTerms.trim() ||
    form.installments > 1 ||
    form.billingCycle !== "one_time",
  );
}

/**
 * Cadastro do fornecedor em abas: dados (com o contrato de serviço recolhível), pedidos (o
 * primeiro junto com o cadastro, depois um a um) e documentos para assinar pelo WhatsApp.
 */
export function SupplierModal({
  supplier,
  initialTab = "dados",
  onClose,
  onSaved,
}: {
  supplier: Supplier | "new";
  initialTab?: SupplierModalTab;
  onClose: () => void;
  /** Recebe o fornecedor salvo (o modal da despesa usa para selecioná-lo). */
  onSaved: (saved: Supplier) => Promise<void>;
}) {
  const toast = useToast();
  const { canView } = useAuthorization();
  const canSign = useCanRequestSignature();
  const templates = useSignatureTemplates(canSign);
  const id = useId();
  const dataPanel = useRef<HTMLDivElement>(null);
  /** Fornecedor já gravado: o recebido ou o salvo agora (o modal passa a editar). */
  const [current, setCurrent] = useState<Supplier | null>(
    supplier === "new" ? null : supplier,
  );
  const [form, setForm] = useState<SupplierInput>(() =>
    supplier === "new" ? emptySupplier : { ...emptySupplier, ...supplier },
  );
  /** Último estado gravado do formulário, para saber se há o que salvar. */
  const [savedForm, setSavedForm] = useState(() => JSON.stringify(form));
  const [tab, setTab] = useState<SupplierModalTab>(initialTab);
  const [contractOpen, setContractOpen] = useState(() => hasContractData(form));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [documentTouched, setDocumentTouched] = useState(false);
  // Pedido em rascunho: o primeiro (fornecedor novo) ou o próximo (fornecedor salvo).
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderError, setOrderError] = useState("");
  const draft = useSupplierOrderDraft(orderOpen);
  const [ordersVersion, setOrdersVersion] = useState(0);
  const history = useSupplierOrders(current?.id ?? null, ordersVersion);
  const [signature, setSignature] = useState<SignatureRequest | null>(null);
  // Fornecedor salvo com documento: o modal passa para o envio do link de assinatura.
  const [sending, setSending] = useState<{
    saved: Supplier;
    prepare: () => ReturnType<typeof issueDocumentForSignature>;
  } | null>(null);
  const isNew = current === null;
  const formDirty = JSON.stringify(form) !== savedForm;
  const dirty = formDirty || Boolean(signature) || (orderOpen && draft.dirty);
  const person = form.kind === "person";
  const documentLabel = person ? "CPF" : "CNPJ";
  const documentError =
    documentTouched && invalidDocument(form)
      ? `Informe um ${documentLabel} válido.`
      : "";
  const installmentValue =
    form.contractAmountInCents && form.installments > 1
      ? `${form.installments}× de ${currency.format(
          Math.round(form.contractAmountInCents / form.installments) / 100,
        )}`
      : "";
  const showDocuments = canSign || (!isNew && canView("contracts"));
  const tabs: SupplierModalTab[] = showDocuments
    ? ["dados", "pedidos", "documentos"]
    : ["dados", "pedidos"];
  const selectedTemplate = signature
    ? templates.templates?.find((item) => item.id === signature.templateId)
    : undefined;

  /** "Preencher" na conferência do modelo: abre a aba Dados e leva ao campo que falta. */
  function fix(source: SupplierTemplateSource) {
    flushSync(() => {
      if (contractSources.includes(source)) setContractOpen(true);
      setTab("dados");
    });
    dataPanel.current
      ?.querySelector<HTMLElement>(`[data-source="${source}"]`)
      ?.focus();
  }

  function update<K extends keyof SupplierInput>(
    key: K,
    value: SupplierInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  // Campos opcionais vazios saem do objeto: a API rejeita data, valor e forma em branco.
  function updateOptional<
    K extends "hiredOn" | "contractAmountInCents" | "paymentMethod",
  >(key: K, value: SupplierInput[K] | "") {
    setForm((current) => {
      const next = { ...current };
      if (value === undefined || value === "") delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function moveTab(event: KeyboardEvent, index: number) {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setTab(tabs[next]!);
    document.getElementById(`${id}-${tabs[next]}-tab`)?.focus();
  }

  function discardOrder() {
    draft.reset();
    setOrderOpen(false);
    setOrderError("");
  }

  /** Registra o pedido em rascunho de um fornecedor já gravado. */
  async function registerOrder(supplierId: string) {
    const built = draft.build();
    if ("error" in built) {
      setOrderError(built.error);
      setTab("pedidos");
      return false;
    }
    await api.createSupplierOrder(supplierId, built.input);
    toast.success("Pedido registrado e itens lançados no estoque.");
    discardOrder();
    setOrdersVersion((value) => value + 1);
    return true;
  }

  /** "Registrar pedido" da aba Pedidos: só o pedido, sem regravar o cadastro. */
  async function submitOrder() {
    if (!current) return;
    setBusy(true);
    setOrderError("");
    try {
      await registerOrder(current.id);
    } catch (cause) {
      setOrderError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Grava o cadastro, o pedido em rascunho e, se escolhido, segue para o envio do documento. */
  async function submit() {
    setDocumentTouched(true);
    if (form.name.trim().length < 2) {
      setError("Informe o nome do fornecedor (pelo menos 2 caracteres).");
      setTab("dados");
      return;
    }
    if (invalidDocument(form)) {
      setError(
        `Informe um ${documentLabel} válido ou deixe o campo em branco.`,
      );
      setTab("dados");
      return;
    }
    if (orderOpen) {
      const built = draft.build();
      if ("error" in built) {
        setOrderError(built.error);
        setTab("pedidos");
        return;
      }
    }
    setBusy(true);
    setError("");
    setOrderError("");
    let saved = current;
    try {
      if (!saved || formDirty) {
        saved = await api.saveSupplier(form, saved?.id);
        setCurrent(saved);
        setSavedForm(JSON.stringify(form));
        toast.success(
          isNew ? "Fornecedor cadastrado." : "Fornecedor atualizado.",
        );
      }
    } catch (cause) {
      setError((cause as Error).message);
      setTab("dados");
      setBusy(false);
      return;
    }
    if (orderOpen) {
      try {
        await registerOrder(saved.id);
      } catch (cause) {
        // O fornecedor já está salvo: o modal segue em edição com o pedido intacto.
        setOrderError(
          `O fornecedor foi salvo, mas o pedido não foi registrado. ${(cause as Error).message}`,
        );
        setTab("pedidos");
        setBusy(false);
        void onSaved(saved);
        return;
      }
    }
    setBusy(false);
    if (signature) {
      const supplierId = saved.id;
      setSending({
        saved,
        prepare: () => issueDocumentForSignature({ ...signature, supplierId }),
      });
      return;
    }
    await onSaved(saved);
    onClose();
  }

  async function finish(saved: Supplier) {
    await onSaved(saved);
    onClose();
  }

  const title = isNew ? "Novo fornecedor" : "Editar fornecedor";

  if (sending)
    return (
      <Modal
        title={title}
        subtitle={`${sending.saved.name} salvo. Envie o documento para o fornecedor assinar.`}
        busy={busy}
        onClose={() => void finish(sending.saved)}
      >
        <SignatureSendStep
          prepare={sending.prepare}
          onBusyChange={setBusy}
          onDone={() => void finish(sending.saved)}
        />
      </Modal>
    );

  const panelProps = (key: SupplierModalTab) => ({
    role: "tabpanel" as const,
    id: `${id}-${key}-panel`,
    "aria-labelledby": `${id}-${key}-tab`,
    hidden: tab !== key,
    className: "supplier-tab-panel",
  });

  return (
    <>
      <Modal
        title={title}
        subtitle={
          isNew
            ? "Cadastre os dados e, se quiser, já o primeiro pedido e o documento para assinatura."
            : "Desativar mantém os vínculos e o histórico das despesas."
        }
        wide
        inactive={draft.creatingFor !== null}
        busy={busy}
        dirty={dirty}
        onClose={onClose}
      >
        <form
          className="clinical-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div
            className="group-modal-tabs"
            role="tablist"
            aria-label="Cadastro do fornecedor"
          >
            {tabs.map((key, index) => (
              <button
                key={key}
                type="button"
                className="secondary-button"
                role="tab"
                id={`${id}-${key}-tab`}
                aria-controls={`${id}-${key}-panel`}
                aria-selected={tab === key}
                tabIndex={tab === key ? 0 : -1}
                onClick={() => setTab(key)}
                onKeyDown={(event) => moveTab(event, index)}
              >
                {tabLabels[key]}
              </button>
            ))}
          </div>

          <div {...panelProps("dados")} ref={dataPanel}>
            {error && <ErrorBanner error={error} />}
            <fieldset className="form-fields form-grid" disabled={busy}>
              <label className="span-2">
                Nome
                <input
                  required
                  data-source="name"
                  minLength={2}
                  maxLength={160}
                  placeholder={
                    person ? "Nome completo" : "Razão social ou nome fantasia"
                  }
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                />
              </label>
              <label>
                Tipo
                <select
                  value={form.kind}
                  onChange={(event) =>
                    update("kind", event.target.value as SupplierInput["kind"])
                  }
                >
                  <option value="company">Pessoa jurídica</option>
                  <option value="person">Pessoa física</option>
                </select>
              </label>
              <div className="field-with-hint">
                <label>
                  {documentLabel}
                  <input
                    data-source="document"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={
                      person ? "000.000.000-00" : "00.000.000/0000-00"
                    }
                    maxLength={person ? 14 : 18}
                    value={
                      person
                        ? formatCpf(form.document)
                        : formatCnpj(form.document)
                    }
                    aria-invalid={documentError ? true : undefined}
                    aria-describedby={
                      documentError ? `${id}-document-error` : undefined
                    }
                    onBlur={() => setDocumentTouched(true)}
                    onChange={(event) =>
                      update(
                        "document",
                        documentDigits(form.kind, event.target.value),
                      )
                    }
                  />
                </label>
                {documentError && (
                  <small
                    id={`${id}-document-error`}
                    className="field-error"
                    aria-live="polite"
                  >
                    {documentError}
                  </small>
                )}
              </div>

              <fieldset className="form-fieldset span-2">
                <legend>Contato</legend>
                <div className="form-fieldset-grid">
                  <label>
                    Telefone
                    <PhoneInput
                      value={form.phone}
                      onChange={(digits) => update("phone", digits)}
                    />
                  </label>
                  <div className="field-with-hint">
                    <label>
                      WhatsApp
                      <PhoneInput
                        value={form.whatsapp}
                        onChange={(digits) => update("whatsapp", digits)}
                      />
                    </label>
                    <small className="field-hint">
                      Recebe os documentos para assinatura.
                    </small>
                  </div>
                  <label className="span-2">
                    E-mail
                    <input
                      type="email"
                      placeholder="contato@empresa.com.br"
                      value={form.email ?? ""}
                      onChange={(event) => update("email", event.target.value)}
                    />
                  </label>
                </div>
              </fieldset>

              <details
                className="more-info span-2"
                open={contractOpen}
                onToggle={(event) => setContractOpen(event.currentTarget.open)}
              >
                <summary>Contrato de serviço (opcional)</summary>
                <div className="supplier-contract-fields">
                  <p className="field-hint">
                    Para fornecedor com contrato: os valores entram nos modelos
                    de documento ({"{{fornecedor_valor}}"},{" "}
                    {"{{fornecedor_pagamento}}"}…).
                  </p>
                  <fieldset className="form-fieldset">
                    <legend>Contratação e valores</legend>
                    <div className="form-fieldset-grid">
                      <label>
                        Data de contratação
                        <input
                          type="date"
                          data-source="hiredOn"
                          value={form.hiredOn ?? ""}
                          onChange={(event) =>
                            updateOptional("hiredOn", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Valor contratado (R$)
                        <MoneyInput
                          data-source="contractAmountInCents"
                          valueInCents={form.contractAmountInCents ?? null}
                          onChange={(cents) =>
                            updateOptional("contractAmountInCents", cents ?? "")
                          }
                        />
                      </label>
                      <label>
                        Recorrência
                        <select
                          value={form.billingCycle}
                          onChange={(event) =>
                            update(
                              "billingCycle",
                              event.target.value as SupplierBillingCycle,
                            )
                          }
                        >
                          {billingCycleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </fieldset>
                  <fieldset className="form-fieldset">
                    <legend>Pagamento</legend>
                    <div className="form-fieldset-grid">
                      <label>
                        Forma de pagamento
                        <select
                          data-source="paymentMethod"
                          value={form.paymentMethod ?? ""}
                          onChange={(event) =>
                            updateOptional(
                              "paymentMethod",
                              event.target.value as PaymentMethod | "",
                            )
                          }
                        >
                          <option value="">Não definida</option>
                          {paymentMethodOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="field-with-hint">
                        <label>
                          Parcelas
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={120}
                            value={form.installments}
                            onChange={(event) =>
                              update(
                                "installments",
                                Math.max(
                                  1,
                                  Math.trunc(Number(event.target.value) || 1),
                                ),
                              )
                            }
                          />
                        </label>
                        {installmentValue && (
                          <small className="field-hint">
                            {installmentValue}
                          </small>
                        )}
                      </div>
                      <label className="span-2">
                        Condições de pagamento
                        <input
                          maxLength={300}
                          placeholder="Ex.: entrada + 3x no boleto, vencimento todo dia 10"
                          value={form.paymentTerms}
                          onChange={(event) =>
                            update("paymentTerms", event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </fieldset>
                </div>
              </details>

              <label className="span-2">
                Observações
                <textarea
                  value={form.notes}
                  maxLength={1000}
                  onChange={(event) => update("notes", event.target.value)}
                />
              </label>
              {(form.orders || form.contracts) && (
                <fieldset className="form-fieldset span-2">
                  <legend>Anotações antigas</legend>
                  <p className="field-hint">
                    Texto livre de antes dos pedidos e documentos do sistema.
                    Fica só para consulta; os novos vão nas abas Pedidos e
                    Documentos.
                  </p>
                  <div className="form-fieldset-grid">
                    {form.orders && (
                      <div className="span-2">
                        <label>
                          Pedidos (anotação antiga)
                          <textarea readOnly value={form.orders} />
                        </label>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => update("orders", "")}
                        >
                          Apagar anotação de pedidos
                        </button>
                      </div>
                    )}
                    {form.contracts && (
                      <div className="span-2">
                        <label>
                          Contratos (anotação antiga)
                          <textarea readOnly value={form.contracts} />
                        </label>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => update("contracts", "")}
                        >
                          Apagar anotação de contratos
                        </button>
                      </div>
                    )}
                  </div>
                </fieldset>
              )}
              <label className="checkbox-field span-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => update("active", event.target.checked)}
                />
                Ativo
              </label>
            </fieldset>
          </div>

          <div {...panelProps("pedidos")}>
            {orderError && <ErrorBanner error={orderError} />}
            {current && (
              <div className="supplier-orders">
                <div className="supplier-orders-head">
                  <p className="panel-context">
                    {supplierOrdersSummary(history.orders)}
                  </p>
                  {!orderOpen && (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy}
                      onClick={() => setOrderOpen(true)}
                    >
                      <Plus size={16} aria-hidden="true" /> Novo pedido
                    </button>
                  )}
                </div>
                {!orderOpen && (
                  <SupplierOrderHistory
                    orders={history.orders}
                    error={history.error}
                  />
                )}
              </div>
            )}
            {isNew && !orderOpen && (
              <div className="supplier-orders-head">
                <p className="field-hint">
                  Pedidos com valor e itens, que entram no estoque e viram opção
                  de venda. Os próximos são registrados aqui mesmo, ao editar o
                  fornecedor.
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setOrderOpen(true)}
                >
                  <Plus size={16} aria-hidden="true" /> Incluir primeiro pedido
                </button>
              </div>
            )}
            {orderOpen && (
              <fieldset className="form-fieldset">
                <legend>{isNew ? "Primeiro pedido" : "Novo pedido"}</legend>
                {draft.loadError && <ErrorBanner error={draft.loadError} />}
                <SupplierOrderFields draft={draft} disabled={busy} />
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={discardOrder}
                  >
                    Descartar pedido
                  </button>
                  {current ? (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy || !draft.products}
                      onClick={() => void submitOrder()}
                    >
                      {busy ? "Registrando…" : "Registrar pedido"}
                    </button>
                  ) : (
                    <p className="field-hint">
                      O pedido é registrado ao salvar o fornecedor.
                    </p>
                  )}
                </div>
              </fieldset>
            )}
          </div>

          {showDocuments && (
            <div {...panelProps("documentos")}>
              {canSign && (
                <fieldset className="form-fieldset">
                  <legend>Enviar documento pelo WhatsApp</legend>
                  <div className="form-fieldset-grid">
                    <SignatureTemplateField
                      signer="fornecedor"
                      state={templates}
                      value={signature}
                      disabled={busy}
                      onChange={setSignature}
                    />
                    {selectedTemplate && (
                      <SupplierDocumentCheck
                        template={selectedTemplate}
                        form={form}
                        onFix={fix}
                      />
                    )}
                    {signature && (
                      <div className="span-2">
                        <button
                          type="submit"
                          className="whatsapp-button"
                          disabled={busy}
                        >
                          <MessageCircle size={16} aria-hidden="true" />
                          {isNew || formDirty || orderOpen
                            ? "Salvar e enviar pelo WhatsApp"
                            : "Enviar pelo WhatsApp"}
                        </button>
                      </div>
                    )}
                  </div>
                </fieldset>
              )}
              {current && canView("contracts") && (
                <div className="supplier-documents">
                  <h3>Documentos enviados</h3>
                  <SupplierDocuments supplierId={current.id} />
                </div>
              )}
            </div>
          )}

          <div className="modal-actions">
            <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
            <button className="primary-button" disabled={busy}>
              Salvar fornecedor
            </button>
          </div>
        </form>
      </Modal>
      <SupplierOrderProductModal draft={draft} />
    </>
  );
}
