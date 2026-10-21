import {
  broadcastSkipReasonLabels,
  formatPhone,
  type CampaignFilterOptions,
  type MessageTemplate,
  type PatientOption,
  type WhatsappCampaignAudience,
  type WhatsappCampaignDetail,
  type WhatsappCampaignPreview,
  type WhatsappCampaignPreviewInput,
  type WhatsappCampaignSegment,
} from "@crm/contracts";
import { Check, Images, Search, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../api";
import { PatientPicker } from "../../../PatientPicker";
import { Modal, ModalCancelButton } from "../../../shared/components/Modal";
import { shortDate } from "../../../shared/lib/formatting";
import { useFormDirty } from "../../../shared/workflows/useDirtyGuard";
import { CampaignFilters } from "./CampaignFilters";
import { useTemplateImages } from "./images";
import { emptyCampaignSegment } from "./model";
import { WhatsappBubble, WhatsappText } from "./WhatsappBubble";

type Step = 1 | 2 | 3;
const steps: Array<[Step, string]> = [
  [1, "Mensagem"],
  [2, "Clientes"],
  [3, "Conferir"],
];

function SamplePreview({
  template,
  preview,
}: {
  template: MessageTemplate;
  preview: WhatsappCampaignPreview;
}) {
  const { images } = useTemplateImages(template.images.map((item) => item.id));
  if (!preview.sample) return null;
  return (
    <WhatsappBubble
      contactName={preview.sample.patientName}
      text={preview.sample.message}
      images={template.images.map((image) => ({
        key: image.id,
        fileName: image.fileName,
        dataUrl: images[image.id] ?? null,
      }))}
    />
  );
}

/** Lista ao vivo de quem o filtro encontrou: quem recebe e quem será pulado. */
function FilterResults({
  loading,
  error,
  preview,
}: {
  loading: boolean;
  error?: string | undefined;
  preview?: WhatsappCampaignPreview | undefined;
}) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const rows = preview
    ? [
        ...preview.included.map((item) => ({ ...item, reason: "" })),
        ...preview.skipped.map((item) => ({
          patientId: item.patientId,
          patientName: item.patientName,
          phone: "",
          reason: broadcastSkipReasonLabels[item.reason],
        })),
      ]
        .sort((a, b) => a.patientName.localeCompare(b.patientName, "pt-BR"))
        .filter(
          (row) =>
            !term || row.patientName.toLocaleLowerCase("pt-BR").includes(term),
        )
    : [];
  return (
    <section
      className="campaign-filter-results"
      aria-label="Clientes encontrados"
      aria-busy={loading}
    >
      <header>
        <strong role="status">
          {loading
            ? "Buscando clientes…"
            : error
              ? "Não foi possível buscar os clientes"
              : `${preview!.matched} ${preview!.matched === 1 ? "cliente encontrado" : "clientes encontrados"}`}
        </strong>
        {preview && !loading && (
          <span>
            {preview.recipients} vão receber
            {preview.skipped.length > 0 &&
              ` · ${preview.skipped.length} ${preview.skipped.length === 1 ? "será pulado" : "serão pulados"}`}
          </span>
        )}
      </header>
      {error && <p className="form-error">{error}</p>}
      {preview && preview.matched > 0 && (
        <>
          {preview.matched > 8 && (
            <label className="campaign-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar entre os clientes encontrados"
                placeholder="Buscar entre os encontrados"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          )}
          <ul className="campaign-filter-list">
            {rows.map((row) => (
              <li key={row.patientId} className={row.reason ? "skipped" : ""}>
                <span className="campaign-filter-avatar" aria-hidden="true">
                  {row.patientName.trim().charAt(0).toUpperCase()}
                </span>
                <span>
                  <strong>{row.patientName}</strong>
                  <small>{row.reason || formatPhone(row.phone)}</small>
                </span>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="campaign-filter-empty">Ninguém com esse nome.</li>
            )}
          </ul>
        </>
      )}
      {preview && preview.matched === 0 && (
        <p className="field-hint">
          Nenhum cliente com esses filtros. Tente tirar alguma etiqueta.
        </p>
      )}
    </section>
  );
}

/** Cria a campanha: escolhe a mensagem padrão, o público e confere quem recebe. */
export function NewCampaignModal({
  templates,
  patients,
  initialTemplateId,
  onClose,
  onCreated,
}: {
  templates: MessageTemplate[];
  patients: PatientOption[];
  initialTemplateId?: string | undefined;
  onClose: () => void;
  onCreated: (campaign: WhatsappCampaignDetail) => void;
}) {
  const active = templates.filter((template) => !template.archivedAt);
  const [step, setStep] = useState<Step>(initialTemplateId ? 2 : 1);
  const [templateId, setTemplateId] = useState(
    initialTemplateId ?? active[0]?.id ?? "",
  );
  const [mode, setMode] =
    useState<WhatsappCampaignAudience["mode"]>("patients");
  const [chosen, setChosen] = useState<PatientOption[]>([]);
  const [pickerValue, setPickerValue] = useState("");
  const [segment, setSegment] =
    useState<WhatsappCampaignSegment>(emptyCampaignSegment);
  const [filterOptions, setFilterOptions] =
    useState<CampaignFilterOptions | null>(null);
  const template = active.find((item) => item.id === templateId);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<WhatsappCampaignPreview | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const dirty = useFormDirty({ templateId, mode, chosen, segment, name });

  // Opções reais dos filtros (serviços, profissionais, cidades…), carregadas uma vez.
  const needsOptions = mode === "segment" && !filterOptions;
  useEffect(() => {
    if (!needsOptions) return;
    let active = true;
    api
      .campaignFilterOptions()
      .then((result) => active && setFilterOptions(result))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [needsOptions]);
  const audience: WhatsappCampaignPreviewInput["audience"] =
    mode === "patients"
      ? { mode, patientIds: chosen.map((patient) => patient.id) }
      : { mode, segment };

  // Por filtros: mostra na hora quem entra no segmento (consulta com pequeno atraso).
  const filterKey =
    mode === "segment" && step === 2 && template
      ? JSON.stringify({ templateId: template.id, segment })
      : "";
  const [matches, setMatches] = useState<{
    key: string;
    preview?: WhatsappCampaignPreview;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!filterKey) return;
    let active = true;
    const timer = window.setTimeout(() => {
      const { templateId: id, segment: filter } = JSON.parse(filterKey) as {
        templateId: string;
        segment: WhatsappCampaignSegment;
      };
      api
        .previewWhatsappCampaign({
          templateId: id,
          audience: { mode: "segment", segment: filter },
        })
        .then(
          (result) => active && setMatches({ key: filterKey, preview: result }),
        )
        .catch(
          (cause: Error) =>
            active && setMatches({ key: filterKey, error: cause.message }),
        );
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [filterKey]);
  const currentMatches = matches?.key === filterKey ? matches : null;

  function change(apply: () => void) {
    apply();
    setPreview(null);
    setError("");
  }

  async function review() {
    if (!template) return;
    setWorking(true);
    setError("");
    try {
      const result = await api.previewWhatsappCampaign({
        templateId: template.id,
        audience,
      });
      setPreview(result);
      setName(
        (current) =>
          current ||
          `${template.title} · ${shortDate.format(new Date())}`.slice(0, 80),
      );
      setStep(3);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function create() {
    if (!template || !preview) return;
    setWorking(true);
    setError("");
    try {
      onCreated(
        await api.createWhatsappCampaign({
          templateId: template.id,
          name: name.trim(),
          audience,
        }),
      );
    } catch (cause) {
      setError((cause as Error).message);
      setWorking(false);
    }
  }

  const audienceMissing = mode === "patients" && chosen.length === 0;

  return (
    <Modal
      wide
      className="campaign-modal"
      eyebrow="Campanha de WhatsApp"
      title="Nova campanha"
      subtitle="Você envia uma a uma pelo seu WhatsApp; o sistema prepara cada mensagem e guarda o progresso."
      busy={working}
      dirty={dirty}
      onClose={onClose}
    >
      <ol className="campaign-steps" aria-label="Etapas">
        {steps.map(([value, label]) => (
          <li
            key={value}
            className={
              value === step ? "current" : value < step ? "done" : undefined
            }
            aria-current={value === step ? "step" : undefined}
          >
            <span aria-hidden="true">
              {value < step ? <Check size={14} /> : value}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <fieldset className="campaign-template-choice">
          <legend className="filter-label">
            Qual mensagem vai ser enviada?
          </legend>
          {active.map((item) => (
            <label
              key={item.id}
              className={`campaign-template-option ${item.id === templateId ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="campaign-template"
                className="sr-only"
                checked={item.id === templateId}
                onChange={() => change(() => setTemplateId(item.id))}
              />
              <strong>{item.title}</strong>
              <span className="campaign-template-excerpt">
                <WhatsappText text={item.body} codes />
              </span>
              {item.images.length > 0 && (
                <small>
                  <Images size={13} aria-hidden="true" />
                  {item.images.length}{" "}
                  {item.images.length === 1 ? "imagem" : "imagens"}
                </small>
              )}
            </label>
          ))}
        </fieldset>
      )}

      {step === 2 && (
        <div className="campaign-audience">
          <div
            className="campaign-segmented"
            role="group"
            aria-label="Como escolher os clientes"
          >
            <button
              type="button"
              className="text-button"
              aria-pressed={mode === "patients"}
              onClick={() => change(() => setMode("patients"))}
            >
              Escolher clientes
            </button>
            <button
              type="button"
              className="text-button"
              aria-pressed={mode === "segment"}
              onClick={() => change(() => setMode("segment"))}
            >
              Por filtros
            </button>
          </div>
          {mode === "patients" ? (
            <div className="campaign-patient-pick">
              <PatientPicker
                popover
                patients={patients}
                value={pickerValue}
                onChange={(id, patient) => {
                  const option =
                    patient ?? patients.find((item) => item.id === id);
                  if (!option) {
                    setPickerValue(id);
                    return;
                  }
                  change(() =>
                    setChosen((current) =>
                      current.some((item) => item.id === option.id)
                        ? current
                        : [...current, option],
                    ),
                  );
                  setPickerValue("");
                }}
              />
              {chosen.length === 0 ? (
                <p className="field-hint">
                  Busque pelo nome e adicione quantos clientes quiser.
                </p>
              ) : (
                <ul
                  className="campaign-chosen"
                  aria-label="Clientes escolhidos"
                >
                  {chosen.map((patient) => (
                    <li key={patient.id}>
                      {patient.fullName}
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`Tirar ${patient.fullName}`}
                        onClick={() =>
                          change(() =>
                            setChosen((current) =>
                              current.filter((item) => item.id !== patient.id),
                            ),
                          )
                        }
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="campaign-filter-layout">
              <CampaignFilters
                value={segment}
                options={filterOptions}
                patients={patients}
                onChange={(next) => change(() => setSegment(next))}
              />
              <FilterResults
                loading={!currentMatches}
                error={currentMatches?.error}
                preview={currentMatches?.preview}
              />
            </div>
          )}
        </div>
      )}

      {step === 3 && preview && template && (
        <div className="campaign-review">
          <div className="campaign-review-info">
            <label>
              Nome da campanha
              <input
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <dl className="campaign-review-numbers">
              <div>
                <dt>Vão receber</dt>
                <dd>{preview.recipients}</dd>
              </div>
              <div>
                <dt>Pulados</dt>
                <dd>{preview.skipped.length}</dd>
              </div>
            </dl>
            {preview.recipients === 0 && (
              <p className="form-error" role="alert">
                Nenhum cliente escolhido tem WhatsApp liberado. Volte e ajuste
                os clientes.
              </p>
            )}
            {preview.skipped.length > 0 && (
              <details className="campaign-skipped">
                <summary>
                  <UsersRound size={15} aria-hidden="true" />
                  Ver quem foi pulado
                </summary>
                <ul>
                  {preview.skipped.map((item) => (
                    <li key={item.patientId}>
                      <strong>{item.patientName}</strong>
                      <span>{broadcastSkipReasonLabels[item.reason]}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <div className="campaign-review-preview">
            <span className="filter-label">Prévia do primeiro envio</span>
            <SamplePreview template={template} preview={preview} />
          </div>
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        {step === 1 ? (
          <ModalCancelButton disabled={working}>Cancelar</ModalCancelButton>
        ) : (
          <button
            type="button"
            className="secondary-button"
            disabled={working}
            onClick={() => setStep((step - 1) as Step)}
          >
            Voltar
          </button>
        )}
        {step === 1 && (
          <button
            type="button"
            className="primary-button"
            disabled={!template}
            onClick={() => setStep(2)}
          >
            Continuar
          </button>
        )}
        {step === 2 && (
          <button
            type="button"
            className="primary-button"
            disabled={working || audienceMissing}
            onClick={() => void review()}
          >
            {working ? "Conferindo…" : "Conferir quem recebe"}
          </button>
        )}
        {step === 3 && (
          <button
            type="button"
            className="primary-button"
            disabled={working || !preview?.recipients || !name.trim()}
            onClick={() => void create()}
          >
            {working ? "Criando…" : "Criar e começar a enviar"}
          </button>
        )}
      </div>
    </Modal>
  );
}
