import type {
  AdministrativeRegistryInput,
  AdministrativeRegistryWorkspace,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { Modal } from "../../shared/components/Modal";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { EmptyState } from "../../shared/components/EmptyState";
import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import { ReportTabs, type ReportTab } from "../reports/index";
type Editor = { id?: string; input: AdministrativeRegistryInput };
type Kind = AdministrativeRegistryInput["kind"];
const kinds: ReportTab<Kind>[] = [
  { key: "service", label: "Serviços" },
  { key: "room", label: "Salas" },
  { key: "professional", label: "Profissionais" },
];
export function AdministrativeRegistrySection() {
  const { can } = useAuthorization();
  const [data, setData] = useState<AdministrativeRegistryWorkspace | null>(
      null,
    ),
    [error, setError] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null);
  async function load() {
    setError("");
    try {
      setData(await api.administrativeRegistry());
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  useEffect(() => {
    let active = true;
    api
      .administrativeRegistry()
      .then((workspace) => active && setData(workspace))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);
  function create(kind: Kind) {
    setEditor({
      input:
        kind === "professional"
          ? {
              kind,
              data: {
                fullName: "",
                crefito: "",
                specialty: "Fisioterapia",
                color: "#547A6B",
                active: true,
              },
            }
          : kind === "room"
            ? { kind, data: { name: "", capacity: 1, active: true } }
            : {
                kind,
                data: {
                  name: "",
                  durationMinutes: 60,
                  priceInCents: 0,
                  active: true,
                },
              },
    });
  }
  function list(kind: Kind) {
    const entries =
      kind === "service"
        ? data?.services
        : kind === "room"
          ? data?.rooms
          : data?.professionals;
    const createPermission =
      kind === "service"
        ? "agenda.services_create"
        : kind === "room"
          ? "agenda.rooms_create"
          : "agenda.professionals_create";
    return (
      <div className="registry-settings-list">
        {can(createPermission) && (
          <div className="page-actions">
            <button className="primary-button" onClick={() => create(kind)}>
              Novo cadastro
            </button>
          </div>
        )}
        {!data ? (
          !error && <LoadingBlock />
        ) : !entries?.length ? (
          <EmptyState
            title="Nenhum cadastro"
            copy="Cadastre os recursos utilizados na agenda."
          />
        ) : (
          entries.map((item) => (
            <div className="table-row" key={item.id}>
              <strong>{"fullName" in item ? item.fullName : item.name}</strong>
              <span>{item.active ? "Ativo" : "Inativo"}</span>
              {can("settings.registry_manage") && (
                <button
                  className="secondary-button"
                  onClick={() =>
                    setEditor({
                      id: item.id,
                      input: {
                        kind,
                        data: item,
                      } as AdministrativeRegistryInput,
                    })
                  }
                >
                  Editar cadastro
                </button>
              )}
            </div>
          ))
        )}
      </div>
    );
  }
  return (
    <div className="settings-panel-body registry-settings">
      {error && <ErrorBanner error={error} />}
      <ReportTabs sub label="Tipos de cadastro" tabs={kinds}>
        {list}
      </ReportTabs>
      {editor && (
        <RegistryEditor
          key={editor.id ?? editor.input.kind}
          editor={editor}
          professionals={data?.professionals ?? []}
          rooms={data?.rooms ?? []}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
function RegistryEditor({
  editor,
  professionals,
  rooms,
  onClose,
  onSaved,
}: {
  editor: Editor;
  professionals: AdministrativeRegistryWorkspace["professionals"];
  rooms: AdministrativeRegistryWorkspace["rooms"];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [form, setForm] = useState(editor.input),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const patch = (data: Record<string, string | number | boolean>) =>
    setForm(
      (current) =>
        ({
          ...current,
          data: { ...current.data, ...data },
        }) as AdministrativeRegistryInput,
    );
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (editor.id) await api.updateAdministrativeRegistry(editor.id, form);
      else if (form.kind === "professional")
        await api.createProfessional(form.data);
      else if (form.kind === "room") await api.createRoom(form.data);
      else await api.createService(form.data);
      toast.success(editor.id ? "Cadastro atualizado." : "Cadastro criado.");
      await onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }
  const prompt = useUnsavedChangesPrompt({
      section: "Cadastro administrativo",
      dirty: JSON.stringify(form) !== JSON.stringify(editor.input),
      busy,
      save,
      discard: () => {},
    }),
    close = () => prompt.confirmLeave(onClose);
  return (
    <>
      <Modal
        title={editor.id ? "Editar cadastro" : "Novo cadastro"}
        subtitle="Desativar mantém os registros anteriores. Os próximos agendamentos usam os valores atuais."
        busy={busy || Boolean(prompt.modal)}
        inactive={Boolean(prompt.modal)}
        onClose={close}
      >
        <form
          className="clinical-form"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await save();
            } catch (cause) {
              setError((cause as Error).message);
            }
          }}
        >
          {error && <ErrorBanner error={error} />}
          <fieldset className="form-fields form-grid" disabled={busy}>
            {form.kind === "professional" ? (
              <>
                <label>
                  Nome completo
                  <input
                    required
                    minLength={3}
                    maxLength={160}
                    value={form.data.fullName}
                    onChange={(event) =>
                      patch({ fullName: event.target.value })
                    }
                  />
                </label>
                <label>
                  Registro profissional
                  <input
                    required
                    minLength={4}
                    maxLength={40}
                    value={form.data.crefito}
                    onChange={(event) => patch({ crefito: event.target.value })}
                  />
                </label>
                <label>
                  Especialidade
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={form.data.specialty}
                    onChange={(event) =>
                      patch({ specialty: event.target.value })
                    }
                  />
                </label>
              </>
            ) : (
              <label>
                Nome
                <input
                  required
                  minLength={2}
                  maxLength={form.kind === "room" ? 80 : 120}
                  value={form.data.name}
                  onChange={(event) => patch({ name: event.target.value })}
                />
              </label>
            )}
            {form.kind === "room" && (
              <label>
                Capacidade
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  value={form.data.capacity}
                  onChange={(event) =>
                    patch({ capacity: Number(event.target.value) })
                  }
                />
              </label>
            )}
            {form.kind === "service" && (
              <>
                <label>
                  Duração (minutos)
                  <input
                    required
                    type="number"
                    min={15}
                    max={480}
                    value={form.data.durationMinutes}
                    onChange={(event) =>
                      patch({ durationMinutes: Number(event.target.value) })
                    }
                  />
                </label>
                <CurrencyField
                  label="Preço de tabela"
                  value={form.data.priceInCents}
                  onChange={(value) => patch({ priceInCents: value })}
                />
                <p className="field-hint span-2">
                  O plano avulso do serviço é criado ou atualizado com este
                  valor.
                </p>
                <ResourceChecklist
                  legend="Profissionais que atendem"
                  items={professionals
                    .filter((item) => item.active)
                    .map((item) => ({ id: item.id, name: item.fullName }))}
                  value={form.data.professionalIds ?? []}
                  onChange={(professionalIds) =>
                    setForm((current) =>
                      current.kind === "service"
                        ? {
                            ...current,
                            data: { ...current.data, professionalIds },
                          }
                        : current,
                    )
                  }
                />
                <ResourceChecklist
                  legend="Salas onde é atendido"
                  items={rooms
                    .filter((item) => item.active)
                    .map((item) => ({ id: item.id, name: item.name }))}
                  value={form.data.roomIds ?? []}
                  onChange={(roomIds) =>
                    setForm((current) =>
                      current.kind === "service"
                        ? { ...current, data: { ...current.data, roomIds } }
                        : current,
                    )
                  }
                />
              </>
            )}
            {form.kind === "professional" && (
              <label>
                Cor
                <input
                  type="color"
                  value={form.data.color}
                  onChange={(event) => patch({ color: event.target.value })}
                />
              </label>
            )}
            {editor.id && (
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.data.active}
                  onChange={(event) => patch({ active: event.target.checked })}
                />
                Ativo
              </label>
            )}
          </fieldset>
          <div className="modal-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={close}
            >
              Cancelar
            </button>
            <button className="primary-button" disabled={busy}>
              Salvar cadastro
            </button>
          </div>
        </form>
      </Modal>
      {prompt.modal}
    </>
  );
}

/** Lista de marcação de profissionais ou salas; nenhum marcado = todos. */
function ResourceChecklist({
  legend,
  items,
  value,
  onChange,
}: {
  legend: string;
  items: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="resource-checklist span-2">
      <legend>{legend}</legend>
      <small>Nenhum marcado: todos podem ser usados no agendamento.</small>
      <div>
        {items.map((item) => (
          <label className="checkbox-field" key={item.id}>
            <input
              type="checkbox"
              checked={value.includes(item.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, item.id]
                    : value.filter((id) => id !== item.id),
                )
              }
            />
            {item.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
