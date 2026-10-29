import {
  assessmentAnswerGroups,
  patientTagKey,
  type AssessmentTemplate,
  type ClinicalAssessment,
} from "@crm/contracts";
import { ClipboardList, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { shortDate, timeLabel } from "../../shared/lib/formatting";
import { groupAssessmentsByTemplate } from "./assessment-forms";

function dateTime(iso: string) {
  const date = new Date(iso);
  return `${shortDate.format(date)} · ${timeLabel.format(date)}`;
}

function localDay(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Aba "Avaliações" do prontuário: todas as avaliações do cliente separadas por tipo de
 * formulário, com filtros por tipo, profissional, período e texto das respostas.
 */
export function ChartAssessmentsTab({
  assessments,
  templates,
  editable,
  onNew,
}: {
  assessments: ClinicalAssessment[];
  templates: AssessmentTemplate[];
  editable: boolean;
  onNew: () => void;
}) {
  const { can } = useAuthorization();
  const [familyFilter, setFamilyFilter] = useState("all");
  const [author, setAuthor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const groups = groupAssessmentsByTemplate(assessments, templates);
  const authors = [...new Set(assessments.map((item) => item.authorName))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  const term = patientTagKey(query);
  const filtered = groups
    .filter(
      (group) => familyFilter === "all" || group.familyId === familyFilter,
    )
    .map((group) => ({
      ...group,
      items: group.items.filter(({ assessment, template }) => {
        const day = localDay(assessment.createdAt);
        if (author && assessment.authorName !== author) return false;
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (!term) return true;
        const text = assessmentAnswerGroups(
          template?.fields ?? [],
          assessment.values,
        )
          .flatMap((answerGroup) =>
            answerGroup.answers.map((answer) => answer.value),
          )
          .concat(assessment.notes ?? "")
          .join(" ");
        return patientTagKey(text).includes(term);
      }),
    }))
    .filter((group) => group.items.length > 0);
  const filtering = Boolean(author || from || to || term);

  return (
    <div className="chart-tab">
      <div className="chart-tab-toolbar">
        <p className="panel-context">
          {assessments.length === 0
            ? "Formulários preenchidos com os modelos da clínica."
            : `${assessments.length} ${assessments.length === 1 ? "avaliação registrada" : "avaliações registradas"} em ${groups.length} ${groups.length === 1 ? "tipo" : "tipos"}.`}
        </p>
        <span className="page-actions">
          {can("clinical.templates_create") && (
            <Link
              className="text-button button-sm"
              to="/prontuarios?aba=modelos"
            >
              Gerenciar modelos
            </Link>
          )}
          {editable && can("clinical.assessments_create") && (
            <button type="button" className="primary-button" onClick={onNew}>
              <ClipboardList size={16} /> Registrar avaliação
            </button>
          )}
        </span>
      </div>
      {assessments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma avaliação registrada"
          copy="Use Registrar avaliação e escolha um formulário (anamnese, postural, ficha de inscrição…)."
        />
      ) : (
        <>
          <div
            className="tag-filter-list"
            role="group"
            aria-label="Tipo de avaliação"
          >
            <button
              type="button"
              className="tag-filter"
              aria-pressed={familyFilter === "all"}
              onClick={() => setFamilyFilter("all")}
            >
              Todas · {assessments.length}
            </button>
            {groups.map((group) => (
              <button
                type="button"
                key={group.familyId}
                className="tag-filter"
                aria-pressed={familyFilter === group.familyId}
                onClick={() => setFamilyFilter(group.familyId)}
              >
                {group.name} · {group.items.length}
              </button>
            ))}
          </div>
          <div className="assessment-filters">
            <label className="chart-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar nas respostas"
                placeholder="Buscar nas respostas"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {authors.length > 1 && (
              <label>
                Profissional
                <select
                  value={author}
                  onChange={(event) => setAuthor(event.target.value)}
                >
                  <option value="">Todos</option>
                  {authors.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              De
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label>
              Até
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
            {filtering && (
              <button
                type="button"
                className="text-button button-sm"
                onClick={() => {
                  setAuthor("");
                  setFrom("");
                  setTo("");
                  setQuery("");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
          {filtered.length === 0 ? (
            <p className="muted-copy">Nenhuma avaliação com esses filtros.</p>
          ) : (
            filtered.map((group) => (
              <section
                key={group.familyId}
                className="assessment-group"
                aria-label={group.name}
              >
                <header>
                  <h3>{group.name}</h3>
                  <p className="panel-context">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "avaliação" : "avaliações"} ·
                    última em{" "}
                    {shortDate.format(
                      new Date(group.items[0]!.assessment.createdAt),
                    )}
                  </p>
                </header>
                <div className="chart-assessments">
                  {group.items.map(({ assessment, template }, index) => {
                    const answerGroups = assessmentAnswerGroups(
                      template?.fields ?? [],
                      assessment.values,
                    );
                    const count = answerGroups.reduce(
                      (total, item) => total + item.answers.length,
                      0,
                    );
                    return (
                      <details
                        className="chart-assessment"
                        key={assessment.id}
                        open={index === 0 && familyFilter !== "all"}
                      >
                        <summary>
                          <span>
                            <strong>{dateTime(assessment.createdAt)}</strong>
                            <small>
                              {assessment.authorName}
                              {template && template.version > 1
                                ? ` · versão ${template.version} do modelo`
                                : ""}
                            </small>
                          </span>
                          <span className="chart-assessment-count">
                            {count} {count === 1 ? "resposta" : "respostas"}
                          </span>
                        </summary>
                        {answerGroups.map((answerGroup, groupIndex) => (
                          <div
                            className="chart-assessment-section"
                            key={answerGroup.title ?? `grupo-${groupIndex}`}
                          >
                            {answerGroup.title && <h4>{answerGroup.title}</h4>}
                            <dl>
                              {answerGroup.answers.map((answer) => (
                                <div key={answer.key}>
                                  <dt>{answer.label}</dt>
                                  <dd>{answer.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ))}
                        {assessment.notes && (
                          <p className="chart-assessment-notes">
                            {assessment.notes}
                          </p>
                        )}
                      </details>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
