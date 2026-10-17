import type {
  Appointment,
  DashboardViewSummary,
  SalesReport,
} from "@crm/contracts";
import { CalendarDays, ChevronRight, Plus, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { api, getStoredUser } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { AppointmentRow } from "../../shared/components/AppointmentRow";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  currency,
  dateLabel,
  initials,
  localIsoDate,
  shortDate,
} from "../../shared/lib/formatting";
import type { DashboardAppointmentAction } from "../../shared/lib/types";
import { BirthdayDashboardCard } from "./BirthdayDashboardCard";
import { useToast } from "../../shared/feedback/toast-context";
import { appointmentStatusToast } from "../agenda/index";
import { DashboardAppointmentDialog } from "./DashboardAppointmentDialog";

export function DashboardPage() {
  const { can, canView } = useAuthorization();
  const [data, setData] = useState<DashboardViewSummary | null>(null);
  const [sales, setSales] = useState<SalesReport | null>(null);
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

  useEffect(() => {
    let active = true;
    const version = ++summaryRequest.current;
    api
      .dashboard(today)
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
  }, [today]);

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
      api.dashboard(today),
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
      const staysToday = localIsoDate(new Date(updated.startsAt)) === today;
      const next = { ...current };
      if (next.appointmentsToday !== undefined)
        next.appointmentsToday -= staysToday ? 0 : 1;
      if (next.completedToday !== undefined)
        next.completedToday +=
          staysToday && updated.status === "completed" ? 1 : 0;
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
    await refreshDashboard();
  }

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

  return (
    <>
      <PageHeader
        eyebrow="Hoje na clínica"
        title={firstName ? `Olá, ${firstName}.` : "Olá."}
        description={dateLabel.format(new Date())}
        action={
          can("agenda.create") && (
            <NavLink to="/agenda" className="primary-button">
              <Plus size={18} />
              Novo atendimento
            </NavLink>
          )
        }
      />
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
          <section className="metric-grid">
            {data.appointmentsToday !== undefined && (
              <article className="metric-card accent">
                <div>
                  <span>Atendimentos hoje</span>
                  <strong>{data.appointmentsToday}</strong>
                </div>
                <CalendarDays size={23} />
              </article>
            )}
            {data.completedToday !== undefined && (
              <article className="metric-card">
                <div>
                  <span>Já finalizados</span>
                  <strong>{data.completedToday}</strong>
                </div>
                <span className="metric-note">de {data.appointmentsToday}</span>
              </article>
            )}
            {data.patientsActive !== undefined && (
              <article className="metric-card">
                <div>
                  <span>Clientes ativos</span>
                  <strong>{data.patientsActive}</strong>
                </div>
                <Users size={23} />
              </article>
            )}
            {data.noShowsThisMonth !== undefined && (
              <article className="metric-card">
                <div>
                  <span>Faltas no mês</span>
                  <strong>{data.noShowsThisMonth}</strong>
                </div>
                <span className="metric-note">neste mês</span>
              </article>
            )}
          </section>
          {canSeeSales && sales && (
            <section className="dashboard-sales panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">
                    Mês até {sales.current.to.split("-").reverse().join("/")}
                  </span>
                  <h2>Vendas e retorno dos clientes</h2>
                </div>
                <NavLink to="/relatorios" className="text-link">
                  Ver detalhes <ChevronRight size={16} />
                </NavLink>
              </div>
              <p className="dashboard-sales-context">
                {sales.current.attendedPatients} clientes atendidos neste mês.
              </p>
              <div className="sales-metrics">
                <article>
                  <span>Vendido líquido</span>
                  <strong>
                    {currency.format(sales.current.netSalesInCents / 100)}
                  </strong>
                  <small>
                    {sales.changePercent === null
                      ? "Sem base anterior"
                      : `${sales.changePercent > 0 ? "+" : ""}${sales.changePercent}% vs. mês anterior comparável`}
                  </small>
                </article>
                <article>
                  <span>Recebido</span>
                  <strong>
                    {currency.format(sales.current.receivedInCents / 100)}
                  </strong>
                  <small>Pela data da baixa</small>
                </article>
                <article>
                  <span>Sem retorno neste mês</span>
                  <strong>{sales.patientsWithoutReturn.length}</strong>
                  <small>Atendidos no mês anterior</small>
                </article>
              </div>
            </section>
          )}
          <section className="dashboard-grid">
            {data.nextAppointments && (
              <article className="panel schedule-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">Pendentes</span>
                    <h2>Agenda de hoje</h2>
                  </div>
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
                {data.nextAppointments.length === 0 ? (
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
                    {data.nextAppointments.map((item) => (
                      <AppointmentRow
                        appointment={item}
                        key={item.id}
                        disabled={
                          savingAppointment ||
                          refreshing ||
                          appointmentAction !== null
                        }
                        onAction={(kind) => openAppointmentAction(item, kind)}
                        onStatus={(status) =>
                          void changeDashboardStatus(item, status)
                        }
                      />
                    ))}
                  </div>
                )}
              </article>
            )}
            {canSeeSales && sales && (
              <article className="panel pulse-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">Acompanhamento</span>
                    <h2>Clientes sem retorno</h2>
                  </div>
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
      {appointmentAction && (
        <DashboardAppointmentDialog
          key={`${appointmentAction.appointment.id}:${appointmentAction.kind}`}
          action={appointmentAction}
          onClose={closeAppointmentAction}
          onReschedule={() =>
            setAppointmentAction({ ...appointmentAction, kind: "reschedule" })
          }
          onUpdated={(updated) =>
            void appointmentUpdated(updated, appointmentAction.appointment)
          }
        />
      )}
    </>
  );
}
