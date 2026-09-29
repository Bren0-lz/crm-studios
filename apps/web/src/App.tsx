import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  Bell,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Columns3,
  Download,
  FileClock,
  FileSpreadsheet,
  FileText,
  HeartHandshake,
  LockKeyhole,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PackageOpen,
  Paperclip,
  Pause,
  PhoneCall,
  Play,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  Stethoscope,
  UserMinus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import type {
  AdminAuditEvent,
  AdminUser,
  Appointment,
  AppointmentInput,
  AppointmentRescheduleEvent,
  AppointmentStatus,
  AssessmentTemplate,
  AssessmentTemplateInput,
  ClinicalAddendumInput,
  ClinicalAssessmentInput,
  ClinicalAttachmentInput,
  ClinicalMeasurementInput,
  ClinicalRecord,
  ClinicalRecordInput,
  ClinicalRecordRevision,
  ClinicalWorkspace,
  ClinicSettings,
  CommunicationCenter,
  CommunicationChannel,
  ContactActivityInput,
  ContactOutcome,
  ContactReason,
  ContactSuggestion,
  BirthdayEntry,
  DashboardSummary,
  DocumentKind,
  DocumentTemplate,
  DocumentTemplateInput,
  FinancialWorkspace,
  GroupClass,
  GroupSession,
  GroupWorkspace,
  IssuedDocument,
  Lead,
  LeadActivity,
  LeadContactInput,
  LeadInput,
  LeadStage,
  ManualMessageInput,
  ManagementReport,
  SalesReport,
  Patient,
  PatientImportAnalysis,
  PatientImportDuplicate,
  PatientImportFileInput,
  PatientImportResult,
  PatientImportRow,
  PatientInput,
  PatientPlan,
  PatientPlanInput,
  PatientTimelineEntry,
  PatientTimelineKind,
  PayableInput,
  PaymentMethod,
  PaymentReceipt,
  PermissionMatrixItem,
  PlanStatus,
  Professional,
  RelationshipSettings,
  Room,
  SatisfactionReport,
  SatisfactionSurvey,
  ScheduleBlock,
  Service,
  TherapeuticGoalInput,
  TreatmentClosureInput,
  UserSummary,
} from "@crm/contracts";
import { describeGroupSchedule, fillMessageTemplate, formatPhone, groupClassName, nextPlanPeriod, phoneDigits, saoPauloToday, whatsappLink } from "@crm/contracts";
import {
  api,
  ApiClientError,
  clearSession,
  getStoredUser,
  hasSession,
  login,
} from "./api";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const dateLabel = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});
const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});
const timeLabel = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatIsoDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function toLocalDateTimeInput(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${localIsoDate(date)}T${hours}:${minutes}`;
}

function groupOperationRange() {
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const to = new Date();
  to.setDate(to.getDate() + 120);
  return { from: from.toISOString(), to: to.toISOString() };
}

function PhoneInput({ value, onChange, required }: { value: string; onChange: (digits: string) => void; required?: boolean }) {
  return (
    <input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="(11) 99999-9999"
      pattern="\(\d{2}\) \d{4,5}-\d{4}"
      title="Informe o telefone com DDD, por exemplo (11) 99999-9999."
      required={required}
      value={formatPhone(value)}
      onChange={(event) => onChange(phoneDigits(event.target.value))}
    />
  );
}

function groupSlotLabel(slot: GroupClass["weeklySlots"][number], weekDayNames: string[]) {
  return `${weekDayNames[slot.weekday]} · ${slot.startTime}–${slot.endTime}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function statusLabel(status: AppointmentStatus) {
  return {
    scheduled: "Agendado",
    confirmed: "Confirmado",
    completed: "Finalizado",
    no_show: "Não compareceu",
    excused_absence: "Ausência justificada",
    professional_absence: "Ausência profissional",
    cancelled: "Cancelado",
  }[status];
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Movimenta">
      <span className="brand-mark">
        <Activity size={compact ? 20 : 24} strokeWidth={2.3} />
      </span>
      {!compact && <span className="brand-name">movimenta</span>}
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: (user: UserSummary) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@movimenta.local");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await login(email, password);
      onLogin(session.user);
      navigate("/");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível entrar.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <Logo />
        <div className="story-copy">
          <span className="eyebrow light">Gestão clínica, sem ruído</span>
          <h1>
            Mais presença no cuidado.
            <br />
            Menos tempo na operação.
          </h1>
          <p>
            Agenda, clientes e prontuários conectados em uma experiência
            simples para toda a equipe.
          </p>
        </div>
        <div className="story-note">
          <span>Ambiente de demonstração</span>
          <span>Dados fictícios</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">Bem-vinda de volta</span>
          <h2>Acesse sua clínica</h2>
          <p>Use suas credenciais para continuar.</p>
          <form onSubmit={submit}>
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary-button full" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
          <div className="demo-credentials">
            <strong>Acesso de demonstração</strong>
            <span>admin@movimenta.local · Admin@123</span>
          </div>
        </div>
      </section>
    </main>
  );
}

const navItems: Array<{
  to: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  roles?: UserSummary["role"][];
}> = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  {
    to: "/turmas",
    label: "Turmas",
    icon: Users,
    roles: ["owner", "reception", "physiotherapist"],
  },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/planos", label: "Planos e sessões", icon: PackageOpen },
  {
    to: "/comercial",
    label: "CRM comercial",
    icon: Columns3,
    roles: ["owner", "reception", "finance"],
  },
  {
    to: "/relacionamento",
    label: "Contatos sugeridos",
    icon: HeartHandshake,
    roles: ["owner", "reception", "finance"],
  },
  {
    to: "/comunicacoes",
    label: "Comunicações",
    icon: Bell,
    roles: ["owner", "reception", "finance"],
  },
  {
    to: "/documentos",
    label: "Documentos",
    icon: FileText,
    roles: ["owner", "reception", "finance"],
  },
  {
    to: "/prontuarios",
    label: "Prontuários",
    icon: Stethoscope,
    roles: ["owner", "physiotherapist"],
  },
  {
    to: "/financeiro",
    label: "Financeiro",
    icon: CircleDollarSign,
    roles: ["owner", "finance"],
  },
  {
    to: "/relatorios",
    label: "Relatórios",
    icon: BarChart3,
    roles: ["owner", "finance"],
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    icon: Settings,
    roles: ["owner", "reception", "finance"],
  },
];

function Shell({
  user,
  onLogout,
  children,
}: {
  user: UserSummary;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="sidebar-head">
          <Logo />
          <button
            className="icon-button sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="main-nav">
          <span className="nav-caption">Rotina</span>
          {navItems.map((item) => {
            const restricted = Boolean(
              item.roles && !item.roles.includes(user.role),
            );
            const disabled = item.disabled || restricted;
            const Icon = item.icon;
            return disabled ? (
              <span className="nav-item disabled" key={item.to}>
                <Icon size={19} />
                <span>{item.label}</span>
                <small>{restricted ? "restrito" : "em breve"}</small>
              </span>
            ) : (
              <NavLink
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
                to={item.to}
                end={item.to === "/"}
                key={item.to}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <button className="user-card" onClick={onLogout} title="Sair">
            <span className="avatar">{initials(user.fullName)}</span>
            <span className="user-copy">
              <strong>{user.fullName}</strong>
              <small>Gestora da clínica</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
        />
      )}
      <section className="app-main">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={21} />
          </button>
          <div>
            <span className="clinic-label">Clínica Movimenta</span>
            <span className="environment-dot">Demonstração</span>
          </div>
          <div className="top-actions">
            <button className="icon-button" title="Notificações">
              <Bell size={19} />
            </button>
            <span className="top-avatar">{initials(user.fullName)}</span>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </section>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="loading-block">
      <span />
      <span />
      <span />
    </div>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <CalendarDays size={30} />
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
  );
}

function ErrorBanner({ error }: { error: string }) {
  return (
    <div className="error-banner" role="alert">
      {error}
    </div>
  );
}

function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [error, setError] = useState("");
  const today = localIsoDate();
  const firstName = getStoredUser()?.fullName?.split(" ")[0];
  const canSeeSales = ["owner", "finance"].includes(
    getStoredUser()?.role ?? "",
  );
  const canSeeRelationship = ["owner", "reception", "finance"].includes(
    getStoredUser()?.role ?? "",
  );

  useEffect(() => {
    api
      .dashboard(today)
      .then(setData)
      .catch((cause: Error) => setError(cause.message));
  }, [today]);

  useEffect(() => {
    if (!canSeeSales) return;
    api
      .salesReport(today.slice(0, 7))
      .then(setSales)
      .catch((cause: Error) => setError(cause.message));
  }, [canSeeSales, today]);

  return (
    <>
      <PageHeader
        eyebrow="Hoje na clínica"
        title={firstName ? `Olá, ${firstName}.` : "Olá."}
        description={dateLabel.format(new Date())}
        action={
          <NavLink to="/agenda" className="primary-button">
            <Plus size={18} />
            Novo atendimento
          </NavLink>
        }
      />
      {error && <ErrorBanner error={error} />}
      {!data ? (
        <LoadingBlock />
      ) : (
        <>
          <section className="metric-grid">
            <article className="metric-card accent">
              <div>
                <span>Atendimentos hoje</span>
                <strong>{data.appointmentsToday}</strong>
              </div>
              <CalendarDays size={23} />
            </article>
            <article className="metric-card">
              <div>
                <span>Já finalizados</span>
                <strong>{data.completedToday}</strong>
              </div>
              <span className="metric-note">de {data.appointmentsToday}</span>
            </article>
            <article className="metric-card">
              <div>
                <span>Clientes ativos</span>
                <strong>{data.patientsActive}</strong>
              </div>
              <Users size={23} />
            </article>
            <article className="metric-card">
              <div>
                <span>Faltas no mês</span>
                <strong>{data.noShowsThisMonth}</strong>
              </div>
              <span className="metric-note">neste mês</span>
            </article>
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
            <article className="panel schedule-panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Próximos</span>
                  <h2>Agenda de hoje</h2>
                </div>
                <NavLink to="/agenda" className="text-link">
                  Ver agenda <ChevronRight size={16} />
                </NavLink>
              </div>
              {data.nextAppointments.length === 0 ? (
                <EmptyState
                  title="Agenda concluída"
                  copy="Não há outros atendimentos hoje."
                />
              ) : (
                <div className="appointment-list">
                  {data.nextAppointments.map((item) => (
                    <AppointmentRow appointment={item} key={item.id} />
                  ))}
                </div>
              )}
            </article>
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
    </>
  );
}

function BirthdayDashboardCard() {
  const [birthdays, setBirthdays] = useState<ContactSuggestion[]>([]);
  const [settings, setSettings] = useState<RelationshipSettings | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.contactSuggestions(), api.relationshipSettings()])
      .then(([suggestionData, settingsData]) => {
        if (!active) return;
        setBirthdays(
          suggestionData.filter((suggestion) => suggestion.reason === "birthday"),
        );
        setSettings(settingsData);
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function markSent(suggestion: ContactSuggestion) {
    setError("");
    setSaving(suggestion.referenceKey);
    try {
      await markBirthdaySent(suggestion.patientId, suggestion.referenceKey);
      setBirthdays((current) =>
        current.filter((item) => item.referenceKey !== suggestion.referenceKey),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving("");
    }
  }

  return (
    <section className="panel pulse-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">
            {settings
              ? `Hoje e próximos ${settings.birthdayDaysAhead} dias`
              : "Hoje e próximos dias"}
          </span>
          <h2>Aniversariantes</h2>
        </div>
        <NavLink to="/relacionamento" className="text-link">
          Ver relacionamento <ChevronRight size={16} />
        </NavLink>
      </div>
      {error && <div className="form-error">{error}</div>}
      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="attention-list">
          {birthdays.length === 0 ? (
            <p>Nenhum aniversário por perto.</p>
          ) : (
            birthdays.map((suggestion) => (
              <div className="attention-item" key={suggestion.referenceKey}>
                <span className="attention-number">
                  {initials(suggestion.patientName)}
                </span>
                <div>
                  <strong>{suggestion.patientName}</strong>
                  <small>{suggestion.detail}</small>
                </div>
                <div className="plan-actions">
                  <a
                    className="secondary-button"
                    href={whatsappLink(
                      suggestion.whatsapp || suggestion.phone,
                      birthdayMessage(settings, suggestion.patientName),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={15} />
                    Dar parabéns
                  </a>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={saving === suggestion.referenceKey}
                    onClick={() => void markSent(suggestion)}
                  >
                    Marcar como enviado
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

function AppointmentRow({ appointment }: { appointment: Appointment }) {
  return (
    <div className="appointment-row">
      <span className="time">
        {timeLabel.format(new Date(appointment.startsAt))}
      </span>
      <span
        className="appointment-line"
        style={{ backgroundColor: appointment.professionalColor }}
      />
      <div className="appointment-copy">
        <strong>{appointment.patientName}</strong>
        <span>
          {appointment.serviceName} · {appointment.professionalName}
        </span>
      </div>
      <span className={`status-pill ${appointment.status}`}>
        {statusLabel(appointment.status)}
      </span>
      <button className="ghost-icon">
        <MoreHorizontal size={19} />
      </button>
    </div>
  );
}

type PatientStatusFilter = "all" | "active" | "inactive";
type PatientRecordFilter = "all" | "with_email" | "without_email" | "birthday_month";
type PatientSort = "name_asc" | "name_desc" | "newest" | "oldest";

const defaultPatientFilters = {
  status: "all" as PatientStatusFilter,
  record: "all" as PatientRecordFilter,
  tags: [] as string[],
  sort: "name_asc" as PatientSort,
};

function filterPatients(patients: Patient[], filters: typeof defaultPatientFilters) {
  const currentMonth = new Date().getMonth() + 1;
  return patients
    .filter((patient) => filters.status === "all" || patient.status === filters.status)
    .filter((patient) => {
      if (filters.record === "with_email") return Boolean(patient.email);
      if (filters.record === "without_email") return !patient.email;
      if (filters.record === "birthday_month")
        return Boolean(patient.birthDate) && Number(patient.birthDate!.slice(5, 7)) === currentMonth;
      return true;
    })
    .filter((patient) => filters.tags.length === 0 || filters.tags.some((tag) => patient.tags.includes(tag)))
    .sort((a, b) => {
      if (filters.sort === "name_desc") return b.fullName.localeCompare(a.fullName, "pt-BR");
      if (filters.sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      if (filters.sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
      return a.fullName.localeCompare(b.fullName, "pt-BR");
    });
}

function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filters, setFilters] = useState(defaultPatientFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const canImport = ["owner", "reception", "finance"].includes(getStoredUser()?.role ?? "");

  async function load(query = search) {
    setLoading(true);
    setError("");
    try {
      setPatients(await api.patients(query));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
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

  const visiblePatients = filterPatients(patients, filters);
  const tagOptions = Object.entries(
    patients.flatMap((patient) => patient.tags).reduce<Record<string, number>>((counts, tag) => {
      counts[tag] = (counts[tag] ?? 0) + 1;
      return counts;
    }, {}),
  ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  const activeFilterCount =
    (filters.status !== "all" ? 1 : 0) + (filters.record !== "all" ? 1 : 0) + filters.tags.length;
  function toggleTag(tag: string) {
    setFilters((current) => ({
      ...current,
      tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag],
    }));
  }
  function clearFilters() {
    setFilters((current) => ({ ...defaultPatientFilters, sort: current.sort }));
  }

  return (
    <>
      <PageHeader
        eyebrow="Base clínica"
        title="Clientes"
        description="Cadastros, vínculos e informações essenciais em um só lugar."
        action={
          <div className="page-actions">
            {canImport && (
              <button className="secondary-button" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet size={18} aria-hidden="true" />
                Importar
              </button>
            )}
            <button className="primary-button" onClick={() => setModalOpen(true)}>
              <Plus size={18} />
              Novo cliente
            </button>
          </div>
        }
      />
      {error && <ErrorBanner error={error} />}
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
            <button>Buscar</button>
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
            {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
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
            <div className="filter-group">
              <span className="filter-label" id="patient-status-filter">Situação</span>
              <div className="segmented" role="group" aria-labelledby="patient-status-filter">
                {([["all", "Todos"], ["active", "Ativos"], ["inactive", "Inativos"]] as const).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={filters.status === value}
                    onClick={() => setFilters((current) => ({ ...current, status: value }))}
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
                onChange={(event) => setFilters((current) => ({ ...current, record: event.target.value as PatientRecordFilter }))}
              >
                <option value="all">Todos</option>
                <option value="with_email">Com e-mail</option>
                <option value="without_email">Sem e-mail</option>
                <option value="birthday_month">Aniversariantes do mês</option>
              </select>
            </label>
            <label className="filter-group">
              <span className="filter-label">Ordenar por</span>
              <select
                value={filters.sort}
                onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as PatientSort }))}
              >
                <option value="name_asc">Nome (A–Z)</option>
                <option value="name_desc">Nome (Z–A)</option>
                <option value="newest">Cadastro mais recente</option>
                <option value="oldest">Cadastro mais antigo</option>
              </select>
            </label>
            {activeFilterCount > 0 && (
              <button type="button" className="text-link clear-filters" onClick={clearFilters}>
                Limpar filtros
              </button>
            )}
            {tagOptions.length > 0 && (
              <div className="filter-group filter-tags">
                <span className="filter-label" id="patient-tag-filter">Etiquetas</span>
                <div className="tag-filter-list" role="group" aria-labelledby="patient-tag-filter">
                  {tagOptions.map(([tag, count]) => (
                    <button
                      type="button"
                      key={tag}
                      className="tag-filter"
                      aria-pressed={filters.tags.includes(tag)}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                      <small>{count}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
            <button type="button" className="secondary-button" onClick={clearFilters}>
              Limpar filtros
            </button>
          </div>
        ) : (
          <div className="patient-table">
            <div className="table-row table-head">
              <span>Cliente</span>
              <span>Contato</span>
              <span>Etiquetas</span>
              <span>Situação</span>
              <span />
            </div>
            {visiblePatients.map((patient) => (
              <div
                className="table-row patient-row"
                key={patient.id}
                role="button"
                tabIndex={0}
                aria-label={`Editar ${patient.fullName}`}
                onClick={() => setEditingPatient(patient)}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    setEditingPatient(patient);
                  }
                }}
              >
                <div className="patient-identity">
                  <span className="avatar patient-avatar">
                    {initials(patient.fullName)}
                  </span>
                  <div>
                    <strong>{patient.fullName}</strong>
                    <small>{patient.recordNumber}</small>
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
                  {patient.tags.length ? (
                    patient.tags.slice(0, 2).map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))
                  ) : (
                    <small>Sem etiquetas</small>
                  )}
                </div>
                <span className={`active-label ${patient.status === "inactive" ? "inactive" : ""}`}>
                  <i />
                  {patient.status === "inactive" ? "Inativo" : "Ativo"}
                </span>
                <ChevronRight className="row-chevron" size={18} aria-hidden="true" />
              </div>
            ))}
          </div>
        )}
      </section>
      {(modalOpen || editingPatient) && (
        <PatientModal
          patient={editingPatient ?? undefined}
          onClose={() => {
            setModalOpen(false);
            setEditingPatient(null);
          }}
          onSaved={(patient) => {
            setPatients((current) =>
              [...current.filter((item) => item.id !== patient.id), patient].sort((a, b) =>
                a.fullName.localeCompare(b.fullName),
              ),
            );
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
    </>
  );
}

const patientImportTemplate = [
  "nome;cpf;telefone;whatsapp;email;nascimento;etiquetas;observações",
  "Maria da Silva;123.456.789-09;(11) 99999-0000;(11) 99999-0000;maria@exemplo.com;15/03/1990;pilates, vip;Prefere horários pela manhã",
].join("\r\n");
/** CSV modelo com BOM UTF-8 e separador `;`, para abrir corretamente no Excel. */
const patientImportTemplateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${patientImportTemplate}\r\n`)}`;

const patientImportStatusLabels: Record<PatientImportRow["status"], string> = {
  valid: "Válida",
  error: "Erro",
  duplicate: "Duplicada",
};

function describeImportDuplicate(duplicate: PatientImportDuplicate): string {
  const field = duplicate.field === "cpf" ? "mesmo CPF" : "mesmo telefone";
  return duplicate.kind === "existing"
    ? `Já cadastrado: ${duplicate.fullName} (${field})`
    : `Repete a linha ${duplicate.line} (${field})`;
}

function countLabel(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
    reader.readAsDataURL(file);
  });
}

function PatientImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<PatientImportFileInput | null>(null);
  const [analysis, setAnalysis] = useState<PatientImportAnalysis | null>(null);
  const [result, setResult] = useState<PatientImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function selectFile(selected: File | undefined) {
    setAnalysis(null);
    setResult(null);
    setFile(null);
    setError("");
    if (!selected) return;
    setLoading(true);
    try {
      const input = { fileName: selected.name, contentBase64: await readFileAsBase64(selected) };
      setAnalysis(await api.previewPatientImport(input));
      setFile(input);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmImport() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      setResult(await api.importPatients(file));
      setAnalysis(null);
      setFile(null);
      onImported();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const validCount = analysis?.totals.valid ?? 0;
  return (
    <Modal
      eyebrow="Importação"
      title="Importar clientes"
      subtitle="Envie uma planilha .csv ou .xlsx, confira a prévia e confirme a importação."
      onClose={onClose}
    >
      <div className="patient-import">
        {error && <ErrorBanner error={error} />}
        {result && (
          <div className="success-banner" role="status">
            {`${countLabel(result.created, "cliente importado", "clientes importados")}, ${countLabel(result.skipped, "ignorado", "ignorados")} por duplicidade e ${result.errors} com erro.`}
          </div>
        )}
        <div className="patient-import-file">
          <div className="field-with-hint">
            <label htmlFor="patient-import-file">Planilha de clientes</label>
            <input
              id="patient-import-file"
              type="file"
              accept=".csv,.xlsx"
              aria-describedby="patient-import-hint"
              disabled={loading}
              onChange={(event) => void selectFile(event.target.files?.[0])}
            />
            <span className="field-hint" id="patient-import-hint">
              Colunas aceitas: nome, cpf, telefone, whatsapp, email, nascimento (dd/mm/aaaa), etiquetas
              (separadas por vírgula) e observações. Até 2 MB.
            </span>
          </div>
          <a className="text-link" href={patientImportTemplateHref} download="modelo-clientes.csv">
            <Download size={16} aria-hidden="true" />
            Baixar modelo CSV
          </a>
        </div>
        {loading && <LoadingBlock />}
        {analysis && (
          <>
            {analysis.errors.map((message) => (
              <ErrorBanner key={message} error={message} />
            ))}
            <div className="patient-import-totals" aria-live="polite">
              <span className="status-pill import-valid">
                {countLabel(analysis.totals.valid, "válido", "válidos")}
              </span>
              <span className="status-pill import-error">{`${analysis.totals.error} com erro`}</span>
              <span className="status-pill import-duplicate">
                {countLabel(analysis.totals.duplicate, "duplicado", "duplicados")}
              </span>
            </div>
            {analysis.rows.length > 0 && (
              <div className="patient-import-table">
                <div className="table-row table-head">
                  <span>Linha</span>
                  <span>Nome</span>
                  <span>Telefone</span>
                  <span>Situação</span>
                  <span>Detalhes</span>
                </div>
                {analysis.rows.map((row) => (
                  <div className="table-row" key={row.line}>
                    <span>{row.line}</span>
                    <strong>{row.fullName || "—"}</strong>
                    <span>{row.phone ? formatPhone(row.phone) : "—"}</span>
                    <span>
                      <span className={`status-pill import-${row.status}`}>
                        {patientImportStatusLabels[row.status]}
                      </span>
                    </span>
                    <small>
                      {row.status === "error"
                        ? (row.errors ?? []).join(" ")
                        : row.duplicateOf
                          ? describeImportDuplicate(row.duplicateOf)
                          : "Pronta para importar"}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            {result ? "Fechar" : "Cancelar"}
          </button>
          {!result && (
            <button
              type="button"
              className="primary-button"
              disabled={loading || !file || validCount === 0}
              onClick={() => void confirmImport()}
            >
              {`Importar ${countLabel(validCount, "cliente", "clientes")}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function PatientModal({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient | undefined;
  onClose: () => void;
  onSaved: (patient: Patient) => void;
}) {
  const [form, setForm] = useState<PatientInput>(() => ({
    fullName: patient?.fullName ?? "",
    phone: patient?.phone ?? "",
    whatsapp: patient?.whatsapp ?? "",
    cpf: patient?.cpf ?? "",
    email: patient?.email ?? "",
    birthDate: patient?.birthDate ?? "",
    emergencyContactName: patient?.emergencyContactName ?? "",
    emergencyContactPhone: patient?.emergencyContactPhone ?? "",
    notes: patient?.notes ?? "",
    tags: patient?.tags ?? [],
  }));
  const [tagsText, setTagsText] = useState(() => (patient?.tags ?? []).join(", "));
  // O histórico usa acesso comercial: a fisioterapia não vê nem chama a rota.
  const showHistory = Boolean(patient) && getStoredUser()?.role !== "physiotherapist";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  function field<K extends keyof PatientInput>(key: K, value: PatientInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const input = {
        ...form,
        tags: tagsText
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      onSaved(patient ? await api.updatePatient(patient.id, input) : await api.createPatient(input));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title={patient ? "Editar cliente" : "Novo cliente"}
      subtitle={patient ? `Atualize o cadastro ${patient.recordNumber}.` : "Cadastre as informações essenciais. O restante pode ser completado depois."}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Nome completo
          <input
            required
            value={form.fullName}
            onChange={(e) => field("fullName", e.target.value)}
            autoFocus
          />
        </label>
        <fieldset className="form-fieldset span-2">
          <legend>Contato</legend>
          <div className="form-fieldset-grid">
            <label>
              Telefone
              <PhoneInput
                required
                value={form.phone}
                onChange={(digits) => field("phone", digits)}
              />
            </label>
            <div className="field-with-hint">
              <label>
                WhatsApp
                <PhoneInput
                  value={form.whatsapp ?? ""}
                  onChange={(digits) => field("whatsapp", digits)}
                />
              </label>
              <small className="field-hint">Em branco, as mensagens usam o telefone de contato.</small>
            </div>
          </div>
        </fieldset>
        <label>
          E-mail
          <input
            type="email"
            value={form.email}
            onChange={(e) => field("email", e.target.value)}
          />
        </label>
        <label>
          CPF
          <input
            value={form.cpf}
            onChange={(e) => field("cpf", e.target.value)}
          />
        </label>
        <label>
          Data de nascimento
          <input
            type="date"
            value={form.birthDate}
            onChange={(e) => field("birthDate", e.target.value)}
          />
        </label>
        <fieldset className="form-fieldset span-2">
          <legend>Contato de emergência</legend>
          <div className="form-fieldset-grid">
            <label>
              Nome
              <input
                autoComplete="off"
                placeholder="Ex.: Maria Souza (mãe)"
                value={form.emergencyContactName}
                onChange={(e) => field("emergencyContactName", e.target.value)}
              />
            </label>
            <label>
              Telefone
              <PhoneInput
                value={form.emergencyContactPhone ?? ""}
                onChange={(digits) => field("emergencyContactPhone", digits)}
              />
            </label>
          </div>
        </fieldset>
        <label className="span-2">
          Etiquetas (separadas por vírgula)
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
          />
        </label>
        <label className="span-2">
          Observações administrativas
          <textarea
            value={form.notes}
            onChange={(e) => field("notes", e.target.value)}
            rows={3}
          />
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={loading}>
            {loading ? "Salvando…" : patient ? "Salvar alterações" : "Salvar cliente"}
          </button>
        </div>
      </form>
      {showHistory && patient && <PatientTimelineSection patientId={patient.id} />}
    </Modal>
  );
}

type TimelineFilter = "all" | "appointments" | "plans" | "payments" | "contacts" | "messages" | "satisfaction";

const timelineKindConfig: Record<PatientTimelineKind, { filter: Exclude<TimelineFilter, "all">; icon: LucideIcon }> = {
  appointment: { filter: "appointments", icon: CalendarDays },
  plan_created: { filter: "plans", icon: PackageOpen },
  plan_renewed: { filter: "plans", icon: RefreshCw },
  plan_cancelled: { filter: "plans", icon: X },
  payment: { filter: "payments", icon: CircleDollarSign },
  payment_reversal: { filter: "payments", icon: RotateCcw },
  contact: { filter: "contacts", icon: PhoneCall },
  message: { filter: "messages", icon: MessageCircle },
  satisfaction: { filter: "satisfaction", icon: Star },
};

const timelineFilterLabels: Array<[Exclude<TimelineFilter, "all">, string]> = [
  ["appointments", "Atendimentos"],
  ["plans", "Planos"],
  ["payments", "Pagamentos"],
  ["contacts", "Contatos"],
  ["messages", "Mensagens"],
  ["satisfaction", "Satisfação"],
];

function timelineDate(value: string) {
  const date = new Date(value);
  return `${shortDate.format(date)} de ${date.getFullYear()} · ${timeLabel.format(date)}`;
}

function PatientTimelineSection({ patientId }: { patientId: string }) {
  const [entries, setEntries] = useState<PatientTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<TimelineFilter>("all");
  useEffect(() => {
    let active = true;
    api
      .patientTimeline(patientId)
      .then((data) => {
        if (active) setEntries(Array.isArray(data) ? data.filter((entry) => entry && entry.kind in timelineKindConfig) : []);
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
  }, [patientId]);
  const counts = entries.reduce<Partial<Record<TimelineFilter, number>>>((acc, entry) => {
    const key = timelineKindConfig[entry.kind].filter;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const visible = filter === "all" ? entries : entries.filter((entry) => timelineKindConfig[entry.kind].filter === filter);
  return (
    <section className="appointment-detail-section patient-timeline" aria-labelledby="patient-timeline-title">
      <h3 id="patient-timeline-title">Histórico</h3>
      {error && <ErrorBanner error={error} />}
      {loading ? (
        <LoadingBlock />
      ) : entries.length === 0 ? (
        !error && <EmptyState title="Sem histórico" copy="Atendimentos, planos, pagamentos e contatos deste cliente aparecem aqui." />
      ) : (
        <>
          <div className="tag-filter-list" role="group" aria-label="Filtrar histórico por tipo">
            <button type="button" className="tag-filter" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              Todos
            </button>
            {timelineFilterLabels
              .filter(([value]) => counts[value])
              .map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className="tag-filter"
                  aria-label={label}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                  <small>{counts[value]}</small>
                </button>
              ))}
          </div>
          <ul className="patient-timeline-list">
            {visible.map((entry) => {
              const Icon = timelineKindConfig[entry.kind].icon;
              return (
                <li key={entry.id} className={`patient-timeline-item timeline-${entry.kind}`}>
                  <span className="patient-timeline-icon" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <div>
                    <strong>{entry.title}</strong>
                    {entry.detail && <span>{entry.detail}</span>}
                    <small>{timelineDate(entry.occurredAt)}</small>
                  </div>
                  {entry.amountInCents !== undefined && (
                    <span className={`patient-timeline-amount ${entry.amountInCents < 0 ? "negative" : ""}`}>
                      {currency.format(entry.amountInCents / 100)}
                    </span>
                  )}
                  {entry.score !== undefined && <span className="status-pill">Nota {entry.score}</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

const leadStages: Array<{ value: LeadStage; label: string }> = [
  { value: "new_contact", label: "Novos" },
  { value: "contacted", label: "Em contato" },
  { value: "evaluation", label: "Avaliação" },
  { value: "proposal", label: "Proposta" },
  { value: "won", label: "Ganhos" },
  { value: "lost", label: "Perdidos" },
];

const contactReasonLabels: Record<ContactReason, string> = {
  birthday: "Aniversário",
  single_no_return: "Veio uma vez",
  plan_expiring: "Plano acabando",
  low_balance: "Saldo baixo",
  expired_with_balance: "Vencido com saldo",
  treatment_paused: "Tratamento parado",
  repeated_no_show: "Faltas seguidas",
  former_client: "Ex-cliente",
  overdue_payment: "Pagamento atrasado",
  nps_detractor: "Avaliação baixa",
};

const contactOutcomeLabels: Record<ContactOutcome, string> = {
  contacted: "Contato feito",
  no_answer: "Não atendeu",
  scheduled: "Agendou horário",
  not_interested: "Sem interesse",
  snoozed: "Adiar contato",
  dismissed: "Descartar sugestão",
};

function suggestionKey(suggestion: ContactSuggestion) {
  return `${suggestion.patientId}:${suggestion.reason}:${suggestion.referenceKey}`;
}

function addDaysToIsoDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function birthdayMessage(
  settings: RelationshipSettings | null,
  patientName: string,
) {
  const firstName = patientName.trim().split(/\s+/)[0] ?? patientName;
  return fillMessageTemplate(settings?.messages.birthday ?? "", {
    nome: firstName,
  });
}

/** Registra o parabéns do ano (atividade `birthday`/`contacted`). */
function markBirthdaySent(patientId: string, referenceKey: string) {
  return api.createContactActivity({
    patientId,
    reason: "birthday",
    referenceKey,
    outcome: "contacted",
  });
}

function RelationshipPage() {
  const [view, setView] = useState<"suggestions" | "birthdays">("suggestions");
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [settings, setSettings] = useState<RelationshipSettings | null>(null);
  const [reasonFilter, setReasonFilter] = useState<ContactReason | "all">("all");
  const [recording, setRecording] = useState<ContactSuggestion | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([api.contactSuggestions(), api.relationshipSettings()])
      .then(([suggestionData, settingsData]) => {
        if (!active) return;
        setSuggestions(suggestionData);
        setSettings(settingsData);
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const counts = new Map<ContactReason, number>();
  for (const suggestion of suggestions) {
    counts.set(suggestion.reason, (counts.get(suggestion.reason) ?? 0) + 1);
  }
  const reasonOptions = (Object.keys(contactReasonLabels) as ContactReason[]).filter(
    (reason) => counts.has(reason),
  );
  const visible =
    reasonFilter === "all"
      ? suggestions
      : suggestions.filter((suggestion) => suggestion.reason === reasonFilter);

  function messageFor(suggestion: ContactSuggestion) {
    const template = settings?.messages[suggestion.reason] ?? "";
    const firstName =
      suggestion.patientName.trim().split(/\s+/)[0] ?? suggestion.patientName;
    return fillMessageTemplate(template, { nome: firstName });
  }

  function recorded(suggestion: ContactSuggestion) {
    const key = suggestionKey(suggestion);
    const remaining = suggestions.filter((item) => suggestionKey(item) !== key);
    setSuggestions(remaining);
    if (!remaining.some((item) => item.reason === reasonFilter)) {
      setReasonFilter("all");
    }
    setRecording(null);
    setNotice(`Contato com ${suggestion.patientName} registrado.`);
  }

  return (
    <>
      <PageHeader
        eyebrow="Central de relacionamento"
        title="Contatos sugeridos"
        description="Clientes que merecem um contato agora, com a mensagem pronta para o WhatsApp."
      />
      {error && <ErrorBanner error={error} />}
      {notice && <div className="success-banner">{notice}</div>}
      <div className="segmented" role="group" aria-label="Visão">
        <button
          type="button"
          aria-pressed={view === "suggestions"}
          onClick={() => setView("suggestions")}
        >
          Contatos sugeridos
        </button>
        <button
          type="button"
          aria-pressed={view === "birthdays"}
          onClick={() => setView("birthdays")}
        >
          Aniversários do mês
        </button>
      </div>
      {view === "birthdays" ? (
        <BirthdaysMonthPanel settings={settings} />
      ) : (
      <section className="panel plans-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Fila de contatos</span>
            <h2>Quem contatar</h2>
          </div>
        </div>
        {!loading && suggestions.length > 0 && (
          <div className="filter-group filter-tags">
            <span className="filter-label" id="relationship-reason-filter">
              Situação
            </span>
            <div
              className="tag-filter-list"
              role="group"
              aria-labelledby="relationship-reason-filter"
            >
              <button
                type="button"
                className="tag-filter"
                aria-pressed={reasonFilter === "all"}
                onClick={() => setReasonFilter("all")}
              >
                Todas
                <small>{suggestions.length}</small>
              </button>
              {reasonOptions.map((reason) => (
                <button
                  type="button"
                  key={reason}
                  className="tag-filter"
                  aria-pressed={reasonFilter === reason}
                  onClick={() => setReasonFilter(reason)}
                >
                  {contactReasonLabels[reason]}
                  <small>{counts.get(reason)}</small>
                </button>
              ))}
            </div>
          </div>
        )}
        {loading ? (
          <LoadingBlock />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Nenhum contato sugerido"
            copy="Quando algum cliente precisar de atenção, ele aparece aqui."
          />
        ) : (
          <div className="plans-grid">
            {visible.map((suggestion) => {
              const contactPhone = suggestion.whatsapp || suggestion.phone;
              return (
                <article className="plan-card" key={suggestionKey(suggestion)}>
                  <div className="plan-card-head">
                    <span className="status-pill open">
                      {contactReasonLabels[suggestion.reason]}
                    </span>
                    {suggestion.dueDate && (
                      <span>
                        {shortDate.format(
                          new Date(`${suggestion.dueDate}T12:00:00`),
                        )}
                      </span>
                    )}
                  </div>
                  <h3>{suggestion.patientName}</h3>
                  <p>{suggestion.detail}</p>
                  <div className="plan-meta">
                    <span>Telefone</span>
                    <strong>{formatPhone(suggestion.phone)}</strong>
                  </div>
                  <div className="plan-actions">
                    <a
                      className="secondary-button"
                      href={whatsappLink(contactPhone, messageFor(suggestion))}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle size={15} />
                      WhatsApp
                    </a>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setNotice("");
                        setRecording(suggestion);
                      }}
                    >
                      <PhoneCall size={15} />
                      Registrar contato
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      )}
      {recording && (
        <ContactActivityModal
          suggestion={recording}
          onClose={() => setRecording(null)}
          onSaved={() => recorded(recording)}
        />
      )}
    </>
  );
}

function BirthdaysMonthPanel({
  settings,
}: {
  settings: RelationshipSettings | null;
}) {
  const [month, setMonth] = useState(() => saoPauloToday().slice(0, 7));
  const [entries, setEntries] = useState<BirthdayEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    let active = true;
    api
      .birthdays(month)
      .then((data) => active && setEntries(data))
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month]);

  async function markSent(entry: BirthdayEntry) {
    setError("");
    setSaving(entry.referenceKey);
    try {
      await markBirthdaySent(entry.patientId, entry.referenceKey);
      setEntries((current) =>
        current.map((item) =>
          item.referenceKey === entry.referenceKey
            ? { ...item, congratulated: true }
            : item,
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving("");
    }
  }

  return (
    <section className="panel plans-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Aniversários do mês</span>
          <h2>Aniversariantes</h2>
        </div>
        <label className="filter-group">
          <span className="filter-label">Mês</span>
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setError("");
              setLoading(/^\d{4}-\d{2}$/.test(event.target.value));
              setMonth(event.target.value);
            }}
          />
        </label>
      </div>
      {error && <div className="form-error">{error}</div>}
      {loading ? (
        <LoadingBlock />
      ) : entries.length === 0 ? (
        <EmptyState
          title="Nenhum aniversariante neste mês"
          copy="Clientes ativos com data de nascimento aparecem aqui."
        />
      ) : (
        <div className="plans-grid">
          {entries.map((entry) => (
            <article className="plan-card" key={entry.referenceKey}>
              <div className="plan-card-head">
                <span className="status-pill open">
                  {shortDate.format(new Date(`${entry.date}T12:00:00`))}
                </span>
                {entry.congratulated && (
                  <span className="status-pill completed">Parabéns enviado</span>
                )}
              </div>
              <h3>{entry.patientName}</h3>
              <p>Completa {entry.ageTurning} anos</p>
              <div className="plan-meta">
                <span>Telefone</span>
                <strong>{formatPhone(entry.phone)}</strong>
              </div>
              {!entry.congratulated && (
                <div className="plan-actions">
                  <a
                    className="secondary-button"
                    href={whatsappLink(
                      entry.whatsapp || entry.phone,
                      birthdayMessage(settings, entry.patientName),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={15} />
                    Dar parabéns
                  </a>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={saving === entry.referenceKey}
                    onClick={() => void markSent(entry)}
                  >
                    Marcar como enviado
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ContactActivityModal({
  suggestion,
  onClose,
  onSaved,
}: {
  suggestion: ContactSuggestion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = saoPauloToday();
  const [outcome, setOutcome] = useState<ContactOutcome>("contacted");
  const [notes, setNotes] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState(() => addDaysToIsoDate(today, 7));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const trimmedNotes = notes.trim();
      const input: ContactActivityInput = {
        patientId: suggestion.patientId,
        reason: suggestion.reason,
        referenceKey: suggestion.referenceKey,
        outcome,
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
        ...(outcome === "snoozed" ? { snoozeUntil } : {}),
      };
      await api.createContactActivity(input);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      setLoading(false);
    }
  }

  return (
    <Modal
      eyebrow={contactReasonLabels[suggestion.reason]}
      title="Registrar contato"
      subtitle={`${suggestion.patientName} · ${suggestion.detail}`}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className={outcome === "snoozed" ? undefined : "span-2"}>
          Resultado
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as ContactOutcome)}
          >
            {(Object.keys(contactOutcomeLabels) as ContactOutcome[]).map(
              (value) => (
                <option value={value} key={value}>
                  {contactOutcomeLabels[value]}
                </option>
              ),
            )}
          </select>
        </label>
        {outcome === "snoozed" && (
          <label>
            Adiar até
            <input
              required
              type="date"
              min={addDaysToIsoDate(today, 1)}
              value={snoozeUntil}
              onChange={(e) => setSnoozeUntil(e.target.value)}
            />
          </label>
        )}
        <label className="span-2">
          Observação
          <textarea
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={loading}>
            {loading ? "Salvando…" : "Salvar contato"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CommunicationsPage() {
  const [center, setCenter] = useState<CommunicationCenter | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [channel, setChannel] = useState<CommunicationChannel>("whatsapp");
  const [body, setBody] = useState("");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [referenceDate, setReferenceDate] = useState(localIsoDate(tomorrow));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const [communicationData, patientData] = await Promise.all([
      api.communications(),
      api.patients(),
    ]);
    setCenter(communicationData);
    setPatients(patientData);
    setPatientId((current) => current || patientData[0]?.id || "");
  }

  useEffect(() => {
    let active = true;
    Promise.all([api.communications(), api.patients()])
      .then(([communicationData, patientData]) => {
        if (!active) return;
        setCenter(communicationData);
        setPatients(patientData);
        setPatientId(patientData[0]?.id || "");
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function allowed(
    targetPatientId: string,
    targetChannel: CommunicationChannel,
  ) {
    return (
      center?.preferences.find(
        (item) =>
          item.patientId === targetPatientId && item.channel === targetChannel,
      )?.allowed ?? true
    );
  }

  async function togglePreference(targetChannel: CommunicationChannel) {
    if (!patientId) return;
    setError("");
    try {
      const preference = await api.setCommunicationPreference({
        patientId,
        channel: targetChannel,
        allowed: !allowed(patientId, targetChannel),
      });
      setCenter((current) =>
        current
          ? {
              ...current,
              preferences: [
                preference,
                ...current.preferences.filter(
                  (item) =>
                    !(
                      item.patientId === patientId &&
                      item.channel === targetChannel
                    ),
                ),
              ],
            }
          : current,
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function queueMessage(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const input: ManualMessageInput = { patientId, channel, body };
      await api.queueMessage(input);
      setBody("");
      setNotice("Mensagem adicionada à fila com segurança.");
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function generate() {
    setError("");
    setNotice("");
    try {
      const result = await api.generateReminders(referenceDate);
      setNotice(
        `${result.queued} lembrete(s) criado(s), ${result.alreadyQueued} já existente(s) e ${result.skippedByPreference} bloqueado(s) por preferência.`,
      );
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Relacionamento operacional"
        title="Central de comunicações"
        description="Prepare lembretes e mensagens sem misturar conteúdo clínico."
      />
      {error && <ErrorBanner error={error} />}
      {notice && <div className="success-banner">{notice}</div>}
      {loading || !center ? (
        <LoadingBlock />
      ) : (
        <div className="communications-layout">
          <section className="panel communication-compose">
            <span className="eyebrow">Mensagem individual</span>
            <h2>Adicionar à fila</h2>
            <form onSubmit={queueMessage}>
              <label>
                Cliente
                <select
                  value={patientId}
                  onChange={(event) => setPatientId(event.target.value)}
                >
                  {patients.map((patient) => (
                    <option value={patient.id} key={patient.id}>
                      {patient.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="preference-row">
                {(["whatsapp", "email"] as const).map((item) => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      checked={allowed(patientId, item)}
                      onChange={() => void togglePreference(item)}
                    />
                    {item === "whatsapp"
                      ? "WhatsApp permitido"
                      : "E-mail permitido"}
                  </label>
                ))}
              </div>
              <label>
                Canal
                <select
                  value={channel}
                  onChange={(event) =>
                    setChannel(event.target.value as CommunicationChannel)
                  }
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                </select>
              </label>
              <label>
                Mensagem administrativa
                <textarea
                  required
                  maxLength={500}
                  rows={5}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Não inclua diagnósticos ou informações clínicas."
                />
              </label>
              <button
                className="primary-button"
                disabled={!patientId || !body.trim()}
              >
                Adicionar à fila
              </button>
            </form>
          </section>
          <section className="panel reminder-generator">
            <span className="eyebrow">Automação segura</span>
            <h2>Gerar lembretes</h2>
            <p>
              Cria avisos de atendimentos da data e parcelas vencidas. Repetir a
              operação não duplica mensagens.
            </p>
            <label>
              Data de referência
              <input
                type="date"
                value={referenceDate}
                onChange={(event) => setReferenceDate(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              onClick={() => void generate()}
            >
              Gerar lembretes
            </button>
            <div className="outbox-note">
              <LockKeyhole size={17} />
              <span>
                Modo fila interna: nenhum envio externo ocorre até um provedor
                oficial ser configurado.
              </span>
            </div>
          </section>
          <section className="panel communication-history">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Outbox</span>
                <h2>Histórico da fila</h2>
              </div>
              <span className="list-count">{center.messages.length}</span>
            </div>
            {center.messages.length === 0 ? (
              <EmptyState
                title="Fila vazia"
                copy="Gere lembretes ou adicione uma mensagem individual."
              />
            ) : (
              <div className="message-list">
                {center.messages.map((message) => (
                  <article key={message.id}>
                    <div>
                      <strong>{message.patientName}</strong>
                      <span>
                        {message.channel === "whatsapp" ? "WhatsApp" : "E-mail"}{" "}
                        ·{" "}
                        {message.kind === "manual"
                          ? "individual"
                          : message.kind === "appointment_reminder"
                            ? "atendimento"
                            : "cobrança"}
                      </span>
                    </div>
                    <p>{message.body}</p>
                    <span className={`status-pill ${message.status}`}>
                      {message.status === "queued" ? "Na fila" : message.status}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function professionalWithCrefito(name: string, crefito?: string) {
  if (!crefito) return name;
  return `${name} · ${/crefito/i.test(crefito) ? crefito : `CREFITO ${crefito}`}`;
}

const documentKindLabels: Record<DocumentKind, string> = {
  contract: "Contrato",
  attendance_declaration: "Declaração de comparecimento",
  consent: "Termo de consentimento",
  other: "Outro",
};

function DocumentsPage() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [documents, setDocuments] = useState<IssuedDocument[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [plans, setPlans] = useState<PatientPlan[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [templateForm, setTemplateForm] = useState<DocumentTemplateInput>({
    name: "Contrato de prestação de serviços",
    kind: "contract",
    body: "CONTRATO\n\n{{clinica_nome}} e {{paciente_nome}} firmam o presente instrumento em {{data_emissao}}, referente ao plano {{plano_nome}}.",
  });
  const [documentForm, setDocumentForm] = useState({
    templateId: "",
    patientId: "",
    planId: "",
    professionalId: "",
    title: "Contrato de prestação de serviços",
  });

  async function load() {
    const [templateData, documentData, patientData, planData] =
      await Promise.all([
        api.documentTemplates(),
        api.documents(),
        api.patients(),
        api.plans(),
      ]);
    setTemplates(templateData);
    setDocuments(documentData);
    setPatients(patientData);
    setPlans(planData);
    setDocumentForm((current) => ({
      ...current,
      templateId:
        current.templateId ||
        templateData.find((item) => item.active)?.id ||
        "",
      patientId: current.patientId || patientData[0]?.id || "",
    }));
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      api.documentTemplates(),
      api.documents(),
      api.patients(),
      api.plans(),
      api.professionals(),
    ])
      .then(([templateData, documentData, patientData, planData, professionalData]) => {
        if (!active) return;
        setTemplates(templateData);
        setDocuments(documentData);
        setPatients(patientData);
        setPlans(planData);
        setProfessionals(professionalData.filter((item) => item.active !== false));
        setDocumentForm((current) => ({
          ...current,
          templateId:
            current.templateId ||
            templateData.find((item) => item.active)?.id ||
            "",
          patientId: current.patientId || patientData[0]?.id || "",
        }));
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.createDocumentTemplate(templateForm);
      setNotice("Modelo criado com a versão 1.");
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function versionTemplate(template: DocumentTemplate) {
    const body = window.prompt(
      "Revise o conteúdo da nova versão:",
      template.body,
    );
    if (!body || body.trim() === template.body.trim()) return;
    setError("");
    try {
      await api.createDocumentTemplateVersion(template.id, body);
      setNotice(`Nova versão de “${template.name}” criada.`);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function createDocument(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.createDocument({
        templateId: documentForm.templateId,
        patientId: documentForm.patientId,
        ...(documentForm.planId ? { planId: documentForm.planId } : {}),
        ...(documentForm.professionalId
          ? { professionalId: documentForm.professionalId }
          : {}),
        title: documentForm.title,
      });
      setNotice("Documento criado como rascunho com snapshot preservado.");
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function changeStatus(
    item: IssuedDocument,
    status: "issued" | "cancelled",
  ) {
    if (
      status === "cancelled" &&
      !window.confirm(`Cancelar definitivamente “${item.title}”?`)
    )
      return;
    setError("");
    try {
      const updated = await api.updateDocumentStatus(item.id, status);
      setDocuments((current) =>
        current.map((document) =>
          document.id === updated.id ? updated : document,
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const patientPlans = plans.filter(
    (plan) => plan.patientId === documentForm.patientId,
  );
  const activeTemplates = templates.filter((template) => template.active);
  return (
    <>
      <PageHeader
        eyebrow="Formalização"
        title="Contratos e documentos"
        description="Emita documentos administrativos com conteúdo e versão preservados."
      />
      {error && <ErrorBanner error={error} />}
      {notice && <div className="success-banner">{notice}</div>}
      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="documents-layout">
          <section className="panel document-form-panel">
            <span className="eyebrow">Biblioteca</span>
            <h2>Novo modelo</h2>
            <form onSubmit={createTemplate}>
              <label>
                Nome
                <input
                  required
                  value={templateForm.name}
                  onChange={(event) =>
                    setTemplateForm({
                      ...templateForm,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Tipo
                <select
                  value={templateForm.kind}
                  onChange={(event) =>
                    setTemplateForm({
                      ...templateForm,
                      kind: event.target.value as DocumentKind,
                    })
                  }
                >
                  {Object.entries(documentKindLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Conteúdo
                <textarea
                  required
                  rows={8}
                  value={templateForm.body}
                  onChange={(event) =>
                    setTemplateForm({
                      ...templateForm,
                      body: event.target.value,
                    })
                  }
                />
              </label>
              <small>
                Variáveis: {"{{paciente_nome}}"}, {"{{plano_nome}}"},{" "}
                {"{{profissional_nome}}"}, {"{{profissional_crefito}}"},{" "}
                {"{{data_emissao}}"} e {"{{clinica_nome}}"}.
              </small>
              <button className="secondary-button">Criar modelo</button>
            </form>
          </section>
          <section className="panel document-form-panel">
            <span className="eyebrow">Emissão</span>
            <h2>Novo documento</h2>
            <form onSubmit={createDocument}>
              <label>
                Modelo ativo
                <select
                  required
                  value={documentForm.templateId}
                  onChange={(event) =>
                    setDocumentForm({
                      ...documentForm,
                      templateId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {activeTemplates.map((template) => (
                    <option value={template.id} key={template.id}>
                      {template.name} · v{template.version}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cliente
                <select
                  required
                  value={documentForm.patientId}
                  onChange={(event) =>
                    setDocumentForm({
                      ...documentForm,
                      patientId: event.target.value,
                      planId: "",
                    })
                  }
                >
                  {patients.map((patient) => (
                    <option value={patient.id} key={patient.id}>
                      {patient.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Plano vinculado
                <select
                  value={documentForm.planId}
                  onChange={(event) =>
                    setDocumentForm({
                      ...documentForm,
                      planId: event.target.value,
                    })
                  }
                >
                  <option value="">Sem plano</option>
                  {patientPlans.map((plan) => (
                    <option value={plan.id} key={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Profissional (opcional)
                <select
                  value={documentForm.professionalId}
                  onChange={(event) =>
                    setDocumentForm({
                      ...documentForm,
                      professionalId: event.target.value,
                    })
                  }
                >
                  <option value="">Sem profissional</option>
                  {professionals.map((professional) => (
                    <option value={professional.id} key={professional.id}>
                      {professionalWithCrefito(
                        professional.fullName,
                        professional.crefito,
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Título
                <input
                  required
                  value={documentForm.title}
                  onChange={(event) =>
                    setDocumentForm({
                      ...documentForm,
                      title: event.target.value,
                    })
                  }
                />
              </label>
              <button
                className="primary-button"
                disabled={!documentForm.templateId || !documentForm.patientId}
              >
                Criar rascunho
              </button>
            </form>
          </section>
          <section className="panel template-library">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Versões</span>
                <h2>Modelos cadastrados</h2>
              </div>
              <span className="list-count">{templates.length}</span>
            </div>
            {templates.length === 0 ? (
              <EmptyState
                title="Nenhum modelo"
                copy="Crie o primeiro modelo acima."
              />
            ) : (
              <div className="template-list">
                {templates.map((template) => (
                  <article key={template.id}>
                    <div>
                      <strong>{template.name}</strong>
                      <span>
                        {documentKindLabels[template.kind]} · versão{" "}
                        {template.version}
                      </span>
                    </div>
                    <span
                      className={`status-pill ${template.active ? "active" : "cancelled"}`}
                    >
                      {template.active ? "Ativa" : "Histórica"}
                    </span>
                    {template.active && (
                      <button
                        className="secondary-button"
                        onClick={() => void versionTemplate(template)}
                      >
                        Nova versão
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="panel issued-documents">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Documentos</span>
                <h2>Emissões e rascunhos</h2>
              </div>
              <span className="list-count">{documents.length}</span>
            </div>
            {documents.length === 0 ? (
              <EmptyState
                title="Nenhum documento"
                copy="Crie um rascunho a partir de um modelo."
              />
            ) : (
              <div className="issued-document-list">
                {documents.map((item) => (
                  <article key={item.id}>
                    <div className="document-summary">
                      <strong>{item.title}</strong>
                      <span>
                        {item.patientName} · {item.templateName} v
                        {item.templateVersion}
                      </span>
                      <details>
                        <summary>Ver conteúdo preservado</summary>
                        <pre>{item.snapshotBody}</pre>
                      </details>
                    </div>
                    <span className={`status-pill ${item.status}`}>
                      {item.status === "draft"
                        ? "Rascunho"
                        : item.status === "issued"
                          ? "Emitido"
                          : "Cancelado"}
                    </span>
                    <div className="document-actions">
                      {item.status === "draft" && (
                        <button
                          className="primary-button"
                          onClick={() => void changeStatus(item, "issued")}
                        >
                          Emitir
                        </button>
                      )}
                      {item.status !== "cancelled" && (
                        <button
                          className="secondary-button danger"
                          onClick={() => void changeStatus(item, "cancelled")}
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function SalesInsights() {
  const [month, setMonth] = useState(localIsoDate().slice(0, 7));
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const currentMovements =
    report?.sales.filter(
      (item) =>
        new Date(item.occurredAt)
          .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
          .slice(0, 7) === month,
    ) ?? [];

  useEffect(() => {
    let active = true;
    api
      .salesReport(month)
      .then((data) => active && setReport(data))
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month]);

  async function exportXlsx() {
    setExporting(true);
    setError("");
    try {
      const blob = await api.salesReportXlsx(month);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `vendas-${month}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="panel sales-report">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Vendas e clientes</span>
          <h2>Comparação mensal</h2>
        </div>
        <div className="sales-report-actions">
          <label>
            Mês{" "}
            <input
              type="month"
              value={month}
              max={localIsoDate().slice(0, 7)}
              onChange={(event) => {
                setLoading(true);
                setReport(null);
                setError("");
                setMonth(event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={!report || exporting || loading}
            onClick={() => void exportXlsx()}
          >
            {exporting ? "Exportando…" : "Exportar Excel detalhado"}
          </button>
        </div>
      </div>
      {error && <ErrorBanner error={error} />}
      {loading ? (
        <LoadingBlock />
      ) : report ? (
        <>
          <p className="sales-period">
            {formatIsoDate(report.current.from)} a {formatIsoDate(report.current.to)}
            {" · "}Comparado com {formatIsoDate(report.previousComparable.from)}
            {" "}a {formatIsoDate(report.previousComparable.to)}.
            {" "}{report.current.attendedPatients} clientes atendidos neste mês.
          </p>
          <div className="sales-metrics">
            <article>
              <span>Vendido no mês</span>
              <strong>
                {currency.format(report.current.netSalesInCents / 100)}
              </strong>
              <small>
                {report.changePercent === null
                  ? "Sem vendas no período anterior"
                  : `${report.changePercent > 0 ? "+" : ""}${report.changePercent}% frente ao mês anterior`}
              </small>
              <small>
                Antes dos cancelamentos: {currency.format(report.current.grossSalesInCents / 100)}
                {" · "}Cancelado: {currency.format(report.current.cancelledSalesInCents / 100)}
              </small>
            </article>
            <article>
              <span>Dinheiro recebido</span>
              <strong>
                {currency.format(report.current.receivedInCents / 100)}
              </strong>
              <small>Pagamentos registrados, após estornos</small>
            </article>
            <article>
              <span>Clientes sem retorno</span>
              <strong>{report.patientsWithoutReturn.length}</strong>
              <small>
                Atendidos no mês anterior, sem consulta concluída neste mês
              </small>
            </article>
          </div>
          <details className="report-disclosure sales-details">
            <summary>Ver vendas e clientes do mês</summary>
            <div className="sales-detail-grid">
            <div>
              <h3>Movimentos deste mês</h3>
              {currentMovements.length === 0 ? (
                <p>Nenhuma venda ou cancelamento.</p>
              ) : (
                <div className="sales-detail-list">
                  {currentMovements.slice(0, 12).map((item) => (
                    <div key={item.id}>
                      <span>
                        <strong>{item.itemName}</strong>
                        <small>
                          {item.patientName} ·{" "}
                          {item.kind === "sale" ? "Venda" : "Cancelamento"}
                        </small>
                      </span>
                      <b>{currency.format(item.amountInCents / 100)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3>Clientes sem retorno</h3>
              {report.patientsWithoutReturn.length === 0 ? (
                <p>Nenhum cliente nessa situação.</p>
              ) : (
                <div className="sales-detail-list">
                  {report.patientsWithoutReturn.slice(0, 12).map((item) => (
                    <div key={item.patientId}>
                      <span>
                        <strong>{item.patientName}</strong>
                        <small>
                          Último atendimento:{" "}
                          {shortDate.format(new Date(item.lastCompletedAt))}
                        </small>
                      </span>
                      <small>
                        {item.nextAppointmentAt
                          ? `Agendado: ${shortDate.format(new Date(item.nextAppointmentAt))}`
                          : "Sem agendamento"}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
          </details>
          <p className="sales-help">
            A planilha traz cada venda, pagamento e cliente sem retorno dos
            dois períodos comparados.
          </p>
        </>
      ) : null}
    </section>
  );
}

function ReportsPage() {
  const today = localIsoDate();
  const [filter, setFilter] = useState({
    from: `${today.slice(0, 8)}01`,
    to: today,
  });
  const [report, setReport] = useState<ManagementReport | null>(null);
  const [satisfaction, setSatisfaction] = useState<SatisfactionReport | null>(
    null,
  );
  const [satisfactionError, setSatisfactionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  async function loadSatisfaction(from: string, to: string) {
    setSatisfaction(null);
    setSatisfactionError("");
    try {
      setSatisfaction(await api.satisfaction(from, to));
    } catch (cause) {
      setSatisfactionError((cause as Error).message);
    }
  }

  async function load(from = filter.from, to = filter.to) {
    setLoading(true);
    setReport(null);
    setError("");
    void loadSatisfaction(from, to);
    try {
      setReport(await api.managementReport(from, to));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    const initialTo = localIsoDate();
    const initialFrom = `${initialTo.slice(0, 8)}01`;
    api
      .managementReport(initialFrom, initialTo)
      .then((data) => active && setReport(data))
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    api
      .satisfaction(initialFrom, initialTo)
      .then((data) => active && setSatisfaction(data))
      .catch((cause: Error) => active && setSatisfactionError(cause.message));
    return () => {
      active = false;
    };
  }, []);

  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const blob = await api.managementReportCsv(filter.from, filter.to);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `relatorio-${filter.from}-${filter.to}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Gestão por evidências"
        title="Relatórios gerenciais"
        description="Veja o resultado do mês e encontre quem precisa de acompanhamento."
      />
      <SalesInsights />
      <details className="report-disclosure report-advanced">
        <summary>Ver outros indicadores da clínica</summary>
        <p>
          Atendimentos, planos, caixa, estoque e resultados por serviço.
          Escolha um período para analisar esses dados.
        </p>
      <section className="report-filter">
        <label>
          De
          <input
            type="date"
            value={filter.from}
            max={filter.to}
            onChange={(event) =>
              setFilter({ ...filter, from: event.target.value })
            }
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={filter.to}
            min={filter.from}
            onChange={(event) =>
              setFilter({ ...filter, to: event.target.value })
            }
          />
        </label>
        <button
          className="primary-button"
          onClick={() => void load()}
          disabled={!filter.from || !filter.to}
        >
          Atualizar
        </button>
        <button
          className="secondary-button"
          disabled={!report || exporting}
          onClick={() => void exportCsv()}
        >
          {exporting ? "Exportando…" : "Exportar CSV"}
        </button>
      </section>
      {error && <ErrorBanner error={error} />}
      <section className="report-metrics">
        <article>
          <span>Satisfação (NPS)</span>
          {satisfaction ? (
            <>
              <strong>
                {satisfaction.summary.nps === null
                  ? "—"
                  : satisfaction.summary.nps}
              </strong>
              <small>
                {satisfaction.summary.total} respostas ·{" "}
                {satisfaction.summary.promoters} promotores ·{" "}
                {satisfaction.summary.passives} neutros ·{" "}
                {satisfaction.summary.detractors} detratores
              </small>
            </>
          ) : (
            <small>
              {satisfactionError || "Carregando pesquisas de satisfação…"}
            </small>
          )}
        </article>
      </section>
      {loading ? (
        <LoadingBlock />
      ) : report ? (
        <>
          <section className="report-metrics">
            <article>
              <span>Atendimentos</span>
              <strong>{report.appointments.total}</strong>
              <small>{report.appointments.attendanceRate}% de presença</small>
            </article>
            <article>
              <span>Sessões disponíveis</span>
              <strong>{report.plans.availableSessions}</strong>
              <small>{report.plans.active} planos ativos</small>
            </article>
            <article>
              <span>Recebido no período</span>
              <strong>
                {currency.format(report.finance.paidInPeriodInCents / 100)}
              </strong>
              <small>
                {currency.format(report.finance.overdueInCents / 100)} em atraso
              </small>
            </article>
            <article>
              <span>Conversão comercial</span>
              <strong>{report.commercial.conversionRate}%</strong>
              <small>
                {report.commercial.leadsCreated} leads · média de{" "}
                {report.commercial.averageFirstResponseMinutes} min para
                resposta
              </small>
            </article>
          </section>
          <section className="dre-section">
            <div className="panel dre-card">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Resultado financeiro</span>
                  <h2>DRE básica por caixa</h2>
                </div>
                <strong
                  className={
                    report.profitability.dre.netResultInCents >= 0
                      ? "positive"
                      : "negative"
                  }
                >
                  {currency.format(
                    report.profitability.dre.netResultInCents / 100,
                  )}
                </strong>
              </div>
              <div className="dre-lines">
                <div><span>Receita de serviços</span><strong>{currency.format(report.profitability.dre.serviceRevenueInCents / 100)}</strong></div>
                <div><span>Receita de produtos</span><strong>{currency.format(report.profitability.dre.productRevenueInCents / 100)}</strong></div>
                <div className="dre-total"><span>Receita bruta</span><strong>{currency.format(report.profitability.dre.grossRevenueInCents / 100)}</strong></div>
                <div><span>(−) Custo dos produtos</span><strong>{currency.format(report.profitability.dre.productCostInCents / 100)}</strong></div>
                <div><span>(−) Despesas operacionais</span><strong>{currency.format(report.profitability.dre.operatingExpensesInCents / 100)}</strong></div>
                <div><span>(−) Comissões</span><strong>{currency.format(report.profitability.dre.commissionsInCents / 100)}</strong></div>
                <div className="dre-total"><span>Resultado líquido</span><strong>{currency.format(report.profitability.dre.netResultInCents / 100)} · {report.profitability.dre.netMargin}%</strong></div>
              </div>
            </div>
            <div className="panel operation-card">
              <div className="panel-head"><div><span className="eyebrow">Eficiência</span><h2>Indicadores operacionais</h2></div></div>
              <div className="operation-metrics">
                <article><strong>{report.profitability.operational.groupOccupancyRate}%</strong><span>Ocupação das turmas</span><small>{report.profitability.operational.activeGroupSeats}/{report.profitability.operational.totalGroupCapacity} vagas</small></article>
                <article><strong>{report.profitability.operational.waitlistCount}</strong><span>Em lista de espera</span></article>
                <article><strong>{report.profitability.operational.lowStockCount}</strong><span>Produtos com estoque baixo</span></article>
                <article><strong>{report.profitability.operational.productUnitsSold}</strong><span>Unidades vendidas</span></article>
                <article><strong>{currency.format(report.profitability.operational.averageReceiptInCents / 100)}</strong><span>Ticket médio recebido</span></article>
              </div>
            </div>
          </section>
          <section className="profit-grid">
            <div className="panel profit-table">
              <div className="panel-head"><div><span className="eyebrow">Margem</span><h2>Rentabilidade por serviço</h2></div></div>
              {report.profitability.byService.length === 0 ? <EmptyState title="Sem dados" copy="Não houve produção ou recebimento de serviços no período." /> : <div className="profit-rows">{report.profitability.byService.map((item)=><div key={item.id}><span><strong>{item.name}</strong><small>{item.completedAppointments} atendimentos concluídos</small></span><span>{currency.format(item.revenueInCents/100)} receita</span><span>{currency.format(item.commissionsInCents/100)} comissões</span><b>{currency.format(item.contributionInCents/100)} · {item.contributionMargin}%</b></div>)}</div>}
            </div>
            <div className="panel profit-table">
              <div className="panel-head"><div><span className="eyebrow">Produtos</span><h2>Rentabilidade por produto</h2></div></div>
              {report.profitability.byProduct.length === 0 ? <EmptyState title="Sem vendas" copy="Nenhuma venda de produto foi recebida no período." /> : <div className="profit-rows">{report.profitability.byProduct.map((item)=><div key={item.id}><span><strong>{item.name}</strong><small>{item.unitsSold} unidades</small></span><span>{currency.format(item.revenueInCents/100)} receita</span><span>{currency.format(item.costInCents/100)} custo</span><b>{currency.format(item.grossProfitInCents/100)} · {item.grossMargin}%</b></div>)}</div>}
            </div>
          </section>
          <div className="report-grid">
            <ReportBreakdown
              title="Por profissional"
              items={report.byProfessional}
              empty="Sem atendimentos de profissionais no período."
            />
            <ReportBreakdown
              title="Por serviço"
              items={report.byService}
              empty="Sem serviços realizados no período."
            />
            <section className="panel report-table source-report">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Aquisição</span>
                  <h2>Conversão por origem</h2>
                </div>
              </div>
              {report.bySource.length === 0 ? (
                <EmptyState
                  title="Sem leads"
                  copy="Nenhum lead foi criado no período."
                />
              ) : (
                <div className="report-rows">
                  {report.bySource.map((item) => (
                    <div key={item.source}>
                      <strong>{item.source}</strong>
                      <span>{item.leads} leads</span>
                      <span>{item.won} ganhos</span>
                      <b>{item.conversionRate}%</b>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          <p className="report-definition">
            Presença = concluídos ÷ (concluídos + faltas não justificadas).
            Conversão = ganhos atuais ÷ leads criados no período selecionado.
          </p>
        </>
      ) : null}
      </details>
    </>
  );
}

function ReportBreakdown({
  title,
  items,
  empty,
}: {
  title: string;
  items: ManagementReport["byProfessional"];
  empty: string;
}) {
  return (
    <section className="panel report-table">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Operação</span>
          <h2>{title}</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Sem movimento" copy={empty} />
      ) : (
        <div className="report-rows">
          {items.map((item) => (
            <div key={item.id}>
              <strong>{item.name}</strong>
              <span>{item.appointments} atendimentos</span>
              <span>{item.noShows} faltas</span>
              <b>{item.attendanceRate}%</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CommercialPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [activityLead, setActivityLead] = useState<Lead | null>(null);
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
    const lostReason =
      stage === "lost"
        ? window.prompt("Qual foi o motivo da perda?")?.trim()
        : undefined;
    if (stage === "lost" && !lostReason) return;
    setError("");
    try {
      replaceLead(await api.moveLead(lead.id, stage, lostReason));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function convert(lead: Lead) {
    if (!window.confirm(`Converter ${lead.fullName} em cliente?`)) return;
    setError("");
    try {
      const result = await api.convertLead(lead.id);
      replaceLead(result.lead);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  const activeLeads = leads.filter(
    (lead) => !["won", "lost"].includes(lead.stage),
  );
  return (
    <>
      <PageHeader
        eyebrow="Relacionamento"
        title="CRM comercial"
        description="Acompanhe cada oportunidade desde o primeiro contato até a conversão."
        action={
          <button className="primary-button" onClick={() => setModalOpen(true)}>
            <Plus size={18} />
            Novo lead
          </button>
        }
      />
      {error && <ErrorBanner error={error} />}
      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <section className="commercial-metrics">
            <div>
              <strong>{activeLeads.length}</strong>
              <span>oportunidades abertas</span>
            </div>
            <div>
              <strong>
                {leads.filter((lead) => lead.stage === "won").length}
              </strong>
              <span>conversões</span>
            </div>
            <div>
              <strong>
                {leads.length
                  ? Math.round(
                      (leads.filter((lead) => lead.stage === "won").length /
                        leads.length) *
                        100,
                    )
                  : 0}
                %
              </strong>
              <span>taxa de conversão</span>
            </div>
          </section>
          <div className="kanban-board">
            {leadStages.map((stage) => (
              <section className="kanban-column" key={stage.value}>
                <header>
                  <strong>{stage.label}</strong>
                  <span>
                    {leads.filter((lead) => lead.stage === stage.value).length}
                  </span>
                </header>
                <div>
                  {leads
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
                          <span className={lead.overdueTasks ? "overdue" : ""}>
                            {lead.openTasks} tarefa(s)
                            {lead.overdueTasks > 0
                              ? ` · ${lead.overdueTasks} atrasada(s)`
                              : ""}
                          </span>
                          <button onClick={() => setActivityLead(lead)}>
                            Atividades
                          </button>
                        </div>
                        {lead.lostReason && (
                          <div className="lost-reason">{lead.lostReason}</div>
                        )}
                        {!["won", "lost"].includes(lead.stage) && (
                          <div className="lead-actions">
                            <select
                              value={lead.stage}
                              onChange={(event) =>
                                void move(lead, event.target.value as LeadStage)
                              }
                            >
                              {leadStages
                                .filter((item) => item.value !== "won")
                                .map((item) => (
                                  <option value={item.value} key={item.value}>
                                    {item.label}
                                  </option>
                                ))}
                            </select>
                            <button
                              className="primary-button"
                              onClick={() => void convert(lead)}
                            >
                              Converter
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </>
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
      {activityLead && (
        <LeadActivityModal
          lead={activityLead}
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

function LeadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (lead: Lead) => void;
}) {
  const [form, setForm] = useState<LeadInput>({
    fullName: "",
    phone: "",
    email: "",
    source: "Indicação",
    interest: "Fisioterapia",
    notes: "",
    responsibleUserId: getStoredUser()?.id ?? "",
    tags: [],
  });
  const [tagText, setTagText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onCreated(
        await api.createLead({
          ...form,
          tags: tagText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Novo lead"
      subtitle="Registre o contato para acompanhar a oportunidade no funil."
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Nome completo
          <input
            required
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            autoFocus
          />
        </label>
        <label>
          Telefone
          <PhoneInput
            required
            value={form.phone}
            onChange={(digits) => setForm({ ...form, phone: digits })}
          />
        </label>
        <label>
          E-mail
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Origem
          <input
            required
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          />
        </label>
        <label>
          Interesse
          <input
            required
            value={form.interest}
            onChange={(e) => setForm({ ...form, interest: e.target.value })}
          />
        </label>
        <label className="span-2">
          Observações
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <label>
          Responsável
          <select
            value={form.responsibleUserId}
            onChange={(e) =>
              setForm({ ...form, responsibleUserId: e.target.value })
            }
          >
            <option value="">Não atribuído</option>
            {getStoredUser() && (
              <option value={getStoredUser()!.id}>
                {getStoredUser()!.fullName}
              </option>
            )}
          </select>
        </label>
        <label>
          Etiquetas
          <input
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder="Ortopedia, indicação, prioridade"
          />
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={loading}>
            {loading ? "Salvando…" : "Adicionar ao funil"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LeadActivityModal({
  lead,
  onClose,
  onChanged,
}: {
  lead: Lead;
  onClose: () => void;
  onChanged: () => void;
}) {
  const currentUser = getStoredUser();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const [activity, setActivity] = useState<LeadActivity | null>(null);
  const [tab, setTab] = useState<"contacts" | "tasks">("tasks");
  const [contact, setContact] = useState<LeadContactInput>({
    channel: "phone",
    direction: "outbound",
    notes: "",
  });
  const [task, setTask] = useState({
    title: "Retornar contato",
    notes: "",
    dueAt: toLocalDateTimeInput(tomorrow),
    assignedUserId: currentUser?.id ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .leadActivity(lead.id)
      .then((data) => active && setActivity(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [lead.id]);

  async function addContact(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await api.createLeadContact(lead.id, contact);
      setActivity((current) =>
        current
          ? { ...current, contacts: [created, ...current.contacts] }
          : current,
      );
      setContact({ ...contact, notes: "" });
      onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addTask(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await api.createLeadTask(lead.id, {
        ...task,
        dueAt: new Date(task.dueAt).toISOString(),
      });
      setActivity((current) =>
        current ? { ...current, tasks: [...current.tasks, created] } : current,
      );
      setTask({ ...task, title: "", notes: "" });
      onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function changeTask(taskId: string, status: "completed" | "cancelled") {
    try {
      const updated = await api.updateLeadTaskStatus(taskId, status);
      setActivity((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <Modal
      title={lead.fullName}
      subtitle="Contatos e tarefas comerciais em uma única linha do tempo."
      onClose={onClose}
    >
      <div className="activity-tabs">
        <button
          className={tab === "tasks" ? "active" : ""}
          onClick={() => setTab("tasks")}
        >
          Tarefas (
          {activity?.tasks.filter((item) => item.status === "open").length ?? 0}
          )
        </button>
        <button
          className={tab === "contacts" ? "active" : ""}
          onClick={() => setTab("contacts")}
        >
          Contatos ({activity?.contacts.length ?? 0})
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {!activity ? (
        <LoadingBlock />
      ) : tab === "tasks" ? (
        <div className="lead-activity-content">
          <form className="activity-form" onSubmit={addTask}>
            <label>
              Tarefa
              <input
                required
                value={task.title}
                onChange={(event) =>
                  setTask({ ...task, title: event.target.value })
                }
              />
            </label>
            <label>
              Vencimento
              <input
                required
                type="datetime-local"
                value={task.dueAt}
                onChange={(event) =>
                  setTask({ ...task, dueAt: event.target.value })
                }
              />
            </label>
            <label className="span-2">
              Observações
              <input
                value={task.notes}
                onChange={(event) =>
                  setTask({ ...task, notes: event.target.value })
                }
              />
            </label>
            <button className="primary-button span-2" disabled={saving}>
              Adicionar tarefa
            </button>
          </form>
          <div className="activity-list">
            {activity.tasks.map((item) => (
              <article key={item.id} className={item.status}>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {new Date(item.dueAt).toLocaleString("pt-BR")} ·{" "}
                    {item.assignedUserName ?? "Sem responsável"}
                  </span>
                </div>
                {item.status === "open" ? (
                  <div>
                    <button
                      onClick={() => void changeTask(item.id, "completed")}
                    >
                      Concluir
                    </button>
                    <button
                      onClick={() => void changeTask(item.id, "cancelled")}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <span>
                    {item.status === "completed" ? "Concluída" : "Cancelada"}
                  </span>
                )}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="lead-activity-content">
          <form className="activity-form" onSubmit={addContact}>
            <label>
              Canal
              <select
                value={contact.channel}
                onChange={(event) =>
                  setContact({
                    ...contact,
                    channel: event.target.value as LeadContactInput["channel"],
                  })
                }
              >
                <option value="phone">Telefone</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
                <option value="in_person">Presencial</option>
                <option value="note">Nota interna</option>
              </select>
            </label>
            <label>
              Direção
              <select
                value={contact.direction}
                onChange={(event) =>
                  setContact({
                    ...contact,
                    direction: event.target
                      .value as LeadContactInput["direction"],
                  })
                }
              >
                <option value="outbound">Realizado</option>
                <option value="inbound">Recebido</option>
                <option value="internal">Registro interno</option>
              </select>
            </label>
            <label className="span-2">
              Registro do contato
              <textarea
                required
                rows={3}
                value={contact.notes}
                onChange={(event) =>
                  setContact({ ...contact, notes: event.target.value })
                }
              />
            </label>
            <button className="primary-button span-2" disabled={saving}>
              Registrar contato
            </button>
          </form>
          <div className="activity-list contact-timeline">
            {activity.contacts.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.notes}</strong>
                  <span>
                    {item.actorName} ·{" "}
                    {new Date(item.occurredAt).toLocaleString("pt-BR")}
                  </span>
                </div>
                <span>{item.channel}</span>
              </article>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

const planKindLabels: Record<PatientPlan["kind"], string> = {
  single: "Avulso",
  fixed_package: "Pacote fixo",
  recurring: "Recorrente",
  custom: "Personalizado",
};

function PlansPage({ canManage }: { canManage: boolean }) {
  const [plans, setPlans] = useState<PatientPlan[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [movementPlan, setMovementPlan] = useState<PatientPlan | null>(null);
  const [renewingPlan, setRenewingPlan] = useState<PatientPlan | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api.plans(), api.patients(), api.services()])
      .then(([planData, patientData, serviceData]) => {
        if (!active) return;
        setPlans(planData);
        setPatients(patientData);
        setServices(serviceData);
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

  function replacePlan(plan: PatientPlan) {
    setPlans((items) => [plan, ...items.filter((item) => item.id !== plan.id)]);
  }

  async function changeStatus(plan: PatientPlan, status: PlanStatus) {
    setError("");
    try {
      replacePlan(await api.updatePlanStatus(plan.id, status));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function toggleAutoRenew(plan: PatientPlan) {
    setError("");
    try {
      const updated = await api.setPlanAutoRenew(plan.id, !plan.autoRenew);
      setPlans((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  function planRenewalLabel(plan: PatientPlan) {
    if (plan.renewedByPlanId) {
      const next = plans.find((item) => item.id === plan.renewedByPlanId);
      return next
        ? `Renovado a partir de ${shortDate.format(new Date(`${next.validFrom}T12:00:00`))}`
        : "Renovado";
    }
    if (plan.autoRenew && plan.validUntil) {
      return `Automática em ${shortDate.format(new Date(`${nextPlanPeriod(plan)!.validFrom}T12:00:00`))}`;
    }
    return "Manual";
  }

  return (
    <>
      <PageHeader
        eyebrow="Jornada contratada"
        title="Planos e sessões"
        description="Controle validade, saldo e consumo de cada pacote vendido."
        action={
          canManage ? (
            <button
              className="primary-button"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={18} />
              Novo plano
            </button>
          ) : undefined
        }
      />
      {error && <ErrorBanner error={error} />}
      <section className="plan-metrics">
        <div>
          <strong>
            {plans.filter((plan) => plan.status === "active").length}
          </strong>
          <span>planos ativos</span>
        </div>
        <div>
          <strong>
            {plans.reduce((sum, plan) => sum + plan.remainingSessions, 0)}
          </strong>
          <span>sessões disponíveis</span>
        </div>
        <div>
          <strong>
            {
              plans.filter(
                (plan) =>
                  plan.remainingSessions <= 2 && plan.status === "active",
              ).length
            }
          </strong>
          <span>saldos baixos</span>
        </div>
      </section>
      <section className="panel plans-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Carteira</span>
            <h2>Planos dos clientes</h2>
          </div>
        </div>
        {loading ? (
          <LoadingBlock />
        ) : plans.length === 0 ? (
          <EmptyState
            title="Nenhum plano cadastrado"
            copy="Crie um pacote para gerar o saldo e as parcelas automaticamente."
          />
        ) : (
          <div className="plans-grid">
            {plans.map((plan) => {
              const used = plan.totalSessions - plan.remainingSessions;
              const percent = Math.min(
                100,
                Math.round((used / plan.totalSessions) * 100),
              );
              return (
                <article className="plan-card" key={plan.id}>
                  <div className="plan-card-head">
                    <span className={`status-pill ${plan.status}`}>
                      {plan.status === "active"
                        ? "Ativo"
                        : plan.status === "paused"
                          ? "Pausado"
                          : plan.status === "expired"
                            ? "Expirado"
                            : "Cancelado"}
                    </span>
                    <span>{planKindLabels[plan.kind]}</span>
                  </div>
                  <h3>{plan.patientName}</h3>
                  <p>
                    {plan.name} · {plan.serviceName}
                  </p>
                  <div className="balance-line">
                    <strong>{plan.remainingSessions}</strong>
                    <span>de {plan.totalSessions} sessões restantes</span>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  <div className="plan-meta">
                    <span>Validade</span>
                    <strong>
                      {shortDate.format(new Date(`${plan.validFrom}T12:00:00`))}
                      {plan.validUntil
                        ? ` — ${shortDate.format(new Date(`${plan.validUntil}T12:00:00`))}`
                        : " · contínuo"}
                    </strong>
                  </div>
                  {plan.status !== "cancelled" && (
                    <div className="plan-meta plan-renewal">
                      <span>Renovação</span>
                      <strong>{planRenewalLabel(plan)}</strong>
                      {canManage &&
                        plan.validUntil &&
                        !plan.renewedByPlanId &&
                        plan.status !== "expired" && (
                          <label className="plan-auto-renew">
                            <input
                              type="checkbox"
                              checked={plan.autoRenew}
                              onChange={() => void toggleAutoRenew(plan)}
                            />
                            Renovar automaticamente
                          </label>
                        )}
                    </div>
                  )}
                  <div className="plan-actions">
                    <button
                      className="secondary-button"
                      onClick={() => setMovementPlan(plan)}
                    >
                      <FileClock size={15} />
                      Extrato
                    </button>
                    {canManage &&
                      plan.status !== "cancelled" &&
                      !plan.renewedByPlanId && (
                        <button
                          className="secondary-button"
                          onClick={() => setRenewingPlan(plan)}
                        >
                          <RefreshCw size={15} />
                          Renovar
                        </button>
                      )}
                    {canManage && plan.status !== "cancelled" && (
                      <>
                        {plan.status === "active" ? (
                          <button
                            className="secondary-button"
                            onClick={() => void changeStatus(plan, "paused")}
                          >
                            <Pause size={15} />
                            Pausar
                          </button>
                        ) : (
                          <button
                            className="secondary-button"
                            onClick={() => void changeStatus(plan, "active")}
                          >
                            <Play size={15} />
                            Ativar
                          </button>
                        )}
                        <button
                          className="ghost-danger"
                          onClick={() =>
                            window.confirm(
                              "Cancelar este plano definitivamente?",
                            ) && void changeStatus(plan, "cancelled")
                          }
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {modalOpen && (
        <PlanModal
          patients={patients}
          services={services}
          onClose={() => setModalOpen(false)}
          onSaved={(plan) => {
            replacePlan(plan);
            setModalOpen(false);
          }}
        />
      )}
      {renewingPlan && (
        <PlanModal
          patients={patients}
          services={services}
          renewing={renewingPlan}
          onClose={() => setRenewingPlan(null)}
          onSaved={(plan) => {
            const renewedFrom = renewingPlan.id;
            setPlans((items) => [
              plan,
              ...items.map((item) =>
                item.id === renewedFrom
                  ? { ...item, renewedByPlanId: plan.id }
                  : item,
              ),
            ]);
            setRenewingPlan(null);
          }}
        />
      )}
      {movementPlan && (
        <SessionMovementsModal
          plan={movementPlan}
          onClose={() => setMovementPlan(null)}
        />
      )}
    </>
  );
}

function PlanModal({
  patients,
  services,
  renewing,
  onClose,
  onSaved,
}: {
  patients: Patient[];
  services: Service[];
  renewing?: PatientPlan;
  onClose: () => void;
  onSaved: (plan: PatientPlan) => void;
}) {
  const currentDate = localIsoDate();
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const [form, setForm] = useState<PatientPlanInput>(() => {
    if (!renewing) {
      return {
        patientId: patients[0]?.id ?? "",
        serviceId: services[0]?.id ?? "",
        name: "Pacote de fisioterapia",
        kind: "fixed_package",
        totalSessions: 10,
        validFrom: currentDate,
        validUntil: localIsoDate(nextYear),
        totalValueInCents: 180000,
        installments: 3,
        firstDueDate: currentDate,
        autoRenew: false,
      };
    }
    const period = nextPlanPeriod(renewing) ?? {
      validFrom: currentDate,
      validUntil: "",
      firstDueDate: currentDate,
    };
    return {
      patientId: renewing.patientId,
      serviceId: renewing.serviceId,
      name: renewing.name,
      kind: renewing.kind,
      totalSessions: renewing.totalSessions,
      totalValueInCents: renewing.totalValueInCents,
      installments: renewing.installments,
      autoRenew: renewing.autoRenew && Boolean(period.validUntil),
      ...period,
    };
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (renewing) {
        onSaved(
          await api.renewPlan(renewing.id, {
            name: form.name,
            totalSessions: form.totalSessions,
            validFrom: form.validFrom,
            validUntil: form.validUntil,
            totalValueInCents: form.totalValueInCents,
            installments: form.installments,
            firstDueDate: form.firstDueDate,
            autoRenew: Boolean(form.autoRenew),
          }),
        );
      } else {
        onSaved(await api.createPlan(form));
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title={renewing ? "Renovar plano" : "Novo plano"}
      subtitle={
        renewing
          ? `${renewing.patientName} · ${renewing.serviceName}. O novo período recebe saldo e parcelas próprios; as sessões restantes do plano atual não são transferidas.`
          : "O saldo e as contas a receber serão criados na mesma operação."
      }
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        {!renewing && (
          <>
            <label className="span-2">
              Cliente
              <select
                required
                value={form.patientId}
                onChange={(e) => setForm({ ...form, patientId: e.target.value })}
              >
                {patients.map((patient) => (
                  <option value={patient.id} key={patient.id}>
                    {patient.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Serviço
              <select
                required
                value={form.serviceId}
                onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
              >
                {services.map((service) => (
                  <option value={service.id} key={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Modelo
              <select
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value as PatientPlan["kind"];
                  setForm({ ...form, kind, autoRenew: kind === "recurring" });
                }}
              >
                {Object.entries(planKindLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="span-2">
          Nome do plano
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Sessões
          <input
            required
            type="number"
            min="1"
            value={form.totalSessions}
            onChange={(e) =>
              setForm({ ...form, totalSessions: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Valor total
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={form.totalValueInCents / 100}
            onChange={(e) =>
              setForm({
                ...form,
                totalValueInCents: Math.round(Number(e.target.value) * 100),
              })
            }
          />
        </label>
        <label>
          Início
          <input
            required
            type="date"
            value={form.validFrom}
            onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
          />
        </label>
        <label>
          Fim da validade
          <input
            type="date"
            value={form.validUntil}
            onChange={(e) =>
              setForm({
                ...form,
                validUntil: e.target.value,
                autoRenew: Boolean(e.target.value) && form.autoRenew,
              })
            }
          />
        </label>
        <label>
          Parcelas
          <input
            required
            type="number"
            min="1"
            max="36"
            value={form.installments}
            onChange={(e) =>
              setForm({ ...form, installments: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Primeiro vencimento
          <input
            required
            type="date"
            value={form.firstDueDate}
            onChange={(e) => setForm({ ...form, firstDueDate: e.target.value })}
          />
        </label>
        <label className="checkbox-field span-2">
          <input
            type="checkbox"
            checked={Boolean(form.autoRenew)}
            disabled={!form.validUntil}
            onChange={(e) => setForm({ ...form, autoRenew: e.target.checked })}
          />
          {form.validUntil
            ? "Renovar automaticamente ao fim da validade, com as mesmas condições"
            : "Renovação automática exige o fim da validade"}
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={loading}>
            {renewing
              ? loading
                ? "Renovando…"
                : "Renovar plano e gerar parcelas"
              : loading
                ? "Criando…"
                : "Criar plano e parcelas"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SessionMovementsModal({
  plan,
  onClose,
}: {
  plan: PatientPlan;
  onClose: () => void;
}) {
  const [movements, setMovements] = useState<
    Awaited<ReturnType<typeof api.sessionMovements>>
  >([]);
  useEffect(() => {
    let active = true;
    api.sessionMovements(plan.id).then((data) => {
      if (active) setMovements(data);
    });
    return () => {
      active = false;
    };
  }, [plan.id]);
  return (
    <Modal
      title={`Extrato · ${plan.patientName}`}
      subtitle={`${plan.remainingSessions} sessões disponíveis no momento.`}
      onClose={onClose}
    >
      <div className="movement-list">
        {movements.length === 0 ? (
          <LoadingBlock />
        ) : (
          movements.map((movement) => (
            <div key={movement.id}>
              <span
                className={
                  movement.quantity > 0 ? "movement-credit" : "movement-debit"
                }
              >
                {movement.quantity > 0 ? "+" : ""}
                {movement.quantity}
              </span>
              <div>
                <strong>{movement.reason}</strong>
                <small>
                  {new Date(movement.createdAt).toLocaleString("pt-BR")}
                </small>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

function FinancePage() {
  const [data, setData] = useState<FinancialWorkspace | null>(null);
  const [tab, setTab] = useState<"receivables" | "payables" | "commissions">(
    "receivables",
  );
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedReceivables, setSelectedReceivables] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [payableModal, setPayableModal] = useState(false);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState("");
  async function reload() {
    setData(await api.financialWorkspace());
  }
  useEffect(() => {
    let active = true;
    Promise.all([api.financialWorkspace(), api.professionals()])
      .then(([workspace, professionalData]) => {
        if (active) {
          setData(workspace);
          setProfessionals(professionalData);
        }
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);
  async function receivableAction(id: string, operation: "pay" | "reverse") {
    setError("");
    try {
      if (operation === "pay") await api.settleReceivable(id, paymentMethod);
      else await api.reverseReceivable(id);
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function payableAction(id: string, operation: "pay" | "reverse") {
    setError("");
    try {
      if (operation === "pay") await api.settlePayable(id, paymentMethod);
      else await api.reversePayable(id);
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function adjustReceivable(id: string, currentValue: number) {
    const value = window.prompt(
      "Novo valor da parcela em reais:",
      String(currentValue / 100),
    );
    if (value === null) return;
    const reason = window
      .prompt("Justificativa obrigatória do ajuste:")
      ?.trim();
    if (!reason) return;
    try {
      await api.adjustReceivable(id, Math.round(Number(value) * 100), reason);
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function createCategory() {
    const name = window.prompt("Nome da nova categoria de despesa:")?.trim();
    if (!name) return;
    try {
      await api.createFinancialCategory({ name, kind: "expense" });
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function createCenter() {
    const name = window.prompt("Nome do novo centro de custo:")?.trim();
    if (!name) return;
    try {
      await api.createCostCenter({ name });
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function renegotiate() {
    if (!data || selectedReceivables.length === 0) return;
    const selected = data.summary.receivables.filter((item) =>
      selectedReceivables.includes(item.id),
    );
    const total = selected.reduce((sum, item) => sum + item.amountInCents, 0);
    const value = window.prompt(
      "Novo valor total em reais:",
      String(total / 100),
    );
    const installments = window.prompt(
      "Quantidade de novas parcelas:",
      String(selected.length),
    );
    const firstDueDate = window.prompt(
      "Primeiro vencimento (AAAA-MM-DD):",
      new Date().toISOString().slice(0, 10),
    );
    const reason = window.prompt("Motivo da renegociação:")?.trim();
    if (!value || !installments || !firstDueDate || !reason) return;
    try {
      await api.renegotiateReceivables({
        receivableIds: selectedReceivables,
        totalAmountInCents: Math.round(Number(value) * 100),
        installments: Number(installments),
        firstDueDate,
        reason,
      });
      setSelectedReceivables([]);
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function createCommissionRule() {
    const professional = professionals[0];
    if (!professional) return;
    const percentage = window.prompt(
      `Percentual para ${professional.fullName}:`,
      "30",
    );
    if (!percentage) return;
    try {
      await api.createCommissionRule({
        professionalId: professional.id,
        percentage: Number(percentage),
        effectiveFrom: new Date().toISOString().slice(0, 10),
      });
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Saúde financeira"
        title="Financeiro"
        description="Controle entradas, despesas, pagamentos e fluxo de caixa."
        action={
          <div className="page-actions">
            <button
              className="secondary-button"
              onClick={() => void createCategory()}
            >
              + Categoria
            </button>
            <button
              className="secondary-button"
              onClick={() => void createCenter()}
            >
              + Centro de custo
            </button>
            <button
              className="primary-button"
              onClick={() => setPayableModal(true)}
            >
              <Plus size={18} /> Nova despesa
            </button>
          </div>
        }
      />
      {error && <ErrorBanner error={error} />}
      {!data ? (
        <LoadingBlock />
      ) : (
        <>
          <section className="metric-grid finance-metrics">
            <article className="metric-card accent">
              <span>Saldo do mês</span>
              <strong>
                {currency.format(data.cashBalanceThisMonthInCents / 100)}
              </strong>
            </article>
            <article className="metric-card">
              <span>Recebido no mês</span>
              <strong>
                {currency.format(data.summary.paidThisMonthInCents / 100)}
              </strong>
            </article>
            <article className="metric-card">
              <span>Despesas pagas</span>
              <strong>
                {currency.format(data.paidExpensesThisMonthInCents / 100)}
              </strong>
            </article>
            <article className="metric-card">
              <span>Compromissos em aberto</span>
              <strong>{currency.format(data.payableOpenInCents / 100)}</strong>
            </article>
          </section>
          <section className="finance-controls">
            <div className="activity-tabs">
              <button
                className={tab === "receivables" ? "active" : ""}
                onClick={() => setTab("receivables")}
              >
                Contas a receber ({data.summary.receivables.length})
              </button>
              <button
                className={tab === "payables" ? "active" : ""}
                onClick={() => setTab("payables")}
              >
                Contas a pagar ({data.payables.length})
              </button>
              <button
                className={tab === "commissions" ? "active" : ""}
                onClick={() => setTab("commissions")}
              >
                Comissões ({data.commissions.length})
              </button>
            </div>
            <label>
              Forma usada na baixa
              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as PaymentMethod)
                }
              >
                <option value="pix">Pix</option>
                <option value="card">Cartão</option>
                <option value="cash">Dinheiro</option>
                <option value="bank_transfer">Transferência</option>
                <option value="boleto">Boleto</option>
                <option value="other">Outro</option>
              </select>
            </label>
          </section>
          <section className="panel finance-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">
                  {tab === "receivables"
                    ? "Entradas"
                    : tab === "payables"
                      ? "Saídas"
                      : "Profissionais"}
                </span>
                <h2>
                  {tab === "receivables"
                    ? "Parcelas"
                    : tab === "payables"
                      ? "Despesas"
                      : "Comissões"}
                </h2>
              </div>
              {tab === "receivables" && selectedReceivables.length > 0 && (
                <button
                  className="primary-button"
                  onClick={() => void renegotiate()}
                >
                  Renegociar ({selectedReceivables.length})
                </button>
              )}
              {tab === "commissions" && (
                <div className="page-actions">
                  <button
                    className="secondary-button"
                    onClick={() => void createCommissionRule()}
                  >
                    + Regra
                  </button>
                  <button
                    className="primary-button"
                    onClick={async () => {
                      await api.generateCommissions(
                        new Date().toISOString().slice(0, 7),
                      );
                      await reload();
                    }}
                  >
                    Gerar competência
                  </button>
                </div>
              )}
            </div>
            {tab === "receivables" ? (
              data.summary.receivables.length === 0 ? (
                <EmptyState
                  title="Nenhuma conta a receber"
                  copy="As parcelas surgem após a venda de um plano."
                />
              ) : (
                <div className="finance-table advanced">
                  {data.summary.receivables.map((item) => (
                    <div className="finance-row" key={item.id}>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${item.description}`}
                        disabled={item.status !== "open"}
                        checked={selectedReceivables.includes(item.id)}
                        onChange={() =>
                          setSelectedReceivables((current) =>
                            current.includes(item.id)
                              ? current.filter((id) => id !== item.id)
                              : [...current, item.id],
                          )
                        }
                      />
                      <div>
                        <strong>{item.patientName}</strong>
                        <span>{item.description}</span>
                      </div>
                      <div>
                        <span>Vencimento</span>
                        <strong>
                          {new Date(
                            `${item.dueDate}T12:00:00`,
                          ).toLocaleDateString("pt-BR")}
                        </strong>
                      </div>
                      <strong>
                        {currency.format(item.amountInCents / 100)}
                      </strong>
                      <span
                        className={`status-pill ${item.overdue ? "overdue" : item.status}`}
                      >
                        {item.overdue
                          ? "Vencida"
                          : item.status === "paid"
                            ? "Paga"
                            : item.status === "cancelled"
                              ? "Cancelada"
                              : "Aberta"}
                      </span>
                      <div className="finance-actions">
                        {item.status === "open" && (
                          <button
                            className="secondary-button"
                            onClick={() =>
                              void adjustReceivable(item.id, item.amountInCents)
                            }
                          >
                            Ajustar
                          </button>
                        )}
                        {item.status === "paid" && (
                          <button
                            className="secondary-button"
                            onClick={() =>
                              void api
                                .paymentReceipt(item.id)
                                .then(setReceipt)
                                .catch((cause: Error) =>
                                  setError(cause.message),
                                )
                            }
                          >
                            Recibo
                          </button>
                        )}
                        <button
                          className={
                            item.status === "paid"
                              ? "secondary-button"
                              : "primary-button"
                          }
                          disabled={item.status === "cancelled"}
                          onClick={() =>
                            void receivableAction(
                              item.id,
                              item.status === "paid" ? "reverse" : "pay",
                            )
                          }
                        >
                          {item.status === "paid" ? "Estornar" : "Dar baixa"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : tab === "payables" && data.payables.length === 0 ? (
              <EmptyState
                title="Nenhuma conta a pagar"
                copy="Cadastre as despesas previstas da clínica."
              />
            ) : tab === "payables" ? (
              <div className="finance-table advanced">
                {data.payables.map((item) => (
                  <div className="finance-row" key={item.id}>
                    <div>
                      <strong>{item.description}</strong>
                      <span>
                        {item.supplier || item.categoryName} ·{" "}
                        {item.costCenterName}
                      </span>
                    </div>
                    <div>
                      <span>Vencimento</span>
                      <strong>
                        {new Date(
                          `${item.dueDate}T12:00:00`,
                        ).toLocaleDateString("pt-BR")}
                      </strong>
                    </div>
                    <strong>{currency.format(item.amountInCents / 100)}</strong>
                    <span
                      className={`status-pill ${item.overdue ? "overdue" : item.status}`}
                    >
                      {item.overdue
                        ? "Vencida"
                        : item.status === "paid"
                          ? "Paga"
                          : "Aberta"}
                    </span>
                    <div className="finance-actions">
                      <button
                        className={
                          item.status === "paid"
                            ? "secondary-button"
                            : "primary-button"
                        }
                        onClick={() =>
                          void payableAction(
                            item.id,
                            item.status === "paid" ? "reverse" : "pay",
                          )
                        }
                      >
                        {item.status === "paid" ? "Estornar" : "Pagar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : data.commissions.length === 0 ? (
              <EmptyState
                title="Nenhuma comissão gerada"
                copy="Cadastre uma regra e gere a competência após concluir atendimentos."
              />
            ) : (
              <div className="finance-table advanced">
                {data.commissions.map((item) => (
                  <div className="finance-row" key={item.id}>
                    <div>
                      <strong>{item.professionalName}</strong>
                      <span>
                        {item.competence} · {item.percentage}% sobre{" "}
                        {currency.format(item.baseAmountInCents / 100)}
                      </span>
                    </div>
                    <strong>{currency.format(item.amountInCents / 100)}</strong>
                    <span className={`status-pill ${item.status}`}>
                      {item.status === "paid" ? "Paga" : "Aberta"}
                    </span>
                    <div className="finance-actions">
                      <button
                        className={
                          item.status === "paid"
                            ? "secondary-button"
                            : "primary-button"
                        }
                        onClick={async () => {
                          if (item.status === "paid")
                            await api.reverseCommission(item.id);
                          else await api.settleCommission(item.id);
                          await reload();
                        }}
                      >
                        {item.status === "paid" ? "Estornar" : "Pagar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {payableModal && data && (
        <PayableModal
          workspace={data}
          onClose={() => setPayableModal(false)}
          onCreated={() => {
            setPayableModal(false);
            void reload();
          }}
        />
      )}
      {receipt && (
        <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
      )}
    </>
  );
}

function PayableModal({
  workspace,
  onClose,
  onCreated,
}: {
  workspace: FinancialWorkspace;
  onClose: () => void;
  onCreated: () => void;
}) {
  const expenseCategories = workspace.categories.filter(
    (item) => item.kind === "expense",
  );
  const [form, setForm] = useState<PayableInput>({
    description: "",
    supplier: "",
    categoryId: expenseCategories[0]?.id ?? "",
    costCenterId: workspace.costCenters[0]?.id ?? "",
    dueDate: localIsoDate(),
    amountInCents: 0,
    notes: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await api.createPayable(form);
      onCreated();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Nova conta a pagar"
      subtitle="Classifique a despesa para compor o fluxo de caixa."
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Descrição
          <input
            required
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
        </label>
        <label>
          Fornecedor
          <input
            value={form.supplier}
            onChange={(event) =>
              setForm({ ...form, supplier: event.target.value })
            }
          />
        </label>
        <label>
          Vencimento
          <input
            required
            type="date"
            value={form.dueDate}
            onChange={(event) =>
              setForm({ ...form, dueDate: event.target.value })
            }
          />
        </label>
        <label>
          Categoria
          <select
            required
            value={form.categoryId}
            onChange={(event) =>
              setForm({ ...form, categoryId: event.target.value })
            }
          >
            {expenseCategories.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Centro de custo
          <select
            required
            value={form.costCenterId}
            onChange={(event) =>
              setForm({ ...form, costCenterId: event.target.value })
            }
          >
            {workspace.costCenters.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={form.amountInCents / 100}
            onChange={(event) =>
              setForm({
                ...form,
                amountInCents: Math.round(Number(event.target.value) * 100),
              })
            }
          />
        </label>
        <label>
          Observações
          <input
            value={form.notes}
            onChange={(event) =>
              setForm({ ...form, notes: event.target.value })
            }
          />
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>
            Voltar
          </button>
          <button
            className="primary-button"
            disabled={loading || !form.categoryId || !form.costCenterId}
          >
            {loading ? "Salvando…" : "Cadastrar despesa"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiptModal({
  receipt,
  onClose,
}: {
  receipt: PaymentReceipt;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Recibo de pagamento"
      subtitle={receipt.receiptNumber}
      onClose={onClose}
    >
      <div className="receipt-content">
        <Logo />
        <p>
          Recebemos de <strong>{receipt.patientName}</strong> o valor de{" "}
          <strong>{currency.format(receipt.amountInCents / 100)}</strong>,
          referente a {receipt.description}.
        </p>
        <dl>
          <div>
            <dt>Pagamento</dt>
            <dd>{receipt.paymentMethod}</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>{new Date(receipt.paidAt).toLocaleString("pt-BR")}</dd>
          </div>
        </dl>
        <button className="primary-button" onClick={() => window.print()}>
          Imprimir recibo
        </button>
      </div>
    </Modal>
  );
}

function ClinicalRecordsPage() {
  const [records, setRecords] = useState<ClinicalRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<ClinicalRecord | "new" | null>(null);
  const [historyRecord, setHistoryRecord] = useState<ClinicalRecord | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    const from = new Date();
    from.setDate(from.getDate() - 180);
    const to = new Date();
    to.setDate(to.getDate() + 2);
    Promise.all([
      api.clinicalRecords(),
      api.appointments(from.toISOString(), to.toISOString()),
      api.patients(),
    ])
      .then(([recordData, appointmentData, patientData]) => {
        if (!active) return;
        setRecords(recordData);
        setPatients(patientData);
        setAppointments(
          appointmentData.filter(
            (appointment) => appointment.status !== "cancelled",
          ),
        );
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

  function replaceRecord(record: ClinicalRecord) {
    setRecords((current) =>
      [record, ...current.filter((item) => item.id !== record.id)].sort(
        (a, b) => b.appointmentStartsAt.localeCompare(a.appointmentStartsAt),
      ),
    );
  }

  async function finalize(record: ClinicalRecord) {
    if (
      !window.confirm(
        "Após finalizar, o prontuário não poderá mais ser alterado. Deseja continuar?",
      )
    )
      return;
    setError("");
    try {
      replaceRecord(await api.finalizeClinicalRecord(record.id));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const availableAppointments = appointments.filter(
    (appointment) =>
      !records.some((record) => record.appointmentId === appointment.id),
  );

  return (
    <>
      <PageHeader
        eyebrow="Cuidado documentado"
        title="Prontuários"
        description="Evoluções clínicas no formato SOAP, protegidas e rastreáveis."
        action={
          <button
            className="primary-button"
            onClick={() => setEditor("new")}
            disabled={availableAppointments.length === 0}
            title={
              availableAppointments.length === 0
                ? "Todos os atendimentos disponíveis já possuem prontuário"
                : undefined
            }
          >
            <FileText size={18} />
            Nova evolução
          </button>
        }
      />
      {error && <ErrorBanner error={error} />}
      <section className="clinical-summary">
        <div>
          <strong>{records.length}</strong>
          <span>evoluções registradas</span>
        </div>
        <div>
          <strong>
            {records.filter((record) => record.status === "draft").length}
          </strong>
          <span>rascunhos aguardando revisão</span>
        </div>
        <div className="clinical-security">
          <LockKeyhole size={18} />
          <span>Acesso restrito à equipe clínica</span>
        </div>
      </section>
      <section className="panel clinical-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Linha do tempo</span>
            <h2>Evoluções recentes</h2>
          </div>
        </div>
        {loading ? (
          <LoadingBlock />
        ) : records.length === 0 ? (
          <EmptyState
            title="Nenhuma evolução registrada"
            copy="Crie o primeiro prontuário a partir de um atendimento realizado."
          />
        ) : (
          <div className="clinical-list">
            {records.map((record) => (
              <article className="clinical-card" key={record.id}>
                <div className="clinical-date">
                  <strong>
                    {new Intl.DateTimeFormat("pt-BR", {
                      day: "2-digit",
                    }).format(new Date(record.appointmentStartsAt))}
                  </strong>
                  <span>
                    {new Intl.DateTimeFormat("pt-BR", {
                      month: "short",
                    }).format(new Date(record.appointmentStartsAt))}
                  </span>
                </div>
                <div className="clinical-card-copy">
                  <div>
                    <span className={`status-pill ${record.status}`}>
                      {record.status === "finalized"
                        ? "Finalizado"
                        : "Rascunho"}
                    </span>
                    <h3>{record.patientName}</h3>
                    <p>
                      {professionalWithCrefito(
                        record.professionalName,
                        record.professionalCrefito,
                      )}{" "}
                      · versão {record.version}
                    </p>
                  </div>
                  <p className="clinical-preview">
                    {record.assessment ||
                      "Avaliação clínica ainda não preenchida."}
                  </p>
                </div>
                <div className="clinical-card-actions">
                  <button
                    className="secondary-button"
                    onClick={() => setHistoryRecord(record)}
                  >
                    <FileClock size={16} />
                    Histórico
                  </button>
                  {record.status === "draft" && (
                    <>
                      <button
                        className="secondary-button"
                        onClick={() => setEditor(record)}
                      >
                        Editar
                      </button>
                      <button
                        className="primary-button"
                        onClick={() => void finalize(record)}
                      >
                        Finalizar
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {!loading && patients.length > 0 && (
        <ClinicalWorkspacePanel patients={patients} />
      )}
      {editor && (
        <ClinicalRecordModal
          record={editor === "new" ? undefined : editor}
          appointments={availableAppointments}
          onClose={() => setEditor(null)}
          onSaved={(record) => {
            replaceRecord(record);
            setEditor(null);
          }}
        />
      )}
      {historyRecord && (
        <ClinicalHistoryModal
          record={historyRecord}
          onClose={() => setHistoryRecord(null)}
        />
      )}
    </>
  );
}

function ClinicalWorkspacePanel({ patients }: { patients: Patient[] }) {
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "");
  const [workspace, setWorkspace] = useState<ClinicalWorkspace | null>(null);
  const [editor, setEditor] = useState<
    | "template"
    | "assessment"
    | "goal"
    | "measurement"
    | "closure"
    | "attachment"
    | "addendum"
    | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(targetPatientId = patientId) {
    if (!targetPatientId) return;
    setLoading(true);
    setError("");
    try {
      setWorkspace(await api.clinicalWorkspace(targetPatientId));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    api
      .clinicalWorkspace(patientId)
      .then((data) => {
        if (active) setWorkspace(data);
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
  }, [patientId]);

  async function exportRecord(print = false) {
    setError("");
    try {
      const data = await api.exportClinicalWorkspace(patientId);
      if (print) {
        window.print();
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `prontuario-${data.patient.recordNumber}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function downloadAttachment(attachmentId: string) {
    setError("");
    try {
      const attachment = await api.clinicalAttachmentContent(attachmentId);
      const link = document.createElement("a");
      link.href = `data:${attachment.mimeType};base64,${attachment.contentBase64}`;
      link.download = attachment.fileName;
      link.click();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const timeline = workspace
    ? [
        ...workspace.records.map((item) => ({
          id: `record-${item.id}`,
          date: item.appointmentStartsAt,
          kind: "Evolução SOAP",
          title: item.assessment || "Evolução clínica",
          author: item.authorName,
        })),
        ...workspace.assessments.map((item) => ({
          id: `assessment-${item.id}`,
          date: item.createdAt,
          kind: "Avaliação",
          title: item.templateName,
          author: item.authorName,
        })),
        ...workspace.measurements.map((item) => ({
          id: `measurement-${item.id}`,
          date: item.measuredAt,
          kind: "Medição",
          title: `${item.name}: ${item.value} ${item.unit}`,
          author: item.authorName,
        })),
        ...workspace.closures.map((item) => ({
          id: `closure-${item.id}`,
          date: item.occurredAt,
          kind:
            item.kind === "discharge"
              ? "Alta"
              : item.kind === "referral"
                ? "Encaminhamento"
                : "Abandono",
          title: item.summary,
          author: item.authorName,
        })),
        ...(workspace.addenda ?? []).map((item) => ({
          id: `addendum-${item.id}`,
          date: item.createdAt,
          kind: "Adendo imutável",
          title: `${item.reason}: ${item.content}`,
          author: item.authorName,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date))
    : [];

  return (
    <section className="panel clinical-workspace-panel">
      <div className="panel-head clinical-workspace-head">
        <div>
          <span className="eyebrow">Visão longitudinal</span>
          <h2>Acompanhamento terapêutico</h2>
        </div>
        <label>
          Cliente
          <select
            value={patientId}
            onChange={(event) => {
              setLoading(true);
              setError("");
              setPatientId(event.target.value);
            }}
          >
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.fullName}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <ErrorBanner error={error} />}
      {loading || !workspace ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="clinical-workspace-actions">
            <button
              className="secondary-button"
              onClick={() => setEditor("template")}
            >
              Novo modelo
            </button>
            <button
              className="secondary-button"
              onClick={() => setEditor("assessment")}
            >
              Nova avaliação
            </button>
            <button
              className="secondary-button"
              onClick={() => setEditor("goal")}
            >
              Novo objetivo
            </button>
            <button
              className="secondary-button"
              onClick={() => setEditor("measurement")}
            >
              Nova medição
            </button>
            <button
              className="secondary-button"
              onClick={() => setEditor("closure")}
            >
              Encerrar tratamento
            </button>
            <button
              className="secondary-button"
              onClick={() => setEditor("attachment")}
            >
              <Paperclip size={15} /> Anexar arquivo
            </button>
            <button
              className="secondary-button"
              onClick={() => setEditor("addendum")}
              disabled={workspace.records.every(
                (item) => item.status !== "finalized",
              )}
            >
              Adicionar adendo
            </button>
            <button
              className="secondary-button"
              onClick={() => void exportRecord(true)}
            >
              <Printer size={15} /> Imprimir
            </button>
            <button
              className="secondary-button"
              onClick={() => void exportRecord()}
            >
              <Download size={15} /> Exportar
            </button>
          </div>
          <div className="clinical-workspace-grid">
            <div className="clinical-goals">
              <div className="panel-head compact">
                <div>
                  <span className="eyebrow">Objetivos</span>
                  <h3>Plano terapêutico</h3>
                </div>
              </div>
              {workspace.goals.length === 0 ? (
                <p className="muted-copy">Nenhum objetivo registrado.</p>
              ) : (
                workspace.goals.map((goal) => {
                  const latest = workspace.measurements.find(
                    (item) => item.goalId === goal.id,
                  );
                  return (
                    <article className="clinical-goal-card" key={goal.id}>
                      <div>
                        <span className={`status-pill ${goal.status}`}>
                          {goal.status === "active"
                            ? "Ativo"
                            : goal.status === "achieved"
                              ? "Alcançado"
                              : "Cancelado"}
                        </span>
                        <h4>{goal.title}</h4>
                        <p>{goal.description || "Sem descrição adicional."}</p>
                        {(latest || goal.targetValue !== undefined) && (
                          <small>
                            Atual:{" "}
                            {latest ? `${latest.value} ${latest.unit}` : "—"}
                            {goal.targetValue !== undefined
                              ? ` · Meta: ${goal.targetValue} ${goal.unit ?? ""}`
                              : ""}
                          </small>
                        )}
                      </div>
                      {goal.status === "active" && (
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              await api.updateTherapeuticGoalStatus(
                                goal.id,
                                "achieved",
                              );
                              await load();
                            } catch (cause) {
                              setError((cause as Error).message);
                            }
                          }}
                        >
                          Marcar alcançado
                        </button>
                      )}
                    </article>
                  );
                })
              )}
            </div>
            <div className="clinical-timeline">
              <div className="panel-head compact">
                <div>
                  <span className="eyebrow">Histórico integrado</span>
                  <h3>Linha do tempo</h3>
                </div>
              </div>
              {timeline.length === 0 ? (
                <p className="muted-copy">Nenhum evento clínico registrado.</p>
              ) : (
                timeline.map((event) => (
                  <article key={event.id}>
                    <span>{event.kind}</span>
                    <strong>{event.title}</strong>
                    <small>
                      {new Date(event.date).toLocaleString("pt-BR")} ·{" "}
                      {event.author}
                    </small>
                  </article>
                ))
              )}
            </div>
          </div>
          <div className="clinical-attachments">
            <div className="panel-head compact">
              <div>
                <span className="eyebrow">Arquivos protegidos</span>
                <h3>Anexos clínicos</h3>
              </div>
            </div>
            {(workspace.attachments ?? []).length === 0 ? (
              <p className="muted-copy">Nenhum anexo clínico.</p>
            ) : (
              (workspace.attachments ?? []).map((attachment) => (
                <article key={attachment.id}>
                  <Paperclip size={17} />
                  <div>
                    <strong>{attachment.fileName}</strong>
                    <small>
                      {(attachment.sizeInBytes / 1024).toFixed(1)} KB ·{" "}
                      {attachment.authorName}
                    </small>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => void downloadAttachment(attachment.id)}
                  >
                    Baixar
                  </button>
                </article>
              ))
            )}
          </div>
          <div className="clinical-print-summary">
            <header>
              <span>Prontuário longitudinal</span>
              <h1>{workspace.patient.fullName}</h1>
              <p>
                Registro {workspace.patient.recordNumber} · Emitido em{" "}
                {new Date().toLocaleString("pt-BR")}
              </p>
            </header>
            <h2>Evoluções SOAP</h2>
            {workspace.records.map((record) => (
              <article key={record.id}>
                <h3>
                  {new Date(record.appointmentStartsAt).toLocaleString("pt-BR")}
                </h3>
                <p>
                  <strong>S:</strong> {record.subjective}
                </p>
                <p>
                  <strong>O:</strong> {record.objective}
                </p>
                <p>
                  <strong>A:</strong> {record.assessment}
                </p>
                <p>
                  <strong>P:</strong> {record.plan}
                </p>
                <small>
                  {professionalWithCrefito(
                    record.professionalName,
                    record.professionalCrefito,
                  )}{" "}
                  · Registrado por {record.authorName} · versão{" "}
                  {record.version}
                </small>
              </article>
            ))}
            <h2>Avaliações estruturadas</h2>
            {workspace.assessments.map((assessment) => (
              <article key={assessment.id}>
                <h3>{assessment.templateName}</h3>
                {Object.entries(assessment.values).map(([key, value]) => (
                  <p key={key}>
                    <strong>{key}:</strong> {String(value)}
                  </p>
                ))}
                <small>
                  {assessment.authorName} ·{" "}
                  {new Date(assessment.createdAt).toLocaleString("pt-BR")}
                </small>
              </article>
            ))}
            <h2>Objetivos e medidas</h2>
            {workspace.goals.map((goal) => (
              <article key={goal.id}>
                <h3>
                  {goal.title} · {goal.status}
                </h3>
                <p>{goal.description}</p>
                {workspace.measurements
                  .filter((measurement) => measurement.goalId === goal.id)
                  .map((measurement) => (
                    <p key={measurement.id}>
                      {new Date(measurement.measuredAt).toLocaleDateString(
                        "pt-BR",
                      )}
                      : {measurement.value} {measurement.unit}
                    </p>
                  ))}
              </article>
            ))}
            {(workspace.addenda ?? []).length > 0 && <h2>Adendos</h2>}
            {(workspace.addenda ?? []).map((addendum) => (
              <article key={addendum.id}>
                <h3>{addendum.reason}</h3>
                <p>{addendum.content}</p>
                <small>
                  {addendum.authorName} ·{" "}
                  {new Date(addendum.createdAt).toLocaleString("pt-BR")}
                </small>
              </article>
            ))}
            {workspace.closures.length > 0 && <h2>Encerramentos</h2>}
            {workspace.closures.map((closure) => (
              <article key={closure.id}>
                <h3>{closure.kind}</h3>
                <p>{closure.summary}</p>
                <p>{closure.recommendations}</p>
              </article>
            ))}
          </div>
        </>
      )}
      {editor === "template" && (
        <AssessmentTemplateModal
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {editor === "assessment" && workspace && (
        <ClinicalAssessmentModal
          patientId={patientId}
          templates={workspace.templates}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {editor === "goal" && (
        <TherapeuticGoalModal
          patientId={patientId}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {editor === "measurement" && workspace && (
        <ClinicalMeasurementModal
          patientId={patientId}
          goals={workspace.goals.filter((item) => item.status === "active")}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {editor === "closure" && (
        <TreatmentClosureModal
          patientId={patientId}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {editor === "attachment" && (
        <ClinicalAttachmentModal
          patientId={patientId}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {editor === "addendum" && workspace && (
        <ClinicalAddendumModal
          records={workspace.records.filter(
            (item) => item.status === "finalized",
          )}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function ClinicalAttachmentModal({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) {
      setError("Use um arquivo PDF, PNG ou JPEG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("O arquivo deve ter no máximo 5 MB.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const input: ClinicalAttachmentInput = {
        patientId,
        fileName: file.name,
        mimeType: file.type as ClinicalAttachmentInput["mimeType"],
        sizeInBytes: file.size,
        contentBase64: await fileToBase64(file),
        notes,
      };
      await api.createClinicalAttachment(input);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Novo anexo clínico"
      subtitle="PDF, PNG ou JPEG de até 5 MB. O conteúdo é validado e recebe uma impressão SHA-256."
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={submit}>
        <label>
          Arquivo
          <input
            required
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Observações
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={!file || loading}>
            {loading ? "Enviando…" : "Anexar arquivo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ClinicalAddendumModal({
  records,
  onClose,
  onSaved,
}: {
  records: ClinicalRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ClinicalAddendumInput>({
    clinicalRecordId: records[0]?.id ?? "",
    reason: "",
    content: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.createClinicalAddendum(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Adendo ao prontuário"
      subtitle="O texto original não será alterado. O adendo ficará permanentemente vinculado à evolução."
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={submit}>
        <label>
          Evolução finalizada
          <select
            required
            value={form.clinicalRecordId}
            onChange={(event) =>
              setForm({ ...form, clinicalRecordId: event.target.value })
            }
          >
            {records.map((record) => (
              <option key={record.id} value={record.id}>
                {shortDate.format(new Date(record.appointmentStartsAt))} ·{" "}
                {record.professionalName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Motivo do adendo
          <input
            required
            minLength={5}
            value={form.reason}
            onChange={(event) =>
              setForm({ ...form, reason: event.target.value })
            }
          />
        </label>
        <label>
          Conteúdo complementar
          <textarea
            required
            minLength={10}
            rows={5}
            value={form.content}
            onChange={(event) =>
              setForm({ ...form, content: event.target.value })
            }
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={loading}>
            {loading ? "Salvando…" : "Registrar adendo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AssessmentTemplateModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AssessmentTemplateInput>({
    name: "",
    specialty: "Fisioterapia",
    fields: [
      {
        key: "campo_1",
        label: "",
        type: "text",
        required: false,
        unit: "",
      },
    ],
  });
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.createAssessmentTemplate(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  function updateField(
    index: number,
    patch: Partial<AssessmentTemplateInput["fields"][number]>,
  ) {
    setForm({
      ...form,
      fields: form.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    });
  }

  return (
    <Modal
      title="Novo modelo de avaliação"
      subtitle="Monte campos estruturados para uma especialidade. Modelos usados permanecem versionados."
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={submit}>
        <div className="clinical-form-row">
          <label>
            Nome do modelo
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
          <label>
            Especialidade
            <input
              required
              value={form.specialty}
              onChange={(event) =>
                setForm({ ...form, specialty: event.target.value })
              }
            />
          </label>
        </div>
        <div className="assessment-field-builder">
          {form.fields.map((field, index) => (
            <div key={index}>
              <label>
                Chave técnica
                <input
                  required
                  pattern="[a-z][a-z0-9_]*"
                  value={field.key}
                  onChange={(event) =>
                    updateField(index, { key: event.target.value })
                  }
                />
              </label>
              <label>
                Rótulo
                <input
                  required
                  value={field.label}
                  onChange={(event) =>
                    updateField(index, { label: event.target.value })
                  }
                />
              </label>
              <label>
                Tipo
                <select
                  value={field.type}
                  onChange={(event) =>
                    updateField(index, {
                      type: event.target.value as typeof field.type,
                    })
                  }
                >
                  <option value="text">Texto</option>
                  <option value="number">Número</option>
                  <option value="scale">Escala</option>
                  <option value="boolean">Sim/Não</option>
                </select>
              </label>
              <label>
                Unidade
                <input
                  value={field.unit}
                  onChange={(event) =>
                    updateField(index, { unit: event.target.value })
                  }
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) =>
                    updateField(index, { required: event.target.checked })
                  }
                />
                Obrigatório
              </label>
              {form.fields.length > 1 && (
                <button
                  type="button"
                  className="icon-button"
                  title="Remover campo"
                  onClick={() =>
                    setForm({
                      ...form,
                      fields: form.fields.filter(
                        (_, fieldIndex) => fieldIndex !== index,
                      ),
                    })
                  }
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setForm({
                ...form,
                fields: [
                  ...form.fields,
                  {
                    key: `campo_${form.fields.length + 1}`,
                    label: "",
                    type: "text",
                    required: false,
                    unit: "",
                  },
                ],
              })
            }
          >
            <Plus size={15} /> Adicionar campo
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button">Salvar modelo</button>
        </div>
      </form>
    </Modal>
  );
}

function ClinicalAssessmentModal({
  patientId,
  templates,
  onClose,
  onSaved,
}: {
  patientId: string;
  templates: AssessmentTemplate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [values, setValues] = useState<
    Record<string, string | number | boolean>
  >({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const template = templates.find((item) => item.id === templateId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const input: ClinicalAssessmentInput = {
        patientId,
        templateId,
        values,
        notes,
      };
      await api.createClinicalAssessment(input);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <Modal
      title="Nova avaliação configurável"
      subtitle="Os dados são preservados com o modelo e a autoria usados no registro."
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={submit}>
        <label>
          Modelo
          <select
            required
            value={templateId}
            onChange={(event) => {
              setTemplateId(event.target.value);
              setValues({});
            }}
          >
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · v{item.version}
              </option>
            ))}
          </select>
        </label>
        {template?.fields.map((field) => (
          <label key={field.key}>
            {field.label} {field.unit ? `(${field.unit})` : ""}
            {field.type === "boolean" ? (
              <select
                required={field.required}
                value={String(values[field.key] ?? "")}
                onChange={(event) =>
                  setValues({
                    ...values,
                    [field.key]: event.target.value === "true",
                  })
                }
              >
                <option value="">Selecione</option>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            ) : field.type === "text" ? (
              <textarea
                required={field.required}
                rows={3}
                value={String(values[field.key] ?? "")}
                onChange={(event) =>
                  setValues({ ...values, [field.key]: event.target.value })
                }
              />
            ) : (
              <input
                type="number"
                step="any"
                required={field.required}
                min={field.min}
                max={field.max}
                value={String(values[field.key] ?? "")}
                onChange={(event) =>
                  setValues({
                    ...values,
                    [field.key]: Number(event.target.value),
                  })
                }
              />
            )}
          </label>
        ))}
        <label>
          Observações
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={!templateId}>
            Registrar avaliação
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TherapeuticGoalModal({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TherapeuticGoalInput>({
    patientId,
    title: "",
    description: "",
    unit: "",
  });
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createTherapeuticGoal(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <Modal
      title="Novo objetivo terapêutico"
      subtitle="Defina um resultado observável e, quando aplicável, uma meta numérica."
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={submit}>
        <label>
          Objetivo
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label>
          Descrição
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <div className="clinical-form-row">
          <label>
            Valor inicial
            <input
              type="number"
              step="any"
              onChange={(e) =>
                setForm({
                  ...form,
                  baselineValue: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
          </label>
          <label>
            Valor-alvo
            <input
              type="number"
              step="any"
              onChange={(e) =>
                setForm({
                  ...form,
                  targetValue: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
          </label>
          <label>
            Unidade
            <input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </label>
          <label>
            Data-alvo
            <input
              type="date"
              onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
            />
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button">Salvar objetivo</button>
        </div>
      </form>
    </Modal>
  );
}

function ClinicalMeasurementModal({
  patientId,
  goals,
  onClose,
  onSaved,
}: {
  patientId: string;
  goals: ClinicalWorkspace["goals"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ClinicalMeasurementInput>({
    patientId,
    goalId: goals[0]?.id ?? "",
    name: "",
    value: 0,
    unit: "",
    measuredAt: new Date().toISOString(),
    notes: "",
  });
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createClinicalMeasurement(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <Modal
      title="Nova medição clínica"
      subtitle="Registre medidas comparáveis para acompanhar a evolução ao longo do tempo."
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={submit}>
        <label>
          Objetivo relacionado
          <select
            value={form.goalId}
            onChange={(e) => setForm({ ...form, goalId: e.target.value })}
          >
            <option value="">Sem objetivo específico</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </label>
        <div className="clinical-form-row">
          <label>
            Medida
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Valor
            <input
              required
              type="number"
              step="any"
              value={form.value}
              onChange={(e) =>
                setForm({ ...form, value: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Unidade
            <input
              required
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </label>
          <label>
            Data e hora
            <input
              required
              type="datetime-local"
              value={form.measuredAt.slice(0, 16)}
              onChange={(e) =>
                setForm({
                  ...form,
                  measuredAt: new Date(e.target.value).toISOString(),
                })
              }
            />
          </label>
        </div>
        <label>
          Observações
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button">Registrar medição</button>
        </div>
      </form>
    </Modal>
  );
}

function TreatmentClosureModal({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TreatmentClosureInput>({
    patientId,
    kind: "discharge",
    summary: "",
    recommendations: "",
    occurredAt: new Date().toISOString(),
  });
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createTreatmentClosure(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <Modal
      title="Encerramento do tratamento"
      subtitle="O registro é permanente e compõe a linha do tempo clínica."
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={submit}>
        <label>
          Motivo
          <select
            value={form.kind}
            onChange={(e) =>
              setForm({
                ...form,
                kind: e.target.value as TreatmentClosureInput["kind"],
              })
            }
          >
            <option value="discharge">Alta</option>
            <option value="referral">Encaminhamento</option>
            <option value="abandonment">Abandono</option>
          </select>
        </label>
        <label>
          Resumo clínico
          <textarea
            required
            minLength={10}
            rows={5}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </label>
        <label>
          Recomendações
          <textarea
            rows={4}
            value={form.recommendations}
            onChange={(e) =>
              setForm({ ...form, recommendations: e.target.value })
            }
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button">Registrar encerramento</button>
        </div>
      </form>
    </Modal>
  );
}

function ClinicalRecordModal({
  record,
  appointments,
  onClose,
  onSaved,
}: {
  record: ClinicalRecord | undefined;
  appointments: Appointment[];
  onClose: () => void;
  onSaved: (record: ClinicalRecord) => void;
}) {
  const [form, setForm] = useState<ClinicalRecordInput>({
    appointmentId: record?.appointmentId ?? appointments[0]?.id ?? "",
    subjective: record?.subjective ?? "",
    objective: record?.objective ?? "",
    assessment: record?.assessment ?? "",
    plan: record?.plan ?? "",
    painScale: record?.painScale,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onSaved(await api.saveClinicalRecord(form));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={record ? "Editar evolução" : "Nova evolução clínica"}
      subtitle="Registre informações objetivas e necessárias para a continuidade do cuidado."
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={submit}>
        <label>
          Atendimento
          <select
            required
            disabled={Boolean(record)}
            value={form.appointmentId}
            onChange={(event) =>
              setForm({ ...form, appointmentId: event.target.value })
            }
          >
            {appointments.map((appointment) => (
              <option value={appointment.id} key={appointment.id}>
                {shortDate.format(new Date(appointment.startsAt))} ·{" "}
                {appointment.patientName} · {appointment.professionalName}
              </option>
            ))}
            {record && (
              <option value={record.appointmentId}>
                {shortDate.format(new Date(record.appointmentStartsAt))} ·{" "}
                {record.patientName}
              </option>
            )}
          </select>
        </label>
        {record && (
          <p className="muted-copy">
            Profissional:{" "}
            {professionalWithCrefito(
              record.professionalName,
              record.professionalCrefito,
            )}
          </p>
        )}
        <label>
          S — Subjetivo
          <small>Relato, sintomas e percepção do cliente.</small>
          <textarea
            required
            rows={4}
            value={form.subjective}
            onChange={(event) =>
              setForm({ ...form, subjective: event.target.value })
            }
          />
        </label>
        <label>
          O — Objetivo
          <small>Achados, testes, medidas e intervenções realizadas.</small>
          <textarea
            required
            rows={4}
            value={form.objective}
            onChange={(event) =>
              setForm({ ...form, objective: event.target.value })
            }
          />
        </label>
        <div className="clinical-form-row">
          <label>
            A — Avaliação
            <textarea
              required
              rows={4}
              value={form.assessment}
              onChange={(event) =>
                setForm({ ...form, assessment: event.target.value })
              }
            />
          </label>
          <label>
            P — Plano
            <textarea
              required
              rows={4}
              value={form.plan}
              onChange={(event) =>
                setForm({ ...form, plan: event.target.value })
              }
            />
          </label>
        </div>
        <label className="pain-field">
          Escala de dor <span>{form.painScale ?? "—"}/10</span>
          <input
            type="range"
            min="0"
            max="10"
            value={form.painScale ?? 0}
            onChange={(event) =>
              setForm({ ...form, painScale: Number(event.target.value) })
            }
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={loading}>
            {loading ? "Salvando…" : "Salvar rascunho"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ClinicalHistoryModal({
  record,
  onClose,
}: {
  record: ClinicalRecord;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<ClinicalRecordRevision[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .clinicalRecordRevisions(record.id)
      .then((data) => {
        if (active) setRevisions(data);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [record.id]);
  return (
    <Modal
      title={`Histórico · ${record.patientName}`}
      subtitle="Cada salvamento gera uma versão preservada para auditoria."
      onClose={onClose}
    >
      {error && <ErrorBanner error={error} />}
      {!error && revisions.length === 0 ? (
        <LoadingBlock />
      ) : (
        <div className="revision-list">
          {revisions.map((revision) => (
            <article key={revision.id}>
              <div>
                <strong>Versão {revision.version}</strong>
                <span className={`status-pill ${revision.status}`}>
                  {revision.status === "finalized" ? "Finalizada" : "Rascunho"}
                </span>
              </div>
              <small>
                {revision.authorName} ·{" "}
                {new Date(revision.createdAt).toLocaleString("pt-BR")}
              </small>
              <p>
                {revision.assessment ||
                  "Sem avaliação registrada nesta versão."}
              </p>
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AgendaPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [historyAppointment, setHistoryAppointment] = useState<Appointment | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [eventsDay, setEventsDay] = useState<Date | null>(null);
  const selectedAppointment = appointments.find((item) => item.id === selectedAppointmentId);
  const date = localIsoDate(selectedDate);
  const weekStart = new Date(selectedDate);
  weekStart.setHours(12, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12);
  const monthGridStart = new Date(monthStart);
  monthGridStart.setDate(monthGridStart.getDate() - ((monthGridStart.getDay() + 6) % 7));
  const monthGridLength = Math.ceil(
    (((monthStart.getDay() + 6) % 7) + new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate()) / 7,
  ) * 7;
  const monthDays = Array.from({ length: monthGridLength }, (_, index) => {
    const item = new Date(monthGridStart);
    item.setDate(item.getDate() + index);
    return item;
  });
  const rangeStart = view === "day" ? new Date(selectedDate) : view === "week" ? weekStart : monthGridStart;
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + (view === "day" ? 1 : view === "week" ? 7 : monthGridLength));
  const rangeFrom = rangeStart.toISOString();
  const rangeTo = rangeEnd.toISOString();
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const item = new Date(weekStart);
    item.setDate(item.getDate() + index);
    return item;
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      api.appointments(rangeFrom, rangeTo),
      api.scheduleBlocks(rangeFrom, rangeTo),
      api.groupSessions(rangeFrom, rangeTo),
      api.professionals(),
      api.rooms(),
      api.services(),
      api.patients(),
    ])
      .then(
        ([
          appointmentData,
          blockData,
          groupSessionData,
          professionalData,
          roomData,
          serviceData,
          patientData,
        ]) => {
          if (!active) return;
          setAppointments(appointmentData);
          setBlocks(blockData);
          setGroupSessions(groupSessionData);
          setProfessionals(professionalData);
          setRooms(roomData);
          setServices(serviceData);
          setPatients(patientData);
        },
      )
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rangeFrom, rangeTo]);
  function moveDay(amount: number) {
    setLoading(true);
    setError("");
    setSelectedDate((current) => {
      const next = new Date(current);
      if (view === "month") {
        const day = current.getDate();
        next.setDate(1);
        next.setMonth(current.getMonth() + amount);
        next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      } else {
        next.setDate(current.getDate() + amount * (view === "week" ? 7 : 1));
      }
      return next;
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Operação diária"
        title="Agenda"
        description="Visualize atendimentos, turmas, profissionais e salas sem conflitos."
        action={
          <div className="page-actions">
            <button
              className="secondary-button"
              onClick={() => setBlockModalOpen(true)}
            >
              Bloquear horário
            </button>
            <button
              className="primary-button"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={18} />
              Novo atendimento
            </button>
          </div>
        }
      />
      {error && <ErrorBanner error={error} />}
      <section className="panel agenda-panel">
        <div className="agenda-toolbar">
          <div className="date-navigator">
            <button className="icon-button" onClick={() => moveDay(-1)} aria-label={view === "month" ? "Mês anterior" : view === "week" ? "Semana anterior" : "Dia anterior"}>
              <ChevronLeft size={19} />
            </button>
            <button
              className="date-button"
              onClick={() => setSelectedDate(new Date())}
            >
              <strong>{view === "month" ? selectedDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : dateLabel.format(selectedDate)}</strong>
              <small>
                {view === "month"
                  ? "Voltar para hoje"
                  : view === "week"
                  ? `${shortDate.format(weekStart)} — ${shortDate.format(weekDays[6]!)}`
                  : date === localIsoDate()
                    ? "Hoje"
                    : shortDate.format(selectedDate)}
              </small>
            </button>
            <button className="icon-button" onClick={() => moveDay(1)} aria-label={view === "month" ? "Próximo mês" : view === "week" ? "Próxima semana" : "Próximo dia"}>
              <ChevronRight size={19} />
            </button>
          </div>
          <div className="agenda-toolbar-end">
            <div className="view-toggle">
              <button
                className={view === "day" ? "active" : ""}
                onClick={() => setView("day")}
              >
                Dia
              </button>
              <button
                className={view === "week" ? "active" : ""}
                onClick={() => setView("week")}
              >
                Semana
              </button>
              <button
                className={view === "month" ? "active" : ""}
                onClick={() => setView("month")}
              >
                Mês
              </button>
            </div>
            <div className="legend">
              {professionals.map((professional) => (
                <span key={professional.id}>
                  <i style={{ background: professional.color }} />
                  {professional.fullName.replace(/Dra?\. /, "")}
                </span>
              ))}
            </div>
          </div>
        </div>
        {loading ? (
          <LoadingBlock />
        ) : view === "month" ? (
          <div className="month-agenda">
            <div className="month-weekdays" aria-hidden="true">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="month-grid">
              {monthDays.map((day) => {
                const dayKey = localIsoDate(day);
                const dayAppointments = appointments.filter((item) => localIsoDate(new Date(item.startsAt)) === dayKey);
                const dayBlocks = blocks.filter((item) => localIsoDate(new Date(item.startsAt)) === dayKey && item.status === "active");
                const dayGroups = groupSessions.filter((item) => localIsoDate(new Date(item.startsAt)) === dayKey);
                const dayEvents = sortAgendaEntries({ appointments: dayAppointments, groupSessions: dayGroups });
                return (
                  <div
                    className={`month-day ${day.getMonth() !== selectedDate.getMonth() ? "outside" : ""} ${dayKey === localIsoDate() ? "today" : ""} ${dayKey === date ? "selected" : ""}`}
                    key={dayKey}
                    onClick={(event) => {
                      // Botões internos (atendimento, "ver todos") têm ação própria.
                      if (!(event.target as HTMLElement).closest("button")) setEventsDay(day);
                    }}
                  >
                    <button
                      type="button"
                      className="month-day-head"
                      onClick={() => setEventsDay(day)}
                      aria-label={`${day.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}: ${dayAppointments.length} atendimentos, ${dayGroups.length} aulas de turma, ${dayBlocks.length} bloqueios`}
                    >
                      <strong>{day.getDate()}</strong>
                      {dayAppointments.length > 0 && <small>{dayAppointments.length} {dayAppointments.length === 1 ? "atendimento" : "atendimentos"}</small>}
                    </button>
                    <span className="month-day-events">
                      {dayEvents.slice(0, 2).map((entry) =>
                        entry.kind === "appointment" ? (
                          <button type="button" className="month-event" key={entry.appointment.id} onClick={() => setSelectedAppointmentId(entry.appointment.id)} aria-label={`Detalhes de ${entry.appointment.patientName}, ${timeLabel.format(new Date(entry.appointment.startsAt))} a ${timeLabel.format(new Date(entry.appointment.endsAt))}`}>
                            <span className="month-event-time"><i style={{ background: entry.appointment.professionalColor }} aria-hidden="true" /><time>{timeLabel.format(new Date(entry.appointment.startsAt))}–{timeLabel.format(new Date(entry.appointment.endsAt))}</time></span>
                            <span className="month-event-name">{entry.appointment.patientName}</span>
                          </button>
                        ) : entry.kind === "group" ? (
                          <span className="month-group" key={entry.session.id} title={`${entry.session.groupName} · ${entry.session.professionalName} · ${entry.session.roomName}`}>
                            <span className="month-event-time"><time>{timeLabel.format(new Date(entry.session.startsAt))}–{timeLabel.format(new Date(entry.session.endsAt))}</time></span>
                            <span className="month-event-name">{entry.session.groupName}</span>
                          </span>
                        ) : null,
                      )}
                      {dayEvents.length > 2 && <button type="button" className="month-more" onClick={() => setEventsDay(day)}>+{dayEvents.length - 2} {dayEvents.length - 2 === 1 ? "evento" : "eventos"}</button>}
                      {dayBlocks.length > 0 && <span className="month-block">{dayBlocks.length} {dayBlocks.length === 1 ? "bloqueio" : "bloqueios"}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : view === "week" ? (
          <div className="week-agenda">
            {weekDays.map((day) => {
              const dayKey = localIsoDate(day);
              const dayAppointments = appointments.filter(
                (item) => localIsoDate(new Date(item.startsAt)) === dayKey,
              );
              const dayBlocks = blocks.filter(
                (item) => localIsoDate(new Date(item.startsAt)) === dayKey,
              );
              const dayGroups = groupSessions.filter(
                (item) => localIsoDate(new Date(item.startsAt)) === dayKey,
              );
              return (
                <section key={dayKey}>
                  <header className={dayKey === localIsoDate() ? "today" : ""}>
                    <span>
                      {day.toLocaleDateString("pt-BR", { weekday: "short" })}
                    </span>
                    <strong>{day.getDate()}</strong>
                  </header>
                  <div>
                    {sortAgendaEntries({ appointments: dayAppointments, groupSessions: dayGroups, blocks: dayBlocks }).map((entry) =>
                      entry.kind === "block" ? (
                        <ScheduleBlockCard
                          compact
                          block={entry.block}
                          key={entry.block.id}
                          onCancel={() => void cancelBlock(entry.block)}
                        />
                      ) : entry.kind === "group" ? (
                        <GroupSessionCard compact session={entry.session} key={entry.session.id} />
                      ) : (
                        <article
                          className="week-appointment"
                          key={entry.appointment.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Detalhes de ${entry.appointment.patientName}`}
                          onClick={() => setSelectedAppointmentId(entry.appointment.id)}
                          onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedAppointmentId(entry.appointment.id); } }}
                        >
                          <i
                            style={{ background: entry.appointment.professionalColor }}
                            aria-hidden="true"
                          />
                          <time>
                            {timeLabel.format(new Date(entry.appointment.startsAt))}–{timeLabel.format(new Date(entry.appointment.endsAt))}
                          </time>
                          <strong>{entry.appointment.patientName}</strong>
                          <span>{entry.appointment.serviceName}</span>
                        </article>
                      ),
                    )}
                    {dayAppointments.length === 0 && dayBlocks.length === 0 && dayGroups.length === 0 && (
                      <span className="week-empty">Livre</span>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : appointments.length === 0 && blocks.length === 0 && groupSessions.length === 0 ? (
          <EmptyState
            title="Dia disponível"
            copy="Não há atendimentos agendados para esta data."
          />
        ) : (
          <div className="day-agenda">
            {sortAgendaEntries({ appointments, groupSessions, blocks }).map((entry) =>
              entry.kind === "block" ? (
                <ScheduleBlockCard
                  block={entry.block}
                  key={entry.block.id}
                  onCancel={() => void cancelBlock(entry.block)}
                />
              ) : entry.kind === "group" ? (
                <GroupSessionCard session={entry.session} key={entry.session.id} />
              ) : (
                <AgendaCard
                  appointment={entry.appointment}
                  key={entry.appointment.id}
                  onOpen={() => setSelectedAppointmentId(entry.appointment.id)}
                  onHistory={() => setHistoryAppointment(entry.appointment)}
                  onStatus={(status) => changeAppointmentStatus(entry.appointment, status)}
                />
              ),
            )}
          </div>
        )}
      </section>
      {modalOpen && (
        <AppointmentModal
          date={selectedDate}
          patients={patients}
          professionals={professionals}
          rooms={rooms}
          services={services}
          onClose={() => setModalOpen(false)}
          onCreated={(appointment) => {
            setAppointments((items) =>
              [
                ...items,
                ...appointment.filter(
                  (item) => item.startsAt < rangeTo && item.endsAt > rangeFrom,
                ),
              ].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
            );
            setModalOpen(false);
          }}
        />
      )}
      {blockModalOpen && (
        <ScheduleBlockModal
          date={selectedDate}
          professionals={professionals}
          rooms={rooms}
          onClose={() => setBlockModalOpen(false)}
          onCreated={(block) => {
            if (block.startsAt < rangeTo && block.endsAt > rangeFrom)
              setBlocks((items) =>
                [...items, block].sort((a, b) =>
                  a.startsAt.localeCompare(b.startsAt),
                ),
              );
            setBlockModalOpen(false);
          }}
        />
      )}
      {rescheduling && (
        <AppointmentRescheduleModal
          appointment={rescheduling}
          professionals={professionals}
          rooms={rooms}
          onClose={() => setRescheduling(null)}
          onSaved={(updated) => {
            setAppointments((items) =>
              items
                .map((item) => (item.id === updated.id ? updated : item))
                .filter((item) => item.startsAt < rangeTo && item.endsAt > rangeFrom)
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
            );
            setSelectedDate(new Date(updated.startsAt));
            setRescheduling(null);
          }}
        />
      )}
      {selectedAppointment && (
        <AppointmentDetailsModal
          appointment={selectedAppointment}
          patient={patients.find((item) => item.id === selectedAppointment.patientId)}
          service={services.find((item) => item.id === selectedAppointment.serviceId)}
          onClose={() => setSelectedAppointmentId(null)}
          onReschedule={() => { setSelectedAppointmentId(null); setRescheduling(selectedAppointment); }}
          onCancelled={(updated) => {
            setAppointments((items) => items.map((item) => item.id === updated.id ? updated : item));
            setSelectedAppointmentId(null);
          }}
        />
      )}
      {eventsDay && (
        <DayEventsModal
          day={eventsDay}
          appointments={appointments.filter((item) => localIsoDate(new Date(item.startsAt)) === localIsoDate(eventsDay))}
          groupSessions={groupSessions.filter((item) => localIsoDate(new Date(item.startsAt)) === localIsoDate(eventsDay))}
          blocks={blocks.filter((item) => localIsoDate(new Date(item.startsAt)) === localIsoDate(eventsDay) && item.status === "active")}
          onClose={() => setEventsDay(null)}
          onOpenAppointment={(id) => { setEventsDay(null); setSelectedAppointmentId(id); }}
          onOpenDay={() => { setSelectedDate(eventsDay); setView("day"); setEventsDay(null); }}
        />
      )}
      {historyAppointment && (
        <AppointmentRescheduleHistoryModal
          appointment={historyAppointment}
          onClose={() => setHistoryAppointment(null)}
        />
      )}
    </>
  );

  async function changeAppointmentStatus(appointment: Appointment, status: AppointmentStatus) {
    try {
      const updated = await api.updateAppointmentStatus(appointment.id, status);
      setAppointments((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function cancelBlock(block: ScheduleBlock) {
    if (!window.confirm(`Cancelar o bloqueio “${block.reason}”?`)) return;
    try {
      const updated = await api.cancelScheduleBlock(block.id);
      setBlocks((items) => items.filter((item) => item.id !== updated.id));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
}

type AgendaEntry =
  | { kind: "block"; startsAt: string; block: ScheduleBlock }
  | { kind: "group"; startsAt: string; session: GroupSession }
  | { kind: "appointment"; startsAt: string; appointment: Appointment };

const agendaKindOrder: Record<AgendaEntry["kind"], number> = { block: 0, group: 1, appointment: 2 };

// Junta atendimentos, aulas de turma e bloqueios em ordem crescente de início.
function sortAgendaEntries({
  appointments = [],
  groupSessions = [],
  blocks = [],
}: {
  appointments?: Appointment[];
  groupSessions?: GroupSession[];
  blocks?: ScheduleBlock[];
}): AgendaEntry[] {
  return [
    ...blocks.map((block) => ({ kind: "block" as const, startsAt: block.startsAt, block })),
    ...groupSessions.map((session) => ({ kind: "group" as const, startsAt: session.startsAt, session })),
    ...appointments.map((appointment) => ({ kind: "appointment" as const, startsAt: appointment.startsAt, appointment })),
  ].sort(
    (a, b) =>
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() ||
      agendaKindOrder[a.kind] - agendaKindOrder[b.kind],
  );
}

function DayEventsModal({
  day,
  appointments,
  groupSessions,
  blocks,
  onClose,
  onOpenAppointment,
  onOpenDay,
}: {
  day: Date;
  appointments: Appointment[];
  groupSessions: GroupSession[];
  blocks: ScheduleBlock[];
  onClose: () => void;
  onOpenAppointment: (id: string) => void;
  onOpenDay: () => void;
}) {
  const events = sortAgendaEntries({ appointments, groupSessions, blocks }).map((entry) =>
    entry.kind === "appointment"
      ? { kind: entry.kind, id: entry.appointment.id, startsAt: entry.startsAt, endsAt: entry.appointment.endsAt, title: entry.appointment.patientName, detail: `${entry.appointment.serviceName} · ${entry.appointment.professionalName} · ${statusLabel(entry.appointment.status)}`, color: entry.appointment.professionalColor }
      : entry.kind === "group"
        ? { kind: entry.kind, id: entry.session.id, startsAt: entry.startsAt, endsAt: entry.session.endsAt, title: entry.session.groupName, detail: `${entry.session.professionalName} · ${entry.session.roomName}`, color: undefined }
        : { kind: entry.kind, id: entry.block.id, startsAt: entry.startsAt, endsAt: entry.block.endsAt, title: entry.block.reason, detail: `Bloqueio · ${[entry.block.professionalName, entry.block.roomName].filter(Boolean).join(" · ")}`, color: undefined },
  );
  const count = events.length;
  return (
    <Modal
      eyebrow="Agenda do dia"
      title={day.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
      subtitle={count === 0 ? "Nenhum evento neste dia." : `${count} ${count === 1 ? "evento" : "eventos"} neste dia.`}
      onClose={onClose}
    >
      <div className="day-events">
        {count > 0 && (
          <ul className="day-events-list">
            {events.map((event) => {
              const content = (
                <>
                  <time>{timeLabel.format(new Date(event.startsAt))}–{timeLabel.format(new Date(event.endsAt))}</time>
                  <span>
                    <strong>{event.color && <i style={{ background: event.color }} aria-hidden="true" />}{event.title}</strong>
                    <small>{event.detail}</small>
                  </span>
                </>
              );
              return (
                <li key={`${event.kind}-${event.id}`}>
                  {event.kind === "appointment" ? (
                    <button type="button" className="day-event appointment" onClick={() => onOpenAppointment(event.id)} aria-label={`Detalhes de ${event.title}`}>
                      {content}
                    </button>
                  ) : (
                    <div className={`day-event ${event.kind}`}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onOpenDay}>Abrir dia na agenda</button>
        </div>
      </div>
    </Modal>
  );
}

// Mesmo layout do card de atendimento, com fundo próprio para diferenciar as aulas em grupo.
function GroupSessionCard({ session, compact = false }: { session: GroupSession; compact?: boolean }) {
  const startsAt = timeLabel.format(new Date(session.startsAt));
  const endsAt = timeLabel.format(new Date(session.endsAt));
  if (compact)
    return (
      <article className="week-appointment group-class" aria-label={session.groupName}>
        <Users size={10} aria-hidden="true" />
        <time>{startsAt}–{endsAt}</time>
        <strong>{session.groupName}</strong>
        <span>{session.professionalName} · {session.roomName}</span>
      </article>
    );
  return (
    <article className="agenda-card group-class" aria-label={session.groupName}>
      <div className="agenda-time">
        <strong>{startsAt}</strong>
        <span>{endsAt}</span>
      </div>
      <div className="agenda-main">
        <div>
          <span className="service-name">
            <Users size={13} aria-hidden="true" />
            Aula em grupo
          </span>
          <h3>{session.groupName}</h3>
          <p>
            {session.professionalName} · {session.roomName}
          </p>
        </div>
      </div>
    </article>
  );
}

function ScheduleBlockCard({
  block,
  compact = false,
  onCancel,
}: {
  block: ScheduleBlock;
  compact?: boolean;
  onCancel: () => void;
}) {
  return (
    <article
      className={`schedule-block ${compact ? "compact" : ""} ${block.status}`}
    >
      <div>
        <strong>{block.reason}</strong>
        <span>
          {timeLabel.format(new Date(block.startsAt))} —{" "}
          {timeLabel.format(new Date(block.endsAt))}
        </span>
        {!compact && (
          <small>
            {[block.professionalName, block.roomName]
              .filter(Boolean)
              .join(" · ")}
          </small>
        )}
      </div>
      {block.status === "active" && !compact && (
        <button className="secondary-button danger" onClick={onCancel}>
          Cancelar bloqueio
        </button>
      )}
    </article>
  );
}

function AgendaCard({
  appointment,
  onOpen,
  onStatus,
  onHistory,
}: {
  appointment: Appointment;
  onOpen: () => void;
  onStatus: (status: AppointmentStatus) => void;
  onHistory: () => void;
}) {
  return (
    <article
      className="agenda-card"
      role="button"
      tabIndex={0}
      aria-label={`Detalhes de ${appointment.patientName}`}
      onClick={(event) => { if (!(event.target as HTMLElement).closest("button, select")) onOpen(); }}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(); } }}
    >
      <div className="agenda-time">
        <strong>{timeLabel.format(new Date(appointment.startsAt))}</strong>
        <span>{timeLabel.format(new Date(appointment.endsAt))}</span>
      </div>
      <div className="agenda-main">
        <div>
          <span className="service-name">
            <i style={{ background: appointment.professionalColor }} aria-hidden="true" />
            {appointment.serviceName}
          </span>
          <h3>{appointment.patientName}</h3>
          <p>
            {appointment.professionalName} · {appointment.roomName}
          </p>
        </div>
        <div className="agenda-actions">
          <select
            value={appointment.status}
            onChange={(event) =>
              onStatus(event.target.value as AppointmentStatus)
            }
            aria-label="Status do atendimento"
          >
            <option value="scheduled">Agendado</option>
            <option value="confirmed">Confirmado</option>
            <option value="completed">Finalizado</option>
            <option value="no_show">Não compareceu</option>
            <option value="excused_absence">Ausência justificada</option>
            <option value="professional_absence">Ausência profissional</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <button
            className="ghost-icon"
            aria-label={`Histórico de ${appointment.patientName}`}
            title="Histórico de reagendamentos"
            onClick={onHistory}
          >
            <MoreHorizontal size={19} />
          </button>
        </div>
      </div>
    </article>
  );
}

function AppointmentDetailsModal({
  appointment,
  patient,
  service,
  onClose,
  onReschedule,
  onCancelled,
}: {
  appointment: Appointment;
  patient: Patient | undefined;
  service: Service | undefined;
  onClose: () => void;
  onReschedule: () => void;
  onCancelled: (appointment: Appointment) => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const canChange = appointment.status === "scheduled" || appointment.status === "confirmed";
  const isCompleted = appointment.status === "completed";
  const [survey, setSurvey] = useState<SatisfactionSurvey | null>(null);
  const [surveyChecked, setSurveyChecked] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [rating, setRating] = useState(false);
  useEffect(() => {
    if (!isCompleted) return;
    let active = true;
    // A pesquisa é filtrada pela data de registro: do dia do atendimento até amanhã.
    const from = addDaysToIsoDate(localIsoDate(new Date(appointment.startsAt)), -1);
    const tomorrow = addDaysToIsoDate(localIsoDate(), 1);
    const to = tomorrow > from ? tomorrow : from;
    api
      .satisfaction(from, to)
      .then((data) => {
        if (!active) return;
        setSurvey(data.surveys.find((item) => item.appointmentId === appointment.id) ?? null);
      })
      .catch(() => undefined)
      .finally(() => active && setSurveyChecked(true));
    return () => {
      active = false;
    };
  }, [appointment.id, appointment.startsAt, isCompleted]);
  async function cancelAppointment() {
    setCancelling(true);
    setError("");
    try {
      onCancelled(await api.updateAppointmentStatus(appointment.id, "cancelled"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cancelar o atendimento.");
    } finally {
      setCancelling(false);
    }
  }
  if (rating) {
    return (
      <SatisfactionSurveyModal
        appointment={appointment}
        onClose={() => setRating(false)}
        onSaved={(saved) => {
          setSurvey(saved);
          setRating(false);
        }}
        onDuplicate={() => {
          setAlreadyRated(true);
          setRating(false);
        }}
      />
    );
  }
  return (
    <Modal title="Detalhes do atendimento" subtitle={appointment.patientName} onClose={onClose}>
      <div className="appointment-details">
        <section className="appointment-detail-section">
          <h3>Atendimento marcado</h3>
          <div className="appointment-detail-grid">
            <div><small>Serviço</small><strong>{appointment.serviceName}</strong></div>
            <div><small>Status</small><strong>{statusLabel(appointment.status)}</strong></div>
            <div><small>Data</small><strong>{new Date(appointment.startsAt).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</strong></div>
            <div><small>Horário</small><strong>{timeLabel.format(new Date(appointment.startsAt))} – {timeLabel.format(new Date(appointment.endsAt))}</strong></div>
            <div><small>Profissional</small><strong>{appointment.professionalName}</strong></div>
            <div><small>Sala</small><strong>{appointment.roomName}</strong></div>
            {service && <div><small>Duração e valor</small><strong>{service.durationMinutes} min · {currency.format(service.priceInCents / 100)}</strong></div>}
            {appointment.notes && <div className="detail-wide"><small>Observações do agendamento</small><strong>{appointment.notes}</strong></div>}
          </div>
        </section>
        <section className="appointment-detail-section">
          <h3>Dados do cliente</h3>
          {patient ? (
            <div className="appointment-detail-grid">
              <div><small>Nome completo</small><strong>{patient.fullName}</strong></div>
              <div><small>Prontuário</small><strong>{patient.recordNumber || "Não informado"}</strong></div>
              <div><small>Telefone</small><strong>{patient.phone ? formatPhone(patient.phone) : "Não informado"}</strong></div>
              <div><small>WhatsApp</small><strong>{patient.whatsapp ? formatPhone(patient.whatsapp) : "Mesmo telefone de contato"}</strong></div>
              <div><small>E-mail</small><strong>{patient.email || "Não informado"}</strong></div>
              <div><small>CPF</small><strong>{patient.cpf || "Não informado"}</strong></div>
              <div><small>Nascimento</small><strong>{patient.birthDate ? formatIsoDate(patient.birthDate) : "Não informado"}</strong></div>
              <div className="detail-wide"><small>Contato de emergência</small><strong>{patient.emergencyContactName || patient.emergencyContactPhone ? [patient.emergencyContactName, patient.emergencyContactPhone && formatPhone(patient.emergencyContactPhone)].filter(Boolean).join(" · ") : "Não informado"}</strong></div>
              <div><small>Situação</small><strong>{patient.status === "active" ? "Ativo" : "Inativo"}</strong></div>
              <div><small>Etiquetas</small><strong>{patient.tags?.length ? patient.tags.join(", ") : "Nenhuma"}</strong></div>
              {patient.notes && <div className="detail-wide"><small>Observações do cliente</small><strong>{patient.notes}</strong></div>}
            </div>
          ) : <p>Dados cadastrais indisponíveis no momento.</p>}
        </section>
        {error && <div className="form-error">{error}</div>}
        {confirmCancel && (
          <div className="appointment-cancel-confirm">
            <strong>Cancelar este atendimento?</strong>
            <span>O horário será liberado na agenda.</span>
            <div>
              <button className="secondary-button" onClick={() => setConfirmCancel(false)} disabled={cancelling}>Voltar</button>
              <button className="secondary-button danger" onClick={() => void cancelAppointment()} disabled={cancelling}>{cancelling ? "Cancelando…" : "Confirmar cancelamento"}</button>
            </div>
          </div>
        )}
        {!confirmCancel && canChange && (
          <div className="appointment-detail-actions">
            <button className="secondary-button danger" onClick={() => setConfirmCancel(true)}>Cancelar atendimento</button>
            <button className="primary-button" onClick={onReschedule}>Remarcar atendimento</button>
          </div>
        )}
        {isCompleted && survey && (
          <p className="appointment-satisfaction">Satisfação registrada: nota {survey.score}</p>
        )}
        {isCompleted && !survey && alreadyRated && (
          <p className="appointment-satisfaction">Este atendimento já tem pesquisa de satisfação registrada.</p>
        )}
        {isCompleted && surveyChecked && !survey && !alreadyRated && (
          <div className="appointment-detail-actions">
            <button className="primary-button" onClick={() => setRating(true)}>Registrar satisfação</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SatisfactionSurveyModal({
  appointment,
  onClose,
  onSaved,
  onDuplicate,
}: {
  appointment: Appointment;
  onClose: () => void;
  onSaved: (survey: SatisfactionSurvey) => void;
  onDuplicate: () => void;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (score === null) return;
    setSaving(true);
    setError("");
    try {
      const trimmed = comment.trim();
      onSaved(
        await api.createSatisfactionSurvey({
          patientId: appointment.patientId,
          appointmentId: appointment.id,
          score,
          ...(trimmed ? { comment: trimmed } : {}),
        }),
      );
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === "SATISFACTION_DUPLICATE") {
        onDuplicate();
        return;
      }
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a avaliação.");
      setSaving(false);
    }
  }
  return (
    <Modal title="Registrar satisfação" subtitle={appointment.patientName} eyebrow="Pesquisa NPS" onClose={onClose}>
      <form className="form-grid" onSubmit={(event) => void save(event)}>
        <fieldset className="span-2 form-fieldset">
          <legend>De 0 a 10, quanto recomendaria a clínica a um amigo?</legend>
          <div className="tag-filter-list">
            {Array.from({ length: 11 }, (_, value) => (
              <button
                key={value}
                type="button"
                className="tag-filter"
                aria-label={`Nota ${value}`}
                aria-pressed={score === value}
                onClick={() => setScore(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="span-2">
          Comentário (opcional)
          <textarea value={comment} maxLength={1000} rows={3} onChange={(event) => setComment(event.target.value)} />
        </label>
        {error && <div className="span-2"><ErrorBanner error={error} /></div>}
        <div className="span-2 appointment-detail-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Voltar</button>
          <button type="submit" className="primary-button" disabled={score === null || saving}>{saving ? "Salvando…" : "Salvar avaliação"}</button>
        </div>
      </form>
    </Modal>
  );
}

function AppointmentRescheduleModal({
  appointment,
  professionals,
  rooms,
  onClose,
  onSaved,
}: {
  appointment: Appointment;
  professionals: Professional[];
  rooms: Room[];
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
}) {
  const [form, setForm] = useState({
    professionalId: appointment.professionalId,
    roomId: appointment.roomId,
    startsAt: toLocalDateTimeInput(new Date(appointment.startsAt)),
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onSaved(
        await api.rescheduleAppointment(appointment.id, {
          professionalId: form.professionalId,
          roomId: form.roomId,
          startsAt: new Date(form.startsAt).toISOString(),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível reagendar.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Reagendar atendimento"
      subtitle={`${appointment.patientName} · ${appointment.serviceName}. Esta alteração afeta somente esta ocorrência.`}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label>
          Profissional
          <select
            required
            value={form.professionalId}
            onChange={(e) => setForm({ ...form, professionalId: e.target.value })}
          >
            {professionals.map((item) => (
              <option value={item.id} key={item.id}>{item.fullName}</option>
            ))}
          </select>
        </label>
        <label>
          Sala
          <select
            required
            value={form.roomId}
            onChange={(e) => setForm({ ...form, roomId: e.target.value })}
          >
            {rooms.map((item) => (
              <option value={item.id} key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Nova data e horário
          <input
            required
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
          />
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={loading}>
            {loading ? "Salvando…" : "Confirmar reagendamento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AppointmentRescheduleHistoryModal({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<AppointmentRescheduleEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api.appointmentReschedules(appointment.id)
      .then((data) => { if (active) setEvents(data); })
      .catch((cause: Error) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appointment.id]);
  return (
    <Modal
      title="Histórico de reagendamentos"
      subtitle={appointment.patientName}
      onClose={onClose}
    >
      {error && <ErrorBanner error={error} />}
      {loading ? <LoadingBlock /> : events.length === 0 ? (
        <EmptyState title="Sem reagendamentos" copy="O horário deste atendimento ainda não foi alterado." />
      ) : (
        <div className="reschedule-history">
          {events.map((event) => (
            <article key={event.id}>
              <small>{event.actorName} · {new Date(event.createdAt).toLocaleString("pt-BR")}</small>
              <div>
                <span>{new Date(event.previousStartsAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                <strong>→</strong>
                <span>{new Date(event.startsAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
              </div>
              <p className="report-definition">Receitas e despesas pela baixa. A classificação gerencial detalhada ainda precisa de conciliação.</p>
              <p>
                {event.previousProfessionalName} · {event.previousRoomName}
                {" → "}
                {event.professionalName} · {event.roomName}
              </p>
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AppointmentModal({
  date,
  patients,
  professionals,
  rooms,
  services,
  onClose,
  onCreated,
}: {
  date: Date;
  patients: Patient[];
  professionals: Professional[];
  rooms: Room[];
  services: Service[];
  onClose: () => void;
  onCreated: (appointment: Appointment[]) => void;
}) {
  const initialTime = new Date(date);
  initialTime.setHours(9, 0, 0, 0);
  const [form, setForm] = useState({
    patientId: patients[0]?.id ?? "",
    professionalId: professionals[0]?.id ?? "",
    roomId: rooms[0]?.id ?? "",
    serviceId: services[0]?.id ?? "",
    startsAt: toLocalDateTimeInput(initialTime),
    notes: "",
    recurring: false,
    occurrences: 4,
    intervalWeeks: 1,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const input: AppointmentInput = {
        patientId: form.patientId,
        professionalId: form.professionalId,
        roomId: form.roomId,
        serviceId: form.serviceId,
        startsAt: new Date(form.startsAt).toISOString(),
        notes: form.notes,
      };
      onCreated(
        form.recurring
          ? await api.createRecurringAppointments({
              ...input,
              occurrences: form.occurrences,
              intervalWeeks: form.intervalWeeks,
            })
          : [await api.createAppointment(input)],
      );
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Não foi possível agendar.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Novo atendimento"
      subtitle="A duração e o valor seguem o serviço selecionado."
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Cliente
          <select
            required
            value={form.patientId}
            onChange={(e) => setForm({ ...form, patientId: e.target.value })}
          >
            {patients.map((item) => (
              <option value={item.id} key={item.id}>
                {item.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-field span-2">
          <input
            type="checkbox"
            checked={form.recurring}
            onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
          />
          Repetir este atendimento
        </label>
        {form.recurring && (
          <>
            <label>
              Número de ocorrências
              <input
                type="number"
                min={2}
                max={52}
                value={form.occurrences}
                onChange={(e) =>
                  setForm({ ...form, occurrences: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Intervalo
              <select
                value={form.intervalWeeks}
                onChange={(e) =>
                  setForm({ ...form, intervalWeeks: Number(e.target.value) })
                }
              >
                <option value={1}>Toda semana</option>
                <option value={2}>A cada 2 semanas</option>
                <option value={3}>A cada 3 semanas</option>
                <option value={4}>A cada 4 semanas</option>
              </select>
            </label>
          </>
        )}
        <label>
          Profissional
          <select
            required
            value={form.professionalId}
            onChange={(e) =>
              setForm({ ...form, professionalId: e.target.value })
            }
          >
            {professionals.map((item) => (
              <option value={item.id} key={item.id}>
                {item.fullName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sala
          <select
            required
            value={form.roomId}
            onChange={(e) => setForm({ ...form, roomId: e.target.value })}
          >
            {rooms.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Serviço
          <select
            required
            value={form.serviceId}
            onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
          >
            {services.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · {currency.format(item.priceInCents / 100)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data e horário
          <input
            required
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
          />
        </label>
        <label className="span-2">
          Observação
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
          />
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={loading}>
            {loading ? "Agendando…" : "Confirmar atendimento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ScheduleBlockModal({
  date,
  professionals,
  rooms,
  onClose,
  onCreated,
}: {
  date: Date;
  professionals: Professional[];
  rooms: Room[];
  onClose: () => void;
  onCreated: (block: ScheduleBlock) => void;
}) {
  const initialStart = new Date(date);
  initialStart.setHours(12, 0, 0, 0);
  const initialEnd = new Date(initialStart);
  initialEnd.setHours(13, 0, 0, 0);
  const [form, setForm] = useState({
    target: "professional" as "professional" | "room",
    targetId: professionals[0]?.id ?? "",
    startsAt: toLocalDateTimeInput(initialStart),
    endsAt: toLocalDateTimeInput(initialEnd),
    reason: "Horário indisponível",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onCreated(
        await api.createScheduleBlock({
          ...(form.target === "professional"
            ? { professionalId: form.targetId }
            : { roomId: form.targetId }),
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          reason: form.reason,
        }),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const targets = form.target === "professional" ? professionals : rooms;
  return (
    <Modal
      title="Bloquear horário"
      subtitle="Impeça novos agendamentos durante uma indisponibilidade."
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label>
          Tipo
          <select
            value={form.target}
            onChange={(event) => {
              const target = event.target.value as "professional" | "room";
              setForm({
                ...form,
                target,
                targetId:
                  target === "professional"
                    ? (professionals[0]?.id ?? "")
                    : (rooms[0]?.id ?? ""),
              });
            }}
          >
            <option value="professional">Profissional</option>
            <option value="room">Sala</option>
          </select>
        </label>
        <label>
          Recurso
          <select
            required
            value={form.targetId}
            onChange={(event) =>
              setForm({ ...form, targetId: event.target.value })
            }
          >
            {targets.map((item) => (
              <option value={item.id} key={item.id}>
                {"fullName" in item ? item.fullName : item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Início
          <input
            required
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) =>
              setForm({ ...form, startsAt: event.target.value })
            }
          />
        </label>
        <label>
          Término
          <input
            required
            type="datetime-local"
            value={form.endsAt}
            onChange={(event) =>
              setForm({ ...form, endsAt: event.target.value })
            }
          />
        </label>
        <label className="span-2">
          Motivo
          <input
            required
            value={form.reason}
            onChange={(event) =>
              setForm({ ...form, reason: event.target.value })
            }
          />
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>
            Voltar
          </button>
          <button
            className="primary-button"
            disabled={loading || !form.targetId}
          >
            {loading ? "Bloqueando…" : "Criar bloqueio"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [matrix, setMatrix] = useState<PermissionMatrixItem[]>([]);
  const [audit, setAudit] = useState<AdminAuditEvent[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [userData, settingData, matrixData, auditData] = await Promise.all([
        api.adminUsers(),
        api.clinicSettings(),
        api.permissionMatrix(),
        api.adminAuditEvents(),
      ]);
      setUsers(userData);
      setSettings(settingData);
      setMatrix(matrixData);
      setAudit(auditData);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      api.adminUsers(),
      api.clinicSettings(),
      api.permissionMatrix(),
      api.adminAuditEvents(),
    ])
      .then(([userData, settingData, matrixData, auditData]) => {
        if (!active) return;
        setUsers(userData);
        setSettings(settingData);
        setMatrix(matrixData);
        setAudit(auditData);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);

  async function createUser() {
    const fullName = window.prompt("Nome completo do usuário:")?.trim();
    const email = window.prompt("E-mail de acesso:")?.trim();
    const password = window.prompt(
      "Senha inicial forte (mínimo 10 caracteres):",
    );
    if (!fullName || !email || !password) return;
    try {
      await api.createAdminUser({
        fullName,
        email,
        password,
        role: "reception",
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Controle operacional"
        title="Configurações"
        description="Usuários, permissões, dados da clínica e auditoria administrativa."
        action={
          <button className="primary-button" onClick={() => void createUser()}>
            <Plus size={17} /> Novo usuário
          </button>
        }
      />
      {error && <ErrorBanner error={error} />}
      <div className="admin-grid">
        <section className="panel admin-users">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Acessos</span>
              <h2>Usuários</h2>
            </div>
          </div>
          {users.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.fullName}</strong>
                <small>
                  {item.email} · {item.role}
                </small>
              </div>
              <button
                className="secondary-button"
                onClick={async () => {
                  try {
                    await api.updateAdminUser(item.id, {
                      fullName: item.fullName,
                      role: item.role,
                      active: !item.active,
                    });
                    await load();
                  } catch (cause) {
                    setError((cause as Error).message);
                  }
                }}
              >
                {item.active ? "Desativar" : "Ativar"}
              </button>
              <button
                className="text-button"
                onClick={async () => {
                  const password = window.prompt("Nova senha forte:");
                  if (!password) return;
                  try {
                    await api.resetAdminPassword(item.id, password);
                    await load();
                  } catch (cause) {
                    setError((cause as Error).message);
                  }
                }}
              >
                Redefinir senha
              </button>
            </article>
          ))}
        </section>
        {settings && (
          <section className="panel admin-settings">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Organização</span>
                <h2>Dados da clínica</h2>
              </div>
            </div>
            <form
              className="clinical-form"
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  setSettings(await api.updateClinicSettings(settings));
                  await load();
                } catch (cause) {
                  setError((cause as Error).message);
                }
              }}
            >
              <label>
                Nome
                <input
                  required
                  value={settings.name}
                  onChange={(e) =>
                    setSettings({ ...settings, name: e.target.value })
                  }
                />
              </label>
              <label>
                Razão social
                <input
                  value={settings.legalName}
                  onChange={(e) =>
                    setSettings({ ...settings, legalName: e.target.value })
                  }
                />
              </label>
              <div className="clinical-form-row">
                <label>
                  CNPJ/CPF
                  <input
                    value={settings.taxId}
                    onChange={(e) =>
                      setSettings({ ...settings, taxId: e.target.value })
                    }
                  />
                </label>
                <label>
                  Telefone
                  <PhoneInput
                    value={settings.phone ?? ""}
                    onChange={(digits) =>
                      setSettings({ ...settings, phone: digits })
                    }
                  />
                </label>
              </div>
              <label>
                E-mail
                <input
                  type="email"
                  value={settings.email}
                  onChange={(e) =>
                    setSettings({ ...settings, email: e.target.value })
                  }
                />
              </label>
              <label>
                Endereço
                <textarea
                  rows={2}
                  value={settings.address}
                  onChange={(e) =>
                    setSettings({ ...settings, address: e.target.value })
                  }
                />
              </label>
              <button className="primary-button">Salvar configurações</button>
            </form>
          </section>
        )}
        <RelationshipSettingsSection canEdit />
        <section className="panel admin-matrix">
          <div className="panel-head">
            <div>
              <span className="eyebrow">RBAC</span>
              <h2>Matriz de permissões</h2>
            </div>
          </div>
          {matrix.map((item) => (
            <article key={item.role}>
              <strong>{item.role}</strong>
              <span>{item.modules.join(" · ")}</span>
            </article>
          ))}
        </section>
        <section className="panel admin-audit">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Rastreabilidade</span>
              <h2>Auditoria recente</h2>
            </div>
          </div>
          {audit.length === 0 ? (
            <p className="muted-copy">Nenhuma alteração administrativa.</p>
          ) : (
            audit.slice(0, 20).map((item) => (
              <article key={item.id}>
                <strong>{item.action}</strong>
                <span>
                  {item.actorName ?? "Sistema"} ·{" "}
                  {new Date(item.createdAt).toLocaleString("pt-BR")}
                </span>
              </article>
            ))
          )}
        </section>
      </div>
    </>
  );
}

type RelationshipDeadlineKey = Exclude<keyof RelationshipSettings, "messages">;

const relationshipDeadlineFields: Array<{
  key: RelationshipDeadlineKey;
  label: string;
  min: number;
}> = [
  { key: "birthdayDaysAhead", label: "Aniversário: avisar quantos dias antes", min: 0 },
  { key: "singleNoReturnDays", label: "Veio uma vez: dias sem voltar", min: 1 },
  { key: "planExpiringDays", label: "Plano acabando: avisar quantos dias antes do fim", min: 1 },
  { key: "lowBalanceSessions", label: "Saldo baixo: sessões restantes", min: 0 },
  { key: "expiredWithBalanceDays", label: "Vencido com saldo: até quantos dias após vencer", min: 1 },
  { key: "treatmentPausedDays", label: "Tratamento parado: dias sem atendimento", min: 1 },
  { key: "repeatedNoShowCount", label: "Faltas seguidas: número de faltas", min: 1 },
  { key: "repeatedNoShowWindowDays", label: "Faltas seguidas: período em dias", min: 1 },
  { key: "formerClientMinDays", label: "Ex-cliente: cancelou há pelo menos (dias)", min: 0 },
  { key: "formerClientMaxDays", label: "Ex-cliente: cancelou há no máximo (dias)", min: 1 },
];

function RelationshipSettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Controle operacional"
        title="Configurações"
        description="Prazos e mensagens usados nos contatos sugeridos."
      />
      <RelationshipSettingsSection canEdit={false} />
    </>
  );
}

function RelationshipSettingsSection({ canEdit }: { canEdit: boolean }) {
  const [settings, setSettings] = useState<RelationshipSettings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .relationshipSettings()
      .then((data) => active && setSettings(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      setSettings(await api.updateRelationshipSettings(settings));
      setNotice("Prazos e mensagens salvos.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel admin-relationship">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Relacionamento</span>
          <h2>Prazos e mensagens</h2>
        </div>
      </div>
      {error && <ErrorBanner error={error} />}
      {!canEdit && (
        <p className="muted-copy">
          Somente a gestora da clínica pode alterar estes valores.
        </p>
      )}
      {!settings ? (
        !error && <LoadingBlock />
      ) : (
        <form className="clinical-form" onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            {relationshipDeadlineFields.map((field) => (
              <label key={field.key}>
                {field.label}
                <input
                  type="number"
                  min={field.min}
                  step={1}
                  required
                  readOnly={!canEdit}
                  value={settings[field.key]}
                  onChange={(e) =>
                    setSettings({ ...settings, [field.key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <p className="muted-copy">
            Variáveis disponíveis nas mensagens: <code>{"{{nome}}"}</code> — é
            substituída pelo primeiro nome do cliente ao abrir o WhatsApp.
          </p>
          {(Object.keys(contactReasonLabels) as ContactReason[]).map((reason) => (
            <label key={reason}>
              Mensagem: {contactReasonLabels[reason]}
              <textarea
                rows={2}
                required
                maxLength={1000}
                readOnly={!canEdit}
                value={settings.messages[reason]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    messages: { ...settings.messages, [reason]: e.target.value },
                  })
                }
              />
            </label>
          ))}
          {notice && <p className="muted-copy">{notice}</p>}
          {canEdit && (
            <button className="primary-button" disabled={saving}>
              {saving ? "Salvando…" : "Salvar prazos e mensagens"}
            </button>
          )}
        </form>
      )}
    </section>
  );
}

function Modal({
  title,
  subtitle,
  eyebrow = "Cadastro rápido",
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id="modal-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; };
  }, [onClose]);
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer-head"><div><span className="eyebrow">Turmas</span><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar gaveta" autoFocus><X size={20} /></button></header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

function GroupSlotsEditor({ slots, onChange, weekDayNames }: { slots: GroupClass["weeklySlots"]; onChange: (slots: GroupClass["weeklySlots"]) => void; weekDayNames: string[] }) {
  function addSlot() {
    const candidate = [["09:00", "10:00"], ["10:00", "11:00"], ["11:00", "12:00"], ["14:00", "15:00"], ["15:00", "16:00"], ["16:00", "17:00"], ["18:00", "19:00"]]
      .flatMap(([startTime, endTime]) => [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({ weekday, startTime: startTime!, endTime: endTime! })))
      .find((slot) => !slots.some((item) => item.weekday === slot.weekday && item.startTime < slot.endTime && item.endTime > slot.startTime));
    if (candidate) onChange([...slots, candidate]);
  }
  return (
    <div className="group-slots-editor">
      <div className="group-slots-head"><div><h4>Dias e horários fixos</h4><p>Estes horários ficam reservados na agenda toda semana, com o profissional e a sala da turma.</p></div><button type="button" className="secondary-button" disabled={slots.length >= 14} onClick={addSlot}>Adicionar horário</button></div>
      {slots.length === 0 && <p className="group-empty">Adicione ao menos um dia e horário para a turma.</p>}
      {slots.map((slot, index) => (
        <div className="group-slot-row" key={index}>
          <label>Dia<select value={slot.weekday} onChange={(event) => onChange(slots.map((item, position) => position === index ? { ...item, weekday: Number(event.target.value) } : item))}>{weekDayNames.map((name, weekday) => <option key={name} value={weekday}>{name}</option>)}</select></label>
          <label>Início<input type="time" required value={slot.startTime} onChange={(event) => onChange(slots.map((item, position) => position === index ? { ...item, startTime: event.target.value } : item))} /></label>
          <label>Término<input type="time" required min={slot.startTime} value={slot.endTime} onChange={(event) => onChange(slots.map((item, position) => position === index ? { ...item, endTime: event.target.value } : item))} /></label>
          <button type="button" className="ghost-icon" aria-label={`Remover horário ${index + 1}`} onClick={() => onChange(slots.filter((_, position) => position !== index))}><X size={18} /></button>
        </div>
      ))}
    </div>
  );
}

function GroupsPage() {
  const weekDayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const [workspace, setWorkspace] = useState<GroupWorkspace | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<"create" | "enroll" | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editingCapacity, setEditingCapacity] = useState(1);
  const [editingSlots, setEditingSlots] = useState<GroupClass["weeklySlots"]>([]);
  const [groupForm, setGroupForm] = useState({
    serviceId: "",
    professionalId: "",
    roomId: "",
    capacity: 1,
    weeklySlots: [] as GroupClass["weeklySlots"],
  });
  const [enrollmentForm, setEnrollmentForm] = useState({
    groupId: "",
    patientId: "",
  });
  async function load() {
    setLoading(true);
    setError("");
    try {
      const dates = groupOperationRange();
      const [data, patientData, professionalData, roomData, serviceData] =
        await Promise.all([
          api.groupWorkspace(dates.from, dates.to),
          api.patients(),
          api.professionals(),
          api.rooms(),
          api.services(),
        ]);
      setWorkspace(data);
      setPatients(patientData);
      setProfessionals(professionalData);
      setRooms(roomData);
      setServices(serviceData);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    const dates = groupOperationRange();
    Promise.all([
      api.groupWorkspace(dates.from, dates.to),
      api.patients(),
      api.professionals(),
      api.rooms(),
      api.services(),
    ])
      .then(([data, patientData, professionalData, roomData, serviceData]) => {
        if (!active) return;
        setWorkspace(data);
        setPatients(patientData);
        setProfessionals(professionalData);
        setRooms(roomData);
        setServices(serviceData);
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);
  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  const activeEnrollments =
    workspace?.enrollments.filter((item) => item.status === "active") ?? [];
  const selectedGroup = workspace?.groups.find((item) => item.id === selectedGroupId);
  const newGroupService = services.find((item) => item.id === groupForm.serviceId);
  const nextGroupSequence = Math.max(0, ...(workspace?.groups ?? []).filter((item) => item.serviceId === groupForm.serviceId).map((item) => item.sequence)) + 1;
  const groupOptionLabel = (group: GroupClass) => `${group.name} — ${describeGroupSchedule(group.weeklySlots ?? [])}`;
  function openGroup(group: GroupClass) {
    setSelectedGroupId(group.id);
    setEditingCapacity(group.capacity);
    setEditingSlots(group.weeklySlots ?? []);
  }
  function closeDrawers() {
    setDrawer(null);
    setSelectedGroupId(null);
  }
  return (
    <>
      <PageHeader
        eyebrow="Operação coletiva"
        title="Turmas"
        description="Capacidade, lista de espera e horários fixos reservados na agenda."
        action={<button className="primary-button" onClick={() => setDrawer("create")}><Plus size={18} /> Nova turma</button>}
      />
      {error && <ErrorBanner error={error} />}
      {loading && !workspace ? (
        <LoadingBlock />
      ) : (
        <div className="groups-layout">
          <div className="group-overview">
            <div><span>Turmas</span><strong>{workspace?.groups.length ?? 0}</strong><small>cadastradas</small></div>
            <div><span>Matrículas ativas</span><strong>{activeEnrollments.length}</strong><small>clientes inscritos</small></div>
            <div><span>Encontros</span><strong>{workspace?.sessions.filter((item) => item.status === "scheduled").length ?? 0}</strong><small>agendados</small></div>
          </div>
          <div className="group-actions-bar">
            <button className="secondary-button" onClick={() => setDrawer("enroll")}>Matricular cliente</button>
          </div>
          {drawer === "create" && <Drawer title="Nova turma" subtitle="Configure os dados e horários fixos." onClose={closeDrawers}>
          <section className="group-drawer-content group-form-panel">
            {error && <ErrorBanner error={error} />}
            <h2>Nova turma</h2>
            <p className="group-panel-copy">Defina o serviço, o profissional, a sala e o número de vagas. O nome é gerado automaticamente por serviço.</p>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => { await api.createGroupClass(groupForm); setGroupForm({ serviceId: "", professionalId: "", roomId: "", capacity: 1, weeklySlots: [] }); closeDrawers(); });
              }}
            >
              <label>
                Serviço
                <select
                  required
                  value={groupForm.serviceId}
                  onChange={(event) =>
                    setGroupForm({
                      ...groupForm,
                      serviceId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {services.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Profissional
                <select
                  required
                  value={groupForm.professionalId}
                  onChange={(event) =>
                    setGroupForm({
                      ...groupForm,
                      professionalId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {professionals.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sala
                <select
                  required
                  value={groupForm.roomId}
                  onChange={(event) =>
                    setGroupForm({ ...groupForm, roomId: event.target.value })
                  }
                >
                  <option value="">Selecione</option>
                  {rooms.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.capacity})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Vagas
                <input
                  type="number"
                  min={1}
                  max={rooms.find((item) => item.id === groupForm.roomId)?.capacity ?? 100}
                  value={groupForm.capacity}
                  onChange={(event) =>
                    setGroupForm({
                      ...groupForm,
                      capacity: Number(event.target.value),
                    })
                  }
                />
              </label>
              <GroupSlotsEditor slots={groupForm.weeklySlots} onChange={(weeklySlots) => setGroupForm({ ...groupForm, weeklySlots })} weekDayNames={weekDayNames} />
              <div className="group-next-session" aria-live="polite">
                {newGroupService ? <strong>{groupClassName(newGroupService.name, nextGroupSequence)}</strong> : "Selecione o serviço para ver o nome da turma"}
                <br />
                {describeGroupSchedule(groupForm.weeklySlots)}
              </div>
              <button className="primary-button" disabled={groupForm.weeklySlots.length === 0}>Criar turma</button>
            </form>
          </section>
          </Drawer>}
          {drawer === "enroll" && <Drawer title="Nova matrícula" subtitle="Escolha a turma e o cliente." onClose={closeDrawers}>
          <section className="group-drawer-content group-form-panel">
            {error && <ErrorBanner error={error} />}
            <h2>Matrícula</h2>
            <p className="group-panel-copy">Inclua um cliente em uma turma com vagas disponíveis.</p>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => { await api.createGroupEnrollment(enrollmentForm); closeDrawers(); });
              }}
            >
              <label>
                Turma
                <select
                  required
                  value={enrollmentForm.groupId}
                  onChange={(event) =>
                    setEnrollmentForm({
                      ...enrollmentForm,
                      groupId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {workspace?.groups
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {groupOptionLabel(item)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Cliente
                <select
                  required
                  value={enrollmentForm.patientId}
                  onChange={(event) =>
                    setEnrollmentForm({
                      ...enrollmentForm,
                      patientId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {patients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button">Matricular</button>
            </form>
          </section>
          </Drawer>}

          <section className="panel groups-wide">
            <h2>Turmas</h2>
            <p className="group-panel-copy">Acompanhe ocupação, participantes e lista de espera.</p>
            {workspace?.groups.length === 0 && <p className="group-empty">Nenhuma turma cadastrada. Crie a primeira turma no formulário acima.</p>}
            <div className="group-card-grid">
              {workspace?.groups.map((group) => (
                <article className="group-card" key={group.id}>
                  <div>
                    <strong>{group.name}</strong>
                    <span className="group-card-schedule">{describeGroupSchedule(group.weeklySlots ?? [])}</span>
                    <small>
                      {group.professionalName} · {group.roomName}
                    </small>
                  </div>
                  <span>
                    {group.activeEnrollments}/{group.capacity} vagas
                  </span>
                  <small>{group.waitlistCount} em espera</small>
                  <div className="group-slot-summary">
                    {(group.weeklySlots ?? []).length ? group.weeklySlots.map((slot) => <span key={`${slot.weekday}-${slot.startTime}`}>{groupSlotLabel(slot, weekDayNames)}</span>) : <small>Horários ainda não definidos</small>}
                  </div>
                  <button className="secondary-button" onClick={() => openGroup(group)}>Abrir turma</button>
                </article>
              ))}
            </div>
          </section>

          {selectedGroup && <Drawer title={selectedGroup.name} subtitle={`${describeGroupSchedule(selectedGroup.weeklySlots ?? [])} · ${selectedGroup.professionalName}`} onClose={closeDrawers}>
            <div className="group-drawer-content">
              {error && <ErrorBanner error={error} />}
              <div className="group-drawer-quick-actions">
                <button className="secondary-button" onClick={() => { setEnrollmentForm({ ...enrollmentForm, groupId: selectedGroup.id }); setSelectedGroupId(null); setDrawer("enroll"); }}>Matricular cliente</button>
              </div>
              <section className="group-drawer-section">
                <h3>Capacidade e horários</h3>
                <p>Ao salvar, os próximos encontros são refeitos nos novos horários. Encontros com presença registrada são mantidos.</p>
                <form className="form-grid" onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => { await api.updateGroupClass(selectedGroup.id, { capacity: editingCapacity, weeklySlots: editingSlots }); closeDrawers(); });
                }}>
                  <label>Máximo de pessoas<input type="number" min={selectedGroup.activeEnrollments} max={rooms.find((item) => item.id === selectedGroup.roomId)?.capacity ?? 100} required value={editingCapacity} onChange={(event) => setEditingCapacity(Number(event.target.value))} /></label>
                  <div className="group-drawer-note">{selectedGroup.activeEnrollments} matriculados · Sala {selectedGroup.roomName} comporta até {rooms.find((item) => item.id === selectedGroup.roomId)?.capacity ?? "—"} pessoas</div>
                  <GroupSlotsEditor slots={editingSlots} onChange={setEditingSlots} weekDayNames={weekDayNames} />
                  <button className="primary-button" disabled={editingSlots.length === 0}>Salvar alterações</button>
                </form>
              </section>
              <section className="group-drawer-section">
                <h3>Participantes</h3>
                <div className="group-members">
                  {workspace?.enrollments.filter((item) => item.groupId === selectedGroup.id && item.status !== "cancelled").map((item) => (
                    <div key={item.id}><span>{item.patientName} · {item.status === "active" ? "Matriculado" : `Espera ${item.queuePosition}`}</span><button type="button" className="group-cancel-button" aria-label={`Cancelar matrícula de ${item.patientName}`} onClick={() => void run(() => api.cancelGroupEnrollment(item.id))}><UserMinus size={14} aria-hidden="true" />Cancelar matrícula</button></div>
                  ))}
                  {!workspace?.enrollments.some((item) => item.groupId === selectedGroup.id && item.status !== "cancelled") && <p>Nenhum participante matriculado.</p>}
                </div>
              </section>
            </div>
          </Drawer>}
        </div>
      )}
    </>
  );
}

function App() {
  const [user, setUser] = useState<UserSummary | null>(() => getStoredUser());
  const authenticated = Boolean(user && hasSession());
  const logout = () => {
    clearSession();
    setUser(null);
  };
  return (
    <Routes>
      <Route
        path="/login"
        element={
          authenticated ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage onLogin={setUser} />
          )
        }
      />
      <Route
        path="*"
        element={
          !authenticated ? (
            <Navigate to="/login" replace />
          ) : (
            <Shell user={user!} onLogout={logout}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/agenda" element={<AgendaPage />} />
                <Route
                  path="/turmas"
                  element={
                    ["owner", "reception", "physiotherapist"].includes(
                      user!.role,
                    ) ? (
                      <GroupsPage />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  }
                />
                <Route path="/clientes" element={<PatientsPage />} />
                {/* Endereço antigo, mantido para links e favoritos já salvos. */}
                <Route path="/pacientes" element={<Navigate to="/clientes" replace />} />
                <Route
                  path="/planos"
                  element={
                    <PlansPage
                      canManage={["owner", "reception", "finance"].includes(
                        user!.role,
                      )}
                    />
                  }
                />
                <Route
                  path="/comercial"
                  element={
                    ["owner", "reception", "finance"].includes(user!.role) ? (
                      <CommercialPage />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  }
                />
                <Route
                  path="/relacionamento"
                  element={
                    ["owner", "reception", "finance"].includes(user!.role) ? (
                      <RelationshipPage />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  }
                />
                <Route
                  path="/comunicacoes"
                  element={
                    ["owner", "reception", "finance"].includes(user!.role) ? (
                      <CommunicationsPage />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  }
                />
                <Route
                  path="/documentos"
                  element={
                    ["owner", "reception", "finance"].includes(user!.role) ? (
                      <DocumentsPage />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  }
                />
                <Route
                  path="/prontuarios"
                  element={
                    ["owner", "physiotherapist"].includes(user!.role) ? (
                      <ClinicalRecordsPage />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  }
                />
                <Route
                  path="/financeiro"
                  element={
                    ["owner", "finance"].includes(user!.role) ? (
                      <FinancePage />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  }
                />
                <Route
                  path="/relatorios"
                  element={
                    ["owner", "finance"].includes(user!.role) ? (
                      <ReportsPage />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  }
                />
                <Route
                  path="/configuracoes"
                  element={
                    user!.role === "owner" ? (
                      <AdminPage />
                    ) : ["reception", "finance"].includes(user!.role) ? (
                      <RelationshipSettingsPage />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          )
        }
      />
    </Routes>
  );
}

export default App;
