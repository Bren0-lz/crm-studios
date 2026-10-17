import { CommercialFilters } from "./CommercialFilters";
import {
  matchesLead,
  buildLeadInsights,
  type LeadFilter,
} from "@crm/contracts";
import { type Lead, type LeadStage, formatPhone } from "@crm/contracts";
import { CalendarDays, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import {
  shortDate,
  timeLabel,
  visitTypeLabels,
} from "../../shared/lib/formatting";
import { leadStages } from "../relationship/index";
import { LeadActivityModal } from "./LeadActivityModal";
import { LeadAppointmentModal } from "./LeadAppointmentModal";
import { LeadConvertModal } from "./LeadConvertModal";
import { LeadLostModal } from "./LeadLostModal";
import { LeadModal } from "./LeadModal";

export function CommercialPage() {
  const { can, canEdit } = useAuthorization();
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  useEffect(() => {
    let active = true;
    api
      .clinicBranding()
      .then((branding) => {
        if (active && branding.timezone) setTimezone(branding.timezone);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activityLead, setActivityLead] = useState<Lead | null>(null);
  const [trialLead, setTrialLead] = useState<Lead | null>(null);
  const [notice, setNotice] = useState("");
  const [losingLead, setLosingLead] = useState<Lead | null>(null);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [filter, setFilter] = useState<LeadFilter>({});
  const canManage = canEdit("crm");
  useEffect(() => {
    let active = true;
    api
      .leads()
      .then((data) => {
        if (active) setLeads(data);
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
  function replaceLead(lead: Lead) {
    setLeads((items) => [lead, ...items.filter((item) => item.id !== lead.id)]);
  }
  async function move(lead: Lead, stage: LeadStage) {
    if (stage === "won") return;
    // Perda pede o motivo num modal próprio; o seletor só muda depois de confirmar.
    if (stage === "lost") {
      setLosingLead(lead);
      return;
    }
    setError("");
    try {
      replaceLead(await api.moveLead(lead.id, stage));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function markLost(lead: Lead, reason: string) {
    replaceLead(await api.moveLead(lead.id, "lost", reason));
    setLosingLead(null);
  }
  async function convert(lead: Lead) {
    const result = await api.convertLead(lead.id);
    replaceLead(result.lead);
    setConvertingLead(null);
  }
  const visibleLeads = leads.filter((lead) =>
    matchesLead(lead, filter, timezone),
  );
  const insights = buildLeadInsights(visibleLeads);
  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        title="CRM comercial"
        description="Acompanhe cada oportunidade desde o primeiro contato até a conversão."
        action={
          canManage
            ? can("crm.create") && (
                <button
                  className="primary-button"
                  onClick={() => setModalOpen(true)}
                >
                  <Plus size={18} />
                  Novo lead
                </button>
              )
            : undefined
        }
      />
      {!canManage && <ReadOnlyNotice module="crm" />}
      {error && <ErrorBanner error={error} />}
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <CommercialFilters
            leads={leads}
            visible={visibleLeads}
            filter={filter}
            onChange={setFilter}
          />
          <section className="commercial-metrics">
            <div>
              <strong>{insights.open}</strong>
              <span>oportunidades abertas</span>
            </div>
            <div>
              <strong>{insights.won}</strong>
              <span>conversões</span>
            </div>
            <div>
              <strong>{insights.conversionRate}%</strong>
              <span>taxa de conversão</span>
            </div>
          </section>
          {visibleLeads.length === 0 ? (
            !error && (
              <section className="panel">
                <EmptyState
                  title="Nenhum lead cadastrado"
                  copy={
                    canManage
                      ? "Cadastre o primeiro interessado para acompanhar o contato até a conversão."
                      : "Os leads cadastrados pela equipe aparecem aqui."
                  }
                  action={
                    canManage
                      ? can("crm.create") && (
                          <button
                            className="primary-button"
                            onClick={() => setModalOpen(true)}
                          >
                            <Plus size={18} />
                            Cadastrar primeiro lead
                          </button>
                        )
                      : undefined
                  }
                />
              </section>
            )
          ) : (
            <div className="kanban-board">
              {leadStages.map((stage) => (
                <section className="kanban-column" key={stage.value}>
                  <header>
                    <strong>{stage.label}</strong>
                    <span>
                      {
                        visibleLeads.filter(
                          (lead) => lead.stage === stage.value,
                        ).length
                      }
                    </span>
                  </header>
                  <div>
                    {!visibleLeads.some(
                      (lead) => lead.stage === stage.value,
                    ) && <p className="kanban-empty-hint">{stage.hint}</p>}
                    {visibleLeads
                      .filter((lead) => lead.stage === stage.value)
                      .map((lead) => (
                        <article className="lead-card" key={lead.id}>
                          <span className="lead-source">{lead.source}</span>
                          <h3>{lead.fullName}</h3>
                          <p>{lead.interest}</p>
                          <small>{formatPhone(lead.phone)}</small>
                          {lead.responsibleName && (
                            <span className="lead-owner">
                              {lead.responsibleName}
                            </span>
                          )}
                          {lead.tags.length > 0 && (
                            <div className="lead-tags">
                              {lead.tags.map((tag) => (
                                <span key={tag}>{tag}</span>
                              ))}
                            </div>
                          )}
                          <div className="lead-activity-summary">
                            <span
                              className={lead.overdueTasks ? "overdue" : ""}
                            >
                              {lead.openTasks} tarefa(s)
                              {lead.overdueTasks > 0
                                ? ` · ${lead.overdueTasks} atrasada(s)`
                                : ""}
                            </span>
                            <button
                              className="text-button button-sm"
                              onClick={() => setActivityLead(lead)}
                            >
                              Atividades
                            </button>
                          </div>
                          {!lead.convertedPatientId && can("crm.update") && (
                            <button
                              className="text-button button-sm"
                              onClick={() => setEditingLead(lead)}
                            >
                              Editar cadastro
                            </button>
                          )}
                          {lead.lostReason && (
                            <div className="lost-reason">{lead.lostReason}</div>
                          )}
                          {canManage &&
                            !["won", "lost"].includes(lead.stage) && (
                              <div className="lead-actions">
                                <select
                                  value={lead.stage}
                                  disabled={!can("crm.stage")}
                                  onChange={(event) =>
                                    void move(
                                      lead,
                                      event.target.value as LeadStage,
                                    )
                                  }
                                >
                                  {leadStages
                                    .filter((item) => item.value !== "won")
                                    .map((item) => (
                                      <option
                                        value={item.value}
                                        key={item.value}
                                      >
                                        {item.label}
                                      </option>
                                    ))}
                                </select>
                                {can("crm.convert", "patients.create") && (
                                  <button
                                    className="primary-button button-sm"
                                    onClick={() => setConvertingLead(lead)}
                                  >
                                    Converter
                                  </button>
                                )}
                                {!lead.convertedPatientId &&
                                  can(
                                    "crm.appointments_create",
                                    "agenda.create",
                                  ) && (
                                    <button
                                      className="secondary-button button-sm lead-trial-button"
                                      onClick={() => {
                                        setNotice("");
                                        setTrialLead(lead);
                                      }}
                                    >
                                      <CalendarDays size={14} />
                                      Agendar experimental
                                    </button>
                                  )}
                              </div>
                            )}
                        </article>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
      {editingLead && (
        <LeadModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onCreated={(lead) => {
            replaceLead(lead);
            setEditingLead(null);
          }}
        />
      )}
      {modalOpen && (
        <LeadModal
          onClose={() => setModalOpen(false)}
          onCreated={(lead) => {
            replaceLead(lead);
            setModalOpen(false);
          }}
        />
      )}
      {losingLead && (
        <LeadLostModal
          lead={losingLead}
          onClose={() => setLosingLead(null)}
          onConfirm={(reason) => markLost(losingLead, reason)}
        />
      )}
      {convertingLead && (
        <LeadConvertModal
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
          onConfirm={() => convert(convertingLead)}
        />
      )}
      {trialLead && (
        <LeadAppointmentModal
          lead={trialLead}
          onClose={() => setTrialLead(null)}
          onCreated={(appointment) => {
            const startsAt = new Date(appointment.startsAt);
            setNotice(
              `${visitTypeLabels[appointment.visitType]} agendada para ${trialLead.fullName} em ${shortDate.format(startsAt)} às ${timeLabel.format(startsAt)}.`,
            );
            setTrialLead(null);
          }}
        />
      )}
      {activityLead && (
        <LeadActivityModal
          lead={activityLead}
          editable={canManage}
          onClose={() => setActivityLead(null)}
          onChanged={() => {
            api
              .leads()
              .then(setLeads)
              .catch((cause: Error) => setError(cause.message));
          }}
        />
      )}
    </>
  );
}
