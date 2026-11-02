import {
  DEFAULT_PATIENT_TAG_COLOR,
  MISSING_CPF_TAG,
  OVERDUE_PAYMENT_TAG,
  patientTagDisplayColor,
} from "@crm/contracts";
import { PatientProfileFilters } from "./PatientProfileFilters";
import {
  type Patient,
  type PatientSegmentSummary,
  formatPhone,
} from "@crm/contracts";
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileUp,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import { ActionMenu } from "../../shared/components/ActionMenu";
import type { ActionMenuItem } from "../../shared/lib/types";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { PatientTagBadge } from "../../shared/components/PatientTagBadge";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import { TagChoice } from "../../shared/components/TagChoice";
import { usePatientTags } from "../../shared/hooks/usePatientTags";
import {
  automaticPatientTagColor,
  initials,
  tagColorLookup,
  tagCounts,
} from "../../shared/lib/formatting";
import {
  defaultPatientFilters,
  filterPatients,
  patientsPerPage,
} from "./model";
import { PatientExportModal } from "./PatientExportModal";
import { PatientImportModal } from "./PatientImportModal";
import { PatientModal } from "./PatientModal";
import type { PatientRecordFilter, PatientSort } from "./types";

const automaticTagHints: Record<string, string> = {
  [OVERDUE_PAYMENT_TAG]:
    "Etiqueta automática: cliente com parcela vencida e em aberto.",
  [MISSING_CPF_TAG]:
    "Etiqueta automática: cliente sem CPF (importado da planilha). Sai sozinha quando o CPF é preenchido.",
};
export function PatientsPage() {
  const { can, canEdit, canView } = useAuthorization();
  const navigate = useNavigate();
  const [segments, setSegments] = useState<PatientSegmentSummary[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filters, setFilters] = useState(defaultPatientFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Busca efetivamente aplicada na lista (a do campo só vale depois de "Buscar").
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const canManage = canEdit("patients");
  const canEnroll = can("groups.enroll");
  const canExport = can("patients.export");
  const configuredTags = usePatientTags();
  const tagColor = tagColorLookup(configuredTags.tags);

  // Só a busca mais recente vale: uma resposta atrasada não sobrescreve a lista.
  const latestRequest = useRef(0);
  const searchTimer = useRef<number | undefined>(undefined);
  async function load(query = search, withoutGroup = filters.withoutGroup) {
    window.clearTimeout(searchTimer.current);
    const request = ++latestRequest.current;
    setLoading(true);
    setError("");
    try {
      const data = await api.patients(query, { withoutGroup });
      if (request !== latestRequest.current) return;
      setPatients(data);
      setAppliedSearch(query);
      setPage(1);
    } catch (cause) {
      if (request === latestRequest.current) setError((cause as Error).message);
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }
  // Busca enquanto digita (U12): 350 ms depois da última tecla; Enter/Buscar continua.
  const searchTyped = useEffectEvent((value: string) => {
    if (value.trim() === appliedSearch.trim()) return;
    searchTimer.current = window.setTimeout(() => void load(value), 350);
  });
  useEffect(() => {
    searchTyped(search);
    return () => window.clearTimeout(searchTimer.current);
  }, [search]);
  useEffect(() => {
    let active = true;
    api
      .patients("")
      .then((data) => {
        if (active) setPatients(data);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visiblePatients = filterPatients(patients, filters, segments);
  const pageCount = Math.max(
    1,
    Math.ceil(visiblePatients.length / patientsPerPage),
  );
  // A página guardada pode ficar além do total (ex.: depois de remover cadastros): limita no cálculo.
  const currentPage = Math.min(page, pageCount);
  const pagePatients = visiblePatients.slice(
    (currentPage - 1) * patientsPerPage,
    currentPage * patientsPerPage,
  );
  // Filtro mostra as etiquetas configuradas (com a cor), com quantos clientes da lista têm cada uma.
  const countTag = tagCounts(patients);
  const tagOptions = configuredTags.tags ?? [];
  // Etiquetas automáticas: "Pagamento atrasado" só para quem vê o Financeiro (a API só calcula
  // para esse perfil); "Falta CPF" (B6-05) para todos.
  const automaticTagOptions = [
    ...(canView("finance") ? [OVERDUE_PAYMENT_TAG] : []),
    MISSING_CPF_TAG,
  ];
  const activeFilterCount =
    (filters.status !== "all" ? 1 : 0) +
    (filters.record !== "all" ? 1 : 0) +
    (filters.withoutGroup ? 1 : 0) +
    filters.tags.length +
    Object.values(filters.profile).filter(Boolean).length;
  // Toda mudança de filtro ou ordenação volta para a primeira página.
  function updateFilters(update: (current: typeof filters) => typeof filters) {
    setFilters(update);
    setPage(1);
  }
  function toggleTag(tag: string) {
    updateFilters((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag],
    }));
  }
  function clearFilters() {
    updateFilters((current) => ({
      ...defaultPatientFilters,
      sort: current.sort,
    }));
    if (filters.withoutGroup) void load(appliedSearch, false);
  }
  // O filtro de assinantes sem turma é da API: recarrega a lista com a busca já aplicada.
  function toggleWithoutGroup(withoutGroup: boolean) {
    updateFilters((current) => ({ ...current, withoutGroup }));
    void load(appliedSearch, withoutGroup);
  }

  const moreActions: ActionMenuItem[] = [
    ...(canManage && can("patients.import")
      ? [
          {
            label: "Importar",
            icon: <FileDown size={16} aria-hidden="true" />,
            onSelect: () => setImportOpen(true),
          },
        ]
      : []),
    ...(canExport && can("patients.export")
      ? [
          {
            label: "Exportar",
            icon: <FileUp size={16} aria-hidden="true" />,
            onSelect: () => setExportOpen(true),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cadastros, vínculos e informações essenciais em um só lugar."
        action={
          <div className="page-actions patients-actions">
            {/* V2: ações secundárias no menu "Mais"; só "Novo cliente" fica à vista. */}
            {moreActions.length > 0 && (
              <ActionMenu label="Mais" align="end" items={moreActions} />
            )}
            {canManage && can("patients.create") && (
              <button
                className="primary-button"
                onClick={() => {
                  setNotice("");
                  setModalOpen(true);
                }}
              >
                <Plus size={18} />
                Novo cliente
              </button>
            )}
          </div>
        }
      />
      {!canManage && <ReadOnlyNotice module="patients" />}
      {error && <ErrorBanner error={error} />}
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      <section className="panel patients-panel">
        <div className="list-toolbar">
          <form
            className="search-box"
            onSubmit={(event) => {
              event.preventDefault();
              void load(search);
            }}
          >
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, CPF ou telefone"
            />
            <button className="primary-button button-sm">Buscar</button>
          </form>
          <button
            type="button"
            className={`secondary-button filter-toggle ${filtersOpen ? "active" : ""}`}
            aria-expanded={filtersOpen}
            aria-controls="patient-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="filter-badge">{activeFilterCount}</span>
            )}
          </button>
          <div className="list-count" aria-live="polite">
            <strong>{visiblePatients.length}</strong>
            <span>
              {visiblePatients.length === patients.length
                ? "clientes encontrados"
                : `de ${patients.length} clientes`}
            </span>
          </div>
        </div>
        {filtersOpen && (
          <div className="patient-filters" id="patient-filters">
            <div className="patient-filters-row">
              <div className="filter-group">
                <span className="filter-label" id="patient-status-filter">
                  Situação
                </span>
                <div
                  className="segmented"
                  role="group"
                  aria-labelledby="patient-status-filter"
                >
                  {(
                    [
                      ["all", "Todos"],
                      ["active", "Ativos"],
                      ["inactive", "Inativos"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      className="segment-button"
                      type="button"
                      key={value}
                      aria-pressed={filters.status === value}
                      onClick={() =>
                        updateFilters((current) => ({
                          ...current,
                          status: value,
                        }))
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="filter-group">
                <span className="filter-label">Cadastro</span>
                <select
                  value={filters.record}
                  onChange={(event) =>
                    updateFilters((current) => ({
                      ...current,
                      record: event.target.value as PatientRecordFilter,
                    }))
                  }
                >
                  <option value="all">Todos</option>
                  <option value="with_email">Com e-mail</option>
                  <option value="without_email">Sem e-mail</option>
                  <option value="birthday_month">Aniversariantes do mês</option>
                </select>
              </label>
              <div className="filter-group">
                <span className="filter-label">Turmas</span>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={filters.withoutGroup}
                    onChange={(event) =>
                      toggleWithoutGroup(event.target.checked)
                    }
                  />
                  Assinantes sem turma vinculada
                </label>
              </div>
              <label className="filter-group">
                <span className="filter-label">Ordenar por</span>
                <select
                  value={filters.sort}
                  onChange={(event) =>
                    updateFilters((current) => ({
                      ...current,
                      sort: event.target.value as PatientSort,
                    }))
                  }
                >
                  <option value="name_asc">Nome (A–Z)</option>
                  <option value="name_desc">Nome (Z–A)</option>
                  <option value="newest">Cadastro mais recente</option>
                  <option value="oldest">Cadastro mais antigo</option>
                </select>
              </label>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  className="text-button button-sm clear-filters"
                  onClick={clearFilters}
                >
                  Limpar filtros
                </button>
              )}
            </div>
            {configuredTags.error ? (
              <div className="filter-group filter-tags">
                <span className="filter-label">Etiquetas</span>
                <p className="form-error">{`Não foi possível carregar as etiquetas: ${configuredTags.error}`}</p>
              </div>
            ) : (
              tagOptions.length + automaticTagOptions.length > 0 && (
                <div className="filter-group filter-tags">
                  <span className="filter-label" id="patient-tag-filter">
                    Etiquetas
                  </span>
                  <div
                    className="tag-filter-list"
                    role="group"
                    aria-labelledby="patient-tag-filter"
                  >
                    {tagOptions.map((tag) => (
                      <TagChoice
                        key={tag.id}
                        name={tag.name}
                        color={patientTagDisplayColor(tag)}
                        count={countTag(tag.name)}
                        pressed={filters.tags.includes(tag.name)}
                        onToggle={() => toggleTag(tag.name)}
                      />
                    ))}
                    {automaticTagOptions.map((name) => (
                      <TagChoice
                        key={`automatic-${name}`}
                        name={name}
                        color={
                          automaticPatientTagColor(name) ??
                          DEFAULT_PATIENT_TAG_COLOR
                        }
                        count={countTag(name)}
                        hint={automaticTagHints[name] ?? ""}
                        pressed={filters.tags.includes(name)}
                        onToggle={() => toggleTag(name)}
                      />
                    ))}
                  </div>
                </div>
              )
            )}
            <PatientProfileFilters
              patients={patients}
              value={filters.profile}
              onSegments={setSegments}
              onChange={(profile) =>
                updateFilters((current) => ({ ...current, profile }))
              }
            />
          </div>
        )}
        {loading ? (
          <LoadingBlock />
        ) : patients.length === 0 ? (
          <EmptyState
            title="Nenhum cliente encontrado"
            copy="Tente uma busca diferente ou crie um novo cadastro."
          />
        ) : visiblePatients.length === 0 ? (
          <div className="empty-state">
            <Search size={30} />
            <strong>Nenhum cliente com esses filtros</strong>
            <span>Ajuste os filtros para ver mais cadastros.</span>
            <button
              type="button"
              className="secondary-button"
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <>
            <div className="patient-table">
              <div className="table-row table-head">
                <span>Cliente</span>
                <span>Contato</span>
                <span>Etiquetas</span>
                <span>Situação</span>
                <span className="table-actions-head">Ações</span>
              </div>
              {pagePatients.map((patient) => (
                <div
                  className="table-row patient-row"
                  key={patient.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir ficha de ${patient.fullName}`}
                  // A linha abre a ficha (U13); editar fica no botão da coluna Ações.
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest("a, button"))
                      void navigate(`/clientes/${patient.id}`);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      void navigate(`/clientes/${patient.id}`);
                    }
                  }}
                >
                  <div className="patient-identity">
                    <span className="avatar patient-avatar">
                      {initials(patient.fullName)}
                    </span>
                    <div>
                      <strong>{patient.fullName}</strong>
                      <small>
                        {patient.nickname
                          ? `${patient.recordNumber} · "${patient.nickname}"`
                          : patient.recordNumber}
                      </small>
                    </div>
                  </div>
                  <div className="contact-cell">
                    <span>{formatPhone(patient.phone)}</span>
                    {patient.whatsapp && patient.whatsapp !== patient.phone && (
                      <small>WhatsApp {formatPhone(patient.whatsapp)}</small>
                    )}
                    <small>{patient.email || "E-mail não informado"}</small>
                  </div>
                  <div className="tags-cell">
                    {filters.withoutGroup && (
                      <>
                        <span className="status-pill paused">Sem turma</span>
                        {canEnroll && (
                          <Link
                            className="secondary-button button-sm"
                            to={`/turmas?matricular=${patient.id}`}
                            aria-label={`Matricular ${patient.fullName} em uma turma`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <UserPlus size={14} aria-hidden="true" />
                            Matricular
                          </Link>
                        )}
                      </>
                    )}
                    {patient.tags.length ? (
                      <>
                        {patient.tags.slice(0, 2).map((tag) => (
                          <PatientTagBadge
                            key={tag}
                            name={tag}
                            color={tagColor(tag)}
                          />
                        ))}
                        {patient.tags.length > 2 && (
                          <span
                            className="tag-more"
                            title={patient.tags.slice(2).join(", ")}
                            aria-label={`Mais ${patient.tags.length - 2} ${patient.tags.length - 2 === 1 ? "etiqueta" : "etiquetas"}: ${patient.tags.slice(2).join(", ")}`}
                          >
                            +{patient.tags.length - 2}
                          </span>
                        )}
                      </>
                    ) : (
                      <small>Sem etiquetas</small>
                    )}
                  </div>
                  <span
                    className={`active-label ${patient.status === "inactive" ? "inactive" : ""}`}
                  >
                    <i />
                    {patient.status === "inactive" ? "Inativo" : "Ativo"}
                  </span>
                  <div className="table-actions">
                    <button
                      type="button"
                      className="secondary-button button-sm"
                      aria-label={`Editar ${patient.fullName}`}
                      onClick={() => setEditingPatient(patient)}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {pageCount > 1 && (
              <nav
                className="list-pagination"
                aria-label="Paginação de clientes"
              >
                <button
                  type="button"
                  className="secondary-button"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  Anterior
                </button>
                <span className="list-pagination-status" aria-live="polite">
                  {`Página ${currentPage} de ${pageCount} · ${visiblePatients.length} ${
                    visiblePatients.length === 1 ? "cliente" : "clientes"
                  }`}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Próxima
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </section>
      {(modalOpen || editingPatient) && (
        <PatientModal
          patient={editingPatient ?? undefined}
          configuredTags={configuredTags}
          onClose={() => {
            setModalOpen(false);
            setEditingPatient(null);
          }}
          onSaved={(patient, savedNotice) => {
            setPatients((current) =>
              [
                ...current.filter((item) => item.id !== patient.id),
                patient,
              ].sort((a, b) => a.fullName.localeCompare(b.fullName)),
            );
            setNotice(savedNotice ?? "");
            setModalOpen(false);
            setEditingPatient(null);
          }}
        />
      )}
      {importOpen && (
        <PatientImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => void load()}
        />
      )}
      {exportOpen && (
        <PatientExportModal
          filters={filters}
          search={appliedSearch}
          tagColor={tagColor}
          onClose={() => setExportOpen(false)}
        />
      )}
    </>
  );
}
