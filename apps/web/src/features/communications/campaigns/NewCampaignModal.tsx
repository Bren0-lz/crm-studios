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
import {
  Check,
  Images,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../../api";
import { PatientPicker } from "../../../PatientPicker";
import { Modal, ModalCancelButton } from "../../../shared/components/Modal";
import { shortDate } from "../../../shared/lib/formatting";
import { useFormDirty } from "../../../shared/workflows/useDirtyGuard";
import { CampaignFiltersModal } from "./CampaignFiltersModal";
import { useTemplateImages } from "./images";
import {
  activeFilterCount,
  emptyCampaignSegment,
  filterGroupCounts,
  filterGroupLabels,
  type CampaignFilterGroup,
} from "./model";
import { useSegmentPreview } from "./useSegmentPreview";
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

/** Lista ao vivo de quem o filtro encontrou e vai receber a campanha. */
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
    ? [...preview.included]
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
      <header className="campaign-audience-total" role="status">
        {loading ? (
          <strong>Buscando clientes…</strong>
        ) : error ? (
          <strong>Não foi possível buscar os clientes</strong>
        ) : (
          <>
            <span className="campaign-audience-number">
              {preview!.recipients}
            </span>
            <span>
              <strong>
                {preview!.recipients === 1
                  ? "cliente vai receber esta campanha"
                  : "clientes vão receber esta campanha"}
              </strong>
              <small>
                {preview!.matched}{" "}
                {preview!.matched === 1
                  ? "cliente encontrado"
                  : "clientes encontrados"}
                {preview!.skipped.length > 0 &&
                  ` · ${preview!.skipped.length} ${preview!.skipped.length === 1 ? "será pulado" : "serão pulados"} (sem WhatsApp liberado)`}
              </small>
            </span>
          </>
        )}
      </header>
      {error && <p className="form-error">{error}</p>}
      {preview && preview.recipients > 0 && (
        <>
          {preview.recipients > 8 && (
            <label className="campaign-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar entre os clientes que vão receber"
                placeholder="Buscar entre os que vão receber"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          )}
          <ul className="campaign-filter-list" aria-label="Vão receber">
            {rows.map((row) => (
              <li key={row.patientId}>
                <span className="campaign-filter-avatar" aria-hidden="true">
                  {row.patientName.trim().charAt(0).toUpperCase()}
                </span>
                <span>
                  <strong>{row.patientName}</strong>
                  <small>{formatPhone(row.phone)}</small>
                </span>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="campaign-filter-empty">Ninguém com esse nome.</li>
            )}
          </ul>
        </>
      )}
      {preview && preview.matched > 0 && preview.recipients === 0 && (
        <p className="field-hint">
          Nenhum dos clientes encontrados tem WhatsApp liberado.
        </p>
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

  // Por filtros: mostra na hora quem entra no segmento aplicado.
  const matches = useSegmentPreview(
    mode === "segment" && step === 2 && template ? template.id : "",
    segment,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const groupCounts = filterGroupCounts(segment);
  const activeGroups = (
    Object.keys(filterGroupLabels) as CampaignFilterGroup[]
  ).filter((group) => groupCounts[group] > 0);
  const totalFilters = activeFilterCount(segment);

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
      inactive={filtersOpen}
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
                <>
                  <p className="campaign-chosen-count" role="status">
                    <strong>{chosen.length}</strong>{" "}
                    {chosen.length === 1
                      ? "cliente escolhido para esta campanha"
                      : "clientes escolhidos para esta campanha"}
                  </p>
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
                                current.filter(
                                  (item) => item.id !== patient.id,
                                ),
                              ),
                            )
                          }
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="campaign-filter-bar">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setFiltersOpen(true)}
                >
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  Filtros
                  {totalFilters > 0 && (
                    <span className="campaign-filter-badge">
                      {totalFilters}
                    </span>
                  )}
                </button>
                <ul
                  className="campaign-filter-summary"
                  aria-label="Filtros ligados"
                >
                  {activeGroups.length === 0 ? (
                    <li>Todos os clientes</li>
                  ) : (
                    activeGroups.map((group) => (
                      <li key={group}>
                        {filterGroupLabels[group]}
                        {groupCounts[group] > 1 && ` (${groupCounts[group]})`}
                      </li>
                    ))
                  )}
                </ul>
                {totalFilters > 0 && (
                  <button
                    type="button"
                    className="text-button button-sm"
                    onClick={() =>
                      change(() => setSegment(emptyCampaignSegment()))
                    }
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    Limpar filtros
                  </button>
                )}
              </div>
              <FilterResults
                loading={matches.loading}
                error={matches.error}
                preview={matches.preview}
              />
            </>
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
      {filtersOpen &&
        template &&
        createPortal(
          <CampaignFiltersModal
            templateId={template.id}
            initial={segment}
            options={filterOptions}
            patients={patients}
            onApply={(next) => {
              change(() => setSegment(next));
              setFiltersOpen(false);
            }}
            onClose={() => setFiltersOpen(false)}
          />,
          document.body,
        )}
    </Modal>
  );
}
