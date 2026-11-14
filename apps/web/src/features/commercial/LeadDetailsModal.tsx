import {
  type Lead,
  type LeadContact,
  type LeadStage,
  type LeadStageChange,
  formatCpf,
  formatPhone,
} from "@crm/contracts";
import { ArrowRightLeft, Pencil } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import {
  formatIsoDate,
  shortDateTime,
} from "../../shared/lib/formatting";
import { SendToTrashModal, TrashIconButton } from "../trash";
import { LeadContactTimeline } from "./LeadContactTimeline";
import { LeadStageTimeline } from "./LeadStageTimeline";
import { mergeLeadContacts } from "./lead-contact-history";

/** Dado exibido só quando preenchido. */
function Detail({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  if (!value?.trim()) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const tabs = [
  { key: "details", label: "Detalhes" },
  { key: "moves", label: "Movimentações" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

/**
 * Detalhes do lead, abertos ao clicar no cartão do funil: contato, origem, interesse,
 * responsável, histórico completo de contatos com data e hora e, para leads perdidos,
 * o motivo da perda e as observações em destaque. A aba "Movimentações" lista todas as
 * trocas de etapa do lead no funil.
 */
export function LeadDetailsModal({
  lead,
  contacts,
  stageLabel,
  stageName,
  canEdit,
  onClose,
  onEdit,
  onTrashed,
}: {
  lead: Lead;
  contacts?: LeadContact[] | undefined;
  /** Nome da etapa atual (a clínica pode renomear as colunas). */
  stageLabel: string;
  /** Nome de uma etapa qualquer do funil; `undefined` se ela não existe mais. */
  stageName: (stage: LeadStage) => string | undefined;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  /** Lead enviado para a lixeira pelo botão "Excluir" (exige `trash.send`). */
  onTrashed?: (lead: Lead) => void;
}) {
  const { can } = useAuthorization();
  const [trashing, setTrashing] = useState(false);
  const canTrash = Boolean(onTrashed) && can("trash.send");
  const id = useId();
  const [tab, setTab] = useState<TabKey>("details");
  const [fetched, setFetched] = useState<LeadContact[] | null>(null);
  const [moves, setMoves] = useState<LeadStageChange[] | null>(null);
  const [movesError, setMovesError] = useState("");
  const loadingContacts = fetched === null;

  useEffect(() => {
    let active = true;
    api
      .leadActivity(lead.id)
      .then((data) => {
        if (active) {
          setFetched(Array.isArray(data?.contacts) ? data.contacts : []);
          setMoves(Array.isArray(data?.stageHistory) ? data.stageHistory : []);
          setMovesError("");
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFetched([]);
        setMoves([]);
        setMovesError(
          error instanceof Error && error.message
            ? error.message
            : "Não foi possível carregar as movimentações.",
        );
      });
    return () => {
      active = false;
    };
  }, [
    lead.id,
    lead.stage,
    lead.contactCount,
    lead.lastMessageSentAt,
    lead.lastContactAt,
  ]);

  const history = mergeLeadContacts(lead, fetched, contacts);
  const totalContacts = Math.max(lead.contactCount ?? 0, history.length);
  const lost = lead.stage === "lost";
  const notes = lead.notes?.trim();
  const tasks =
    lead.openTasks > 0
      ? `${lead.openTasks} aberta(s)${lead.overdueTasks > 0 ? ` · ${lead.overdueTasks} atrasada(s)` : ""}`
      : "Nenhuma aberta";
  const place = [lead.neighborhood, lead.city].filter(Boolean).join(" · ");
  return (
    <>
      <Modal
        eyebrow="CRM comercial"
        title={lead.fullName}
        subtitle={`Etapa: ${stageLabel}`}
        initialFocus='[role="tab"][aria-selected="true"]'
        inactive={trashing}
        onClose={onClose}
      >
        <div className="clinical-form lead-details">
          <div
            className="group-modal-tabs"
            role="tablist"
            aria-label="Detalhes do lead"
          >
            {tabs.map(({ key, label }, index) => (
              <button
                key={key}
                type="button"
                role="tab"
                className="secondary-button"
                id={`${id}-${key}-tab`}
                aria-controls={`${id}-${key}-panel`}
                aria-selected={tab === key}
                tabIndex={tab === key ? 0 : -1}
                onClick={() => setTab(key)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : event.key === "ArrowRight"
                          ? (index + 1) % tabs.length
                          : event.key === "ArrowLeft"
                            ? (index + tabs.length - 1) % tabs.length
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  setTab(tabs[next]!.key);
                  document
                    .getElementById(`${id}-${tabs[next]!.key}-tab`)
                    ?.focus();
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            className="lead-details-panel"
            id={`${id}-details-panel`}
            aria-labelledby={`${id}-details-tab`}
            hidden={tab !== "details"}
          >
            {lost && (
              <section className="lead-details-lost" aria-label="Perda do lead">
                <dl>
                  <div>
                    <dt>Motivo da perda</dt>
                    <dd>{lead.lostReason?.trim() || "Não informado"}</dd>
                  </div>
                  <div>
                    <dt>Observações</dt>
                    <dd className="lead-details-notes">
                      {notes || "Sem observações"}
                    </dd>
                  </div>
                </dl>
              </section>
            )}
            {lead.convertedPatientId && (
              <p className="success-banner">Convertido em cliente.</p>
            )}
            <dl className="lead-details-grid">
              <Detail label="Telefone" value={formatPhone(lead.phone)} />
              <Detail
                label="WhatsApp"
                value={lead.whatsapp ? formatPhone(lead.whatsapp) : undefined}
              />
              <Detail label="E-mail" value={lead.email} />
              <Detail label="Origem" value={lead.source} />
              <Detail label="Interesse" value={lead.interest} />
              <Detail label="Forma de contato" value={lead.contactMethod} />
              <Detail label="Responsável" value={lead.responsibleName} />
              <Detail label="Etiquetas" value={lead.tags.join(", ")} />
              <Detail label="Tarefas" value={tasks} />
              <Detail
                label="Último contato"
                value={
                  lead.lastContactAt
                    ? shortDateTime(lead.lastContactAt)
                    : undefined
                }
              />
              <Detail
                label="Última mensagem enviada"
                value={
                  lead.lastMessageSentAt
                    ? shortDateTime(lead.lastMessageSentAt)
                    : undefined
                }
              />
              <Detail
                label="Cadastrado em"
                value={shortDateTime(lead.createdAt)}
              />
              <Detail
                label="Atualizado em"
                value={shortDateTime(lead.updatedAt)}
              />
              <Detail
                label="CPF"
                value={lead.cpf ? formatCpf(lead.cpf) : undefined}
              />
              <Detail
                label="Nascimento"
                value={
                  lead.birthDate ? formatIsoDate(lead.birthDate) : undefined
                }
              />
              <Detail label="Profissão" value={lead.occupation} />
              <Detail label="Bairro · cidade" value={place} />
            </dl>
            {!lost && notes && (
              <dl className="lead-details-grid">
                <div className="lead-details-wide">
                  <dt>Observações</dt>
                  <dd className="lead-details-notes">{notes}</dd>
                </div>
              </dl>
            )}
            <section
              className="lead-details-contacts"
              aria-label="Histórico de contatos"
            >
              <header className="lead-details-contacts-head">
                <h3>Histórico de contatos</h3>
                {totalContacts > 0 && (
                  <span>
                    {totalContacts === 1
                      ? "1 contato"
                      : `${totalContacts} contatos`}
                  </span>
                )}
              </header>
              {loadingContacts && history.length === 0 ? (
                <p className="contact-timeline-empty">
                  Carregando histórico...
                </p>
              ) : (
                <LeadContactTimeline contacts={history} />
              )}
            </section>
          </div>
          <div
            role="tabpanel"
            className="lead-details-panel"
            id={`${id}-moves-panel`}
            aria-labelledby={`${id}-moves-tab`}
            hidden={tab !== "moves"}
          >
            {moves === null ? (
              <LoadingBlock />
            ) : movesError ? (
              <ErrorBanner error={movesError} />
            ) : moves.length === 0 ? (
              <EmptyState
                icon={ArrowRightLeft}
                title="Nenhuma movimentação"
                copy="Este lead ainda não mudou de etapa no funil."
              />
            ) : (
              <LeadStageTimeline
                lead={lead}
                changes={moves}
                stageLabel={stageName}
              />
            )}
          </div>
          <div className="modal-actions">
            {canTrash && (
              <TrashIconButton
                label="Excluir"
                onClick={() => setTrashing(true)}
              />
            )}
            {canEdit && !lead.convertedPatientId && (
              <button type="button" className="primary-button" onClick={onEdit}>
                <Pencil size={16} aria-hidden="true" />
                Editar cadastro
              </button>
            )}
          </div>
        </div>
      </Modal>
      {trashing && onTrashed && (
        <SendToTrashModal
          kind="leads"
          id={lead.id}
          title={lead.fullName}
          onClose={() => setTrashing(false)}
          onDone={() => onTrashed(lead)}
        />
      )}
    </>
  );
}
