import {
  type AdministrativeRegistryInput,
  type AdministrativeRegistryWorkspace,
  serviceBusinessLineLabels,
  serviceBusinessLines,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { Modal } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { EmptyState } from "../../shared/components/EmptyState";
import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import { ReportTabs, type ReportTab } from "../reports/index";
// Profissionais são cadastrados pelo usuário (Configurações › Usuários).
type RegistryInput = Exclude<
  AdministrativeRegistryInput,
  { kind: "professional" }
>;
type Editor = { id?: string; input: RegistryInput };
type Kind = RegistryInput["kind"];
const kinds: ReportTab<Kind>[] = [
  { key: "service", label: "Serviços" },
  { key: "room", label: "Salas" },
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
        kind === "room"
          ? { kind, data: { name: "", capacity: 1, active: true } }
          : {
              kind,
              data: {
                name: "",
                durationMinutes: 60,
                businessLine: null,
                active: true,
              },
            },
    });
  }
  function list(kind: Kind) {
    const entries = kind === "service" ? data?.services : data?.rooms;
    const createPermission =
      kind === "service" ? "agenda.services_create" : "agenda.rooms_create";
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
              <strong>{item.name}</strong>
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
                      } as RegistryInput,
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
  const patch = (data: Record<string, string | number | boolean | null>) =>
    setForm(
      (current) =>
        ({
          ...current,
          data: { ...current.data, ...data },
        }) as RegistryInput,
    );
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (editor.id) await api.updateAdministrativeRegistry(editor.id, form);
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
                <p className="field-hint span-2">
                  O serviço não tem preço: o valor fica nos planos. Para um
                  atendimento único, cadastre o plano avulso dele em
                  Configurações › Planos.
                </p>
                <label>
                  Linha no painel
                  <select
                    value={form.data.businessLine ?? ""}
                    onChange={(event) =>
                      patch({ businessLine: event.target.value || null })
                    }
                  >
                    <option value="">Sem classificação</option>
                    {serviceBusinessLines.map((line) => (
                      <option key={line} value={line}>
                        {serviceBusinessLineLabels[line]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="field-hint span-2">
                  Só vale para o painel de vendas, que separa as turmas e vendas
                  do serviço por linha (sem classificação aparece como Outros).
                  Não muda nada no CRM.
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
