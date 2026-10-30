import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import {
  clinicalResourceLabels,
  type ClinicalResource,
  type ClinicalResourceInput,
  type ClinicalResourceKind,
  type ClinicCatalogEntry,
  type PatientOption,
  type Professional,
} from "@crm/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { PatientPicker } from "../../PatientPicker";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { localIsoDate } from "../../shared/lib/formatting";
import { useToast } from "../../shared/feedback/toast-context";
import { fileToBase64 } from "./model";

/** Evoluções saíram do prontuário: o editor só cria e altera os demais registros. */
export type EditableResourceKind = Exclude<
  ClinicalResourceKind,
  "evolution" | "evolution_template"
>;

function initial(
  kind: EditableResourceKind,
  patientId: string,
  professionalId: string,
): ClinicalResourceInput {
  const common = { name: "", active: true };
  const forms = {
    equipment: { kind, ...common, description: "", image: "" },
    exercise: {
      kind,
      ...common,
      description: "",
      equipmentId: "",
      muscleGroupId: "",
      level: "",
      image: "",
      videoUrl: "",
    },
    training: {
      kind,
      ...common,
      patientId,
      professionalId,
      validFrom: localIsoDate(),
      validUntil: "",
      notes: "",
      exercises: [],
    },
    training_execution: {
      kind,
      name: "Execução do treino",
      patientId,
      trainingId: "",
      startedAt: new Date().toISOString(),
      notes: "",
    },
    clinical_document: {
      kind,
      name: "Relatório clínico",
      patientId,
      professionalId,
      documentKind: "report",
      body: "",
    },
  };
  return forms[kind] as ClinicalResourceInput;
}
export function ClinicalResourceEditor({
  kind,
  resource,
  copy = false,
  patientId,
  patients,
  professionals,
  resources,
  muscleGroups,
  onClose,
  onSaved,
}: {
  kind: EditableResourceKind;
  resource?: ClinicalResource | undefined;
  copy?: boolean;
  patientId: string;
  patients: PatientOption[];
  professionals: Professional[];
  resources: ClinicalResource[];
  muscleGroups: ClinicCatalogEntry[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [form, setForm] = useState<ClinicalResourceInput>(() =>
    resource
      ? structuredClone(resource.data)
      : initial(kind, patientId, professionals[0]?.id ?? ""),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copyPatients, setCopyPatients] = useState<PatientOption[]>(patients);
  useEffect(() => {
    if (!copy) return;
    let alive = true;
    api
      .patientOptions()
      .then((items) => {
        if (alive) setCopyPatients(items);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [copy]);
  const patientOptions =
    "patientId" in form &&
    !copyPatients.some((item) => item.id === form.patientId)
      ? [
          ...copyPatients,
          {
            id: form.patientId,
            fullName:
              patients.find((item) => item.id === patientId)?.fullName ??
              "Cliente do registro original",
            tags: [],
          },
        ]
      : copyPatients;
  const patch = (update: Partial<ClinicalResourceInput>) =>
    setForm((current) => ({ ...current, ...update }) as ClinicalResourceInput);
  const historical = resource && !copy ? resource.data : undefined;
  const historicIds = new Set(
    historical
      ? historical.kind === "exercise"
        ? [historical.equipmentId]
        : historical.kind === "training"
          ? historical.exercises.map((entry) => entry.exerciseId)
          : []
      : [],
  );
  const equipment = resources.filter(
      (item) =>
        item.kind === "equipment" &&
        (item.status === "active" || historicIds.has(item.id)),
    ),
    exercises = resources.filter(
      (item) =>
        item.kind === "exercise" &&
        (item.status === "active" || historicIds.has(item.id)),
    );
  // O que falta para salvar: Salvar fica desativado listando os campos (QM14).
  const missing = useMissingFields(
    [
      ...(form.name.trim().length < 2
        ? ["Nome (pelo menos 2 caracteres)"]
        : []),
      ...("patientId" in form && !form.patientId ? ["Cliente"] : []),
      ...("professionalId" in form && !form.professionalId
        ? ["Profissional"]
        : []),
      ...(form.kind === "training" && !form.validFrom ? ["Início"] : []),
      ...(form.kind === "training"
        ? form.exercises
            .filter((entry) => !entry.repetitions.trim())
            .map(
              (entry) =>
                `Repetições de ${
                  resources.find((item) => item.id === entry.exerciseId)
                    ?.name ?? "exercício"
                }`,
            )
        : []),
      ...(form.kind === "training_execution" && !form.trainingId
        ? ["Treino"]
        : []),
      ...(form.kind === "clinical_document" && form.body.trim().length < 10
        ? ["Conteúdo (pelo menos 10 caracteres)"]
        : []),
    ],
    "field-hint",
  );
  const [savedForm] = useState(() => JSON.stringify(form));
  async function save() {
    setSaving(true);
    setError("");
    try {
      await api.saveClinicalResource(form, copy ? undefined : resource?.id);
      toast.success("Registro clínico salvo.");
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }
  const prompt = useUnsavedChangesPrompt({
    section: "Registro clínico",
    dirty: JSON.stringify(form) !== savedForm,
    busy: saving,
    save,
    discard: () => {},
  });
  const close = () => prompt.confirmLeave(onClose);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await save();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function image(file: File | undefined) {
    if (!file) return;
    setError("");
    if (
      file.size > 5 * 1024 * 1024 ||
      !["image/png", "image/jpeg"].includes(file.type)
    ) {
      setError("Use uma imagem PNG ou JPEG de até 5 MB.");
      return;
    }
    setSaving(true);
    try {
      patch({ image: `data:${file.type};base64,${await fileToBase64(file)}` });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      {" "}
      <Modal
        title={
          copy
            ? "Copiar treino"
            : resource
              ? "Editar registro"
              : "Novo registro"
        }
        subtitle={clinicalResourceLabels[kind]}
        busy={saving || Boolean(prompt.modal)}
        inactive={Boolean(prompt.modal)}
        onClose={close}
        wide
      >
        <form className="clinical-form" onSubmit={submit}>
          {error && <ErrorBanner error={error} />}
          <label>
            Nome
            <input
              required
              minLength={2}
              maxLength={160}
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </label>
          {"patientId" in form && (
            <label>
              Cliente
              <PatientPicker
                patients={patientOptions}
                value={form.patientId}
                disabled={!copy}
                onChange={(id) => patch({ patientId: id })}
                required
              />
            </label>
          )}
          {"professionalId" in form && (
            <label>
              Profissional
              <select
                required
                value={form.professionalId}
                onChange={(event) =>
                  patch({ professionalId: event.target.value })
                }
              >
                {!professionals.some(
                  (item) => item.id === form.professionalId,
                ) &&
                  form.professionalId && (
                    <option value={form.professionalId}>
                      Profissional do registro original
                    </option>
                  )}
                {professionals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {"active" in form && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => patch({ active: event.target.checked })}
              />
              Ativo
            </label>
          )}
          {"description" in form && (
            <label>
              Descrição
              <textarea
                rows={4}
                value={form.description}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </label>
          )}
          {"image" in form && (
            <label>
              Imagem
              <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={saving}
                onChange={(event) => void image(event.target.files?.[0])}
              />
            </label>
          )}
          {form.kind === "exercise" && (
            <>
              <label>
                Aparelho
                <select
                  value={form.equipmentId ?? ""}
                  onChange={(event) =>
                    patch({ equipmentId: event.target.value })
                  }
                >
                  <option value="">Sem aparelho</option>
                  {equipment.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Grupo muscular
                <select
                  value={form.muscleGroupId ?? ""}
                  onChange={(event) =>
                    patch({ muscleGroupId: event.target.value })
                  }
                >
                  <option value="">Não informado</option>
                  {muscleGroups.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nível
                <input
                  value={form.level ?? ""}
                  onChange={(event) => patch({ level: event.target.value })}
                />
              </label>
              <label>
                Vídeo
                <input
                  type="url"
                  value={form.videoUrl ?? ""}
                  onChange={(event) => patch({ videoUrl: event.target.value })}
                />
              </label>
            </>
          )}
          {form.kind === "training" && (
            <>
              <div className="form-grid">
                <label>
                  Início
                  <input
                    type="date"
                    required
                    value={form.validFrom}
                    onChange={(event) =>
                      patch({ validFrom: event.target.value })
                    }
                  />
                </label>
                <label>
                  Fim
                  <input
                    type="date"
                    value={form.validUntil ?? ""}
                    onChange={(event) =>
                      patch({ validUntil: event.target.value })
                    }
                  />
                </label>
                <label>
                  Limite de execuções
                  <input
                    type="number"
                    min={1}
                    value={form.sessionLimit ?? ""}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        sessionLimit: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      } as ClinicalResourceInput)
                    }
                  />
                </label>
              </div>
              {form.exercises.map((entry, index) => (
                <fieldset className="form-fieldset" key={entry.exerciseId}>
                  <legend>
                    {
                      resources.find((item) => item.id === entry.exerciseId)
                        ?.name
                    }
                  </legend>
                  <div className="form-grid">
                    <label>
                      Séries
                      <input
                        type="number"
                        min={1}
                        max={100}
                        required
                        value={entry.sets}
                        onChange={(event) =>
                          patch({
                            exercises: form.exercises.map((item, i) =>
                              i === index
                                ? { ...item, sets: Number(event.target.value) }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Repetições
                      <input
                        required
                        value={entry.repetitions}
                        onChange={(event) =>
                          patch({
                            exercises: form.exercises.map((item, i) =>
                              i === index
                                ? { ...item, repetitions: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Pausa entre séries, segundos
                      <input
                        type="number"
                        min={0}
                        max={3600}
                        value={entry.restSeconds}
                        onChange={(event) =>
                          patch({
                            exercises: form.exercises.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    restSeconds: Number(event.target.value),
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="span-2">
                      Observações do exercício
                      <textarea
                        maxLength={1000}
                        value={entry.notes}
                        onChange={(event) =>
                          patch({
                            exercises: form.exercises.map((item, i) =>
                              i === index
                                ? { ...item, notes: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={index === 0}
                      onClick={() => {
                        const ordered = [...form.exercises];
                        [ordered[index - 1], ordered[index]] = [
                          ordered[index]!,
                          ordered[index - 1]!,
                        ];
                        patch({ exercises: ordered });
                      }}
                    >
                      Mover exercício para cima
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={index === form.exercises.length - 1}
                      onClick={() => {
                        const ordered = [...form.exercises];
                        [ordered[index], ordered[index + 1]] = [
                          ordered[index + 1]!,
                          ordered[index]!,
                        ];
                        patch({ exercises: ordered });
                      }}
                    >
                      Mover exercício para baixo
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        patch({
                          exercises: form.exercises.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      Remover exercício
                    </button>
                  </div>
                </fieldset>
              ))}
              <label>
                Adicionar exercício
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value)
                      patch({
                        exercises: [
                          ...form.exercises,
                          {
                            exerciseId: event.target.value,
                            sets: 1,
                            repetitions: "10",
                            restSeconds: 0,
                            notes: "",
                          },
                        ],
                      });
                  }}
                >
                  <option value="">Selecione</option>
                  {exercises
                    .filter(
                      (item) =>
                        !form.exercises.some(
                          (entry) => entry.exerciseId === item.id,
                        ),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Observações
                <textarea
                  value={form.notes}
                  onChange={(event) => patch({ notes: event.target.value })}
                />
              </label>
            </>
          )}
          {form.kind === "training_execution" && (
            <>
              <label>
                Treino
                <select
                  required
                  value={form.trainingId}
                  onChange={(event) =>
                    patch({ trainingId: event.target.value })
                  }
                >
                  <option value="">Selecione</option>
                  {resources
                    .filter(
                      (item) =>
                        item.kind === "training" &&
                        item.patientId === form.patientId,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Observações
                <textarea
                  value={form.notes}
                  onChange={(event) => patch({ notes: event.target.value })}
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(form.endedAt)}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      endedAt: event.target.checked
                        ? new Date().toISOString()
                        : undefined,
                    } as ClinicalResourceInput)
                  }
                />
                Execução concluída
              </label>
            </>
          )}
          {form.kind === "clinical_document" && (
            <>
              <label>
                Tipo
                <select
                  value={form.documentKind}
                  onChange={(event) =>
                    patch({
                      documentKind: event.target.value as
                        "report" | "prescription",
                    })
                  }
                >
                  <option value="report">Relatório</option>
                  <option value="prescription">Prescrição manual</option>
                </select>
              </label>
              <label>
                Conteúdo
                <textarea
                  required
                  minLength={10}
                  rows={10}
                  value={form.body}
                  onChange={(event) => patch({ body: event.target.value })}
                />
              </label>
            </>
          )}
          {missing.hint}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={saving}
              onClick={close}
            >
              Cancelar
            </button>
            <button
              className="primary-button"
              disabled={saving || missing.blocked}
              aria-describedby={missing.describedBy}
            >
              Salvar
            </button>
          </div>
        </form>
      </Modal>
      {prompt.modal}
    </>
  );
}
