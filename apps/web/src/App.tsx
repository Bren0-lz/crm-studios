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
  FileText,
  LockKeyhole,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  PackageOpen,
  Paperclip,
  Pause,
  Play,
  Plus,
  Printer,
  Search,
  Settings,
  Stethoscope,
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
  DashboardSummary,
  DocumentKind,
  DocumentTemplate,
  DocumentTemplateInput,
  FinancialWorkspace,
  GroupWorkspace,
  InventoryWorkspace,
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
  PatientInput,
  PatientPlan,
  PatientPlanInput,
  PayableInput,
  PaymentMethod,
  PaymentReceipt,
  PermissionMatrixItem,
  PlanStatus,
  Professional,
  Room,
  ScheduleBlock,
  Service,
  TherapeuticGoalInput,
  TreatmentClosureInput,
  UserSummary,
} from "@crm/contracts";
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
            Agenda, pacientes e prontuários conectados em uma experiência
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
  { to: "/pacientes", label: "Pacientes", icon: Users },
  {
    to: "/estoque",
    label: "Estoque e comandas",
    icon: PackageOpen,
    roles: ["owner", "reception", "finance"],
  },
  { to: "/planos", label: "Planos e sessões", icon: PackageOpen },
  {
    to: "/comercial",
    label: "CRM comercial",
    icon: Columns3,
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
    roles: ["owner"],
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
  const canSeeSales = ["owner", "finance"].includes(
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
        title="Bom dia, Mariana."
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
                <span>Pacientes ativos</span>
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
                  <h2>Vendas e retorno dos pacientes</h2>
                </div>
                <NavLink to="/relatorios" className="text-link">
                  Ver detalhes <ChevronRight size={16} />
                </NavLink>
              </div>
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
                  <span>Pacientes atendidos</span>
                  <strong>{sales.current.attendedPatients}</strong>
                  <small>Com atendimento concluído</small>
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
                    <h2>Pacientes sem retorno</h2>
                  </div>
                </div>
                <div className="attention-list">
                  {sales.patientsWithoutReturn.length === 0 ? (
                    <p>Nenhum paciente nessa situação.</p>
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
    </>
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

function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

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

  return (
    <>
      <PageHeader
        eyebrow="Base clínica"
        title="Pacientes"
        description="Cadastros, vínculos e informações essenciais em um só lugar."
        action={
          <button className="primary-button" onClick={() => setModalOpen(true)}>
            <Plus size={18} />
            Novo paciente
          </button>
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
          <div className="list-count">
            <strong>{patients.length}</strong>
            <span>pacientes encontrados</span>
          </div>
        </div>
        {loading ? (
          <LoadingBlock />
        ) : patients.length === 0 ? (
          <EmptyState
            title="Nenhum paciente encontrado"
            copy="Tente uma busca diferente ou crie um novo cadastro."
          />
        ) : (
          <div className="patient-table">
            <div className="table-row table-head">
              <span>Paciente</span>
              <span>Contato</span>
              <span>Etiquetas</span>
              <span>Situação</span>
              <span />
            </div>
            {patients.map((patient) => (
              <div className="table-row" key={patient.id}>
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
                  <span>{patient.phone}</span>
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
                <span className="active-label">
                  <i />
                  Ativo
                </span>
                <button
                  className="ghost-icon"
                  aria-label={`Editar ${patient.fullName}`}
                  onClick={() => setEditingPatient(patient)}
                >
                  <ChevronRight size={18} />
                </button>
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
    </>
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
    cpf: patient?.cpf ?? "",
    email: patient?.email ?? "",
    birthDate: patient?.birthDate ?? "",
    emergencyContactName: patient?.emergencyContactName ?? "",
    emergencyContactPhone: patient?.emergencyContactPhone ?? "",
    notes: patient?.notes ?? "",
    tags: patient?.tags ?? [],
  }));
  const [tagsText, setTagsText] = useState(() => (patient?.tags ?? []).join(", "));
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
      title={patient ? "Editar paciente" : "Novo paciente"}
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
        <label>
          Telefone
          <input
            required
            value={form.phone}
            onChange={(e) => field("phone", e.target.value)}
          />
        </label>
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
        <label>
          Contato de emergência
          <input
            value={form.emergencyContactName}
            onChange={(e) => field("emergencyContactName", e.target.value)}
          />
        </label>
        <label>
          Telefone de emergência
          <input
            value={form.emergencyContactPhone}
            onChange={(e) => field("emergencyContactPhone", e.target.value)}
          />
        </label>
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
            {loading ? "Salvando…" : patient ? "Salvar alterações" : "Salvar paciente"}
          </button>
        </div>
      </form>
    </Modal>
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
                Paciente
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
    ])
      .then(([templateData, documentData, patientData, planData]) => {
        if (!active) return;
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
                Paciente
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
          <span className="eyebrow">Vendas e pacientes</span>
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
      {loading || !report ? (
        <LoadingBlock />
      ) : (
        <>
          <p className="sales-period">
            {report.current.from} a {report.current.to} comparado com{" "}
            {report.previousComparable.from} a {report.previousComparable.to}.
          </p>
          <div className="sales-metrics">
            <article>
              <span>Vendas líquidas</span>
              <strong>
                {currency.format(report.current.netSalesInCents / 100)}
              </strong>
              <small>
                {report.changePercent === null
                  ? "Sem vendas no período anterior"
                  : `${report.changePercent > 0 ? "+" : ""}${report.changePercent}% · ${currency.format(report.changeInCents / 100)} de diferença`}
              </small>
            </article>
            <article>
              <span>Vendas brutas</span>
              <strong>
                {currency.format(report.current.grossSalesInCents / 100)}
              </strong>
              <small>
                {currency.format(report.current.cancelledSalesInCents / 100)} em
                cancelamentos
              </small>
            </article>
            <article>
              <span>Recebido</span>
              <strong>
                {currency.format(report.current.receivedInCents / 100)}
              </strong>
              <small>Pagamentos baixados no período</small>
            </article>
            <article>
              <span>Sem retorno</span>
              <strong>{report.patientsWithoutReturn.length}</strong>
              <small>
                Atendidos no mês anterior, sem atendimento concluído neste
              </small>
            </article>
          </div>
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
              <h3>Pacientes sem retorno</h3>
              {report.patientsWithoutReturn.length === 0 ? (
                <p>Nenhum paciente nessa situação.</p>
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
          <p className="report-definition">
            Venda = plano criado ou comanda fechada. Cancelamento entra na data
            do movimento: parcelas abertas do plano ou valor da comanda.
            Recebido = pagamentos menos estornos. A planilha contém todos os
            movimentos dos dois meses exibidos.
          </p>
        </>
      )}
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
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  async function load(from = filter.from, to = filter.to) {
    setLoading(true);
    setError("");
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
        description="Acompanhe operação, carteira e conversão com filtros reproduzíveis."
        action={
          <button
            className="secondary-button"
            disabled={!report || exporting}
            onClick={() => void exportCsv()}
          >
            {exporting ? "Exportando…" : "Exportar CSV"}
          </button>
        }
      />
      <SalesInsights />
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
      </section>
      {error && <ErrorBanner error={error} />}
      {loading || !report ? (
        <LoadingBlock />
      ) : (
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
                <div><span>Receita de serviÃ§os</span><strong>{currency.format(report.profitability.dre.serviceRevenueInCents / 100)}</strong></div>
                <div><span>Receita de produtos</span><strong>{currency.format(report.profitability.dre.productRevenueInCents / 100)}</strong></div>
                <div className="dre-total"><span>Receita bruta</span><strong>{currency.format(report.profitability.dre.grossRevenueInCents / 100)}</strong></div>
                <div><span>(âˆ’) Custo dos produtos</span><strong>{currency.format(report.profitability.dre.productCostInCents / 100)}</strong></div>
                <div><span>(âˆ’) Despesas operacionais</span><strong>{currency.format(report.profitability.dre.operatingExpensesInCents / 100)}</strong></div>
                <div><span>(âˆ’) ComissÃµes</span><strong>{currency.format(report.profitability.dre.commissionsInCents / 100)}</strong></div>
                <div className="dre-total"><span>Resultado lÃ­quido</span><strong>{currency.format(report.profitability.dre.netResultInCents / 100)} Â· {report.profitability.dre.netMargin}%</strong></div>
              </div>
            </div>
            <div className="panel operation-card">
              <div className="panel-head"><div><span className="eyebrow">EficiÃªncia</span><h2>Indicadores operacionais</h2></div></div>
              <div className="operation-metrics">
                <article><strong>{report.profitability.operational.groupOccupancyRate}%</strong><span>OcupaÃ§Ã£o das turmas</span><small>{report.profitability.operational.activeGroupSeats}/{report.profitability.operational.totalGroupCapacity} vagas</small></article>
                <article><strong>{report.profitability.operational.waitlistCount}</strong><span>Em lista de espera</span></article>
                <article><strong>{report.profitability.operational.lowStockCount}</strong><span>Produtos com estoque baixo</span></article>
                <article><strong>{report.profitability.operational.productUnitsSold}</strong><span>Unidades vendidas</span></article>
                <article><strong>{currency.format(report.profitability.operational.averageReceiptInCents / 100)}</strong><span>Ticket mÃ©dio recebido</span></article>
              </div>
            </div>
          </section>
          <section className="profit-grid">
            <div className="panel profit-table">
              <div className="panel-head"><div><span className="eyebrow">Margem</span><h2>Rentabilidade por serviÃ§o</h2></div></div>
              {report.profitability.byService.length === 0 ? <EmptyState title="Sem dados" copy="NÃ£o houve produÃ§Ã£o ou recebimento de serviÃ§os no perÃ­odo." /> : <div className="profit-rows">{report.profitability.byService.map((item)=><div key={item.id}><span><strong>{item.name}</strong><small>{item.completedAppointments} atendimentos concluÃ­dos</small></span><span>{currency.format(item.revenueInCents/100)} receita</span><span>{currency.format(item.commissionsInCents/100)} comissÃµes</span><b>{currency.format(item.contributionInCents/100)} Â· {item.contributionMargin}%</b></div>)}</div>}
            </div>
            <div className="panel profit-table">
              <div className="panel-head"><div><span className="eyebrow">Produtos</span><h2>Rentabilidade por produto</h2></div></div>
              {report.profitability.byProduct.length === 0 ? <EmptyState title="Sem vendas" copy="Nenhuma venda de produto foi recebida no perÃ­odo." /> : <div className="profit-rows">{report.profitability.byProduct.map((item)=><div key={item.id}><span><strong>{item.name}</strong><small>{item.unitsSold} unidades</small></span><span>{currency.format(item.revenueInCents/100)} receita</span><span>{currency.format(item.costInCents/100)} custo</span><b>{currency.format(item.grossProfitInCents/100)} Â· {item.grossMargin}%</b></div>)}</div>}
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
      )}
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
    if (!window.confirm(`Converter ${lead.fullName} em paciente?`)) return;
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
                        <small>{lead.phone}</small>
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
          <input
            required
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
            <h2>Planos dos pacientes</h2>
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
                  <div className="plan-actions">
                    <button
                      className="secondary-button"
                      onClick={() => setMovementPlan(plan)}
                    >
                      <FileClock size={15} />
                      Extrato
                    </button>
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
          onCreated={(plan) => {
            replacePlan(plan);
            setModalOpen(false);
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
  onClose,
  onCreated,
}: {
  patients: Patient[];
  services: Service[];
  onClose: () => void;
  onCreated: (plan: PatientPlan) => void;
}) {
  const currentDate = localIsoDate();
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const [form, setForm] = useState<PatientPlanInput>({
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
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onCreated(await api.createPlan(form));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Novo plano"
      subtitle="O saldo e as contas a receber serão criados na mesma operação."
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Paciente
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
            onChange={(e) =>
              setForm({ ...form, kind: e.target.value as PatientPlan["kind"] })
            }
          >
            {Object.entries(planKindLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
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
            onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
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
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={loading}>
            {loading ? "Criando…" : "Criar plano e parcelas"}
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
                      {record.professionalName} · versão {record.version}
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
          Paciente
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
                  {record.authorName} · versão {record.version}
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
        <label>
          S — Subjetivo
          <small>Relato, sintomas e percepção do paciente.</small>
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
  const [view, setView] = useState<"day" | "week">("day");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
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
  const date = localIsoDate(selectedDate);
  const weekStart = new Date(selectedDate);
  weekStart.setHours(12, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const rangeStart = view === "day" ? new Date(selectedDate) : weekStart;
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + (view === "day" ? 1 : 7));
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
      api.professionals(),
      api.rooms(),
      api.services(),
      api.patients(),
    ])
      .then(
        ([
          appointmentData,
          blockData,
          professionalData,
          roomData,
          serviceData,
          patientData,
        ]) => {
          if (!active) return;
          setAppointments(appointmentData);
          setBlocks(blockData);
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
      next.setDate(current.getDate() + amount * (view === "week" ? 7 : 1));
      return next;
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Operação diária"
        title="Agenda"
        description="Visualize atendimentos, profissionais e salas sem conflitos."
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
            <button className="icon-button" onClick={() => moveDay(-1)}>
              <ChevronLeft size={19} />
            </button>
            <button
              className="date-button"
              onClick={() => setSelectedDate(new Date())}
            >
              <strong>{dateLabel.format(selectedDate)}</strong>
              <small>
                {view === "week"
                  ? `${shortDate.format(weekStart)} — ${shortDate.format(weekDays[6]!)}`
                  : date === localIsoDate()
                    ? "Hoje"
                    : shortDate.format(selectedDate)}
              </small>
            </button>
            <button className="icon-button" onClick={() => moveDay(1)}>
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
              return (
                <section key={dayKey}>
                  <header className={dayKey === localIsoDate() ? "today" : ""}>
                    <span>
                      {day.toLocaleDateString("pt-BR", { weekday: "short" })}
                    </span>
                    <strong>{day.getDate()}</strong>
                  </header>
                  <div>
                    {dayBlocks.map((block) => (
                      <ScheduleBlockCard
                        compact
                        block={block}
                        key={block.id}
                        onCancel={() => void cancelBlock(block)}
                      />
                    ))}
                    {dayAppointments.map((appointment) => (
                      <article
                        className="week-appointment"
                        key={appointment.id}
                      >
                        <time>
                          {timeLabel.format(new Date(appointment.startsAt))}
                        </time>
                        <i
                          style={{ background: appointment.professionalColor }}
                        />
                        <strong>{appointment.patientName}</strong>
                        <span>{appointment.serviceName}</span>
                        {["scheduled", "confirmed"].includes(appointment.status) && (
                          <button
                            className="text-link"
                            onClick={() => setRescheduling(appointment)}
                          >
                            Reagendar
                          </button>
                        )}
                      </article>
                    ))}
                    {dayAppointments.length === 0 && dayBlocks.length === 0 && (
                      <span className="week-empty">Livre</span>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : appointments.length === 0 && blocks.length === 0 ? (
          <EmptyState
            title="Dia disponível"
            copy="Não há atendimentos agendados para esta data."
          />
        ) : (
          <div className="day-agenda">
            {blocks.map((block) => (
              <ScheduleBlockCard
                block={block}
                key={block.id}
                onCancel={() => void cancelBlock(block)}
              />
            ))}
            {appointments.map((appointment) => (
              <AgendaCard
                appointment={appointment}
                key={appointment.id}
                onReschedule={() => setRescheduling(appointment)}
                onHistory={() => setHistoryAppointment(appointment)}
                onStatus={async (status) => {
                  try {
                    const updated = await api.updateAppointmentStatus(
                      appointment.id,
                      status,
                    );
                    setAppointments((items) =>
                      items.map((item) =>
                        item.id === updated.id ? updated : item,
                      ),
                    );
                  } catch (cause) {
                    setError((cause as Error).message);
                  }
                }}
              />
            ))}
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
      {historyAppointment && (
        <AppointmentRescheduleHistoryModal
          appointment={historyAppointment}
          onClose={() => setHistoryAppointment(null)}
        />
      )}
    </>
  );

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
  onStatus,
  onReschedule,
  onHistory,
}: {
  appointment: Appointment;
  onStatus: (status: AppointmentStatus) => void;
  onReschedule: () => void;
  onHistory: () => void;
}) {
  return (
    <article className="agenda-card">
      <div className="agenda-time">
        <strong>{timeLabel.format(new Date(appointment.startsAt))}</strong>
        <span>{timeLabel.format(new Date(appointment.endsAt))}</span>
      </div>
      <span
        className="agenda-stripe"
        style={{ background: appointment.professionalColor }}
      />
      <div className="agenda-main">
        <div>
          <span className="service-name">{appointment.serviceName}</span>
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
          {["scheduled", "confirmed"].includes(appointment.status) && (
            <button className="secondary-button" onClick={onReschedule}>
              Reagendar
            </button>
          )}
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
          Paciente
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
                  <input
                    value={settings.phone}
                    onChange={(e) =>
                      setSettings({ ...settings, phone: e.target.value })
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

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
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
            <span className="eyebrow">Cadastro rápido</span>
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

function InventoryPage() {
  const [workspace, setWorkspace] = useState<InventoryWorkspace | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState({
    name: "",
    sku: "",
    unit: "un",
    cost: 0,
    price: 0,
    initialStock: 0,
    minimumStock: 0,
  });
  const [movement, setMovement] = useState({
    productId: "",
    kind: "purchase" as
      "purchase" | "adjustment_in" | "adjustment_out" | "loss",
    quantity: 1,
    notes: "Entrada de estoque",
  });
  const [newTab, setNewTab] = useState({ patientId: "", notes: "" });
  const [tabItem, setTabItem] = useState({
    tabId: "",
    productId: "",
    quantity: 1,
  });
  const [closing, setClosing] = useState({
    tabId: "",
    settlement: "paid" as "paid" | "receivable",
    paymentMethod: "pix" as PaymentMethod,
    dueDate: localIsoDate(),
  });
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [data, patientData] = await Promise.all([
        api.inventoryWorkspace(),
        api.patients(),
      ]);
      setWorkspace(data);
      setPatients(patientData);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    Promise.all([api.inventoryWorkspace(), api.patients()])
      .then(([data, patientData]) => {
        if (active) {
          setWorkspace(data);
          setPatients(patientData);
        }
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
  const openTabs =
    workspace?.tabs.filter((item) => item.status === "open") ?? [];
  return (
    <>
      <PageHeader
        eyebrow="OperaÃ§Ã£o interna"
        title="Estoque e comandas"
        description="Produtos, saldos, consumo por paciente e fechamento financeiro rastreÃ¡vel."
      />
      {error && <ErrorBanner error={error} />}
      {loading && !workspace ? (
        <LoadingBlock />
      ) : (
        <div className="inventory-layout">
          <section className="metric-grid inventory-metrics">
            <article className="metric-card">
              <span>Produtos</span>
              <strong>{workspace?.products.length ?? 0}</strong>
            </article>
            <article className="metric-card">
              <span>Estoque baixo</span>
              <strong>{workspace?.lowStockCount ?? 0}</strong>
            </article>
            <article className="metric-card">
              <span>Custo em estoque</span>
              <strong>
                {currency.format((workspace?.inventoryCostInCents ?? 0) / 100)}
              </strong>
            </article>
            <article className="metric-card">
              <span>Comandas abertas</span>
              <strong>
                {currency.format((workspace?.openTabsInCents ?? 0) / 100)}
              </strong>
            </article>
          </section>
          <div className="inventory-form-grid">
            <section className="panel group-form-panel">
              <h2>Novo produto</h2>
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(() =>
                    api.createProduct({
                      name: product.name,
                      sku: product.sku,
                      unit: product.unit,
                      costInCents: Math.round(product.cost * 100),
                      salePriceInCents: Math.round(product.price * 100),
                      initialStock: product.initialStock,
                      minimumStock: product.minimumStock,
                    }),
                  );
                }}
              >
                <label>
                  Nome
                  <input
                    required
                    value={product.name}
                    onChange={(event) =>
                      setProduct({ ...product, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  SKU
                  <input
                    required
                    value={product.sku}
                    onChange={(event) =>
                      setProduct({ ...product, sku: event.target.value })
                    }
                  />
                </label>
                <label>
                  Unidade
                  <input
                    required
                    value={product.unit}
                    onChange={(event) =>
                      setProduct({ ...product, unit: event.target.value })
                    }
                  />
                </label>
                <label>
                  Custo (R$)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={product.cost}
                    onChange={(event) =>
                      setProduct({
                        ...product,
                        cost: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Venda (R$)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={product.price}
                    onChange={(event) =>
                      setProduct({
                        ...product,
                        price: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Estoque inicial
                  <input
                    type="number"
                    min="0"
                    value={product.initialStock}
                    onChange={(event) =>
                      setProduct({
                        ...product,
                        initialStock: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Estoque mÃ­nimo
                  <input
                    type="number"
                    min="0"
                    value={product.minimumStock}
                    onChange={(event) =>
                      setProduct({
                        ...product,
                        minimumStock: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <button className="primary-button">Cadastrar</button>
              </form>
            </section>
            <section className="panel group-form-panel">
              <h2>Movimentar estoque</h2>
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(() => api.createStockMovement(movement));
                }}
              >
                <label>
                  Produto
                  <select
                    required
                    value={movement.productId}
                    onChange={(event) =>
                      setMovement({
                        ...movement,
                        productId: event.target.value,
                      })
                    }
                  >
                    <option value="">Selecione</option>
                    {workspace?.products.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} Â· {item.currentStock} {item.unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Movimento
                  <select
                    value={movement.kind}
                    onChange={(event) =>
                      setMovement({
                        ...movement,
                        kind: event.target.value as typeof movement.kind,
                      })
                    }
                  >
                    <option value="purchase">Compra</option>
                    <option value="adjustment_in">Ajuste de entrada</option>
                    <option value="adjustment_out">Ajuste de saÃ­da</option>
                    <option value="loss">Perda</option>
                  </select>
                </label>
                <label>
                  Quantidade
                  <input
                    type="number"
                    min="1"
                    value={movement.quantity}
                    onChange={(event) =>
                      setMovement({
                        ...movement,
                        quantity: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="span-2">
                  Motivo
                  <input
                    required
                    minLength={3}
                    value={movement.notes}
                    onChange={(event) =>
                      setMovement({ ...movement, notes: event.target.value })
                    }
                  />
                </label>
                <button className="primary-button">Registrar</button>
              </form>
            </section>
            <section className="panel group-form-panel">
              <h2>Abrir comanda</h2>
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(() => api.openPatientTab(newTab));
                }}
              >
                <label>
                  Paciente
                  <select
                    required
                    value={newTab.patientId}
                    onChange={(event) =>
                      setNewTab({ ...newTab, patientId: event.target.value })
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
                <label>
                  ObservaÃ§Ã£o
                  <input
                    value={newTab.notes}
                    onChange={(event) =>
                      setNewTab({ ...newTab, notes: event.target.value })
                    }
                  />
                </label>
                <button className="primary-button">Abrir comanda</button>
              </form>
            </section>
          </div>
          <section className="panel">
            <h2>Produtos</h2>
            <div className="product-grid">
              {workspace?.products.map((item) => (
                <article
                  className={`product-card ${item.lowStock ? "low-stock" : ""}`}
                  key={item.id}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.sku} Â· {item.unit}
                    </small>
                  </div>
                  <strong>{item.currentStock}</strong>
                  <span>
                    {item.lowStock ? "Estoque baixo" : "Saldo normal"}
                  </span>
                  <small>
                    {currency.format(item.salePriceInCents / 100)} venda
                  </small>
                </article>
              ))}
            </div>
          </section>
          <section className="panel group-form-panel">
            <h2>Adicionar item na comanda</h2>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() =>
                  api.addPatientTabItem(tabItem.tabId, {
                    productId: tabItem.productId,
                    quantity: tabItem.quantity,
                  }),
                );
              }}
            >
              <label>
                Comanda
                <select
                  required
                  value={tabItem.tabId}
                  onChange={(event) =>
                    setTabItem({ ...tabItem, tabId: event.target.value })
                  }
                >
                  <option value="">Selecione</option>
                  {openTabs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.patientName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Produto
                <select
                  required
                  value={tabItem.productId}
                  onChange={(event) =>
                    setTabItem({ ...tabItem, productId: event.target.value })
                  }
                >
                  <option value="">Selecione</option>
                  {workspace?.products
                    .filter((item) => item.currentStock > 0)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} Â· saldo {item.currentStock}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Quantidade
                <input
                  type="number"
                  min="1"
                  value={tabItem.quantity}
                  onChange={(event) =>
                    setTabItem({
                      ...tabItem,
                      quantity: Number(event.target.value),
                    })
                  }
                />
              </label>
              <button className="primary-button">Adicionar</button>
            </form>
          </section>
          <section className="panel group-form-panel">
            <h2>Fechar comanda</h2>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() =>
                  api.closePatientTab(closing.tabId, {
                    settlement: closing.settlement,
                    dueDate: closing.dueDate,
                    ...(closing.settlement === "paid"
                      ? { paymentMethod: closing.paymentMethod }
                      : {}),
                  }),
                );
              }}
            >
              <label>
                Comanda
                <select
                  required
                  value={closing.tabId}
                  onChange={(event) =>
                    setClosing({ ...closing, tabId: event.target.value })
                  }
                >
                  <option value="">Selecione</option>
                  {openTabs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.patientName} Â·{" "}
                      {currency.format(item.totalInCents / 100)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                LiquidaÃ§Ã£o
                <select
                  value={closing.settlement}
                  onChange={(event) =>
                    setClosing({
                      ...closing,
                      settlement: event.target
                        .value as typeof closing.settlement,
                    })
                  }
                >
                  <option value="paid">Pago agora</option>
                  <option value="receivable">Conta a receber</option>
                </select>
              </label>
              {closing.settlement === "paid" && (
                <label>
                  Forma
                  <select
                    value={closing.paymentMethod}
                    onChange={(event) =>
                      setClosing({
                        ...closing,
                        paymentMethod: event.target.value as PaymentMethod,
                      })
                    }
                  >
                    <option value="pix">Pix</option>
                    <option value="card">CartÃ£o</option>
                    <option value="cash">Dinheiro</option>
                    <option value="bank_transfer">TransferÃªncia</option>
                    <option value="boleto">Boleto</option>
                    <option value="other">Outro</option>
                  </select>
                </label>
              )}
              <label>
                Vencimento
                <input
                  type="date"
                  required
                  value={closing.dueDate}
                  onChange={(event) =>
                    setClosing({ ...closing, dueDate: event.target.value })
                  }
                />
              </label>
              <button className="primary-button">Fechar</button>
            </form>
          </section>
          <section className="panel inventory-wide">
            <h2>Comandas</h2>
            <div className="tab-card-grid">
              {workspace?.tabs.map((tab) => (
                <article className="tab-card" key={tab.id}>
                  <div>
                    <strong>{tab.patientName}</strong>
                    <span className={`status-pill ${tab.status}`}>
                      {tab.status}
                    </span>
                  </div>
                  {tab.items.map((item) => (
                    <small key={item.id}>
                      {item.quantity}Ã— {item.productName} Â·{" "}
                      {currency.format(item.totalInCents / 100)}
                    </small>
                  ))}
                  <strong>{currency.format(tab.totalInCents / 100)}</strong>
                  {tab.status !== "cancelled" && (
                    <button
                      className="text-button danger"
                      onClick={() =>
                        void run(() => api.cancelPatientTab(tab.id))
                      }
                    >
                      Cancelar e estornar
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
          <section className="panel inventory-wide">
            <h2>Ãšltimos movimentos</h2>
            <div className="movement-list">
              {workspace?.movements.slice(0, 20).map((item) => (
                <div key={item.id}>
                  <span>
                    <strong>{item.productName}</strong>
                    <small>{item.notes}</small>
                  </span>
                  <strong
                    className={item.quantity > 0 ? "positive" : "negative"}
                  >
                    {item.quantity > 0 ? "+" : ""}
                    {item.quantity}
                  </strong>
                  <small>Saldo {item.balanceAfter}</small>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function GroupsPage() {
  const [workspace, setWorkspace] = useState<GroupWorkspace | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [groupForm, setGroupForm] = useState({
    name: "",
    serviceId: "",
    professionalId: "",
    roomId: "",
    capacity: 1,
  });
  const [enrollmentForm, setEnrollmentForm] = useState({
    groupId: "",
    patientId: "",
  });
  const [seriesForm, setSeriesForm] = useState({
    groupId: "",
    startsAt: "",
    occurrences: 4,
    intervalWeeks: 1,
  });
  const [replacementForm, setReplacementForm] = useState({
    creditId: "",
    sessionId: "",
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
  return (
    <>
      <PageHeader
        eyebrow="OperaÃ§Ã£o coletiva"
        title="Turmas e reposiÃ§Ãµes"
        description="Capacidade, lista de espera, encontros recorrentes e frequÃªncia em um fluxo Ãºnico."
      />
      {error && <ErrorBanner error={error} />}
      {loading && !workspace ? (
        <LoadingBlock />
      ) : (
        <div className="groups-layout">
          <section className="panel group-form-panel">
            <h2>Nova turma</h2>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => api.createGroupClass(groupForm));
              }}
            >
              <label>
                Nome
                <input
                  required
                  minLength={3}
                  value={groupForm.name}
                  onChange={(event) =>
                    setGroupForm({ ...groupForm, name: event.target.value })
                  }
                />
              </label>
              <label>
                ServiÃ§o
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
                  max={100}
                  value={groupForm.capacity}
                  onChange={(event) =>
                    setGroupForm({
                      ...groupForm,
                      capacity: Number(event.target.value),
                    })
                  }
                />
              </label>
              <button className="primary-button">Criar turma</button>
            </form>
          </section>
          <section className="panel group-form-panel">
            <h2>MatrÃ­cula</h2>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => api.createGroupEnrollment(enrollmentForm));
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
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Paciente
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
          <section className="panel group-form-panel">
            <h2>Gerar encontros</h2>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() =>
                  api.createGroupSessionSeries({
                    ...seriesForm,
                    startsAt: new Date(seriesForm.startsAt).toISOString(),
                  }),
                );
              }}
            >
              <label>
                Turma
                <select
                  required
                  value={seriesForm.groupId}
                  onChange={(event) =>
                    setSeriesForm({
                      ...seriesForm,
                      groupId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {workspace?.groups.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Primeiro encontro
                <input
                  required
                  type="datetime-local"
                  value={seriesForm.startsAt}
                  onChange={(event) =>
                    setSeriesForm({
                      ...seriesForm,
                      startsAt: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                OcorrÃªncias
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={seriesForm.occurrences}
                  onChange={(event) =>
                    setSeriesForm({
                      ...seriesForm,
                      occurrences: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Intervalo (semanas)
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={seriesForm.intervalWeeks}
                  onChange={(event) =>
                    setSeriesForm({
                      ...seriesForm,
                      intervalWeeks: Number(event.target.value),
                    })
                  }
                />
              </label>
              <button className="primary-button">Gerar sÃ©rie</button>
            </form>
          </section>

          <section className="panel groups-wide">
            <h2>Turmas</h2>
            <div className="group-card-grid">
              {workspace?.groups.map((group) => (
                <article className="group-card" key={group.id}>
                  <div>
                    <strong>{group.name}</strong>
                    <small>
                      {group.professionalName} Â· {group.roomName}
                    </small>
                  </div>
                  <span>
                    {group.activeEnrollments}/{group.capacity} vagas
                  </span>
                  <small>{group.waitlistCount} em espera</small>
                  <div className="group-members">
                    {workspace.enrollments
                      .filter(
                        (item) =>
                          item.groupId === group.id &&
                          item.status !== "cancelled",
                      )
                      .map((item) => (
                        <div key={item.id}>
                          <span>
                            {item.patientName} Â·{" "}
                            {item.status === "active"
                              ? "Ativo"
                              : `Espera ${item.queuePosition}`}
                          </span>
                          <button
                            className="text-button"
                            onClick={() =>
                              void run(() => api.cancelGroupEnrollment(item.id))
                            }
                          >
                            Cancelar
                          </button>
                        </div>
                      ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel groups-wide">
            <h2>Encontros e frequÃªncia</h2>
            <div className="group-session-list">
              {workspace?.sessions.map((session) => (
                <article className="group-session" key={session.id}>
                  <div>
                    <strong>{session.groupName}</strong>
                    <small>
                      {shortDate.format(new Date(session.startsAt))} Â·{" "}
                      {timeLabel.format(new Date(session.startsAt))} Â·{" "}
                      {session.status}
                    </small>
                  </div>
                  <div className="attendance-actions">
                    {activeEnrollments
                      .filter((item) => item.groupId === session.groupId)
                      .map((enrollment) => (
                        <div key={enrollment.id}>
                          <span>{enrollment.patientName}</span>
                          {(
                            [
                              ["present", "Presente"],
                              ["absent", "Falta"],
                              ["excused_absence", "Justificada"],
                            ] as const
                          ).map(([status, label]) => (
                            <button
                              key={status}
                              className="secondary-button compact"
                              onClick={() =>
                                void run(() =>
                                  api.recordGroupAttendance(
                                    session.id,
                                    enrollment.patientId,
                                    { status },
                                  ),
                                )
                              }
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ))}
                  </div>
                  {session.status === "scheduled" && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void run(() => api.completeGroupSession(session.id))
                      }
                    >
                      Concluir encontro
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="panel groups-wide group-form-panel">
            <h2>Agendar reposiÃ§Ã£o</h2>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => api.bookReplacement(replacementForm));
              }}
            >
              <label>
                CrÃ©dito
                <select
                  required
                  value={replacementForm.creditId}
                  onChange={(event) =>
                    setReplacementForm({
                      ...replacementForm,
                      creditId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {workspace?.replacementCredits
                    .filter((item) => item.status === "available")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.patientName}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Encontro
                <select
                  required
                  value={replacementForm.sessionId}
                  onChange={(event) =>
                    setReplacementForm({
                      ...replacementForm,
                      sessionId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {workspace?.sessions
                    .filter((item) => item.status === "scheduled")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.groupName} Â·{" "}
                        {shortDate.format(new Date(item.startsAt))}{" "}
                        {timeLabel.format(new Date(item.startsAt))}
                      </option>
                    ))}
                </select>
              </label>
              <button className="primary-button">Reservar reposiÃ§Ã£o</button>
            </form>
          </section>
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
                <Route path="/pacientes" element={<PatientsPage />} />
                <Route
                  path="/estoque"
                  element={
                    ["owner", "reception", "finance"].includes(user!.role) ? (
                      <InventoryPage />
                    ) : (
                      <Navigate to="/" replace />
                    )
                  }
                />
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
