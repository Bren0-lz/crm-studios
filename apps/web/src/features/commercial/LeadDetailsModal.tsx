import {
  type Lead,
  type LeadContact,
  formatCpf,
  formatPhone,
} from "@crm/contracts";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { Modal } from "../../shared/components/Modal";
import {
  formatIsoDate,
  shortDate,
  shortDateTime,
} from "../../shared/lib/formatting";
import { LeadContactTimeline } from "./LeadContactTimeline";
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

function dateText(iso: string | undefined) {
  return iso ? shortDate.format(new Date(iso)) : undefined;
}

/**
 * Detalhes do lead, abertos ao clicar no cartão do funil: contato, origem, interesse,
 * responsável, histórico completo de contatos com data e hora e, para leads perdidos,
 * o motivo da perda e as observações em destaque.
 */
export function LeadDetailsModal({
  lead,
  contacts,
  stageLabel,
  canEdit,
  onClose,
  onEdit,
}: {
  lead: Lead;
  contacts?: LeadContact[] | undefined;
  /** Nome da etapa atual (a clínica pode renomear as colunas). */
  stageLabel: string;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [fetched, setFetched] = useState<LeadContact[] | null>(null);
  const loadingContacts = fetched === null;

  useEffect(() => {
    let active = true;
    api
      .leadActivity(lead.id)
      .then((data) => {
        if (active) {
          setFetched(Array.isArray(data?.contacts) ? data.contacts : []);
        }
      })
      .catch(() => {
        if (active) setFetched([]);
      });
    return () => {
      active = false;
    };
  }, [lead.id, lead.contactCount, lead.lastMessageSentAt, lead.lastContactAt]);

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
    <Modal
      eyebrow="CRM comercial"
      title={lead.fullName}
      subtitle={`Etapa: ${stageLabel}`}
      onClose={onClose}
    >
      <div className="clinical-form lead-details">
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
              lead.lastContactAt ? shortDateTime(lead.lastContactAt) : undefined
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
          <Detail label="Cadastrado em" value={dateText(lead.createdAt)} />
          <Detail label="Atualizado em" value={dateText(lead.updatedAt)} />
          <Detail
            label="CPF"
            value={lead.cpf ? formatCpf(lead.cpf) : undefined}
          />
          <Detail
            label="Nascimento"
            value={lead.birthDate ? formatIsoDate(lead.birthDate) : undefined}
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
            <p className="contact-timeline-empty">Carregando histórico...</p>
          ) : (
            <LeadContactTimeline contacts={history} />
          )}
        </section>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Fechar
          </button>
          {canEdit && !lead.convertedPatientId && (
            <button type="button" className="primary-button" onClick={onEdit}>
              <Pencil size={16} aria-hidden="true" />
              Editar cadastro
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
