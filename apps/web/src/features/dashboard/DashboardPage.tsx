import type {
  Appointment,
  DashboardViewSummary,
  GroupSession,
  Professional,
  SalesReport,
} from "@crm/contracts";
import {
  BellRing,
  CalendarDays,
  ChevronRight,
  LayoutDashboard,
  Plus,
  Users,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { api, getStoredUser } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { AppointmentRow } from "../../shared/components/AppointmentRow";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import {
  dateLabel,
  initials,
  localIsoDate,
  shortDate,
} from "../../shared/lib/formatting";
import type { DashboardAppointmentAction } from "../../shared/lib/types";
import { BirthdayDashboardCard } from "./BirthdayDashboardCard";
import { useToast } from "../../shared/feedback/toast-context";
import { appointmentStatusToast } from "../agenda/index";
import { AutoCampaignQueuePanel } from "../communications/index";
import {
  agendaViewLabel,
  storeAgendaView,
  storedAgendaView,
} from "./agenda-view";
import { DashboardAgendaViewModal } from "./DashboardAgendaViewModal";
import { DashboardAppointmentDialog } from "./DashboardAppointmentDialog";
import { DashboardGroupSessionRow } from "./DashboardGroupSessionRow";

type DashboardTab = "resumo" | "campanhas";
const dashboardTabs: Array<{
  key: DashboardTab;
  label: string;
  icon: typeof BellRing;
}> = [
  { key: "resumo", label: "Resumo do dia", icon: LayoutDashboard },
  { key: "campanhas", label: "Campanhas automáticas", icon: BellRing },
];

function appointmentCounts(appointment: Appointment, date: string) {
  const isToday = localIsoDate(new Date(appointment.startsAt)) === date;
  return {
    appointmentsToday: Number(isToday),
    nonCancelledAppointmentsToday: Number(
      isToday && appointment.status !== "cancelled",
    ),
    pendingToday: Number(
      isToday &&
        (appointment.status === "scheduled" ||
          appointment.status === "confirmed"),
    ),
    awaitingConfirmationToday: Number(
      isToday && appointment.status === "scheduled",
    ),
    completedToday: Number(isToday && appointment.status === "completed"),
  };
}

export function DashboardPage() {
  const { can, canView, user } = useAuthorization();
  const [data, setData] = useState<DashboardViewSummary | null>(null);
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([]);
  const [groupSessionsError, setGroupSessionsError] = useState("");
  const [error, setError] = useState("");
  const [appointmentAction, setAppointmentAction] =
    useState<DashboardAppointmentAction | null>(null);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const savingRef = useRef(false);
  const summaryRequest = useRef(0);
  const salesRequest = useRef(0);
  const actionTrigger = useRef<HTMLElement | null>(null);
  const agendaLink = useRef<HTMLAnchorElement>(null);
  const today = localIsoDate();
  const firstName = getStoredUser()?.fullName?.split(" ")[0];
  const canSeeSales = can("reports.sales");
  const canSeeRelationship = canView("relationship");
  const canSeeAgenda = canView("agenda");
  // Fila das campanhas automáticas em aba própria (link do sino: `/?aba=campanhas`).
  const canSeeAutoCampaigns = canView("communications");
  const [searchParams] = useSearchParams();
  const tabsId = useId();
  const [tab, setTab] = useState<DashboardTab>(() =>
    searchParams.get("aba") === "campanhas" ? "campanhas" : "resumo",
  );
  const [autoVisited, setAutoVisited] = useState(tab === "campanhas");
  // Sem "ver todos", a API já devolve só a agenda do profissional ligado ao usuário.
  const canChooseAgenda = canSeeAgenda && can("agenda.view_all");
  const [agendaView, setAgendaView] = useState<string[]>(() =>
    canChooseAgenda ? storedAgendaView(user?.id) : [],
  );
  const agendaViewQuery = agendaView.join(",");
  const [agendaViewOpen, setAgendaViewOpen] = useState(false);
  const [professionals, setProfessionals] = useState<Professional[] | null>(
    null,
  );
  const [professionalsError, setProfessionalsError] = useState("");
  const [ownProfessionalId, setOwnProfessionalId] = useState<string | null>(
    null,
  );
  const agendaViewButton = useRef<HTMLButtonElement>(null);
  // Mutações na agenda, no financeiro e nos planos refazem o painel em silêncio (QC6).
  const dataVersion = useDataVersion("agenda", "finance", "plans");

  useEffect(() => {
    if (!canChooseAgenda) return;
    let active = true;
    Promise.all([
      api.professionals(),
      user?.role === "admin" ? Promise.resolve(null) : api.ownProfile(),
    ])
      .then(([items, profile]) => {
        if (!active) return;
        const available = items.filter((item) => item.active);
        setProfessionals(available);
        setOwnProfessionalId(profile?.professional?.id ?? null);
        // Profissional desativado ou excluído sai da escolha lembrada.
        setAgendaView((current) => {
          const kept = current.filter((id) =>
            available.some((item) => item.id === id),
          );
          if (kept.length === current.length) return current;
          storeAgendaView(user?.id, kept);
          return kept;
        });
      })
      .catch(() => {
        if (active)
          setProfessionalsError("Não foi possível carregar os profissionais.");
      });
    return () => {
      active = false;
    };
  }, [canChooseAgenda, user?.id, user?.role]);

  function applyAgendaView(ids: string[]) {
    setAgendaView(ids);
    storeAgendaView(user?.id, ids);
    setAgendaViewOpen(false);
    requestAnimationFrame(() => agendaViewButton.current?.focus());
  }

  // Aulas de turma de hoje (não canceladas) entram na "Agenda de hoje" junto dos
  // atendimentos; mudanças em turmas também incrementam a versão da agenda.
  useEffect(() => {
    if (!canSeeAgenda) return;
    let active = true;
    const start = new Date(`${today}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    api
      .groupSessions(start.toISOString(), end.toISOString())
      .then((sessions) => {
        if (!active) return;
        setGroupSessions(
          sessions
            .filter(
              (session) =>
                session.status !== "cancelled" &&
                localIsoDate(new Date(session.startsAt)) === today,
            )
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
        );
        setGroupSessionsError("");
      })
      .catch(() => {
        if (active)
          setGroupSessionsError(
            "Não foi possível carregar as aulas de turma de hoje.",
          );
      });
    return () => {
      active = false;
    };
  }, [canSeeAgenda, today, dataVersion]);

  useEffect(() => {
    let active = true;
    const version = ++summaryRequest.current;
    api
      .dashboard(today, agendaViewQuery ? agendaViewQuery.split(",") : [])
      .then((summary) => {
        if (active && summaryRequest.current === version) setData(summary);
      })
      .catch((cause: Error) => {
        if (active && summaryRequest.current === version)
          setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [today, agendaViewQuery]);

  useEffect(() => {
    if (!canSeeSales) return;
    let active = true;
    const version = ++salesRequest.current;
    api
      .salesReport(today.slice(0, 7))
      .then((report) => {
        if (active && salesRequest.current === version) setSales(report);
      })
      .catch((cause: Error) => {
        if (active && salesRequest.current === version) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [canSeeSales, today]);

  function restoreActionFocus() {
    requestAnimationFrame(() => {
      if (actionTrigger.current?.isConnected) actionTrigger.current.focus();
      else agendaLink.current?.focus();
    });
  }

  function openAppointmentAction(
    appointment: Appointment,
    kind: DashboardAppointmentAction["kind"],
  ) {
    actionTrigger.current = document.activeElement as HTMLElement;
    setError("");
    setAppointmentAction({ appointment, kind });
  }

  function closeAppointmentAction() {
    setAppointmentAction(null);
    restoreActionFocus();
  }

  async function refreshDashboard() {
    setRefreshing(true);
    setRefreshError("");
    const summaryVersion = ++summaryRequest.current;
    const salesVersion = ++salesRequest.current;
    const [summary, report] = await Promise.allSettled([
      api.dashboard(today, agendaView),
      canSeeSales ? api.salesReport(today.slice(0, 7)) : Promise.resolve(null),
    ]);
    if (
      summary.status === "fulfilled" &&
      summaryRequest.current === summaryVersion
    )
      setData(summary.value);
    if (
      report.status === "fulfilled" &&
      canSeeSales &&
      salesRequest.current === salesVersion
    )
      setSales(report.value);
    if (summary.status === "rejected" || report.status === "rejected") {
      setRefreshError(
        "Alteração salva, mas não foi possível atualizar o painel. Tente atualizar novamente.",
      );
    }
    setRefreshing(false);
  }

  async function appointmentUpdated(
    updated: Appointment,
    previous: Appointment,
  ) {
    setData((current) => {
      if (!current) return current;
      const next = { ...current };
      const before = appointmentCounts(previous, today);
      const after = appointmentCounts(updated, today);
      for (const key of [
        "appointmentsToday",
        "nonCancelledAppointmentsToday",
        "pendingToday",
        "awaitingConfirmationToday",
        "completedToday",
      ] as const) {
        if (next[key] !== undefined) next[key] += after[key] - before[key];
      }
      if (next.nextAppointments) {
        next.nextAppointments = next.nextAppointments
          .map((item) => (item.id === previous.id ? updated : item))
          .filter(
            (item) =>
              localIsoDate(new Date(item.startsAt)) === today &&
              (item.status === "scheduled" || item.status === "confirmed"),
          )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      }
      return next;
    });
    closeAppointmentAction();
    // A mutação já mudou a versão da agenda: o efeito abaixo recarrega o painel.
  }
  // Qualquer mutação na agenda, no financeiro ou nos planos (aqui ou em outra tela)
  // recarrega o painel uma única vez, com o mesmo aviso de falha da atualização (QC6).
  const seenVersion = useRef(dataVersion);
  useEffect(() => {
    if (seenVersion.current === dataVersion) return;
    seenVersion.current = dataVersion;
    void refreshDashboard();
    // `refreshDashboard` muda a cada render; só a versão dispara o recarregamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  const shownGroupSessions =
    agendaView.length > 0
      ? groupSessions.filter((session) =>
          agendaView.includes(session.professionalId),
        )
      : groupSessions;
  const agendaViewSummary = agendaViewLabel(agendaView, professionals ?? []);

  const toast = useToast();
  async function changeDashboardStatus(
    appointment: Appointment,
    status: "confirmed" | "completed",
  ) {
    if (savingRef.current || refreshing) return;
    savingRef.current = true;
    actionTrigger.current = document.activeElement as HTMLElement;
    setSavingAppointment(true);
    setError("");
    try {
      const updated = await api.updateAppointmentStatus(appointment.id, status);
      await appointmentUpdated(updated, appointment);
      toast.success(appointmentStatusToast(updated.status));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível alterar o atendimento.",
      );
      restoreActionFocus();
    } finally {
      savingRef.current = false;
      setSavingAppointment(false);
    }
  }

  function selectTab(next: DashboardTab) {
    setTab(next);
    if (next === "campanhas") setAutoVisited(true);
  }

  function moveTabFocus(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "resumo"
        : event.key === "End"
          ? "campanhas"
          : tab === "resumo"
            ? "campanhas"
            : "resumo";
    selectTab(next);
    document.getElementById(`${tabsId}-${next}-tab`)?.focus();
  }

  const showSummary = !canSeeAutoCampaigns || tab === "resumo";

  return (
    <>
      <PageHeader
        title={firstName ? `Olá, ${firstName}.` : "Olá."}
        description={dateLabel.format(new Date())}
        action={
          can("agenda.create") && (
            <NavLink to="/agenda?novo=1" className="primary-button">
              <Plus size={18} />
              Novo atendimento
            </NavLink>
          )
        }
      />
      {canSeeAutoCampaigns && (
        <div
          className="settings-tabs communication-tabs"
          role="tablist"
          aria-label="Seções do início"
        >
          {dashboardTabs.map((item) => (
            <button
              key={item.key}
              id={`${tabsId}-${item.key}-tab`}
              type="button"
              role="tab"
              className="text-button settings-tab"
              aria-selected={tab === item.key}
              aria-controls={`${tabsId}-${item.key}-panel`}
              tabIndex={tab === item.key ? 0 : -1}
              onClick={() => selectTab(item.key)}
              onKeyDown={moveTabFocus}
            >
              <item.icon size={18} aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>
      )}
      {canSeeAutoCampaigns && autoVisited && (
        <div
          id={`${tabsId}-campanhas-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-campanhas-tab`}
          hidden={tab !== "campanhas"}
        >
          <AutoCampaignQueuePanel />
        </div>
      )}
      <div
        {...(canSeeAutoCampaigns
          ? {
              id: `${tabsId}-resumo-panel`,
              role: "tabpanel",
              "aria-labelledby": `${tabsId}-resumo-tab`,
            }
          : {})}
        hidden={!showSummary}
      >
        {error && <ErrorBanner error={error} />}
        {refreshError && (
          <div className="dashboard-refresh-error">
            <ErrorBanner error={refreshError} />
            <button
              className="secondary-button"
              disabled={refreshing}
              onClick={() => void refreshDashboard()}
            >
              {refreshing ? "Atualizando…" : "Atualizar painel"}
            </button>
          </div>
        )}
        {!data ? (
          <LoadingBlock />
        ) : (
          <>
            {(data.nonCancelledAppointmentsToday !== undefined ||
              data.pendingToday !== undefined ||
              data.awaitingConfirmationToday !== undefined ||
              data.completedToday !== undefined) && (
              <section
                className="metric-grid"
                aria-label="Resumo da agenda de hoje"
              >
                {data.nonCancelledAppointmentsToday !== undefined && (
                  <article className="metric-card accent">
                    <div>
                      <span>Atendimentos hoje</span>
                      <strong>{data.nonCancelledAppointmentsToday}</strong>
                    </div>
                    <CalendarDays size={23} />
                    <span className="metric-note">Sem cancelados</span>
                  </article>
                )}
                {data.pendingToday !== undefined && (
                  <article className="metric-card">
                    <div>
                      <span>Pendentes hoje</span>
                      <strong>{data.pendingToday}</strong>
                    </div>
                    <span className="metric-note">Aguardando finalização</span>
                  </article>
                )}
                {data.awaitingConfirmationToday !== undefined && (
                  <article className="metric-card">
                    <div>
                      <span>A confirmar</span>
                      <strong>{data.awaitingConfirmationToday}</strong>
                    </div>
                    <span className="metric-note">Ainda sem confirmação</span>
                  </article>
                )}
                {data.completedToday !== undefined && (
                  <article className="metric-card">
                    <div>
                      <span>Já finalizados</span>
                      <strong>{data.completedToday}</strong>
                    </div>
                    {data.nonCancelledAppointmentsToday !== undefined && (
                      <span className="metric-note">
                        de {data.nonCancelledAppointmentsToday} atendimentos
                        hoje
                      </span>
                    )}
                  </article>
                )}
              </section>
            )}
            {data.pendingFinalization !== undefined &&
              data.pendingFinalization > 0 && (
                <section className="panel dashboard-pending-finalization">
                  <div className="panel-head">
                    <div>
                      <h2>
                        Atendimentos a finalizar ({data.pendingFinalization})
                      </h2>
                    </div>
                    {canView("agenda") && (
                      <NavLink to="/agenda/a-finalizar" className="text-link">
                        Finalizar atendimentos <ChevronRight size={16} />
                      </NavLink>
                    )}
                  </div>
                  <p>
                    Já terminaram e continuam como agendados ou confirmados.
                    Enquanto não forem finalizados, não contam como atendidos.
                  </p>
                </section>
              )}
            <section className="dashboard-grid">
              {data.nextAppointments && (
                <article className="panel schedule-panel">
                  <div className="panel-head">
                    <div>
                      <h2>Agenda de hoje</h2>
                      {agendaView.length > 0 && (
                        <p className="panel-context">
                          Mostrando: {agendaViewSummary}
                        </p>
                      )}
                    </div>
                    <div className="schedule-panel-actions">
                      {canChooseAgenda && (
                        <button
                          type="button"
                          className="secondary-button agenda-view-button"
                          ref={agendaViewButton}
                          aria-label={`Visualização da agenda: ${agendaViewSummary}`}
                          onClick={() => setAgendaViewOpen(true)}
                        >
                          <Users size={15} />
                          <span>
                            {agendaView.length > 0
                              ? agendaViewSummary
                              : "Todos"}
                          </span>
                        </button>
                      )}
                      {canView("agenda") && (
                        <NavLink
                          to="/agenda"
                          className="text-link"
                          ref={agendaLink}
                        >
                          Ver agenda <ChevronRight size={16} />
                        </NavLink>
                      )}
                    </div>
                  </div>
                  {groupSessionsError && (
                    <div className="dashboard-schedule-error">
                      <ErrorBanner error={groupSessionsError} />
                    </div>
                  )}
                  {data.nextAppointments.length === 0 &&
                  shownGroupSessions.length === 0 ? (
                    <EmptyState
                      title={
                        data.appointmentsToday === 0
                          ? "Nenhum atendimento hoje"
                          : "Agenda concluída"
                      }
                      copy={
                        data.appointmentsToday === 0
                          ? "Não há atendimentos agendados para hoje."
                          : "Não há atendimentos pendentes hoje."
                      }
                    />
                  ) : (
                    <div className="appointment-list">
                      {[
                        ...data.nextAppointments.map((item) => ({
                          kind: "appointment" as const,
                          startsAt: item.startsAt,
                          item,
                        })),
                        ...shownGroupSessions.map((session) => ({
                          kind: "group" as const,
                          startsAt: session.startsAt,
                          session,
                        })),
                      ]
                        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                        .map((entry) =>
                          entry.kind === "group" ? (
                            <DashboardGroupSessionRow
                              session={entry.session}
                              key={`group:${entry.session.id}`}
                            />
                          ) : (
                            <AppointmentRow
                              appointment={entry.item}
                              key={entry.item.id}
                              disabled={
                                savingAppointment ||
                                refreshing ||
                                appointmentAction !== null
                              }
                              onAction={(kind) =>
                                openAppointmentAction(entry.item, kind)
                              }
                              onStatus={(status) =>
                                void changeDashboardStatus(entry.item, status)
                              }
                            />
                          ),
                        )}
                    </div>
                  )}
                </article>
              )}
              {canSeeSales && sales && (
                <article className="panel pulse-panel">
                  <div className="panel-head">
                    <div>
                      <h2>Clientes sem retorno</h2>
                    </div>
                    {sales.patientsWithoutReturn.length > 0 && (
                      <NavLink
                        to="/relatorios?secao=sem-retorno"
                        className="text-link"
                      >
                        Ver todos ({sales.patientsWithoutReturn.length}){" "}
                        <ChevronRight size={16} />
                      </NavLink>
                    )}
                  </div>
                  <div className="attention-list">
                    {sales.patientsWithoutReturn.length === 0 ? (
                      <p>Nenhum cliente nessa situação.</p>
                    ) : (
                      sales.patientsWithoutReturn.slice(0, 4).map((item) => (
                        <div className="attention-item" key={item.patientId}>
                          <span className="attention-number">
                            {initials(item.patientName)}
                          </span>
                          <div>
                            <strong>{item.patientName}</strong>
                            <small>
                              Último atendimento:{" "}
                              {shortDate.format(new Date(item.lastCompletedAt))}
                              {item.nextAppointmentAt
                                ? ` · Próximo agendamento: ${shortDate.format(new Date(item.nextAppointmentAt))}`
                                : " · Sem próximo agendamento"}
                            </small>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              )}
            </section>
          </>
        )}
        {canSeeRelationship && <BirthdayDashboardCard />}
      </div>
      {agendaViewOpen && (
        <DashboardAgendaViewModal
          professionals={professionals}
          loadError={professionalsError}
          selected={agendaView}
          ownProfessionalId={ownProfessionalId}
          onApply={applyAgendaView}
          onClose={() => {
            setAgendaViewOpen(false);
            requestAnimationFrame(() => agendaViewButton.current?.focus());
          }}
        />
      )}
      {appointmentAction && (
        <DashboardAppointmentDialog
          key={`${appointmentAction.appointment.id}:${appointmentAction.kind}`}
          action={appointmentAction}
          onClose={closeAppointmentAction}
          onReschedule={() =>
            setAppointmentAction({ ...appointmentAction, kind: "reschedule" })
          }
          onUpdated={(updated) => {
            const previous = appointmentAction.appointment;
            toast.success(
              updated.status !== previous.status
                ? appointmentStatusToast(updated.status)
                : updated.startsAt !== previous.startsAt
                  ? "Atendimento remarcado."
                  : "Atendimento atualizado.",
            );
            void appointmentUpdated(updated, previous);
          }}
        />
      )}
    </>
  );
}
