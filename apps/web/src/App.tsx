import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  Bell,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Columns3,
  Download,
  FileClock,
  FileDown,
  FileUp,
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
  Tags,
  Building2,
  SlidersHorizontal,
  Star,
  Stethoscope,
  UserMinus,
  UserPlus,
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
  AppModule,
  Appointment,
  AppointmentInput,
  AppointmentRescheduleEvent,
  AppointmentStatus,
  AppointmentVisitType,
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
  BroadcastInput,
  BroadcastResult,
  CommunicationCenter,
  CommunicationChannel,
  ContactActivityInput,
  ContactOutcome,
  ContactReason,
  ContactSuggestion,
  BirthdayEntry,
  DailyCash,
  FinanceForecast,
  FinanceForecastFlow,
  DailyCashMovement,
  DailyCashMovementKind,
  DailyCashPaymentMethod,
  DashboardSummary,
  DocumentKind,
  DocumentTemplate,
  DocumentTemplateInput,
  FinancialWorkspace,
  GroupClass,
  GroupSession,
  GroupWorkspace,
  Holiday,
  IssuedDocument,
  Lead,
  LeadActivity,
  LeadAppointmentInput,
  LeadContactInput,
  LeadInput,
  LeadStage,
  ManualMessageInput,
  ManagementReport,
  SalesReport,
  Patient,
  PatientOption,
  PatientTag,
  PatientExportColumn,
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
  Payable,
  PayableInput,
  CommissionEntry,
  PaymentMethod,
  PaymentReceipt,
  Receivable,
  PlanStatus,
  Professional,
  RecurringPayable,
  RecurringPayableInput,
  RelationshipSettings,
  Room,
  SatisfactionReport,
  SatisfactionSurvey,
  RetentionReport,
  ClientReport,
  ScheduleBlock,
  Service,
  TherapeuticGoalInput,
  TreatmentClosureInput,
  UserRole,
  UserSummary,
} from "@crm/contracts";
import { appModuleLabels, appModuleSchema, userRoleLabels, userRoleSchema, broadcastSkipReasonLabels, competenceMonthSchema, DEFAULT_PATIENT_TAG_COLOR, describeGroupSchedule, fillMessageTemplate, formatPhone, groupClassName, nextPlanPeriod, patientExportColumns, patientTagKey, phoneDigits, saoPauloToday, whatsappLink } from "@crm/contracts";
import {
  api,
  ApiClientError,
  clearSession,
  getStoredUser,
  hasSession,
  login,
  storeUser,
  type PatientExportParams,
} from "./api";
import { normalizeTagColor, patientTagPalette, tagColorStyle } from "./tag-colors";

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

const visitTypeLabels: Record<AppointmentVisitType, string> = {
  regular: "Atendimento",
  trial: "Experimental",
  evaluation: "Avaliação",
};

const appointmentVisitTypes: AppointmentVisitType[] = ["regular", "trial", "evaluation"];
const leadVisitTypes: LeadAppointmentInput["visitType"][] = ["trial", "evaluation"];

// Selo de experimental/avaliação; atendimento comum não leva selo. Enquanto o
// atendimento é de lead, o selo avisa que a pessoa ainda não é cliente.
function visitTypeBadgeText(appointment: Appointment) {
  if (appointment.visitType !== "trial" && appointment.visitType !== "evaluation") return null;
  return `${visitTypeLabels[appointment.visitType]}${appointment.leadId ? " · lead" : ""}`;
}

function VisitTypeBadge({ appointment }: { appointment: Appointment }) {
  const text = visitTypeBadgeText(appointment);
  if (!text) return null;
  return <span className={`status-pill visit-${appointment.visitType}`}>{text}</span>;
}

function Logo() {
  return (
    <div className="brand" aria-label="Studios Aryana">
      <span className="brand-name">Studios Aryana</span>
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

const roleLabels: Record<UserRole, string> = userRoleLabels;

/**
 * Sessão gravada no formato atual. Sessões antigas (antes dos módulos por usuário, sem
 * `modules`/`editModules`, ou antes da T055, com perfil `owner`/`reception`/…) são
 * completadas com `/me`.
 */
function hasAccessLists(user: UserSummary) {
  return (
    typeof user.id === "string" &&
    typeof user.fullName === "string" &&
    typeof user.email === "string" &&
    userRoleSchema.safeParse(user.role).success &&
    Array.isArray(user.modules) &&
    Array.isArray(user.editModules)
  );
}

/** O usuário logado vê o módulo (menu, rotas e leituras). */
function canView(module: AppModule) {
  return Boolean(getStoredUser()?.modules?.includes(module));
}

/** O usuário logado edita o módulo (criar, editar e excluir). */
function canEdit(...modules: AppModule[]) {
  const editModules = getStoredUser()?.editModules ?? [];
  return modules.every((module) => editModules.includes(module));
}

/** Aviso de acesso só de consulta, no lugar dos botões de criar/editar/excluir. */
function ReadOnlyNotice({ module, copy }: { module: AppModule; copy?: string }) {
  return (
    <p className="read-only-notice" role="note">
      <LockKeyhole size={16} aria-hidden="true" />
      <span>
        {copy ??
          `Seu acesso a ${appModuleLabels[module]} é só de consulta. Para criar, editar ou excluir, peça a um admin a permissão de edição.`}
      </span>
    </p>
  );
}

const navItems: Array<{
  to: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  /** Módulo exigido; sem módulo (Visão geral) o item aparece para todos. */
  module?: AppModule;
}> = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard },
  { to: "/agenda", label: "Agenda", icon: CalendarDays, module: "agenda" },
  { to: "/turmas", label: "Turmas", icon: Users, module: "groups" },
  { to: "/clientes", label: "Clientes", icon: Users, module: "patients" },
  { to: "/planos", label: "Planos e sessões", icon: PackageOpen, module: "plans" },
  { to: "/comercial", label: "CRM comercial", icon: Columns3, module: "crm" },
  {
    to: "/relacionamento",
    label: "Contatos sugeridos",
    icon: HeartHandshake,
    module: "relationship",
  },
  { to: "/comunicacoes", label: "Comunicações", icon: Bell, module: "communications" },
  { to: "/contratos", label: "Contratos", icon: FileText, module: "contracts" },
  { to: "/prontuarios", label: "Prontuários", icon: Stethoscope, module: "clinical" },
  { to: "/financeiro", label: "Financeiro", icon: CircleDollarSign, module: "finance" },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, module: "reports" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, module: "settings" },
];

/**
 * Guarda de saída pelo menu do app. O app usa `BrowserRouter` (sem data router, então sem
 * `useBlocker`): quem tem edição pendente registra uma função que recebe o destino e devolve
 * `true` para segurar o clique no menu (e abrir o próprio aviso). Voltar do navegador e URL
 * digitada não passam por aqui.
 */
type NavigationGuard = (to: string) => boolean;
const NavigationGuardContext = createContext<(guard: NavigationGuard) => () => void>(
  () => () => {},
);

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
  const guards = useRef(new Set<NavigationGuard>());
  const registerGuard = useCallback((guard: NavigationGuard) => {
    const set = guards.current;
    set.add(guard);
    return () => {
      set.delete(guard);
    };
  }, []);

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
          {navItems
            .filter((item) => !item.module || user.modules.includes(item.module))
            .map((item) => {
            const Icon = item.icon;
            return item.disabled ? (
              <span className="nav-item disabled" key={item.to}>
                <Icon size={19} />
                <span>{item.label}</span>
                <small>em breve</small>
              </span>
            ) : (
              <NavLink
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
                to={item.to}
                end={item.to === "/"}
                key={item.to}
                onClick={(event) => {
                  setMobileOpen(false);
                  for (const guard of guards.current) {
                    if (guard(item.to)) {
                      event.preventDefault();
                      return;
                    }
                  }
                }}
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
              <small>{user.jobTitle ?? roleLabels[user.role]}</small>
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
            <span className="clinic-label">Studios Aryana</span>
            <span className="environment-dot">Demonstração</span>
          </div>
          <div className="top-actions">
            <button className="icon-button" title="Notificações">
              <Bell size={19} />
            </button>
            <span className="top-avatar">{initials(user.fullName)}</span>
          </div>
        </header>
        <div className="page-content">
          <NavigationGuardContext.Provider value={registerGuard}>
            {children}
          </NavigationGuardContext.Provider>
        </div>
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

function EmptyState({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <CalendarDays size={30} />
      <strong>{title}</strong>
      <span>{copy}</span>
      {action}
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

/** Etiquetas configuradas (Configurações › Etiquetas): busca ao montar; `null` enquanto carrega. */
function usePatientTags() {
  const [tags, setTags] = useState<PatientTag[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .patientTags()
      .then((data) => {
        // Só aproveita itens no formato de etiqueta (nome em texto).
        if (active) setTags(Array.isArray(data) ? data.filter((tag) => typeof tag?.name === "string") : []);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return { tags, error };
}

/** Cor de uma etiqueta pelo nome (sem diferenciar maiúsculas/acentos); desconhecida usa a padrão. */
function tagColorLookup(tags: readonly PatientTag[] | null) {
  const colors = new Map((tags ?? []).map((tag) => [patientTagKey(tag.name), tag.color]));
  return (name: string) => normalizeTagColor(colors.get(patientTagKey(name)));
}

/** Selo de etiqueta na cor configurada, com texto preto ou branco (contraste AA). */
function PatientTagBadge({ name, color }: { name: string; color: string }) {
  return (
    <span className="tag tag-colored" style={tagColorStyle(color)}>
      {name}
    </span>
  );
}

/** Chip de etiqueta para filtros e seleção múltipla: ponto na cor; marcado, preenche com a cor. */
function TagChoice({
  name,
  color,
  pressed,
  count,
  disabled,
  onToggle,
}: {
  name: string;
  color: string;
  pressed: boolean;
  count?: number;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="tag-filter tag-choice"
      style={tagColorStyle(color)}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
    >
      <i className="tag-dot" aria-hidden="true" />
      {name}
      {count !== undefined && <small>{count}</small>}
    </button>
  );
}

/** Contagem por etiqueta numa lista de clientes (chave sem maiúsculas/acentos). */
function tagCounts(lists: ReadonlyArray<{ tags: string[] }>) {
  const counts = new Map<string, number>();
  for (const item of lists)
    for (const tag of item.tags) counts.set(patientTagKey(tag), (counts.get(patientTagKey(tag)) ?? 0) + 1);
  return (name: string) => counts.get(patientTagKey(name)) ?? 0;
}

function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [error, setError] = useState("");
  const today = localIsoDate();
  const firstName = getStoredUser()?.fullName?.split(" ")[0];
  const canSeeSales = canView("reports");
  const canSeeRelationship = canView("relationship");

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
          canEdit("agenda") && (
            <NavLink to="/agenda" className="primary-button">
              <Plus size={18} />
              Novo atendimento
            </NavLink>
          )
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
                {canView("agenda") && (
                  <NavLink to="/agenda" className="text-link">
                    Ver agenda <ChevronRight size={16} />
                  </NavLink>
                )}
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
                <div className="birthday-actions">
                  <a
                    className="whatsapp-button button-sm"
                    href={whatsappLink(
                      suggestion.whatsapp || suggestion.phone,
                      birthdayMessage(settings, suggestion.patientName),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={15} aria-hidden="true" />
                    Dar parabéns
                  </a>
                  {canEdit("relationship") && (
                    <button
                      type="button"
                      className="secondary-button button-sm"
                      disabled={saving === suggestion.referenceKey}
                      onClick={() => void markSent(suggestion)}
                    >
                      Marcar como enviado
                    </button>
                  )}
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
      <button className="icon-button button-sm">
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

const patientsPerPage = 20;

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
  const [exportOpen, setExportOpen] = useState(false);
  // Busca efetivamente aplicada na lista (a do campo só vale depois de "Buscar").
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const canManage = canEdit("patients");
  const canExport = getStoredUser()?.role === "admin";
  const configuredTags = usePatientTags();
  const tagColor = tagColorLookup(configuredTags.tags);

  async function load(query = search) {
    setLoading(true);
    setError("");
    try {
      setPatients(await api.patients(query));
      setAppliedSearch(query);
      setPage(1);
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
  const pageCount = Math.max(1, Math.ceil(visiblePatients.length / patientsPerPage));
  // A página guardada pode ficar além do total (ex.: depois de remover cadastros): limita no cálculo.
  const currentPage = Math.min(page, pageCount);
  const pagePatients = visiblePatients.slice((currentPage - 1) * patientsPerPage, currentPage * patientsPerPage);
  // Filtro mostra as etiquetas configuradas (com a cor), com quantos clientes da lista têm cada uma.
  const countTag = tagCounts(patients);
  const tagOptions = configuredTags.tags ?? [];
  const activeFilterCount =
    (filters.status !== "all" ? 1 : 0) + (filters.record !== "all" ? 1 : 0) + filters.tags.length;
  // Toda mudança de filtro ou ordenação volta para a primeira página.
  function updateFilters(update: (current: typeof filters) => typeof filters) {
    setFilters(update);
    setPage(1);
  }
  function toggleTag(tag: string) {
    updateFilters((current) => ({
      ...current,
      tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag],
    }));
  }
  function clearFilters() {
    updateFilters((current) => ({ ...defaultPatientFilters, sort: current.sort }));
  }

  return (
    <>
      <PageHeader
        eyebrow="Base clínica"
        title="Clientes"
        description="Cadastros, vínculos e informações essenciais em um só lugar."
        action={
          <div className="page-actions">
            {canManage && (
              <button className="secondary-button" onClick={() => setImportOpen(true)}>
                <FileDown size={18} aria-hidden="true" />
                Importar
              </button>
            )}
            {canExport && (
              <button className="secondary-button" onClick={() => setExportOpen(true)}>
                <FileUp size={18} aria-hidden="true" />
                Exportar
              </button>
            )}
            {canManage && (
              <button className="primary-button" onClick={() => setModalOpen(true)}>
                <Plus size={18} />
                Novo cliente
              </button>
            )}
          </div>
        }
      />
      {!canManage && <ReadOnlyNotice module="patients" />}
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
                  <button className="segment-button"
                    type="button"
                    key={value}
                    aria-pressed={filters.status === value}
                    onClick={() => updateFilters((current) => ({ ...current, status: value }))}
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
                onChange={(event) => updateFilters((current) => ({ ...current, record: event.target.value as PatientRecordFilter }))}
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
                onChange={(event) => updateFilters((current) => ({ ...current, sort: event.target.value as PatientSort }))}
              >
                <option value="name_asc">Nome (A–Z)</option>
                <option value="name_desc">Nome (Z–A)</option>
                <option value="newest">Cadastro mais recente</option>
                <option value="oldest">Cadastro mais antigo</option>
              </select>
            </label>
            {activeFilterCount > 0 && (
              <button type="button" className="text-button button-sm clear-filters" onClick={clearFilters}>
                Limpar filtros
              </button>
            )}
            {configuredTags.error ? (
              <div className="filter-group filter-tags">
                <span className="filter-label">Etiquetas</span>
                <p className="form-error">{`Não foi possível carregar as etiquetas: ${configuredTags.error}`}</p>
              </div>
            ) : (
              tagOptions.length > 0 && (
                <div className="filter-group filter-tags">
                  <span className="filter-label" id="patient-tag-filter">Etiquetas</span>
                  <div className="tag-filter-list" role="group" aria-labelledby="patient-tag-filter">
                    {tagOptions.map((tag) => (
                      <TagChoice
                        key={tag.id}
                        name={tag.name}
                        color={tag.color}
                        count={countTag(tag.name)}
                        pressed={filters.tags.includes(tag.name)}
                        onToggle={() => toggleTag(tag.name)}
                      />
                    ))}
                  </div>
                </div>
              )
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
          <>
          <div className="patient-table">
            <div className="table-row table-head">
              <span>Cliente</span>
              <span>Contato</span>
              <span>Etiquetas</span>
              <span>Situação</span>
              <span />
            </div>
            {pagePatients.map((patient) => (
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
                      <PatientTagBadge key={tag} name={tag} color={tagColor(tag)} />
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
          {pageCount > 1 && (
            <nav className="list-pagination" aria-label="Paginação de clientes">
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

const patientExportColumnNames: Record<PatientExportColumn, string> = {
  fullName: "Nome",
  recordNumber: "Prontuário",
  cpf: "CPF",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  birthDate: "Nascimento",
  tags: "Etiquetas",
  status: "Situação",
  emergencyContactName: "Contato de emergência",
  emergencyContactPhone: "Telefone de emergência",
  notes: "Observações",
  createdAt: "Cadastrado em",
};

const patientRecordFilterLabels: Record<PatientRecordFilter, string> = {
  all: "Todos",
  with_email: "Com e-mail",
  without_email: "Sem e-mail",
  birthday_month: "Aniversariantes do mês",
};

/**
 * Exporta a base com os filtros da tela que a API conhece (busca aplicada, situação,
 * aniversariantes, etiquetas). Com/sem e-mail e a ordenação existem só na tela.
 */
function PatientExportModal({
  filters,
  search,
  tagColor,
  onClose,
}: {
  filters: typeof defaultPatientFilters;
  search: string;
  tagColor: (name: string) => string;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<PatientExportParams["format"]>("csv");
  const [columns, setColumns] = useState<PatientExportColumn[]>([...patientExportColumns]);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const params: PatientExportParams = { format, columns, tags: filters.tags };
  if (search.trim()) params.search = search.trim();
  if (filters.status !== "all") params.status = filters.status;
  if (filters.record === "birthday_month") params.birthdayMonth = true;
  const scope = [
    params.search ? `Busca: “${params.search}”` : "",
    params.status ? `Situação: ${params.status === "active" ? "ativos" : "inativos"}` : "",
    params.birthdayMonth ? "Aniversariantes do mês" : "",
  ].filter(Boolean);
  const unsupportedRecord = filters.record === "with_email" || filters.record === "without_email";

  function toggleColumn(column: PatientExportColumn) {
    setColumns((current) =>
      current.includes(column)
        ? current.filter((item) => item !== column)
        : patientExportColumns.filter((item) => item === column || current.includes(item)),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (columns.length === 0) {
      setError("Selecione pelo menos uma coluna.");
      return;
    }
    setExporting(true);
    setError("");
    try {
      const blob = await api.exportPatients(params);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `clientes-${saoPauloToday()}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
      setExporting(false);
    }
  }

  return (
    <Modal
      eyebrow="Exportação"
      title="Exportar clientes"
      subtitle="Baixe a base de clientes em planilha, com os filtros aplicados na tela."
      busy={exporting}
      onClose={onClose}
    >
      <form className="patient-export" onSubmit={(event) => void submit(event)} noValidate>
        <div className="patient-export-scope">
          <span className="filter-label">Clientes exportados</span>
          {(scope.length > 0 || filters.tags.length === 0) && (
            <p>
              {scope.length
                ? scope.join(" · ")
                : "Nenhum filtro: todos os clientes serão exportados."}
            </p>
          )}
          {filters.tags.length > 0 && (
            <div className="patient-export-tags">
              <span>Etiquetas (qualquer uma):</span>
              {filters.tags.map((tag) => (
                <PatientTagBadge key={tag} name={tag} color={tagColor(tag)} />
              ))}
            </div>
          )}
          {unsupportedRecord && (
            <small>{`O filtro de cadastro “${patientRecordFilterLabels[filters.record]}” não se aplica à exportação.`}</small>
          )}
          {filters.sort !== "name_asc" && (
            <small>A ordenação da tela não se aplica: o arquivo sai em ordem alfabética.</small>
          )}
        </div>
        <fieldset className="form-fieldset">
          <legend>Formato</legend>
          <div className="form-fieldset-grid">
            {([["csv", "CSV (.csv)"], ["xlsx", "Excel (.xlsx)"]] as const).map(([value, label]) => (
              <label className="checkbox-field" key={value}>
                <input
                  type="radio"
                  name="patient-export-format"
                  value={value}
                  checked={format === value}
                  onChange={() => setFormat(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="form-fieldset">
          <legend>Colunas</legend>
          <div className="patient-export-bulk">
            <button className="text-button button-sm" type="button" onClick={() => setColumns([...patientExportColumns])}>
              Marcar todas
            </button>
            <button className="text-button button-sm" type="button" onClick={() => setColumns([])}>
              Desmarcar todas
            </button>
          </div>
          <div className="form-fieldset-grid">
            {patientExportColumns.map((column) => (
              <label className="checkbox-field" key={column}>
                <input
                  type="checkbox"
                  checked={columns.includes(column)}
                  onChange={() => toggleColumn(column)}
                />
                {patientExportColumnNames[column]}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={exporting}>
            Voltar
          </button>
          <button type="submit" className="primary-button" disabled={exporting}>
            <FileUp size={18} aria-hidden="true" />
            {exporting ? "Exportando..." : "Exportar"}
          </button>
        </div>
      </form>
    </Modal>
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
      busy={loading}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
            {result ? "Fechar" : "Cancelar"}
          </button>
          {!result && (
            <button
              type="button"
              className="primary-button"
              disabled={loading || !file || validCount === 0}
              onClick={() => void confirmImport()}
            >
              <FileDown size={18} aria-hidden="true" />
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
  configuredTags,
  onClose,
  onSaved,
}: {
  patient: Patient | undefined;
  /** Etiquetas configuradas: as únicas que podem ser escolhidas no cadastro. */
  configuredTags: { tags: PatientTag[] | null; error: string };
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
  // O histórico usa acesso comercial: a fisioterapia não vê nem chama a rota.
  const showHistory = Boolean(patient) && canView("patients") && canView("crm");
  const editable = canEdit("patients");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  function field<K extends keyof PatientInput>(key: K, value: PatientInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  const tagColor = tagColorLookup(configuredTags.tags);
  const configuredKeys = new Set((configuredTags.tags ?? []).map((tag) => patientTagKey(tag.name)));
  // Etiqueta que o cliente já tem e não está mais configurada aparece para poder ser retirada.
  const tagChoices = [
    ...(configuredTags.tags ?? []).map((tag) => ({ name: tag.name, color: tag.color })),
    ...form.tags
      .filter((tag) => !configuredKeys.has(patientTagKey(tag)))
      .map((tag) => ({ name: tag, color: tagColor(tag) })),
  ];
  function toggleTag(tag: string) {
    setForm((current) => ({
      ...current,
      tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag],
    }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onSaved(patient ? await api.updatePatient(patient.id, form) : await api.createPatient(form));
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
      busy={loading}
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
        <fieldset className="form-fieldset emergency-fieldset span-2">
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
        <fieldset className="form-fieldset span-2">
          <legend>Etiquetas</legend>
          {configuredTags.error ? (
            <p className="form-error">{`Não foi possível carregar as etiquetas: ${configuredTags.error}`}</p>
          ) : configuredTags.tags === null ? (
            <LoadingBlock />
          ) : tagChoices.length === 0 ? (
            <p className="muted-copy">
              Nenhuma etiqueta configurada. Cadastre as etiquetas em Configurações › Etiquetas.
            </p>
          ) : (
            <div className="tag-filter-list">
              {tagChoices.map((tag) => (
                <TagChoice
                  key={tag.name}
                  name={tag.name}
                  color={tag.color}
                  pressed={form.tags.includes(tag.name)}
                  disabled={!editable}
                  onToggle={() => toggleTag(tag.name)}
                />
              ))}
            </div>
          )}
        </fieldset>
        <label className="span-2">
          Observações administrativas
          <textarea
            value={form.notes}
            onChange={(e) => field("notes", e.target.value)}
            rows={3}
          />
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        {!editable && (
          <p className="muted-copy span-2">
            Seu acesso a Clientes é só de consulta: as alterações não podem ser salvas.
          </p>
        )}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
            {editable ? "Cancelar" : "Fechar"}
          </button>
          {editable && (
            <button className="primary-button" disabled={loading}>
              {loading ? "Salvando…" : patient ? "Salvar alterações" : "Salvar cliente"}
            </button>
          )}
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

const leadStages: Array<{ value: LeadStage; label: string; hint: string }> = [
  { value: "new_contact", label: "Novos", hint: "Leads recém-cadastrados aparecem aqui." },
  { value: "contacted", label: "Em contato", hint: "Mova para cá quem já recebeu o primeiro contato." },
  { value: "evaluation", label: "Avaliação", hint: "Leads com avaliação ou aula experimental marcada." },
  { value: "proposal", label: "Proposta", hint: "Leads que receberam proposta de plano." },
  { value: "won", label: "Ganhos", hint: "Leads convertidos em cliente ficam aqui." },
  { value: "lost", label: "Perdidos", hint: "Leads perdidos ficam aqui, com o motivo." },
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
        <button className="segment-button"
          type="button"
          aria-pressed={view === "suggestions"}
          onClick={() => setView("suggestions")}
        >
          Contatos sugeridos
        </button>
        <button className="segment-button"
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
                      className="whatsapp-button button-sm"
                      href={whatsappLink(contactPhone, messageFor(suggestion))}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle size={15} aria-hidden="true" />
                      WhatsApp
                    </a>
                    {canEdit("relationship") && (
                    <button
                      className="secondary-button button-sm"
                      onClick={() => {
                        setNotice("");
                        setRecording(suggestion);
                      }}
                    >
                      <PhoneCall size={15} />
                      Registrar contato
                    </button>
                    )}
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
                <div className="birthday-actions">
                  <a
                    className="whatsapp-button button-sm"
                    href={whatsappLink(
                      entry.whatsapp || entry.phone,
                      birthdayMessage(settings, entry.patientName),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={15} aria-hidden="true" />
                    Dar parabéns
                  </a>
                  {canEdit("relationship") && (
                    <button
                      type="button"
                      className="secondary-button button-sm"
                      disabled={saving === entry.referenceKey}
                      onClick={() => void markSent(entry)}
                    >
                      Marcar como enviado
                    </button>
                  )}
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
      busy={loading}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
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
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState("");
  const [channel, setChannel] = useState<CommunicationChannel>("whatsapp");
  const [body, setBody] = useState("");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [referenceDate, setReferenceDate] = useState(localIsoDate(tomorrow));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const canManage = canEdit("communications");

  async function load() {
    const [communicationData, patientData] = await Promise.all([
      api.communications(),
      api.patientOptions(),
    ]);
    setCenter(communicationData);
    setPatients(patientData);
    setPatientId((current) => current || patientData[0]?.id || "");
  }

  useEffect(() => {
    let active = true;
    Promise.all([api.communications(), api.patientOptions()])
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
      {!canManage && <ReadOnlyNotice module="communications" />}
      {error && <ErrorBanner error={error} />}
      {notice && <div className="success-banner">{notice}</div>}
      {loading || !center ? (
        <LoadingBlock />
      ) : (
        <div className="communications-layout">
          {canManage && (
          <>
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
              <div className="modal-actions">
              <button
                className="primary-button"
                disabled={!patientId || !body.trim()}
              >
                Adicionar à fila
              </button>
              </div>
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
            <div className="modal-actions">
            <button
              className="primary-button"
              onClick={() => void generate()}
            >
              Gerar lembretes
            </button>
            </div>
            <div className="outbox-note">
              <LockKeyhole size={17} />
              <span>
                Modo fila interna: nenhum envio externo ocorre até um provedor
                oficial ser configurado.
              </span>
            </div>
          </section>
          <BroadcastPanel
            patients={patients}
            outboxOnly={center.deliveryMode === "outbox_only"}
            onQueued={(result) => {
              setError("");
              setNotice(
                `${result.queued} mensagem(ns) do comunicado adicionada(s) à fila; ${result.skipped.length} cliente(s) pulado(s).`,
              );
              load().catch((cause: Error) => setError(cause.message));
            }}
          />
          </>
          )}
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

const broadcastChannelLabels: Record<CommunicationChannel, string> = {
  whatsapp: "WhatsApp",
  email: "e-mail",
};

/**
 * Comunicado segmentado: monta o segmento, pede a prévia (não grava) e só enfileira
 * depois de confirmar num modal. Mudar qualquer campo descarta a prévia.
 */
function BroadcastPanel({
  patients,
  outboxOnly,
  onQueued,
}: {
  patients: PatientOption[];
  outboxOnly: boolean;
  onQueued: (result: BroadcastResult) => void;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [activePlan, setActivePlan] = useState<"" | "with" | "without">("");
  const [birthdayMonth, setBirthdayMonth] = useState(false);
  const [channel, setChannel] = useState<CommunicationChannel>("whatsapp");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<BroadcastResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");

  // Segmento por etiqueta: as configuradas, com a cor e quantos clientes têm cada uma.
  const configuredTags = usePatientTags();
  const tagOptions = configuredTags.tags ?? [];
  const countTag = tagCounts(patients);

  const input: BroadcastInput = {
    segment: {
      tags,
      ...(status ? { status } : {}),
      ...(activePlan ? { activePlan: activePlan === "with" } : {}),
      birthdayMonth,
    },
    channel,
    body: body.trim(),
  };

  function change(apply: () => void) {
    apply();
    setPreview(null);
    setError("");
  }

  async function requestPreview(event: FormEvent) {
    event.preventDefault();
    setPreview(null);
    if (!input.body) {
      setError("Escreva o texto do comunicado.");
      return;
    }
    setError("");
    setPreviewing(true);
    try {
      setPreview(await api.broadcastPreview(input));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  async function send() {
    setSending(true);
    setSendError("");
    try {
      const result = await api.sendBroadcast(input);
      setConfirming(false);
      setPreview(null);
      onQueued(result);
    } catch (cause) {
      setSendError((cause as Error).message);
    } finally {
      setSending(false);
    }
  }

  const outboxWarning = outboxOnly
    ? "Atenção: a fila ainda não envia de fato. As mensagens ficam registradas na fila interna até um provedor oficial ser configurado."
    : "";

  return (
    <>
    <section className="panel communication-broadcast">
      <span className="eyebrow">Envio em massa</span>
      <h2>Comunicado segmentado</h2>
      {outboxWarning && (
        <div className="outbox-note">
          <LockKeyhole size={17} />
          <span>{outboxWarning}</span>
        </div>
      )}
      <form className="form-grid" onSubmit={(event) => void requestPreview(event)} noValidate>
        {configuredTags.error ? (
          <p className="form-error span-2">{`Não foi possível carregar as etiquetas: ${configuredTags.error}`}</p>
        ) : (
          tagOptions.length > 0 && (
            <div className="span-2 broadcast-tags">
              <span className="filter-label" id="broadcast-tag-filter">
                Etiquetas (qualquer uma)
              </span>
              <div className="tag-filter-list" role="group" aria-labelledby="broadcast-tag-filter">
                {tagOptions.map((tag) => (
                  <TagChoice
                    key={tag.id}
                    name={tag.name}
                    color={tag.color}
                    count={countTag(tag.name)}
                    pressed={tags.includes(tag.name)}
                    onToggle={() =>
                      change(() =>
                        setTags((current) =>
                          current.includes(tag.name)
                            ? current.filter((item) => item !== tag.name)
                            : [...current, tag.name],
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )
        )}
        <label>
          Situação
          <select
            value={status}
            onChange={(event) => change(() => setStatus(event.target.value as typeof status))}
          >
            <option value="">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </label>
        <label>
          Plano
          <select
            value={activePlan}
            onChange={(event) => change(() => setActivePlan(event.target.value as typeof activePlan))}
          >
            <option value="">Todos</option>
            <option value="with">Com plano ativo</option>
            <option value="without">Sem plano ativo</option>
          </select>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={birthdayMonth}
            onChange={(event) => change(() => setBirthdayMonth(event.target.checked))}
          />
          Só aniversariantes do mês
        </label>
        <label>
          Canal do comunicado
          <select
            value={channel}
            onChange={(event) => change(() => setChannel(event.target.value as CommunicationChannel))}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="email">E-mail</option>
          </select>
        </label>
        <label className="span-2">
          Texto do comunicado
          <textarea
            maxLength={500}
            rows={4}
            value={body}
            onChange={(event) => {
              const value = event.target.value;
              change(() => setBody(value));
            }}
            placeholder="Use {{nome}} para o primeiro nome. Não inclua informações clínicas."
          />
        </label>
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="span-2 broadcast-actions">
          <button type="submit" className="secondary-button" disabled={previewing}>
            {previewing ? "Calculando…" : "Ver prévia"}
          </button>
          {preview && preview.queued > 0 && (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setSendError("");
                setConfirming(true);
              }}
            >
              Enfileirar comunicado
            </button>
          )}
        </div>
      </form>
      {preview && (
        <div className="broadcast-preview" aria-live="polite">
          <div className="broadcast-summary">
            <span className="status-pill">{`${preview.matched} cliente(s) no segmento`}</span>
            <span className="status-pill active">{`${preview.queued} entrará(ão) na fila`}</span>
            <span className="status-pill paused">{`${preview.skipped.length} pulado(s)`}</span>
          </div>
          {preview.queued === 0 && <p>Nenhum cliente receberia este comunicado.</p>}
          {preview.sampleBody && (
            <div className="broadcast-sample">
              <span className="filter-label">Exemplo de mensagem</span>
              <p>{preview.sampleBody}</p>
            </div>
          )}
          {preview.skipped.length > 0 && (
            <div className="broadcast-skipped">
              <span className="filter-label">Clientes pulados</span>
              <ul>
                {preview.skipped.map((item) => (
                  <li key={item.patientId}>
                    <strong>{item.patientName}</strong>
                    <span>{broadcastSkipReasonLabels[item.reason]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
      {confirming && preview && (
        <Modal
          eyebrow="Comunicado"
          title="Confirmar comunicado"
          subtitle="Confira antes de adicionar as mensagens à fila."
          busy={sending}
          onClose={() => setConfirming(false)}
        >
          <div className="broadcast-confirm">
            <p>
              {`Serão adicionadas ${preview.queued} mensagem(ns) por ${broadcastChannelLabels[preview.channel]} à fila`}
              {preview.skipped.length > 0 ? `; ${preview.skipped.length} cliente(s) ficarão de fora.` : "."}
            </p>
            {outboxWarning && (
              <div className="outbox-note">
                <LockKeyhole size={17} />
                <span>{outboxWarning}</span>
              </div>
            )}
            {sendError && (
              <div className="form-error" role="alert">
                {sendError}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirming(false)}
                disabled={sending}
              >
                Voltar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void send()}
                disabled={sending}
              >
                {sending ? "Enfileirando…" : "Confirmar e enfileirar"}
              </button>
            </div>
          </div>
        </Modal>
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

function fetchContractsPageData() {
  return Promise.all([
    api.documentTemplates(),
    api.documents(),
    api.patientOptions(),
    // Planos são opcionais no documento: quem não vê Planos emite sem vincular plano.
    canView("plans") ? api.plans() : Promise.resolve([]),
    api.professionals(),
  ]);
}

function DocumentsPage() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [documents, setDocuments] = useState<IssuedDocument[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [plans, setPlans] = useState<PatientPlan[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [printing, setPrinting] = useState<IssuedDocument | null>(null);
  const [versioning, setVersioning] = useState<DocumentTemplate | null>(null);
  const [cancelling, setCancelling] = useState<IssuedDocument | null>(null);
  const canManage = canEdit("contracts");
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

  // Carga única da página: usada na abertura e depois de criar modelos ou documentos.
  // Só usa setters de estado (estáveis), por isso o useCallback não tem dependências.
  const applyPageData = useCallback(
    ([
      templateData,
      documentData,
      patientData,
      planData,
      professionalData,
    ]: Awaited<ReturnType<typeof fetchContractsPageData>>) => {
      setTemplates(templateData);
      setDocuments(documentData);
      setPatients(patientData);
      setPlans(planData);
      setProfessionals(
        professionalData.filter((item) => item.active !== false),
      );
      setDocumentForm((current) => ({
        ...current,
        templateId:
          current.templateId ||
          templateData.find((item) => item.active)?.id ||
          "",
        patientId: current.patientId || patientData[0]?.id || "",
      }));
    },
    [],
  );

  async function load() {
    applyPageData(await fetchContractsPageData());
  }

  useEffect(() => {
    let active = true;
    fetchContractsPageData()
      .then((data) => {
        if (active) applyPageData(data);
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [applyPageData]);

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

  async function templateVersioned(template: DocumentTemplate) {
    setVersioning(null);
    setError("");
    setNotice(`Nova versão de “${template.name}” criada.`);
    try {
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

  function replaceDocument(updated: IssuedDocument) {
    setDocuments((current) =>
      current.map((document) =>
        document.id === updated.id ? updated : document,
      ),
    );
  }

  async function issueDocument(item: IssuedDocument) {
    setError("");
    try {
      replaceDocument(await api.updateDocumentStatus(item.id, "issued"));
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
        title="Contratos"
        description="Emita contratos e documentos administrativos com conteúdo e versão preservados."
      />
      {!canManage && <ReadOnlyNotice module="contracts" />}
      {error && <ErrorBanner error={error} />}
      {notice && <div className="success-banner">{notice}</div>}
      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="documents-layout">
          {canManage && (
          <>
          <section className="panel document-form-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Biblioteca</span>
                <h2>Novo modelo</h2>
              </div>
            </div>
            <form className="document-form" onSubmit={createTemplate}>
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
              <div className="modal-actions">
                <button className="primary-button">Criar modelo</button>
              </div>
            </form>
          </section>
          <section className="panel document-form-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Emissão</span>
                <h2>Novo documento</h2>
              </div>
            </div>
            <form className="document-form" onSubmit={createDocument}>
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
              <div className="modal-actions">
              <button
                className="primary-button"
                disabled={!documentForm.templateId || !documentForm.patientId}
              >
                Criar rascunho
              </button>
              </div>
            </form>
          </section>
          </>
          )}
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
                    {canManage && template.active && (
                      <button
                        className="secondary-button button-sm"
                        onClick={() => setVersioning(template)}
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
                      {item.status === "issued" && (
                        <button
                          className="secondary-button button-sm"
                          onClick={() => setPrinting(item)}
                        >
                          <Printer size={15} /> Imprimir
                        </button>
                      )}
                      {canManage && item.status === "draft" && (
                        <button
                          className="primary-button button-sm"
                          onClick={() => void issueDocument(item)}
                        >
                          Emitir
                        </button>
                      )}
                      {canManage && item.status !== "cancelled" && (
                        <button
                          className="danger-button button-sm"
                          onClick={() => setCancelling(item)}
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
      {versioning && (
        <TemplateVersionModal
          template={versioning}
          onClose={() => setVersioning(null)}
          onCreated={() => void templateVersioned(versioning)}
        />
      )}
      {cancelling && (
        <CancelDocumentModal
          document={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={(updated) => {
            replaceDocument(updated);
            setCancelling(null);
          }}
        />
      )}
      {printing && (
        <Modal
          title={printing.title}
          subtitle={printing.patientName}
          eyebrow="Documento emitido"
          onClose={() => setPrinting(null)}
        >
          <div className="receipt-content">
            <Logo />
            <p className="document-print-body">{printing.snapshotBody}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPrinting(null)}
              >
                Fechar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => window.print()}
              >
                <Printer size={15} /> Imprimir documento
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
 

function TemplateVersionModal({
  template,
  onClose,
  onCreated,
}: {
  template: DocumentTemplate;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [body, setBody] = useState(template.body);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (body.trim() === template.body.trim()) {
      setError("Altere o conteúdo para criar uma nova versão.");
      return;
    }
    if (body.trim().length < 20) {
      setError("O conteúdo precisa ter pelo menos 20 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.createDocumentTemplateVersion(template.id, body);
      onCreated();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Nova versão"
      subtitle={`${template.name} · versão ${template.version + 1}`}
      eyebrow="Modelos"
      busy={saving}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        <label className="span-2">
          Conteúdo
          <textarea
            required
            rows={12}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        {error && <div className="span-2 form-error">{error}</div>}
        <div className="span-2 modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Voltar
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Criando…" : "Criar versão"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CancelDocumentModal({
  document,
  onClose,
  onCancelled,
}: {
  document: IssuedDocument;
  onClose: () => void;
  onCancelled: (updated: IssuedDocument) => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function confirmCancel() {
    setSaving(true);
    setError("");
    try {
      onCancelled(await api.updateDocumentStatus(document.id, "cancelled"));
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Cancelar documento"
      subtitle={document.title}
      eyebrow="Documentos"
      busy={saving}
      onClose={onClose}
    >
      <div className="form-grid">
        <p className="span-2">
          “{document.title}” de {document.patientName} será cancelado
          definitivamente. Esta ação não pode ser desfeita.
        </p>
        {error && <div className="span-2 form-error">{error}</div>}
        <div className="span-2 modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Voltar
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => void confirmCancel()}
            disabled={saving}
          >
            {saving ? "Cancelando…" : "Cancelar documento"}
          </button>
        </div>
      </div>
    </Modal>
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
  const [clientPeriod, setClientPeriod] = useState({
    from: `${today.slice(0, 8)}01`,
    to: today,
    version: 0,
  });
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
    setClientPeriod((current) => ({ from, to, version: current.version + 1 }));
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
        <article>
          <span>Experimentais</span>
          {report ? (
            <>
              <strong>
                {report.trials.completed
                  ? `${report.trials.conversionRate}%`
                  : "—"}
              </strong>
              <small>
                {report.trials.completed
                  ? `${report.trials.scheduled} agendadas · ${report.trials.completed} concluídas · ${report.trials.converted} viraram plano em até 30 dias`
                  : `${report.trials.scheduled} agendadas · nenhuma concluída no período`}
              </small>
            </>
          ) : (
            <small>
              {loading
                ? "Carregando experimentais…"
                : "Não foi possível carregar as experimentais."}
            </small>
          )}
        </article>
      </section>
      <ClientInsights
        key={`${clientPeriod.from}-${clientPeriod.to}-${clientPeriod.version}`}
        from={clientPeriod.from}
        to={clientPeriod.to}
      />
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

function formatRate(rate: number | null) {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

function ClientInsights({ from, to }: { from: string; to: string }) {
  const [retention, setRetention] = useState<RetentionReport | null>(null);
  const [retentionError, setRetentionError] = useState("");
  const [clients, setClients] = useState<ClientReport | null>(null);
  const [clientsError, setClientsError] = useState("");

  useEffect(() => {
    let active = true;
    api
      .retentionReport(from, to)
      .then((data) => active && setRetention(data))
      .catch((cause: Error) => active && setRetentionError(cause.message));
    api
      .clientReport(from, to)
      .then((data) => active && setClients(data))
      .catch((cause: Error) => active && setClientsError(cause.message));
    return () => {
      active = false;
    };
  }, [from, to]);

  const clientsBody = (content: (report: ClientReport) => ReactNode) =>
    clientsError ? (
      <ErrorBanner error={clientsError} />
    ) : clients ? (
      content(clients)
    ) : (
      <LoadingBlock />
    );

  return (
    <section className="client-insights">
      <section className="panel report-table retention-report">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Clientes</span>
            <h2>Retenção mês a mês</h2>
          </div>
        </div>
        {retentionError ? (
          <ErrorBanner error={retentionError} />
        ) : !retention ? (
          <LoadingBlock />
        ) : retention.months.length === 0 ? (
          <EmptyState
            title="Sem meses"
            copy="Nenhum mês do período pode ser analisado."
          />
        ) : (
          <>
            <div className="forecast-scroll retention-scroll">
              <table className="forecast-table">
                <thead>
                  <tr>
                    <th scope="col">Mês</th>
                    <th scope="col">Ativos</th>
                    <th scope="col">Novos</th>
                    <th scope="col">Perdidos</th>
                    <th scope="col">Retenção</th>
                    <th scope="col">Planos cancelados</th>
                    <th scope="col">Valor cancelado</th>
                  </tr>
                </thead>
                <tbody>
                  {retention.months.map((item) => (
                    <tr key={item.month}>
                      <th scope="row">{formatCompetence(item.month)}</th>
                      <td>{item.activeClients}</td>
                      <td>{item.newClients}</td>
                      <td>{item.lostClients}</td>
                      <td>{formatRate(item.retentionRate)}</td>
                      <td>{item.cancelledPlans}</td>
                      <td>
                        {currency.format(item.cancelledValueInCents / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="retention-summary">
              No período: {retention.totals.newClients} novos ·{" "}
              {retention.totals.lostClients} perdidos ·{" "}
              {retention.totals.cancelledPlans} planos cancelados (
              {currency.format(retention.totals.cancelledValueInCents / 100)}).
              Retenção = ativos do mês anterior que continuaram ativos.
            </p>
          </>
        )}
      </section>
      <div className="report-grid client-rankings">
        <section className="panel report-table">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Ranking</span>
              <h2>Mais sessões concluídas</h2>
            </div>
          </div>
          {clientsBody((report) =>
            report.topBySessions.length === 0 ? (
              <EmptyState
                title="Sem sessões"
                copy="Nenhum cliente com sessão concluída no período."
              />
            ) : (
              <div className="report-rows ranking-rows">
                {report.topBySessions.map((item, index) => (
                  <div key={item.patientId}>
                    <strong>
                      {index + 1}. {item.patientName}
                    </strong>
                    <b>
                      {item.completedSessions}{" "}
                      {item.completedSessions === 1 ? "sessão" : "sessões"}
                    </b>
                  </div>
                ))}
              </div>
            ),
          )}
        </section>
        <section className="panel report-table">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Ranking</span>
              <h2>Mais recebimentos</h2>
            </div>
          </div>
          {clientsBody((report) =>
            report.topByRevenue.length === 0 ? (
              <EmptyState
                title="Sem recebimentos"
                copy="Nenhum recebimento de cliente no período."
              />
            ) : (
              <div className="report-rows ranking-rows">
                {report.topByRevenue.map((item, index) => (
                  <div key={item.patientId}>
                    <strong>
                      {index + 1}. {item.patientName}
                    </strong>
                    <b>{currency.format(item.receivedInCents / 100)}</b>
                  </div>
                ))}
              </div>
            ),
          )}
        </section>
        <section className="panel report-table source-report">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Perfil</span>
              <h2>Faixa etária</h2>
            </div>
          </div>
          {clientsBody((report) =>
            report.activeClients === 0 ? (
              <EmptyState
                title="Sem clientes ativos"
                copy="Nenhum cliente ativo no período."
              />
            ) : (
              <>
                <div className="report-rows age-rows">
                  {report.ageDistribution.map((item) => (
                    <div key={item.band}>
                      <strong>{item.label}</strong>
                      <span>
                        {Math.round((item.clients / report.activeClients) * 100)}%
                      </span>
                      <b>{item.clients}</b>
                    </div>
                  ))}
                </div>
                <p className="retention-summary">
                  {report.activeClients} clientes ativos no período, com a
                  idade na data final.
                </p>
              </>
            ),
          )}
        </section>
      </div>
    </section>
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
  const [trialLead, setTrialLead] = useState<Lead | null>(null);
  const [notice, setNotice] = useState("");
  const [losingLead, setLosingLead] = useState<Lead | null>(null);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
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
          canManage ? (
            <button className="primary-button" onClick={() => setModalOpen(true)}>
              <Plus size={18} />
              Novo lead
            </button>
          ) : undefined
        }
      />
      {!canManage && <ReadOnlyNotice module="crm" />}
      {error && <ErrorBanner error={error} />}
      {notice && <div className="success-banner" role="status">{notice}</div>}
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
          {leads.length === 0 ? (
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
                  canManage ? (
                    <button className="primary-button" onClick={() => setModalOpen(true)}>
                      <Plus size={18} />
                      Cadastrar primeiro lead
                    </button>
                  ) : undefined
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
                    {leads.filter((lead) => lead.stage === stage.value).length}
                  </span>
                </header>
                <div>
                  {!leads.some((lead) => lead.stage === stage.value) && (
                    <p className="kanban-empty-hint">{stage.hint}</p>
                  )}
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
                          <button className="text-button button-sm" onClick={() => setActivityLead(lead)}>
                            Atividades
                          </button>
                        </div>
                        {lead.lostReason && (
                          <div className="lost-reason">{lead.lostReason}</div>
                        )}
                        {canManage && !["won", "lost"].includes(lead.stage) && (
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
                              className="primary-button button-sm"
                              onClick={() => setConvertingLead(lead)}
                            >
                              Converter
                            </button>
                            {!lead.convertedPatientId && (
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

// Agenda experimental/avaliação para o lead sem criar cadastro de cliente.
function LeadAppointmentModal({
  lead,
  onClose,
  onCreated,
}: {
  lead: Lead;
  onClose: () => void;
  onCreated: (appointment: Appointment) => void;
}) {
  const initialTime = new Date();
  initialTime.setDate(initialTime.getDate() + 1);
  initialTime.setHours(9, 0, 0, 0);
  const [options, setOptions] = useState<{
    services: Service[];
    professionals: Professional[];
    rooms: Room[];
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({
    visitType: "trial" as LeadAppointmentInput["visitType"],
    serviceId: "",
    professionalId: "",
    roomId: "",
    startsAt: toLocalDateTimeInput(initialTime),
    notes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([api.services(), api.professionals(), api.rooms()])
      .then(([services, professionals, rooms]) => {
        if (!active) return;
        setOptions({ services, professionals, rooms });
        setForm((current) => ({
          ...current,
          serviceId: current.serviceId || (services[0]?.id ?? ""),
          professionalId: current.professionalId || (professionals[0]?.id ?? ""),
          roomId: current.roomId || (rooms[0]?.id ?? ""),
        }));
      })
      .catch((cause: Error) => {
        if (active) setLoadError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      onCreated(
        await api.createLeadAppointment(lead.id, {
          professionalId: form.professionalId,
          roomId: form.roomId,
          serviceId: form.serviceId,
          startsAt: new Date(form.startsAt).toISOString(),
          notes: form.notes,
          visitType: form.visitType,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível agendar.");
      setSaving(false);
    }
  }
  const missingOptions =
    options !== null &&
    (options.services.length === 0 || options.professionals.length === 0 || options.rooms.length === 0);
  return (
    <Modal
      eyebrow="Lead"
      title="Agendar experimental"
      subtitle={`${lead.fullName} · o atendimento entra na agenda sem criar cadastro de cliente.`}
      busy={saving}
      onClose={onClose}
    >
      {loadError ? (
        <ErrorBanner error={loadError} />
      ) : options === null ? (
        <LoadingBlock />
      ) : missingOptions ? (
        <EmptyState
          title="Agenda incompleta"
          copy="Cadastre serviço, profissional e sala antes de agendar a experimental."
        />
      ) : (
        <form className="form-grid" onSubmit={(event) => void submit(event)}>
          <label>
            Tipo
            <select
              value={form.visitType}
              onChange={(e) =>
                setForm({ ...form, visitType: e.target.value as LeadAppointmentInput["visitType"] })
              }
            >
              {leadVisitTypes.map((item) => (
                <option value={item} key={item}>
                  {visitTypeLabels[item]}
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
              {options.services.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Profissional
            <select
              required
              value={form.professionalId}
              onChange={(e) => setForm({ ...form, professionalId: e.target.value })}
            >
              {options.professionals.map((item) => (
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
              {options.rooms.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
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
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          {error && <div className="form-error span-2">{error}</div>}
          <div className="modal-actions span-2">
            <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? "Agendando…" : "Confirmar agendamento"}
            </button>
          </div>
        </form>
      )}
    </Modal>
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
      busy={loading}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
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
  editable,
}: {
  lead: Lead;
  onClose: () => void;
  onChanged: () => void;
  /** Sem edição do CRM: só o histórico (sem registrar tarefa/contato nem concluir tarefa). */
  editable: boolean;
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
      busy={saving}
      onClose={onClose}
    >
      <div className="activity-tabs">
        <button
          className={`tab-button ${tab === "tasks" ? "active" : ""}`}
          onClick={() => setTab("tasks")}
        >
          Tarefas (
          {activity?.tasks.filter((item) => item.status === "open").length ?? 0}
          )
        </button>
        <button
          className={`tab-button ${tab === "contacts" ? "active" : ""}`}
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
          {editable && (
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
            <div className="modal-actions">
            <button className="primary-button" disabled={saving}>
              Adicionar tarefa
            </button>
            </div>
          </form>
          )}
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
                {item.status === "open" && editable ? (
                  <div>
                    <button className="secondary-button button-sm"
                      onClick={() => void changeTask(item.id, "completed")}
                    >
                      Concluir
                    </button>
                    <button className="danger-button button-sm"
                      onClick={() => void changeTask(item.id, "cancelled")}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <span>
                    {item.status === "open"
                      ? "Aberta"
                      : item.status === "completed"
                        ? "Concluída"
                        : "Cancelada"}
                  </span>
                )}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="lead-activity-content">
          {editable && (
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
            <div className="modal-actions">
            <button className="primary-button" disabled={saving}>
              Registrar contato
            </button>
            </div>
          </form>
          )}
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
  const [cancellingPlan, setCancellingPlan] = useState<PatientPlan | null>(null);

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
                      className="secondary-button button-sm"
                      onClick={() => setMovementPlan(plan)}
                    >
                      <FileClock size={15} />
                      Extrato
                    </button>
                    {canManage &&
                      plan.status !== "cancelled" &&
                      !plan.renewedByPlanId && (
                        <button
                          className="secondary-button button-sm"
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
                            className="secondary-button button-sm"
                            onClick={() => void changeStatus(plan, "paused")}
                          >
                            <Pause size={15} />
                            Pausar
                          </button>
                        ) : (
                          <button
                            className="secondary-button button-sm"
                            onClick={() => void changeStatus(plan, "active")}
                          >
                            <Play size={15} />
                            Ativar
                          </button>
                        )}
                        <button
                          className="danger-button button-sm"
                          onClick={() => setCancellingPlan(plan)}
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
      {cancellingPlan && (
        <PlanCancelModal
          plan={cancellingPlan}
          onClose={() => setCancellingPlan(null)}
          onConfirm={async () => {
            replacePlan(await api.updatePlanStatus(cancellingPlan.id, "cancelled"));
            setCancellingPlan(null);
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
      busy={loading}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
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
  const [tab, setTab] = useState<
    "receivables" | "payables" | "commissions" | "dailyCash" | "forecast"
  >("receivables");
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedReceivables, setSelectedReceivables] = useState<string[]>([]);
  const [receivableFilter, setReceivableFilter] =
    useState<ReceivableFilter>("all");
  const [receivableSearch, setReceivableSearch] = useState("");
  const [settling, setSettling] = useState<SettleTarget | null>(null);
  const [payableModal, setPayableModal] = useState(false);
  const [adjusting, setAdjusting] = useState<Receivable | null>(null);
  const [registry, setRegistry] = useState<"category" | "costCenter" | null>(null);
  const [renegotiating, setRenegotiating] = useState(false);
  const [commissionRuleOpen, setCommissionRuleOpen] = useState(false);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState("");
  const canManage = canEdit("finance");
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
  async function reverseReceivable(id: string) {
    setError("");
    try {
      await api.reverseReceivable(id);
      // A parcela mudou de situação: a seleção antiga não vale mais para renegociar.
      setSelectedReceivables([]);
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function reversePayable(id: string) {
    setError("");
    try {
      await api.reversePayable(id);
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function settle(target: SettleTarget, method: PaymentMethod) {
    if (target.kind === "receivable")
      await api.settleReceivable(target.id, method);
    else await api.settlePayable(target.id, method);
    // A baixa foi feita: fecha o modal e, se o recarregamento falhar, avisa na página.
    setSettling(null);
    if (target.kind === "receivable") setSelectedReceivables([]);
    setError("");
    try {
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function changeReceivableFilter(filter: ReceivableFilter) {
    setReceivableFilter(filter);
    setSelectedReceivables([]);
  }
  function changeReceivableSearch(value: string) {
    setReceivableSearch(value);
    setSelectedReceivables([]);
  }
  // Ações em modal: o erro da API fica no modal; feito o pedido, o modal fecha e, se o
  // recarregamento falhar, o aviso vai para a página (como na baixa).
  async function reloadAfterAction() {
    setError("");
    try {
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function adjustReceivable(id: string, amountInCents: number, reason: string) {
    await api.adjustReceivable(id, amountInCents, reason);
    setAdjusting(null);
    setSelectedReceivables([]);
    await reloadAfterAction();
  }
  async function createRegistry(kind: "category" | "costCenter", name: string) {
    if (kind === "category") await api.createFinancialCategory({ name, kind: "expense" });
    else await api.createCostCenter({ name });
    setRegistry(null);
    await reloadAfterAction();
  }
  async function renegotiate(input: {
    totalAmountInCents: number;
    installments: number;
    firstDueDate: string;
    reason: string;
  }) {
    await api.renegotiateReceivables({
      receivableIds: selectedReceivables,
      ...input,
    });
    setRenegotiating(false);
    setSelectedReceivables([]);
    await reloadAfterAction();
  }
  async function toggleCommission(item: CommissionEntry) {
    setError("");
    try {
      if (item.status === "paid") await api.reverseCommission(item.id);
      else await api.settleCommission(item.id);
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function generateCommissions() {
    setError("");
    try {
      await api.generateCommissions(new Date().toISOString().slice(0, 7));
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function createCommissionRule(input: {
    professionalId: string;
    percentage: number;
    effectiveFrom: string;
  }) {
    await api.createCommissionRule(input);
    setCommissionRuleOpen(false);
    await reloadAfterAction();
  }
  return (
    <>
      <PageHeader
        eyebrow="Saúde financeira"
        title="Financeiro"
        description="Controle entradas, despesas, pagamentos e fluxo de caixa."
        action={
          canManage && (
          <div className="page-actions">
            <button
              className="secondary-button"
              onClick={() => setRegistry("category")}
            >
              <Tags size={18} /> Nova categoria
            </button>
            <button
              className="secondary-button"
              onClick={() => setRegistry("costCenter")}
            >
              <Building2 size={18} /> Novo centro de custo
            </button>
            <button
              className="primary-button"
              onClick={() => setPayableModal(true)}
            >
              <Plus size={18} /> Nova despesa
            </button>
          </div>
          )
        }
      />
      {!canManage && <ReadOnlyNotice module="finance" />}
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
              <small className="metric-note">
                Recebido no mês − despesas pagas no mês.
              </small>
            </article>
            <article className="metric-card">
              <span>Recebido no mês</span>
              <strong>
                {currency.format(data.summary.paidThisMonthInCents / 100)}
              </strong>
              <small className="metric-note">
                Parcelas de clientes com baixa neste mês.
              </small>
            </article>
            <article className="metric-card">
              <span>Despesas pagas</span>
              <strong>
                {currency.format(data.paidExpensesThisMonthInCents / 100)}
              </strong>
              <small className="metric-note">
                Contas da clínica quitadas neste mês.
              </small>
            </article>
            <article className="metric-card">
              <span>Compromissos em aberto</span>
              <strong>{currency.format(data.payableOpenInCents / 100)}</strong>
              <small className="metric-note">
                Contas a pagar que ainda não foram quitadas.
              </small>
            </article>
          </section>
          <section className="finance-controls">
            <div className="activity-tabs finance-tabs">
              <button
                className={`tab-button ${tab === "receivables" ? "active" : ""}`}
                aria-label={`Contas a receber (${data.summary.receivables.length})`}
                onClick={() => setTab("receivables")}
              >
                Contas a receber
                <span className="tab-count">
                  {data.summary.receivables.length}
                </span>
              </button>
              <button
                className={`tab-button ${tab === "payables" ? "active" : ""}`}
                aria-label={`Contas a pagar (${data.payables.length})`}
                onClick={() => setTab("payables")}
              >
                Contas a pagar
                <span className="tab-count">{data.payables.length}</span>
              </button>
              <button
                className={`tab-button ${tab === "commissions" ? "active" : ""}`}
                aria-label={`Comissões (${data.commissions.length})`}
                onClick={() => setTab("commissions")}
              >
                Comissões
                <span className="tab-count">{data.commissions.length}</span>
              </button>
              <button
                className={`tab-button ${tab === "dailyCash" ? "active" : ""}`}
                onClick={() => setTab("dailyCash")}
              >
                Caixa do dia
              </button>
              <button
                className={`tab-button ${tab === "forecast" ? "active" : ""}`}
                onClick={() => setTab("forecast")}
              >
                Previsão
              </button>
            </div>
          </section>
          {tab === "dailyCash" ? (
            <DailyCashSection />
          ) : tab === "forecast" ? (
            <FinanceForecastSection />
          ) : tab === "receivables" ? (
          <section className="panel finance-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Entradas</span>
                <h2>Parcelas</h2>
              </div>
            </div>
            <ReceivablesList
              receivables={data.summary.receivables}
              canManage={canManage}
              filter={receivableFilter}
              search={receivableSearch}
              selected={selectedReceivables}
              onFilterChange={changeReceivableFilter}
              onSearchChange={changeReceivableSearch}
              onSelectedChange={setSelectedReceivables}
              onRenegotiate={() => setRenegotiating(true)}
              onSettle={(item) =>
                setSettling({
                  kind: "receivable",
                  id: item.id,
                  title: item.patientName,
                  description: item.description,
                  amountInCents: item.amountInCents,
                })
              }
              onReverse={(id) => void reverseReceivable(id)}
              onAdjust={(item) => setAdjusting(item)}
              onReceipt={(id) =>
                void api
                  .paymentReceipt(id)
                  .then(setReceipt)
                  .catch((cause: Error) => setError(cause.message))
              }
            />
          </section>
          ) : tab === "payables" ? (
          <section className="panel finance-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Saídas</span>
                <h2>Contas a pagar</h2>
                <p className="panel-help">
                  Despesas da clínica pelo vencimento, em aberto e já pagas.
                  As despesas fixas logo abaixo geram uma conta por mês
                  automaticamente.
                </p>
              </div>
            </div>
            <PayablesList
              payables={data.payables}
              canManage={canManage}
              onCreate={() => setPayableModal(true)}
              onReverse={(id) => void reversePayable(id)}
              onSettle={(item) =>
                setSettling({
                  kind: "payable",
                  id: item.id,
                  title: item.description,
                  description: item.supplier || item.categoryName,
                  amountInCents: item.amountInCents,
                })
              }
            />
          </section>
          ) : (
          <section className="panel finance-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Profissionais</span>
                <h2>Comissões</h2>
                <p className="panel-help">
                  Quanto cada profissional tem a receber pelos atendimentos
                  concluídos: o percentual da regra sobre a base de cálculo de
                  cada atendimento.
                </p>
                <p className="panel-help">
                  Para quem tem usuário ligado, vale a comissão definida no
                  usuário (Configurações › Usuários); a regra daqui só conta
                  enquanto o usuário não tiver uma.
                </p>
              </div>
              {canManage && (
                <div className="page-actions">
                  <button
                    className="secondary-button"
                    onClick={() => setCommissionRuleOpen(true)}
                  >
                    <Plus size={18} /> Nova regra
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => void generateCommissions()}
                  >
                    Gerar comissões do mês
                  </button>
                </div>
              )}
            </div>
            <CommissionsList
              commissions={data.commissions}
              canManage={canManage}
              onToggle={(item) => void toggleCommission(item)}
            />
          </section>
          )}
          {tab === "payables" && (
            <RecurringPayablesSection
              editable={canManage}
              workspace={data}
              onGenerated={reload}
            />
          )}
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
      {adjusting && (
        <ReceivableAdjustModal
          receivable={adjusting}
          onClose={() => setAdjusting(null)}
          onConfirm={(amountInCents, reason) =>
            adjustReceivable(adjusting.id, amountInCents, reason)
          }
        />
      )}
      {registry && (
        <FinanceRegistryModal
          kind={registry}
          onClose={() => setRegistry(null)}
          onConfirm={(name) => createRegistry(registry, name)}
        />
      )}
      {renegotiating && data && (
        <RenegotiateModal
          receivables={data.summary.receivables.filter((item) =>
            selectedReceivables.includes(item.id),
          )}
          onClose={() => setRenegotiating(false)}
          onConfirm={renegotiate}
        />
      )}
      {commissionRuleOpen && (
        <CommissionRuleModal
          professionals={professionals}
          onClose={() => setCommissionRuleOpen(false)}
          onConfirm={createCommissionRule}
        />
      )}
      {settling && (
        <SettleModal
          target={settling}
          onClose={() => setSettling(null)}
          onConfirm={(method) => settle(settling, method)}
        />
      )}
    </>
  );
}

type ReceivableFilter = "all" | "open" | "overdue" | "paid";

interface SettleTarget {
  kind: "receivable" | "payable";
  id: string;
  title: string;
  description: string;
  amountInCents: number;
}

const paymentMethodOptions: { value: PaymentMethod; label: string }[] = [
  { value: "pix", label: "Pix" },
  { value: "card", label: "Cartão" },
  { value: "cash", label: "Dinheiro" },
  { value: "bank_transfer", label: "Transferência" },
  { value: "boleto", label: "Boleto" },
  { value: "other", label: "Outro" },
];

const receivableFilterLabels: Record<ReceivableFilter, string> = {
  all: "Todas",
  open: "Em aberto",
  overdue: "Vencidas",
  paid: "Pagas",
};

/** Situação de uma parcela ou conta pelo vencimento (selo com cor e texto). */
function receivableSituation(
  item: Pick<Receivable, "status" | "overdue" | "dueDate">,
  today: string,
) {
  if (item.status === "paid") return { key: "paid", label: "Paga", pill: "paid" };
  if (item.status === "cancelled")
    return { key: "cancelled", label: "Cancelada", pill: "cancelled" };
  if (item.overdue) {
    const days = Math.max(
      1,
      Math.round(
        (Date.parse(`${today}T12:00:00Z`) -
          Date.parse(`${item.dueDate}T12:00:00Z`)) /
          86_400_000,
      ),
    );
    return {
      key: "overdue",
      label: `Vencida há ${days} ${days === 1 ? "dia" : "dias"}`,
      pill: "overdue",
    };
  }
  return { key: "open", label: "Em aberto", pill: "open" };
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function ReceivablesList({
  receivables,
  canManage,
  filter,
  search,
  selected,
  onFilterChange,
  onSearchChange,
  onSelectedChange,
  onRenegotiate,
  onSettle,
  onReverse,
  onAdjust,
  onReceipt,
}: {
  receivables: Receivable[];
  canManage: boolean;
  filter: ReceivableFilter;
  search: string;
  selected: string[];
  onFilterChange: (filter: ReceivableFilter) => void;
  onSearchChange: (value: string) => void;
  onSelectedChange: (ids: string[]) => void;
  onRenegotiate: () => void;
  onSettle: (item: Receivable) => void;
  onReverse: (id: string) => void;
  onAdjust: (item: Receivable) => void;
  onReceipt: (id: string) => void;
}) {
  if (receivables.length === 0) {
    return (
      <EmptyState
        title="Nenhuma conta a receber"
        copy="As parcelas surgem após a venda de um plano."
      />
    );
  }
  const today = saoPauloToday();
  const rows = receivables.map((item) => ({
    item,
    situation: receivableSituation(item, today),
  }));
  const counts: Record<ReceivableFilter, number> = {
    all: rows.length,
    open: rows.filter((row) => row.situation.key === "open").length,
    overdue: rows.filter((row) => row.situation.key === "overdue").length,
    paid: rows.filter((row) => row.situation.key === "paid").length,
  };
  const term = normalizeSearch(search);
  const visible = rows.filter(
    (row) =>
      (filter === "all" || row.situation.key === filter) &&
      (!term || normalizeSearch(row.item.patientName).includes(term)),
  );
  const selectable = canManage
    ? visible.filter((row) => row.item.status === "open")
    : [];
  const allSelected =
    selectable.length > 0 &&
    selectable.every((row) => selected.includes(row.item.id));
  function toggle(id: string) {
    onSelectedChange(
      selected.includes(id)
        ? selected.filter((current) => current !== id)
        : [...selected, id],
    );
  }
  return (
    <>
      <div className="list-toolbar finance-filters">
        <div
          className="tag-filter-list"
          role="group"
          aria-label="Filtrar parcelas por situação"
        >
          {(Object.keys(receivableFilterLabels) as ReceivableFilter[]).map(
            (key) => (
              <button
                key={key}
                type="button"
                className="tag-filter"
                aria-pressed={filter === key}
                onClick={() => onFilterChange(key)}
              >
                {receivableFilterLabels[key]} <small>{counts[key]}</small>
              </button>
            ),
          )}
        </div>
        <div className="search-box">
          <Search size={18} />
          <input
            type="search"
            aria-label="Buscar cliente"
            placeholder="Buscar por cliente"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        {selectable.length > 0 && (
          <label className="select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                onSelectedChange(
                  allSelected ? [] : selectable.map((row) => row.item.id),
                )
              }
            />
            Selecionar todas
          </label>
        )}
      </div>
      {canManage && selected.length > 0 && (
        <div className="selection-bar" role="status">
          <strong>
            {selected.length === 1
              ? "1 parcela selecionada"
              : `${selected.length} parcelas selecionadas`}
          </strong>
          <div className="page-actions">
            <button
              type="button"
              className="text-button button-sm"
              onClick={() => onSelectedChange([])}
            >
              Limpar seleção
            </button>
            <button
              type="button"
              className="primary-button button-sm"
              onClick={onRenegotiate}
            >
              Renegociar
            </button>
          </div>
        </div>
      )}
      {visible.length === 0 ? (
        <div className="finance-filter-empty">
          <EmptyState
            title="Nenhuma parcela encontrada"
            copy="Limpe a busca ou escolha outra situação para ver as parcelas."
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              onFilterChange("all");
              onSearchChange("");
            }}
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div
          className={`finance-table finance-list receivables-table${canManage ? " selectable" : ""}`}
        >
          <div className="finance-row finance-head" aria-hidden="true">
            {canManage && <span />}
            <span>Cliente e plano</span>
            <span>Vencimento</span>
            <span className="finance-amount">Valor</span>
            <span>Situação</span>
            <span className="finance-actions">Ações</span>
          </div>
          {visible.map(({ item, situation }) => (
            <div className="finance-row" key={item.id}>
              {canManage &&
                (item.status === "open" ? (
                  <input
                    type="checkbox"
                    className="row-check"
                    aria-label={`Selecionar parcela de ${item.patientName}`}
                    checked={selected.includes(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                ) : (
                  <span />
                ))}
              <div className="finance-item">
                <strong title={item.patientName}>{item.patientName}</strong>
                <span title={item.description}>{item.description}</span>
              </div>
              <span className="finance-due">
                <span className="finance-label">Vencimento </span>
                {shortDate.format(new Date(`${item.dueDate}T12:00:00`))}
              </span>
              <strong
                className={`finance-amount ${item.amountInCents < 0 ? "cash-out" : "cash-in"}`}
              >
                {signedCurrency(item.amountInCents)}
              </strong>
              <span>
                <span className={`status-pill ${situation.pill}`}>
                  {situation.label}
                </span>
              </span>
              <div className="finance-actions">
                {canManage && item.status === "open" && (
                  <button
                    className="secondary-button button-sm"
                    onClick={() => onAdjust(item)}
                  >
                    Ajustar
                  </button>
                )}
                {item.status === "paid" && (
                  <button
                    className="secondary-button button-sm"
                    onClick={() => onReceipt(item.id)}
                  >
                    Recibo
                  </button>
                )}
                {canManage && item.status === "open" && (
                  <button
                    className="primary-button button-sm"
                    onClick={() => onSettle(item)}
                  >
                    Dar baixa
                  </button>
                )}
                {canManage && item.status === "paid" && (
                  <button
                    className="danger-button button-sm"
                    onClick={() => onReverse(item.id)}
                  >
                    Estornar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Valor com sinal explícito pelo efeito no caixa (+ entrada, - saída). */
function signedCurrency(effectInCents: number) {
  return `${effectInCents < 0 ? "-" : "+"} ${currency.format(Math.abs(effectInCents) / 100)}`;
}

function PayablesList({
  payables,
  canManage,
  onCreate,
  onSettle,
  onReverse,
}: {
  payables: Payable[];
  canManage: boolean;
  onCreate: () => void;
  onSettle: (item: Payable) => void;
  onReverse: (id: string) => void;
}) {
  if (payables.length === 0) {
    return (
      <div className="finance-filter-empty">
        <EmptyState
          title="Nenhuma conta a pagar"
          copy="Lance a primeira despesa em “Nova despesa” ou cadastre uma despesa fixa logo abaixo."
        />
        {canManage && (
          <button type="button" className="secondary-button" onClick={onCreate}>
            <Plus size={18} /> Nova despesa
          </button>
        )}
      </div>
    );
  }
  const today = saoPauloToday();
  return (
    <div className="finance-table finance-list payables-table">
      <div className="finance-row finance-head" aria-hidden="true">
        <span>Descrição e fornecedor</span>
        <span>Vencimento</span>
        <span className="finance-amount">Valor</span>
        <span>Situação</span>
        <span className="finance-actions">Ações</span>
      </div>
      {payables.map((item) => {
        const situation = receivableSituation(item, today);
        const detail = `${item.supplier || item.categoryName} · ${item.costCenterName}`;
        return (
          <div className="finance-row" key={item.id}>
            <div className="finance-item">
              <strong title={item.description}>{item.description}</strong>
              <span title={detail}>{detail}</span>
            </div>
            <span className="finance-due">
              <span className="finance-label">Vencimento </span>
              {shortDate.format(new Date(`${item.dueDate}T12:00:00`))}
            </span>
            <strong className="finance-amount cash-out">
              {signedCurrency(-item.amountInCents)}
            </strong>
            <span>
              <span className={`status-pill ${situation.pill}`}>
                {situation.label}
              </span>
            </span>
            <div className="finance-actions">
              {canManage && item.status === "open" && (
                <button
                  className="primary-button button-sm"
                  aria-label={`Pagar ${item.description}`}
                  onClick={() => onSettle(item)}
                >
                  Pagar
                </button>
              )}
              {canManage && item.status === "paid" && (
                <button
                  className="danger-button button-sm"
                  aria-label={`Estornar ${item.description}`}
                  onClick={() => onReverse(item.id)}
                >
                  Estornar
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommissionsList({
  commissions,
  canManage,
  onToggle,
}: {
  commissions: CommissionEntry[];
  canManage: boolean;
  onToggle: (item: CommissionEntry) => void;
}) {
  if (commissions.length === 0) {
    return (
      <EmptyState
        title="Nenhuma comissão gerada"
        copy="Cadastre uma regra de comissão e use “Gerar comissões do mês” depois de concluir atendimentos."
      />
    );
  }
  return (
    <div className="finance-table finance-list commissions-table">
      <div className="finance-row finance-head" aria-hidden="true">
        <span>Profissional e competência</span>
        <span className="finance-number">Base de cálculo</span>
        <span className="finance-number">Percentual</span>
        <span className="finance-amount">Comissão</span>
        <span>Situação</span>
        <span className="finance-actions">Ações</span>
      </div>
      {commissions.map((item) => {
        const detail = [
          `Competência ${formatCompetence(item.competence)}`,
          item.paidAt &&
            `paga em ${shortDate.format(new Date(item.paidAt))}`,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div className="finance-row" key={item.id}>
            <div className="finance-item">
              <strong title={item.professionalName}>
                {item.professionalName}
              </strong>
              <span>{detail}</span>
            </div>
            <span className="finance-due finance-number">
              <span className="finance-label">Base de cálculo </span>
              {currency.format(item.baseAmountInCents / 100)}
            </span>
            <span className="finance-due finance-number">
              <span className="finance-label">Percentual </span>
              {item.percentage}%
            </span>
            <strong className="finance-amount cash-out">
              {signedCurrency(-item.amountInCents)}
            </strong>
            <span>
              <span className={`status-pill ${item.status}`}>
                {item.status === "paid" ? "Paga" : "Em aberto"}
              </span>
            </span>
            <div className="finance-actions">
              {canManage && (
                <button
                  className={
                    item.status === "paid"
                      ? "danger-button button-sm"
                      : "primary-button button-sm"
                  }
                  aria-label={`${item.status === "paid" ? "Estornar" : "Pagar"} comissão de ${item.professionalName}`}
                  onClick={() => onToggle(item)}
                >
                  {item.status === "paid" ? "Estornar" : "Pagar"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SettleModal({
  target,
  onClose,
  onConfirm,
}: {
  target: SettleTarget;
  onClose: () => void;
  onConfirm: (method: PaymentMethod) => Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isReceivable = target.kind === "receivable";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onConfirm(method);
    } catch (cause) {
      setError((cause as Error).message);
      setLoading(false);
    }
  }
  return (
    <Modal
      eyebrow="Financeiro"
      title={isReceivable ? "Dar baixa na parcela" : "Pagar despesa"}
      subtitle={`${target.title} · ${target.description} · ${currency.format(target.amountInCents / 100)}`}
      busy={loading}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          {isReceivable
            ? "Forma de pagamento recebida"
            : "Forma de pagamento usada"}
          <select
            autoFocus
            value={method}
            onChange={(event) =>
              setMethod(event.target.value as PaymentMethod)
            }
          >
            {paymentMethodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
            Voltar
          </button>
          <button className="primary-button" disabled={loading}>
            {loading
              ? "Salvando…"
              : isReceivable
                ? "Confirmar baixa"
                : "Confirmar pagamento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const dailyCashMethodLabels: Record<DailyCashPaymentMethod, string> = {
  pix: "Pix",
  card: "Cartão",
  cash: "Dinheiro",
  bank_transfer: "Transferência",
  boleto: "Boleto",
  other: "Outro",
  unspecified: "Não informada",
};

const dailyCashKinds: Record<
  DailyCashMovementKind,
  { label: string; pill: string }
> = {
  receipt: { label: "Recebimento", pill: "paid" },
  receipt_reversal: { label: "Estorno", pill: "cancelled" },
  payable: { label: "Conta paga", pill: "open" },
  commission: { label: "Comissão", pill: "open" },
};

const saoPauloTime = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function dailyCashMovementAmount(movement: DailyCashMovement) {
  const effect =
    movement.direction === "in"
      ? movement.amountInCents
      : -movement.amountInCents;
  return { effect, text: signedCurrency(effect) };
}

/** Movimentos do dia agrupados por forma de pagamento, na ordem dos totais da API. */
function dailyCashGroups(cash: DailyCash) {
  const methods = cash.byPaymentMethod.map((item) => item.paymentMethod);
  for (const movement of cash.movements)
    if (!methods.includes(movement.paymentMethod))
      methods.push(movement.paymentMethod);
  return methods.map((method) => {
    const movements = cash.movements.filter(
      (movement) => movement.paymentMethod === method,
    );
    const total = cash.byPaymentMethod.find(
      (item) => item.paymentMethod === method,
    );
    const inflow =
      total?.inflowInCents ??
      movements
        .filter((movement) => movement.direction === "in")
        .reduce((sum, movement) => sum + movement.amountInCents, 0);
    const outflow =
      total?.outflowInCents ??
      movements
        .filter((movement) => movement.direction === "out")
        .reduce((sum, movement) => sum + movement.amountInCents, 0);
    return {
      method,
      label: dailyCashMethodLabels[method],
      inflow,
      outflow,
      balance: total?.balanceInCents ?? inflow - outflow,
      movements,
    };
  });
}

function DailyCashSection() {
  const today = saoPauloToday();
  const [date, setDate] = useState(today);
  const [cash, setCash] = useState<DailyCash | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .dailyCash(date)
      .then((data) => active && setCash(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [date]);
  function changeDate(value: string) {
    // Campo limpo mantém o dia anterior: a rota sem data usaria hoje.
    if (!value || value === date) return;
    setCash(null);
    setError("");
    setDate(value);
  }
  return (
    <div className="daily-cash">
      {error && <ErrorBanner error={error} />}
      <section className="panel finance-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">
              {cash ? `Movimentos de ${formatIsoDate(cash.date)}` : "Movimentos"}
            </span>
            <h2>Caixa do dia</h2>
            <p className="panel-help">
              Tudo o que entrou e saiu do caixa no dia escolhido, separado por
              forma de pagamento.
            </p>
          </div>
          <label className="daily-cash-date">
            Data
            <input
              type="date"
              value={date}
              onChange={(event) => changeDate(event.target.value)}
            />
          </label>
        </div>
        {!cash ? (
          !error && <LoadingBlock />
        ) : cash.movements.length === 0 ? (
          <div className="finance-filter-empty">
            <EmptyState
              title="Nenhum movimento neste dia"
              copy="Escolha outra data no campo acima. Baixas de parcelas, estornos, contas pagas e comissões pagas aparecem aqui."
            />
            {date !== today && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => changeDate(today)}
              >
                Ver o caixa de hoje
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="daily-cash-summary">
              <ul className="daily-cash-totals" aria-label="Totais do dia">
                <li>
                  <span>Entradas</span>
                  <strong className="cash-in">
                    {currency.format(cash.totalInflowInCents / 100)}
                  </strong>
                </li>
                <li>
                  <span>Saídas</span>
                  <strong className="cash-out">
                    {currency.format(cash.totalOutflowInCents / 100)}
                  </strong>
                </li>
                <li
                  className={cash.balanceInCents < 0 ? "negative" : "positive"}
                >
                  <span>Saldo</span>
                  <strong>{currency.format(cash.balanceInCents / 100)}</strong>
                </li>
              </ul>
            </div>
            <div className="daily-cash-groups">
              {dailyCashGroups(cash).map((group) => (
                <section
                  className="daily-cash-group"
                  key={group.method}
                  aria-label={`Movimentos em ${group.label}`}
                >
                  <div className="daily-cash-group-head">
                    <h3>{group.label}</h3>
                    <dl className="daily-cash-group-totals">
                      <div>
                        <dt>Entradas</dt>
                        <dd className="cash-in">
                          {currency.format(group.inflow / 100)}
                        </dd>
                      </div>
                      <div>
                        <dt>Saídas</dt>
                        <dd className="cash-out">
                          {currency.format(group.outflow / 100)}
                        </dd>
                      </div>
                      <div>
                        <dt>Saldo</dt>
                        <dd className={group.balance < 0 ? "cash-out" : undefined}>
                          {currency.format(group.balance / 100)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="finance-table finance-list daily-cash-table">
                    {group.movements.map((movement) => {
                      const kind = dailyCashKinds[movement.kind];
                      const amount = dailyCashMovementAmount(movement);
                      return (
                        <div className="finance-row" key={movement.id}>
                          <span className="finance-due">
                            {saoPauloTime.format(new Date(movement.occurredAt))}
                          </span>
                          <span>
                            <span className={`status-pill ${kind.pill}`}>
                              {kind.label}
                            </span>
                          </span>
                          <div className="finance-item">
                            <strong title={movement.description}>
                              {movement.description}
                            </strong>
                            {movement.counterpart && (
                              <span>{movement.counterpart}</span>
                            )}
                          </div>
                          <strong
                            className={`finance-amount ${amount.effect < 0 ? "cash-out" : "cash-in"}`}
                          >
                            {amount.text}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const forecastHorizons = [3, 6, 12] as const;

function forecastFlowCells(flow: FinanceForecastFlow) {
  return (
    <>
      <td className="cash-in">{currency.format(flow.inflowInCents / 100)}</td>
      <td className="cash-out">{currency.format(flow.outflowInCents / 100)}</td>
      <td className={flow.balanceInCents < 0 ? "negative" : undefined}>
        {currency.format(flow.balanceInCents / 100)}
      </td>
    </>
  );
}

function forecastIsEmpty(forecast: FinanceForecast) {
  const flows = [
    forecast.totals.confirmed,
    forecast.totals.projected,
    forecast.overdue,
  ];
  return flows.every(
    (flow) => flow.inflowInCents === 0 && flow.outflowInCents === 0,
  );
}

function FinanceForecastSection() {
  const [months, setMonths] = useState(6);
  const [forecast, setForecast] = useState<FinanceForecast | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .financeForecast(months)
      .then((data) => active && setForecast(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [months]);
  const overdue = forecast?.overdue;
  const hasOverdue =
    !!overdue && (overdue.inflowInCents !== 0 || overdue.outflowInCents !== 0);
  return (
    <div className="daily-cash">
      {error && <ErrorBanner error={error} />}
      <section className="panel finance-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">
              {forecast
                ? `${formatCompetence(forecast.startMonth)} a ${formatCompetence(forecast.endMonth)}`
                : "Próximos meses"}
            </span>
            <h2>Previsão</h2>
            <p className="panel-help">
              Quanto deve entrar e sair do caixa nos próximos meses, mês a mês.
            </p>
          </div>
          <label className="daily-cash-date">
            Horizonte
            <select
              value={months}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value === months) return;
                setForecast(null);
                setError("");
                setMonths(value);
              }}
            >
              {forecastHorizons.map((value) => (
                <option key={value} value={value}>
                  {value} meses
                </option>
              ))}
            </select>
          </label>
        </div>
        {!forecast ? (
          !error && <LoadingBlock />
        ) : forecastIsEmpty(forecast) ? (
          <EmptyState
            title="Nada previsto no período"
            copy="Venda um plano, lance uma conta a pagar ou cadastre uma despesa fixa para ver a previsão. Você também pode aumentar o horizonte."
          />
        ) : (
          <div className="forecast-body">
            <dl className="forecast-legend" aria-label="Legenda da previsão">
              <div>
                <dt>Confirmado</dt>
                <dd>
                  Parcelas de clientes e contas a pagar já lançadas e em
                  aberto, pelo vencimento.
                </dd>
              </div>
              <div>
                <dt>Projetado</dt>
                <dd>
                  Renovações automáticas de planos e despesas fixas que ainda
                  vão ser lançadas.
                </dd>
              </div>
            </dl>
            {hasOverdue && overdue && (
              <p className="forecast-overdue">
                <strong>Em atraso</strong> (vencidos antes de{" "}
                {formatCompetence(forecast.startMonth)}, fora dos saldos):{" "}
                <span className="cash-in">
                  {currency.format(overdue.inflowInCents / 100)}
                </span>{" "}
                a receber ·{" "}
                <span className="cash-out">
                  {currency.format(overdue.outflowInCents / 100)}
                </span>{" "}
                a pagar
              </p>
            )}
            <div className="forecast-scroll">
              <table className="forecast-table" aria-label="Previsão por mês">
                <thead>
                  <tr>
                    <th scope="col" rowSpan={2}>
                      Mês
                    </th>
                    <th scope="colgroup" colSpan={3}>
                      Confirmado
                    </th>
                    <th scope="colgroup" colSpan={3}>
                      Projetado
                    </th>
                    <th scope="col" rowSpan={2}>
                      Saldo do mês
                    </th>
                  </tr>
                  <tr>
                    <th scope="col">Entradas</th>
                    <th scope="col">Saídas</th>
                    <th scope="col">Saldo</th>
                    <th scope="col">Entradas</th>
                    <th scope="col">Saídas</th>
                    <th scope="col">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.months.map((item) => (
                    <tr key={item.month}>
                      <th scope="row">{formatCompetence(item.month)}</th>
                      {forecastFlowCells(item.confirmed)}
                      {forecastFlowCells(item.projected)}
                      <td
                        className={`forecast-balance${item.balanceInCents < 0 ? " negative" : ""}`}
                      >
                        {currency.format(item.balanceInCents / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {forecastFlowCells(forecast.totals.confirmed)}
                    {forecastFlowCells(forecast.totals.projected)}
                    <td
                      className={`forecast-balance${forecast.totals.balanceInCents < 0 ? " negative" : ""}`}
                    >
                      {currency.format(forecast.totals.balanceInCents / 100)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** Competência AAAA-MM exibida como MM/AAAA. */
function formatCompetence(month: string) {
  const [year, value] = month.split("-");
  return `${value}/${year}`;
}

function recurringPayableStatus(
  item: RecurringPayable,
  currentMonth: string,
): "active" | "paused" | "ended" {
  // No mês final a despesa ainda gera conta: só depois dele fica encerrada.
  if (item.endMonth && item.endMonth < currentMonth) return "ended";
  return item.active ? "active" : "paused";
}

/** Corpo completo do PUT: a rota substitui o modelo inteiro. */
function recurringPayableInput(
  item: RecurringPayable,
  changes: Partial<RecurringPayableInput> = {},
): RecurringPayableInput {
  return {
    description: item.description,
    ...(item.supplier ? { supplier: item.supplier } : {}),
    categoryId: item.categoryId,
    costCenterId: item.costCenterId,
    amountInCents: item.amountInCents,
    dayOfMonth: item.dayOfMonth,
    startMonth: item.startMonth,
    ...(item.endMonth ? { endMonth: item.endMonth } : {}),
    active: item.active,
    ...changes,
  };
}

function RecurringPayablesSection({
  workspace,
  onGenerated,
  editable,
}: {
  workspace: FinancialWorkspace;
  onGenerated: () => Promise<void>;
  /** Sem edição do Financeiro: lista só para consulta. */
  editable: boolean;
}) {
  const [items, setItems] = useState<RecurringPayable[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [modal, setModal] = useState(false);
  const [ending, setEnding] = useState<RecurringPayable | null>(null);
  const currentMonth = saoPauloToday().slice(0, 7);
  useEffect(() => {
    let active = true;
    api
      .recurringPayables()
      .then((data) => active && setItems(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);
  async function refresh() {
    // O workspace gera as contas do mês; a lista vem depois, já com a última competência.
    await onGenerated();
    setItems(await api.recurringPayables());
  }
  async function update(
    item: RecurringPayable,
    changes: Partial<RecurringPayableInput>,
  ) {
    setError("");
    setBusyId(item.id);
    try {
      await api.updateRecurringPayable(
        item.id,
        recurringPayableInput(item, changes),
      );
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId("");
    }
  }
  return (
    <div className="recurring-payables">
      {error && <ErrorBanner error={error} />}
      <section className="panel finance-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Recorrentes</span>
            <h2>Despesas fixas</h2>
            <p className="panel-help">
              Contas que se repetem todo mês, como aluguel e internet. Cada mês
              vira uma conta a pagar no dia do vencimento.
            </p>
          </div>
          {editable && (
            <button className="primary-button" onClick={() => setModal(true)}>
              <Plus size={18} /> Nova despesa fixa
            </button>
          )}
        </div>
        {!items ? (
          !error && <LoadingBlock />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhuma despesa fixa"
            copy="Cadastre aluguel, internet e outras contas mensais para gerá-las automaticamente."
          />
        ) : (
          <div className="finance-table finance-list recurring-table">
            <div className="finance-row finance-head" aria-hidden="true">
              <span>Descrição e período</span>
              <span>Vencimento</span>
              <span className="finance-amount">Valor mensal</span>
              <span>Situação</span>
              <span className="finance-actions">Ações</span>
            </div>
            {items.map((item) => {
              const status = recurringPayableStatus(item, currentMonth);
              const period = [
                `Desde ${formatCompetence(item.startMonth)}`,
                item.endMonth && `até ${formatCompetence(item.endMonth)}`,
                item.resumedFromMonth &&
                  `Reativada em ${formatCompetence(item.resumedFromMonth)}`,
                item.lastCompetence
                  ? `Última gerada: ${formatCompetence(item.lastCompetence)}`
                  : "Nenhuma conta gerada",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div className="finance-row" key={item.id}>
                  <div className="finance-item">
                    <strong title={item.description}>{item.description}</strong>
                    <span>
                      {item.supplier || item.categoryName} ·{" "}
                      {item.costCenterName}
                    </span>
                    <span title={period}>{period}</span>
                  </div>
                  <span className="finance-due">
                    <span className="finance-label">Vencimento </span>
                    <span>Dia {item.dayOfMonth}</span>
                  </span>
                  <strong className="finance-amount cash-out">
                    {signedCurrency(-item.amountInCents)}
                  </strong>
                  <span>
                    <span className={`status-pill ${status}`}>
                      {status === "ended"
                        ? "Encerrada"
                        : status === "paused"
                          ? "Pausada"
                          : "Ativa"}
                    </span>
                  </span>
                  <div className="finance-actions">
                    {editable && status !== "ended" && (
                      <>
                        <button
                          className="secondary-button button-sm"
                          aria-label={`${item.active ? "Pausar" : "Reativar"} ${item.description}`}
                          disabled={busyId === item.id}
                          onClick={() =>
                            void update(item, { active: !item.active })
                          }
                        >
                          {item.active ? "Pausar" : "Reativar"}
                        </button>
                        <button
                          className="danger-button button-sm"
                          aria-label={`Encerrar ${item.description}`}
                          disabled={busyId === item.id}
                          onClick={() => setEnding(item)}
                        >
                          Encerrar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {modal && (
        <RecurringPayableModal
          workspace={workspace}
          currentMonth={currentMonth}
          onClose={() => setModal(false)}
          onCreated={() => {
            setModal(false);
            void refresh().catch((cause: Error) => setError(cause.message));
          }}
        />
      )}
      {ending && (
        <RecurringPayableEndModal
          item={ending}
          currentMonth={currentMonth}
          onClose={() => setEnding(null)}
          onEnded={() => {
            setEnding(null);
            void refresh().catch((cause: Error) => setError(cause.message));
          }}
        />
      )}
    </div>
  );
}

function RecurringPayableEndModal({
  item,
  currentMonth,
  onClose,
  onEnded,
}: {
  item: RecurringPayable;
  currentMonth: string;
  onClose: () => void;
  onEnded: () => void;
}) {
  const [endMonth, setEndMonth] = useState(item.endMonth ?? currentMonth);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const month = competenceMonthSchema.safeParse(endMonth);
    if (!month.success) {
      setError("Informe o último mês da despesa.");
      return;
    }
    if (month.data < item.startMonth) {
      setError("O mês final não pode ser anterior ao mês inicial.");
      return;
    }
    setLoading(true);
    try {
      await api.updateRecurringPayable(
        item.id,
        recurringPayableInput(item, { endMonth: month.data }),
      );
      onEnded();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Encerrar despesa fixa"
      subtitle={`${item.description}: nenhuma conta é gerada depois do último mês.`}
      busy={loading}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Último mês
          <input
            required
            type="month"
            min={item.startMonth}
            value={endMonth}
            onChange={(event) => setEndMonth(event.target.value)}
          />
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
            Voltar
          </button>
          <button className="primary-button" disabled={loading}>
            {loading ? "Salvando…" : "Encerrar despesa fixa"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RecurringPayableModal({
  workspace,
  currentMonth,
  onClose,
  onCreated,
}: {
  workspace: FinancialWorkspace;
  currentMonth: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const expenseCategories = workspace.categories.filter(
    (item) => item.kind === "expense" && item.active,
  );
  const costCenters = workspace.costCenters.filter((item) => item.active);
  const [form, setForm] = useState({
    description: "",
    supplier: "",
    categoryId: expenseCategories[0]?.id ?? "",
    costCenterId: costCenters[0]?.id ?? "",
    amountInCents: 0,
    dayOfMonth: Math.min(new Date().getDate(), 28),
    startMonth: currentMonth,
    endMonth: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const { supplier, endMonth, ...rest } = form;
    try {
      await api.createRecurringPayable({
        ...rest,
        description: rest.description.trim(),
        ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
        ...(endMonth ? { endMonth } : {}),
        active: true,
      });
      onCreated();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Nova despesa fixa"
      subtitle="A conta a pagar é gerada todo mês, do mês inicial até o final."
      busy={loading}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Descrição
          <input
            required
            minLength={3}
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
          Valor mensal
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
            {costCenters.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dia do vencimento
          <input
            required
            type="number"
            min="1"
            max="28"
            step="1"
            value={form.dayOfMonth}
            onChange={(event) =>
              setForm({ ...form, dayOfMonth: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Mês inicial
          <input
            required
            type="month"
            value={form.startMonth}
            onChange={(event) =>
              setForm({ ...form, startMonth: event.target.value })
            }
          />
        </label>
        <label>
          Mês final (opcional)
          <input
            type="month"
            min={form.startMonth}
            value={form.endMonth}
            onChange={(event) =>
              setForm({ ...form, endMonth: event.target.value })
            }
          />
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
            Voltar
          </button>
          <button
            className="primary-button"
            disabled={loading || !form.categoryId || !form.costCenterId}
          >
            {loading ? "Salvando…" : "Cadastrar despesa fixa"}
          </button>
        </div>
      </form>
    </Modal>
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
      busy={loading}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
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
        <div className="modal-actions">
        <button className="primary-button" onClick={() => window.print()}>
          Imprimir recibo
        </button>
        </div>
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
  const [finalizing, setFinalizing] = useState<ClinicalRecord | null>(null);
  const canManage = canEdit("clinical");

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
    replaceRecord(await api.finalizeClinicalRecord(record.id));
    setFinalizing(null);
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
          canManage && (
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
          )
        }
      />
      {!canManage && <ReadOnlyNotice module="clinical" />}
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
                    className="secondary-button button-sm"
                    onClick={() => setHistoryRecord(record)}
                  >
                    <FileClock size={16} />
                    Histórico
                  </button>
                  {canManage && record.status === "draft" && (
                    <>
                      <button
                        className="secondary-button button-sm"
                        onClick={() => setEditor(record)}
                      >
                        Editar
                      </button>
                      <button
                        className="primary-button button-sm"
                        onClick={() => setFinalizing(record)}
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
        <ClinicalWorkspacePanel patients={patients} editable={canManage} />
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
      {finalizing && (
        <FinalizeRecordModal
          record={finalizing}
          onClose={() => setFinalizing(null)}
          onConfirm={() => finalize(finalizing)}
        />
      )}
    </>
  );
}

type ActionMenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
};

/** Menu de ações secundárias acessível por teclado (setas, Esc fecha e devolve o foco ao botão). */
function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const entries = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      entries[(index + 1) % entries.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      entries[(index - 1 + entries.length) % entries.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      entries[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      entries[entries.length - 1]?.focus();
    }
  }

  return (
    <div className="action-menu" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className="secondary-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={16} /> {label}
      </button>
      {open && (
        <div className="action-menu-list" role="menu" aria-label={label} ref={menuRef} onKeyDown={onMenuKeyDown}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? "action-menu-item action-menu-item-danger" : "action-menu-item"}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ClinicalWorkspacePanel({
  patients,
  editable,
}: {
  patients: Patient[];
  /** Sem edição de Prontuários: só consulta, impressão e exportação. */
  editable: boolean;
}) {
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
            {editable && (
              <div className="clinical-workspace-main-actions">
                <button
                  className="secondary-button"
                  onClick={() => setEditor("assessment")}
                >
                  Nova avaliação
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setEditor("measurement")}
                >
                  Nova medição
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
                <ActionMenu
                  label="Mais ações"
                  items={[
                    { label: "Novo modelo", onSelect: () => setEditor("template") },
                    { label: "Novo objetivo", onSelect: () => setEditor("goal") },
                    { label: "Anexar arquivo", icon: <Paperclip size={15} />, onSelect: () => setEditor("attachment") },
                    { label: "Encerrar tratamento", danger: true, onSelect: () => setEditor("closure") },
                  ]}
                />
              </div>
            )}
            <div className="clinical-workspace-output-actions">
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
                      {editable && goal.status === "active" && (
                        <button
                          className="text-button button-sm"
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
                    className="text-button button-sm"
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
      busy={loading}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
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
      busy={loading}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
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
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.createAssessmentTemplate(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
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
      busy={saving}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="primary-button" disabled={saving}>Salvar modelo</button>
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
  const [saving, setSaving] = useState(false);
  const template = templates.find((item) => item.id === templateId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
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
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Nova avaliação configurável"
      subtitle="Os dados são preservados com o modelo e a autoria usados no registro."
      busy={saving}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="primary-button" disabled={!templateId || saving}>
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
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.createTherapeuticGoal(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Novo objetivo terapêutico"
      subtitle="Defina um resultado observável e, quando aplicável, uma meta numérica."
      busy={saving}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="primary-button" disabled={saving}>Salvar objetivo</button>
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
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.createClinicalMeasurement(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Nova medição clínica"
      subtitle="Registre medidas comparáveis para acompanhar a evolução ao longo do tempo."
      busy={saving}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="primary-button" disabled={saving}>Registrar medição</button>
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
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.createTreatmentClosure(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Encerramento do tratamento"
      subtitle="O registro é permanente e compõe a linha do tempo clínica."
      busy={saving}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="primary-button" disabled={saving}>Registrar encerramento</button>
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
      busy={loading}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
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

/**
 * Clientes da Agenda: quem vê Clientes recebe o cadastro completo (detalhes do atendimento); os
 * demais, só a lista mínima para escolher o cliente (`GET /patients/options`).
 */
async function fetchAgendaPatients(): Promise<{ options: PatientOption[]; records: Patient[] }> {
  if (!canView("patients")) return { options: await api.patientOptions(), records: [] };
  const records = await api.patients();
  return { options: records, records };
}

function AgendaPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [cancellingBlock, setCancellingBlock] = useState<ScheduleBlock | null>(null);
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  // Cadastro completo só para quem vê Clientes (dados do cliente nos detalhes do atendimento).
  const [patientRecords, setPatientRecords] = useState<Patient[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const canSchedule = canEdit("agenda");
  // Bloqueios exigem editar Agenda E Clientes (mesma regra da API).
  const canBlock = canEdit("agenda", "patients");
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
  // Feriados usam a data da clínica (aaaa-mm-dd), com início e fim inclusivos.
  const lastRangeDay = new Date(rangeEnd);
  lastRangeDay.setDate(lastRangeDay.getDate() - 1);
  const holidayFrom = localIsoDate(rangeStart);
  const holidayTo = localIsoDate(lastRangeDay);
  const holidayNames = new Map(holidays.map((item) => [item.date, item.name]));
  const selectedHoliday = holidayNames.get(date);
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
      api.holidays(holidayFrom, holidayTo),
      api.professionals(),
      api.rooms(),
      api.services(),
      fetchAgendaPatients(),
    ])
      .then(
        ([
          appointmentData,
          blockData,
          groupSessionData,
          holidayData,
          professionalData,
          roomData,
          serviceData,
          patientData,
        ]) => {
          if (!active) return;
          setAppointments(appointmentData);
          setBlocks(blockData);
          setGroupSessions(groupSessionData);
          setHolidays(holidayData);
          setProfessionals(professionalData);
          setRooms(roomData);
          setServices(serviceData);
          setPatients(patientData.options);
          setPatientRecords(patientData.records);
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
  }, [rangeFrom, rangeTo, holidayFrom, holidayTo]);
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
          (canBlock || canSchedule) && (
          <div className="page-actions">
            {canBlock && (
            <button
              className="secondary-button"
              onClick={() => setBlockModalOpen(true)}
            >
              Bloquear horário
            </button>
            )}
            {canSchedule && (
            <button
              className="primary-button"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={18} />
              Novo atendimento
            </button>
            )}
          </div>
          )
        }
      />
      {!canSchedule && <ReadOnlyNotice module="agenda" />}
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
                className={`tab-button ${view === "day" ? "active" : ""}`}
                onClick={() => setView("day")}
              >
                Dia
              </button>
              <button
                className={`tab-button ${view === "week" ? "active" : ""}`}
                onClick={() => setView("week")}
              >
                Semana
              </button>
              <button
                className={`tab-button ${view === "month" ? "active" : ""}`}
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
                const dayHoliday = holidayNames.get(dayKey);
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
                      aria-label={`${day.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}: ${dayAppointments.length} atendimentos, ${dayGroups.length} aulas de turma, ${dayBlocks.length} bloqueios${dayHoliday ? `, feriado: ${dayHoliday}` : ""}`}
                    >
                      <strong>{day.getDate()}</strong>
                      {dayAppointments.length > 0 && <small>{dayAppointments.length} {dayAppointments.length === 1 ? "atendimento" : "atendimentos"}</small>}
                    </button>
                    <span className="month-day-events">
                      {dayHoliday && <span className="month-holiday" title={`Feriado: ${dayHoliday}`}>{dayHoliday}</span>}
                      {dayEvents.slice(0, 2).map((entry) =>
                        entry.kind === "appointment" ? (
                          <button type="button" className="month-event" key={entry.appointment.id} onClick={() => setSelectedAppointmentId(entry.appointment.id)} aria-label={`Detalhes de ${entry.appointment.patientName}, ${timeLabel.format(new Date(entry.appointment.startsAt))} a ${timeLabel.format(new Date(entry.appointment.endsAt))}${visitTypeBadgeText(entry.appointment) ? `, ${visitTypeBadgeText(entry.appointment)}` : ""}`}>
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
              const dayHoliday = holidayNames.get(dayKey);
              return (
                <section key={dayKey}>
                  <header className={dayKey === localIsoDate() ? "today" : ""}>
                    <span>
                      {day.toLocaleDateString("pt-BR", { weekday: "short" })}
                    </span>
                    <strong>{day.getDate()}</strong>
                  </header>
                  <div>
                    {dayHoliday && <span className="week-holiday">Feriado: {dayHoliday}</span>}
                    {sortAgendaEntries({ appointments: dayAppointments, groupSessions: dayGroups, blocks: dayBlocks }).map((entry) =>
                      entry.kind === "block" ? (
                        <ScheduleBlockCard
                          compact
                          block={entry.block}
                          key={entry.block.id}
                          onCancel={canBlock ? () => setCancellingBlock(entry.block) : undefined}
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
                          <VisitTypeBadge appointment={entry.appointment} />
                        </article>
                      ),
                    )}
                    {!dayHoliday && dayAppointments.length === 0 && dayBlocks.length === 0 && dayGroups.length === 0 && (
                      <span className="week-empty">Livre</span>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : appointments.length === 0 && blocks.length === 0 && groupSessions.length === 0 ? (
          selectedHoliday ? (
            <div className="day-agenda">
              <p className="holiday-notice">Feriado: {selectedHoliday}</p>
              <EmptyState
                title="Sem atendimentos"
                copy="A agenda não aceita novos atendimentos nesta data."
              />
            </div>
          ) : (
            <EmptyState
              title="Dia disponível"
              copy="Não há atendimentos agendados para esta data."
            />
          )
        ) : (
          <div className="day-agenda">
            {selectedHoliday && <p className="holiday-notice">Feriado: {selectedHoliday}</p>}
            {sortAgendaEntries({ appointments, groupSessions, blocks }).map((entry) =>
              entry.kind === "block" ? (
                <ScheduleBlockCard
                  block={entry.block}
                  key={entry.block.id}
                  onCancel={canBlock ? () => setCancellingBlock(entry.block) : undefined}
                />
              ) : entry.kind === "group" ? (
                <GroupSessionCard session={entry.session} key={entry.session.id} />
              ) : (
                <AgendaCard
                  appointment={entry.appointment}
                  key={entry.appointment.id}
                  onOpen={() => setSelectedAppointmentId(entry.appointment.id)}
                  onHistory={() => setHistoryAppointment(entry.appointment)}
                  onStatus={canSchedule ? (status) => changeAppointmentStatus(entry.appointment, status) : undefined}
                />
              ),
            )}
          </div>
        )}
      </section>
      {modalOpen && (
        <AppointmentModal
          patients={patients}
          professionals={professionals}
          rooms={rooms}
          services={services}
          onPatientCreated={(patient) => {
            setPatients((items) => [...items.filter((item) => item.id !== patient.id), patient]);
            setPatientRecords((items) => [...items.filter((item) => item.id !== patient.id), patient]);
          }}
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
          patient={patientRecords.find((item) => item.id === selectedAppointment.patientId)}
          service={services.find((item) => item.id === selectedAppointment.serviceId)}
          onClose={() => setSelectedAppointmentId(null)}
          editable={canSchedule}
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
          holidayName={holidayNames.get(localIsoDate(eventsDay))}
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
      {cancellingBlock && (
        <CancelBlockModal
          block={cancellingBlock}
          onClose={() => setCancellingBlock(null)}
          onConfirm={() => cancelBlock(cancellingBlock)}
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
    const updated = await api.cancelScheduleBlock(block.id);
    setBlocks((items) => items.filter((item) => item.id !== updated.id));
    setCancellingBlock(null);
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
  holidayName,
  appointments,
  groupSessions,
  blocks,
  onClose,
  onOpenAppointment,
  onOpenDay,
}: {
  day: Date;
  holidayName: string | undefined;
  appointments: Appointment[];
  groupSessions: GroupSession[];
  blocks: ScheduleBlock[];
  onClose: () => void;
  onOpenAppointment: (id: string) => void;
  onOpenDay: () => void;
}) {
  const events = sortAgendaEntries({ appointments, groupSessions, blocks }).map((entry) =>
    entry.kind === "appointment"
      ? { kind: entry.kind, id: entry.appointment.id, startsAt: entry.startsAt, endsAt: entry.appointment.endsAt, title: entry.appointment.patientName, detail: `${entry.appointment.serviceName} · ${entry.appointment.professionalName} · ${statusLabel(entry.appointment.status)}`, color: entry.appointment.professionalColor, appointment: entry.appointment }
      : entry.kind === "group"
        ? { kind: entry.kind, id: entry.session.id, startsAt: entry.startsAt, endsAt: entry.session.endsAt, title: entry.session.groupName, detail: `${entry.session.professionalName} · ${entry.session.roomName}`, color: undefined, appointment: undefined }
        : { kind: entry.kind, id: entry.block.id, startsAt: entry.startsAt, endsAt: entry.block.endsAt, title: entry.block.reason, detail: `Bloqueio · ${[entry.block.professionalName, entry.block.roomName].filter(Boolean).join(" · ")}`, color: undefined, appointment: undefined },
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
        {holidayName && <p className="holiday-notice">Feriado: {holidayName}</p>}
        {count > 0 && (
          <ul className="day-events-list">
            {events.map((event) => {
              const content = (
                <>
                  <time>{timeLabel.format(new Date(event.startsAt))}–{timeLabel.format(new Date(event.endsAt))}</time>
                  <span>
                    <strong>{event.color && <i style={{ background: event.color }} aria-hidden="true" />}{event.title}</strong>
                    <small>{event.detail}</small>
                    {event.appointment && <VisitTypeBadge appointment={event.appointment} />}
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
  /** Sem `onCancel` (sem permissão de edição) o botão de cancelar não aparece. */
  onCancel?: (() => void) | undefined;
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
      {block.status === "active" && !compact && onCancel && (
        <button className="danger-button button-sm" onClick={onCancel}>
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
  /** Sem `onStatus` (agenda só de consulta) o status fica desabilitado. */
  onStatus?: ((status: AppointmentStatus) => void) | undefined;
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
          <VisitTypeBadge appointment={appointment} />
        </div>
        <div className="agenda-actions">
          <select
            value={appointment.status}
            onChange={(event) =>
              onStatus?.(event.target.value as AppointmentStatus)
            }
            disabled={!onStatus}
            title={onStatus ? undefined : "Seu acesso à Agenda é só de consulta."}
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
            className="icon-button button-sm"
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
  editable,
}: {
  appointment: Appointment;
  patient: Patient | undefined;
  service: Service | undefined;
  onClose: () => void;
  onReschedule: () => void;
  onCancelled: (appointment: Appointment) => void;
  /** Sem edição da Agenda: só consulta (sem cancelar, remarcar ou registrar satisfação). */
  editable: boolean;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const canChange = appointment.status === "scheduled" || appointment.status === "confirmed";
  // Atendimento de lead não tem prontuário, NPS nem histórico de cliente.
  const isLead = Boolean(appointment.leadId);
  const isCompleted = appointment.status === "completed" && !isLead;
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
    <Modal title="Detalhes do atendimento" subtitle={appointment.patientName} busy={cancelling} onClose={onClose}>
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
            {visitTypeBadgeText(appointment) && <div><small>Tipo</small><strong><VisitTypeBadge appointment={appointment} /></strong></div>}
          </div>
        </section>
        {isLead ? (
        <section className="appointment-detail-section">
          <h3>Lead</h3>
          <div className="appointment-detail-grid">
            <div className="detail-wide"><small>Nome</small><strong>{appointment.leadName ?? appointment.patientName}</strong></div>
          </div>
          <p className="appointment-lead-note">Prontuário, pesquisa de satisfação e histórico ficam disponíveis depois que o lead for convertido em cliente.</p>
        </section>
        ) : (
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
              <div className="detail-wide emergency-contact"><small>Contato de emergência</small><strong>{patient.emergencyContactName || patient.emergencyContactPhone ? [patient.emergencyContactName, patient.emergencyContactPhone && formatPhone(patient.emergencyContactPhone)].filter(Boolean).join(" · ") : "Não informado"}</strong></div>
              <div><small>Situação</small><strong>{patient.status === "active" ? "Ativo" : "Inativo"}</strong></div>
              <div><small>Etiquetas</small><strong>{patient.tags?.length ? patient.tags.join(", ") : "Nenhuma"}</strong></div>
              {patient.notes && <div className="detail-wide"><small>Observações do cliente</small><strong>{patient.notes}</strong></div>}
            </div>
          ) : <p>Dados cadastrais indisponíveis no momento.</p>}
        </section>
        )}
        {error && <div className="form-error">{error}</div>}
        {confirmCancel && (
          <div className="appointment-cancel-confirm">
            <strong>Cancelar este atendimento?</strong>
            <span>O horário será liberado na agenda.</span>
            <div>
              <button className="secondary-button" onClick={() => setConfirmCancel(false)} disabled={cancelling}>Voltar</button>
              <button className="danger-button" onClick={() => void cancelAppointment()} disabled={cancelling}>{cancelling ? "Cancelando…" : "Confirmar cancelamento"}</button>
            </div>
          </div>
        )}
        {editable && !confirmCancel && canChange && (
          <div className="appointment-detail-actions">
            <button className="danger-button" onClick={() => setConfirmCancel(true)}>Cancelar atendimento</button>
            <button className="primary-button" onClick={onReschedule}>Remarcar atendimento</button>
          </div>
        )}
        {isCompleted && survey && (
          <p className="appointment-satisfaction">Satisfação registrada: nota {survey.score}</p>
        )}
        {isCompleted && !survey && alreadyRated && (
          <p className="appointment-satisfaction">Este atendimento já tem pesquisa de satisfação registrada.</p>
        )}
        {editable && isCompleted && surveyChecked && !survey && !alreadyRated && (
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
    const patientId = appointment.patientId;
    if (!patientId) {
      setError("Atendimento de lead não tem pesquisa de satisfação.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const trimmed = comment.trim();
      onSaved(
        await api.createSatisfactionSurvey({
          patientId,
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
    <Modal title="Registrar satisfação" subtitle={appointment.patientName} eyebrow="Pesquisa NPS" busy={saving} onClose={onClose}>
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
      busy={loading}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
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

function AppointmentPatientPicker({ patients, value, onChange, inputRef, onAddPatient, busy }: {
  patients: PatientOption[];
  value: string;
  onChange: (id: string, patient?: PatientOption) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onAddPatient: (() => void) | undefined;
  busy: boolean;
}) {
  const selected = patients.find((patient) => patient.id === value);
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<PatientOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const listId = useId();
  const term = query?.trim() ?? "";
  const choices = term ? results : patients;
  useEffect(() => {
    let current = true;
    if (!term) return;
    const timer = window.setTimeout(() => {
      api.patientOptions(term).then((items) => {
        if (current) { setResults(items); setLoading(false); }
      }).catch((cause: Error) => {
        if (current) { setError(cause.message); setLoading(false); }
      });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [term, query]);
  function choose(patient: PatientOption) {
    onChange(patient.id, patient);
    setQuery(patient.fullName);
    setOpen(false);
    setActive(-1);
  }
  return (
    <div className="appointment-patient-picker">
      <div className="patient-picker-header">
        <label htmlFor={`${listId}-input`}>Cliente</label>
        {onAddPatient && <button type="button" className="secondary-button button-sm"
          onClick={onAddPatient} disabled={busy}>Adicionar cliente</button>}
      </div>
      <input
        id={`${listId}-input`} ref={inputRef} role="combobox" required
        placeholder="Buscar por nome ou CPF" autoComplete="off"
        value={query ?? selected?.fullName ?? ""}
        aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value); onChange(""); setOpen(true); setActive(-1);
          setResults([]); setError(""); setLoading(Boolean(event.target.value.trim()));
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActive((index) => choices.length ? (event.key === "ArrowDown"
              ? (index + 1) % choices.length
              : (index <= 0 ? choices.length - 1 : index - 1)) : -1);
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (choices[active]) choose(choices[active]);
          } else if (event.key === "Escape" && open) {
            event.stopPropagation(); setOpen(false);
          }
        }}
      />
      {open && <div className="patient-picker-results">
        {loading ? <p role="status">Buscando clientes…</p> : error ? <p role="alert">{error}</p>
          : choices.length === 0 ? <p role="status">Nenhum cliente encontrado</p> : null}
        <ul id={listId} role="listbox" aria-label="Clientes encontrados">
          {!loading && !error && choices.map((patient, index) => (
            <li id={`${listId}-${index}`} key={patient.id} role="option"
              aria-selected={patient.id === value} className={index === active ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(patient)}>
              {patient.fullName}
            </li>
          ))}
        </ul>
      </div>}
    </div>
  );
}

function AppointmentModal({
  patients,
  professionals,
  rooms,
  services,
  onClose,
  onCreated,
  onPatientCreated,
}: {
  patients: PatientOption[];
  professionals: Professional[];
  rooms: Room[];
  services: Service[];
  onClose: () => void;
  onCreated: (appointment: Appointment[]) => void;
  onPatientCreated: (patient: Patient) => void;
}) {
  const [form, setForm] = useState({
    patientId: "",
    visitType: "" as AppointmentVisitType | "",
    professionalId: "",
    roomId: "",
    serviceId: "",
    startsAt: "",
    notes: "",
    recurring: false,
    occurrences: 4,
    intervalWeeks: 1,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [pickerVersion, setPickerVersion] = useState(0);
  const patientInputRef = useRef<HTMLInputElement>(null);
  const patientChoices = selectedPatient && !patients.some((patient) => patient.id === selectedPatient.id)
    ? [...patients, selectedPatient] : patients;
  function closePatientModal() {
    setPatientModalOpen(false);
    requestAnimationFrame(() => patientInputRef.current?.focus());
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.patientId) {
      setError("Selecione um cliente para confirmar o atendimento.");
      patientInputRef.current?.focus();
      return;
    }
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
        visitType: form.visitType as AppointmentVisitType,
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
    <>
    <Modal
      title="Novo atendimento"
      subtitle="A duração e o valor seguem o serviço selecionado."
      busy={loading}
      inactive={patientModalOpen}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <div>
          <AppointmentPatientPicker key={pickerVersion} patients={patientChoices}
            value={form.patientId} inputRef={patientInputRef}
            busy={loading} onAddPatient={canEdit("patients") ? () => setPatientModalOpen(true) : undefined}
            onChange={(patientId, patient) => {
              if (patient) setSelectedPatient(patient);
              setForm((current) => ({ ...current, patientId }));
            }} />
        </div>
        <label>
          Tipo
          <select
            required
            value={form.visitType}
            onChange={(e) => setForm({ ...form, visitType: e.target.value as AppointmentVisitType })}
          >
            <option value="">Selecione</option>
            {appointmentVisitTypes.map((item) => (
              <option value={item} key={item}>
                {visitTypeLabels[item]}
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
            <option value="">Selecione</option>
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
            <option value="">Selecione</option>
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
            <option value="">Selecione</option>
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button className="primary-button" disabled={loading || !form.patientId}>
            {loading ? "Agendando…" : "Confirmar atendimento"}
          </button>
        </div>
      </form>
    </Modal>
    {patientModalOpen && <AppointmentPatientCreateModal onClose={closePatientModal} onSaved={(patient) => {
      onPatientCreated(patient);
      setSelectedPatient(patient);
      setPickerVersion((version) => version + 1);
      setForm((current) => ({ ...current, patientId: patient.id }));
      closePatientModal();
    }} />}
    </>
  );
}

function AppointmentPatientCreateModal({ onClose, onSaved }: {
  onClose: () => void; onSaved: (patient: Patient) => void;
}) {
  const configuredTags = usePatientTags();
  return <PatientModal patient={undefined} configuredTags={configuredTags} onClose={onClose} onSaved={onSaved} />;
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
      busy={loading}
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
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
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

/**
 * Aviso de edição não salva (fechar gaveta ou sair pelo menu): Salvar (só segue se der certo; o
 * erro fica no modal), Descartar (volta aos valores salvos e segue) ou Continuar editando.
 */
function UnsavedChangesModal({
  section,
  onSave,
  onDiscard,
  onContinue,
}: {
  section: string;
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onContinue: () => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      await onSave();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      eyebrow="Alterações não salvas"
      title="Salvar as alterações?"
      subtitle={`${section} tem edição que ainda não foi salva.`}
      busy={saving}
      onClose={onContinue}
    >
      <form className="form-grid" noValidate onSubmit={(event) => void save(event)}>
        <p className="span-2">
          Salve para manter o que foi alterado ou descarte para voltar aos valores salvos.
        </p>
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onContinue}
            disabled={saving}
          >
            Continuar editando
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={onDiscard}
            disabled={saving}
          >
            Descartar alterações
          </button>
          <button type="submit" className="primary-button" disabled={saving} autoFocus>
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Edição pendente de um formulário: `confirmLeave(seguir)` segue direto sem alteração ou abre o
 * aviso; com alteração, também segura a saída pelo menu do app (ver `NavigationGuardContext`).
 */
function useUnsavedChangesPrompt({
  section,
  dirty,
  save,
  discard,
}: {
  section: string;
  dirty: boolean;
  save: () => Promise<void>;
  discard: () => void;
}) {
  const [pending, setPending] = useState<{ proceed: () => void } | null>(null);
  const navigate = useNavigate();
  const registerGuard = useContext(NavigationGuardContext);
  useEffect(() => {
    if (!dirty) return;
    return registerGuard((to) => {
      setPending({ proceed: () => void navigate(to) });
      return true;
    });
  }, [dirty, registerGuard, navigate]);
  const confirmLeave = useCallback(
    (proceed: () => void) => {
      if (dirty) setPending({ proceed });
      else proceed();
    },
    [dirty],
  );
  const modal = pending && (
    <UnsavedChangesModal
      section={section}
      onSave={async () => {
        await save();
        setPending(null);
        pending.proceed();
      }}
      onDiscard={() => {
        discard();
        setPending(null);
        pending.proceed();
      }}
      onContinue={() => setPending(null)}
    />
  );
  return { confirmLeave, modal };
}

/**
 * Seção recolhível (gaveta) com o visual de `.panel`/`panel-head`: começa fechada e abre pelo
 * título — botão nativo dentro do `h2` (Enter/Espaço), com `aria-expanded`/`aria-controls`.
 * Fechada, o conteúdo não é montado: componentes que buscam os próprios dados só buscam ao abrir
 * (e mostram carregando/erro nesse momento). Pode ser controlada (`open` + `onOpenChange`).
 */
function CollapsibleSection({
  title,
  eyebrow,
  className,
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  title: string;
  eyebrow?: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const bodyId = useId();
  function toggle() {
    if (controlledOpen === undefined) setInnerOpen(!open);
    onOpenChange?.(!open);
  }
  return (
    <section
      className={`panel collapsible-section${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
    >
      <div className="panel-head collapsible-head">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>
            <button
              type="button"
              className="text-button collapsible-toggle"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={toggle}
            >
              {title}
            </button>
          </h2>
        </div>
        <ChevronDown className="collapsible-chevron" size={20} aria-hidden="true" />
      </div>
      <div id={bodyId} className="collapsible-body" hidden={!open}>
        {open ? children : null}
      </div>
    </section>
  );
}

function AdminPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [audit, setAudit] = useState<AdminAuditEvent[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [userForm, setUserForm] = useState<AdminUser | "new" | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [toggling, setToggling] = useState<AdminUser | null>(null);
  // Gaveta de Usuários controlada aqui: "Novo usuário" abre a gaveta junto com o modal.
  const [usersOpen, setUsersOpen] = useState(false);
  // Dados da clínica: valores salvos (base do "descartar") e gaveta controlada para avisar ao fechar.
  const [savedSettings, setSavedSettings] = useState<ClinicSettings | null>(null);
  const [clinicOpen, setClinicOpen] = useState(false);
  const clinicDirty =
    settings !== null &&
    savedSettings !== null &&
    JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const clinicPrompt = useUnsavedChangesPrompt({
    section: "Dados da clínica",
    dirty: clinicDirty,
    save: async () => {
      if (!settings) return;
      const saved = await api.updateClinicSettings(settings);
      setSettings(saved);
      setSavedSettings(saved);
      // Como o submit do formulário: recarrega (auditoria inclusa).
      void load();
    },
    discard: () => setSettings(savedSettings),
  });

  async function load() {
    try {
      const [userData, settingData, auditData] = await Promise.all([
        api.adminUsers(),
        api.clinicSettings(),
        api.adminAuditEvents(),
      ]);
      setUsers(userData);
      setSettings(settingData);
      setSavedSettings(settingData);
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
      api.adminAuditEvents(),
    ])
      .then(([userData, settingData, auditData]) => {
        if (!active) return;
        setUsers(userData);
        setSettings(settingData);
        setSavedSettings(settingData);
        setAudit(auditData);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);

  function finish(message: string) {
    setUserForm(null);
    setResetting(null);
    setToggling(null);
    setError("");
    setNotice(message);
    void load();
  }

  return (
    <>
      <PageHeader
        eyebrow="Controle operacional"
        title="Configurações"
        description="Usuários, permissões, dados da clínica e auditoria administrativa."
        action={
          <button
            className="primary-button"
            onClick={() => {
              setNotice("");
              setUsersOpen(true);
              setUserForm("new");
            }}
          >
            <Plus size={17} /> Novo usuário
          </button>
        }
      />
      {error && <ErrorBanner error={error} />}
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      <div className="admin-grid">
        <CollapsibleSection
          className="admin-users"
          eyebrow="Acessos"
          title="Usuários"
          open={usersOpen}
          onOpenChange={setUsersOpen}
        >
          {users === null ? (
            !error && <LoadingBlock />
          ) : users.length === 0 ? (
            <EmptyState
              title="Nenhum usuário"
              copy="Cadastre a equipe em “Novo usuário”."
            />
          ) : (
            users.map((item) => (
              <article key={item.id} className="admin-user-row">
                <div className="admin-user-info">
                  <strong>{item.fullName}</strong>
                  <small>
                    {roleLabels[item.role]}
                    {item.jobTitle ? ` · ${item.jobTitle}` : ""}
                  </small>
                  <small className="admin-user-email">{item.email}</small>
                  <small>{userAccessSummary(item)}</small>
                  <small>{userCommissionSummary(item)}</small>
                  {!item.active && (
                    <div className="admin-user-tags">
                      <span className="status-pill cancelled">Inativo</span>
                    </div>
                  )}
                </div>
                <div className="admin-user-actions">
                  <button
                    className="secondary-button button-sm"
                    aria-label={`Editar ${item.fullName}`}
                    onClick={() => {
                      setNotice("");
                      setUserForm(item);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    className={item.active ? "danger-button button-sm" : "secondary-button button-sm"}
                    onClick={() => {
                      setNotice("");
                      setToggling(item);
                    }}
                  >
                    {item.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    className="secondary-button button-sm"
                    onClick={() => {
                      setNotice("");
                      setResetting(item);
                    }}
                  >
                    Redefinir senha
                  </button>
                </div>
              </article>
            ))
          )}
        </CollapsibleSection>
        <CollapsibleSection
          className="admin-settings"
          eyebrow="Organização"
          title="Dados da clínica"
          open={clinicOpen}
          onOpenChange={(next) => {
            if (next) setClinicOpen(true);
            else clinicPrompt.confirmLeave(() => setClinicOpen(false));
          }}
        >
          {!settings ? (
            !error && <LoadingBlock />
          ) : (
            <form
              className="clinical-form"
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  const saved = await api.updateClinicSettings(settings);
                  setSettings(saved);
                  setSavedSettings(saved);
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
              <div className="modal-actions">
                <button className="primary-button">Salvar configurações</button>
              </div>
            </form>
          )}
        </CollapsibleSection>
        <RelationshipSettingsSection canEdit />
        <HolidaysSection />
        <PatientTagsSection canEdit />
        <CollapsibleSection
          className="admin-audit"
          eyebrow="Rastreabilidade"
          title="Auditoria recente"
        >
          {users === null ? (
            // Usuários, dados e auditoria chegam juntos no mesmo carregamento da página.
            !error && <LoadingBlock />
          ) : audit.length === 0 ? (
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
        </CollapsibleSection>
      </div>
      {clinicPrompt.modal}
      {userForm && (
        <UserFormModal
          user={userForm === "new" ? null : userForm}
          users={users ?? []}
          onUserUpdated={(updated) =>
            setUsers((current) =>
              current
                ? current.some((item) => item.id === updated.id)
                  ? current.map((item) =>
                      item.id === updated.id ? updated : item,
                    )
                  : [...current, updated]
                : current,
            )
          }
          onClose={() => setUserForm(null)}
          onSaved={(saved) =>
            finish(
              userForm === "new"
                ? `Usuário ${saved.fullName} criado.`
                : `Alterações de ${saved.fullName} salvas.`,
            )
          }
        />
      )}
      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => finish(`Senha de ${resetting.fullName} redefinida.`)}
        />
      )}
      {toggling && (
        <UserActiveModal
          user={toggling}
          onClose={() => setToggling(null)}
          onDone={(updated) =>
            finish(
              updated.active
                ? `${updated.fullName} voltou a ter acesso.`
                : `${updated.fullName} foi desativado(a).`,
            )
          }
        />
      )}
    </>
  );
}

/** Resumo do acesso na lista de usuários (não há padrão por perfil: só o que foi marcado). */
function userAccessSummary(user: AdminUser) {
  if (user.role === "admin") return "Acesso total";
  const view = user.modules.length;
  if (view === 0) return "Nenhum módulo (só Visão geral)";
  const edit = user.editModules.length;
  const viewLabel = `Vê ${view} ${view === 1 ? "módulo" : "módulos"}`;
  return edit === 0 ? `${viewLabel} · só visualiza` : `${viewLabel} · edita ${edit}`;
}

/** Erro ao salvar usuário; o 409 LAST_ADMIN ganha explicação própria. */
function userSaveErrorMessage(cause: unknown) {
  if (cause instanceof ApiClientError && cause.code === "LAST_ADMIN") {
    return "A clínica precisa de pelo menos um admin ativo. Torne outro usuário admin antes de rebaixar ou desativar este.";
  }
  return (cause as Error).message;
}

/** Lista sem duplicatas e na ordem dos módulos (a mesma do menu). */
function orderedModules(list: readonly AppModule[]) {
  return appModuleSchema.options.filter((module) => list.includes(module));
}

const percentageLabel = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

/** Resumo da lista de usuários: profissional da agenda ligado e percentual vigente hoje. */
function userCommissionSummary(user: AdminUser) {
  const agenda = user.professionalId
    ? `Agenda: ${user.professionalName ?? "profissional ligado"}`
    : "Sem profissional da agenda";
  const commission =
    user.commissionPercentage === undefined
      ? "Sem comissão vigente"
      : `Comissão ${percentageLabel.format(user.commissionPercentage)}%`;
  return `${agenda} · ${commission}`;
}

function loadCommissionProfessionals(
  onLoaded: (items: Professional[]) => void,
  onError: (message: string) => void,
) {
  api
    .professionals()
    .then(onLoaded)
    .catch((cause: Error) => onError(cause.message));
}

function percentageText(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

function isoDateLabel(value: string) {
  return shortDate.format(new Date(`${value}T12:00:00`));
}

/** Percentual digitado: vazio = sem comissão; `NaN` = inválido. */
function parsePercentage(text: string) {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : Number.NaN;
}

function UserFormModal({
  user,
  users,
  onUserUpdated,
  onClose,
  onSaved,
}: {
  user: AdminUser | null;
  users: AdminUser[];
  onUserUpdated: (updated: AdminUser) => void;
  onClose: () => void;
  onSaved: (saved: AdminUser) => void;
}) {
  // Usuário já gravado (o editado ou o recém-criado numa falha parcial): a próxima tentativa
  // é PATCH, nunca outro POST.
  const [current, setCurrent] = useState<AdminUser | null>(user);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(user?.role ?? "user");
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? "");
  // Usuário comum novo (ou admin sendo rebaixado) começa com tudo desmarcado: não há padrão.
  const startsCommon = user?.role === "user";
  const [modules, setModules] = useState<AppModule[]>(() =>
    startsCommon ? orderedModules(user.modules) : [],
  );
  const [editModules, setEditModules] = useState<AppModule[]>(() =>
    startsCommon ? orderedModules(user.editModules) : [],
  );
  const [copiedFrom, setCopiedFrom] = useState("");
  // Comissão: percentual vigente e data de hoje; só vira nova vigência se algo mudar.
  const today = saoPauloToday();
  const [percentage, setPercentage] = useState(
    percentageText(user?.commissionPercentage),
  );
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [savedCommission, setSavedCommission] = useState({
    percentage: parsePercentage(percentageText(user?.commissionPercentage)),
    effectiveFrom: today,
  });
  const [professionals, setProfessionals] = useState<Professional[] | null>(
    null,
  );
  const [professionalsError, setProfessionalsError] = useState("");
  const [selectedProfessional, setSelectedProfessional] = useState(
    user?.professionalId ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isAdmin = role === "admin";
  // Fontes para copiar: usuários comuns já cadastrados, menos o próprio.
  const copySources = users.filter(
    (item) => item.role === "user" && item.id !== current?.id,
  );

  useEffect(() => {
    let active = true;
    loadCommissionProfessionals(
      (items) => {
        if (active) setProfessionals(items);
      },
      (message) => {
        if (active) setProfessionalsError(message);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // Livres: sem os já ligados a outros usuários; o do próprio usuário continua na lista.
  const taken = new Set(
    users
      .filter((item) => item.id !== current?.id && item.professionalId)
      .map((item) => item.professionalId),
  );
  const professionalOptions = (professionals ?? []).filter(
    (item) =>
      item.id === current?.professionalId ||
      (item.active && !taken.has(item.id)),
  );

  const typedPercentage = parsePercentage(percentage);
  const commissionChanged =
    typedPercentage !== undefined &&
    (Number.isNaN(typedPercentage) ||
      typedPercentage !== savedCommission.percentage ||
      effectiveFrom !== savedCommission.effectiveFrom);
  const futureStart =
    commissionChanged && Boolean(effectiveFrom) && effectiveFrom > today;
  // Mesma data da vigência atual: a API corrige o percentual dela em vez de criar outra.
  const sameStart =
    commissionChanged &&
    Boolean(current?.commissionEffectiveFrom) &&
    effectiveFrom === current?.commissionEffectiveFrom;

  function copyPermissions(sourceId: string) {
    const source = copySources.find((item) => item.id === sourceId);
    if (!source) return;
    const view = orderedModules(source.modules);
    setModules(view);
    setEditModules(
      orderedModules(source.editModules).filter((module) =>
        view.includes(module),
      ),
    );
    setCopiedFrom(source.fullName);
  }
  function toggleView(module: AppModule, checked: boolean) {
    if (checked) {
      setModules((current) => orderedModules([...current, module]));
      return;
    }
    // Sem ver não há editar.
    setModules((current) => current.filter((item) => item !== module));
    setEditModules((current) => current.filter((item) => item !== module));
  }
  function toggleEdit(module: AppModule, checked: boolean) {
    if (!checked) {
      setEditModules((current) => current.filter((item) => item !== module));
      return;
    }
    // Editar implica ver.
    setEditModules((current) => orderedModules([...current, module]));
    setModules((current) => orderedModules([...current, module]));
  }

  function commissionError() {
    if (typedPercentage === undefined) {
      return savedCommission.percentage === undefined
        ? ""
        : "A comissão não pode ficar em branco: para não pagar comissão, informe 0%.";
    }
    if (!commissionChanged) return "";
    if (
      Number.isNaN(typedPercentage) ||
      typedPercentage < 0 ||
      typedPercentage > 100
    ) {
      return "Informe um percentual de comissão entre 0 e 100.";
    }
    if (!effectiveFrom) return "Informe a data em que a comissão passa a valer.";
    return "";
  }

  /**
   * Um botão grava tudo: dados e módulos (POST/PATCH), depois a ligação com o profissional
   * e a comissão (PUT), cada um só se mudou. Se um PUT falhar, o que já foi gravado fica.
   */
  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = commissionError();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError("");
    // Admin ou nada marcado grava `null` (admin: acesso total; usuário comum: nenhum módulo).
    const permissions =
      isAdmin || (modules.length === 0 && editModules.length === 0)
        ? { modules: null, editModules: null }
        : { modules, editModules };
    const title = jobTitle.trim();
    const commission =
      commissionChanged && typedPercentage !== undefined
        ? { percentage: typedPercentage, effectiveFrom }
        : undefined;
    let latest: AdminUser;
    try {
      latest = current
        ? await api.updateAdminUser(current.id, {
            fullName: fullName.trim(),
            role,
            active: current.active,
            jobTitle: title,
            ...permissions,
          })
        : await api.createAdminUser({
            fullName: fullName.trim(),
            email: email.trim(),
            password,
            role,
            ...(title ? { jobTitle: title } : {}),
            ...permissions,
            ...(commission ? { commission } : {}),
          });
    } catch (cause) {
      setError(userSaveErrorMessage(cause));
      setSaving(false);
      return;
    }
    // Na criação a comissão já foi junto no POST.
    const commissionByPut = current !== null ? commission : undefined;
    if (commission && !commissionByPut) {
      setSavedCommission({ percentage: commission.percentage, effectiveFrom });
    }
    let failed: "professional" | "commission" = "professional";
    try {
      if (selectedProfessional !== (latest.professionalId ?? "")) {
        latest = await api.setUserProfessional(
          latest.id,
          selectedProfessional || null,
        );
      }
      failed = "commission";
      if (commissionByPut) {
        latest = await api.setUserCommission(latest.id, commissionByPut);
      }
      onSaved(latest);
    } catch (cause) {
      const saved = latest;
      setCurrent(saved);
      onUserUpdated(saved);
      const part =
        failed === "professional"
          ? "a ligação com o profissional da agenda não foi salva"
          : "a comissão não foi salva";
      setError(
        `${current ? "Dados do usuário salvos" : `Usuário ${saved.fullName} criado`}, mas ${part}: ${(cause as Error).message} Ajuste e clique em “Salvar alterações” de novo.`,
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      title={current ? `Editar ${current.fullName}` : "Novo usuário"}
      subtitle={
        current
          ? current.email
          : "Acesso da equipe ao sistema, com cargo e módulos."
      }
      eyebrow="Usuários"
      busy={saving}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        <label className="span-2">
          Nome completo
          <input
            required
            minLength={3}
            maxLength={160}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
        {!current && (
          <>
            <label>
              E-mail de acesso
              <input
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Senha inicial
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Tipo
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            {userRoleSchema.options.map((item) => (
              <option value={item} key={item}>
                {roleLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cargo
          <input
            maxLength={80}
            placeholder="Ex.: Instrutora de Pilates"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
          />
        </label>
        {!current && (
          <p className="muted-copy span-2">
            A senha precisa de 10 caracteres ou mais, com letra maiúscula,
            minúscula e número. O cargo é só informativo: o acesso vem dos
            módulos abaixo.
          </p>
        )}
        <fieldset className="form-fieldset span-2">
          <legend>Módulos</legend>
          {isAdmin ? (
            <p className="muted-copy">
              Acesso total: o admin vê e edita todos os módulos, além da
              Administração.
            </p>
          ) : (
            <div className="permission-editor">
              {copySources.length > 0 && (
                <div className="permission-editor-head">
                  <label>
                    Copiar permissões de…
                    <select
                      value=""
                      onChange={(event) => copyPermissions(event.target.value)}
                    >
                      <option value="">Escolha um usuário</option>
                      {copySources.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  {copiedFrom && (
                    <p className="muted-copy" role="status">
                      Permissões copiadas de {copiedFrom}. Ajuste abaixo antes
                      de salvar, se precisar.
                    </p>
                  )}
                </div>
              )}
              <table className="permission-table">
                <thead>
                  <tr>
                    <th scope="col">Módulo</th>
                    <th scope="col">Ver</th>
                    <th scope="col">Editar</th>
                  </tr>
                </thead>
                <tbody>
                  {appModuleSchema.options.map((module) => (
                    <tr key={module}>
                      <th scope="row">{appModuleLabels[module]}</th>
                      <td>
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            aria-label={`Ver ${appModuleLabels[module]}`}
                            checked={modules.includes(module)}
                            onChange={(event) =>
                              toggleView(module, event.target.checked)
                            }
                          />
                          Ver
                        </label>
                      </td>
                      <td>
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            aria-label={`Editar ${appModuleLabels[module]}`}
                            checked={editModules.includes(module)}
                            onChange={(event) =>
                              toggleEdit(module, event.target.checked)
                            }
                          />
                          Editar
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted-copy">
                “Visão geral” aparece para todos; Administração (usuários,
                feriados e dados da clínica) é sempre só do admin.
              </p>
            </div>
          )}
        </fieldset>
        <fieldset className="form-fieldset span-2">
          <legend>Comissão</legend>
          <div className="commission-editor">
            <div className="form-fieldset-grid">
              <label>
                Comissão (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Sem comissão"
                  value={percentage}
                  onChange={(event) => setPercentage(event.target.value)}
                />
              </label>
              <label>
                Vale a partir de
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                />
              </label>
            </div>
            <p className="muted-copy">
              {current?.commissionPercentage !== undefined
                ? `Vigente hoje: ${percentageLabel.format(current.commissionPercentage)}%${current.commissionEffectiveFrom ? ` desde ${isoDateLabel(current.commissionEffectiveFrom)}` : ""}. Um percentual ou data novos criam uma nova vigência; o histórico é mantido.`
                : "Percentual sobre os atendimentos desta pessoa. Deixe em branco se ela não recebe comissão."}
            </p>
            {sameStart && (
              <p className="muted-copy" role="status">
                Vai corrigir o percentual desta vigência.
              </p>
            )}
            {futureStart && (
              <p className="muted-copy" role="status">
                {current?.commissionPercentage !== undefined
                  ? `Data futura: o percentual atual (${percentageLabel.format(current.commissionPercentage)}%) continua valendo até ${isoDateLabel(effectiveFrom)}.`
                  : `Data futura: a comissão só passa a valer em ${isoDateLabel(effectiveFrom)}.`}
              </p>
            )}
            {professionals === null && !professionalsError ? (
              <LoadingBlock />
            ) : professionalsError ? (
              <div className="form-error" role="alert">
                Não foi possível carregar os profissionais da agenda:{" "}
                {professionalsError}
              </div>
            ) : (
              <label>
                Profissional da agenda (opcional)
                <select
                  value={selectedProfessional}
                  onChange={(event) =>
                    setSelectedProfessional(event.target.value)
                  }
                >
                  <option value="">Nenhum</option>
                  {professionalOptions.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.fullName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="muted-copy">
              Ligue o profissional da agenda para contar os atendimentos desta
              pessoa na comissão.
            </p>
          </div>
        </fieldset>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button className="primary-button" disabled={saving}>
            {saving
              ? "Salvando…"
              : current
                ? "Salvar alterações"
                : "Criar usuário"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.resetAdminPassword(user.id, password);
      onDone();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Redefinir senha"
      subtitle={`${user.fullName} · ${user.email}`}
      eyebrow="Usuários"
      busy={saving}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        <label className="span-2">
          Nova senha
          <input
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <p className="muted-copy span-2">
          Mínimo de 10 caracteres, com letra maiúscula, minúscula e número.
        </p>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button className="primary-button" disabled={saving}>
            {saving ? "Salvando…" : "Redefinir senha"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UserActiveModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: (updated: AdminUser) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setSaving(true);
    setError("");
    try {
      onDone(
        await api.updateAdminUser(user.id, {
          fullName: user.fullName,
          role: user.role,
          active: !user.active,
        }),
      );
    } catch (cause) {
      setError(userSaveErrorMessage(cause));
      setSaving(false);
    }
  }
  return (
    <Modal
      title={user.active ? "Desativar usuário" : "Ativar usuário"}
      subtitle={`${user.fullName} · ${user.email}`}
      eyebrow="Usuários"
      busy={saving}
      onClose={onClose}
    >
      <div className="form-grid">
        <p className="span-2">
          {user.active
            ? `${user.fullName} perde o acesso imediatamente, inclusive nas sessões já abertas.`
            : `${user.fullName} volta a entrar com a senha atual e as mesmas permissões.`}
        </p>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Voltar
          </button>
          <button
            type="button"
            className={user.active ? "danger-button" : "primary-button"}
            onClick={() => void confirm()}
            disabled={saving}
          >
            {saving ? "Salvando…" : user.active ? "Desativar" : "Ativar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function HolidaysSection() {
  return (
    <CollapsibleSection className="admin-holidays" eyebrow="Agenda" title="Feriados">
      <HolidaysContent />
    </CollapsibleSection>
  );
}

/** Conteúdo da gaveta de Feriados: só monta (e busca a lista) quando a gaveta abre. */
function HolidaysContent() {
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ date: "", name: "" });
  const [saving, setSaving] = useState(false);
  const [deletingHoliday, setDeletingHoliday] = useState<Holiday | null>(null);

  useEffect(() => {
    let active = true;
    api
      .holidays()
      .then((data) => active && setHolidays(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const created = await api.createHoliday({ date: form.date, name: form.name.trim() });
      setHolidays((items) =>
        [...(items ?? []), created].sort((a, b) => a.date.localeCompare(b.date)),
      );
      setForm({ date: "", name: "" });
    } catch (cause) {
      setFormError(
        cause instanceof ApiClientError
          ? cause.message
          : "Não foi possível adicionar o feriado.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(holiday: Holiday) {
    try {
      await api.deleteHoliday(holiday.id);
    } catch (cause) {
      throw new Error(
        cause instanceof ApiClientError
          ? cause.message
          : "Não foi possível excluir o feriado.",
        { cause },
      );
    }
    setHolidays((items) => (items ?? []).filter((item) => item.id !== holiday.id));
    setDeletingHoliday(null);
  }

  return (
    <>
      <p className="muted-copy">
        Nos feriados a agenda não aceita novos atendimentos.
      </p>
      {error && <ErrorBanner error={error} />}
      {!holidays ? (
        !error && <LoadingBlock />
      ) : (
        <>
          <form className="form-grid holiday-form" onSubmit={(event) => void submit(event)}>
            <label>
              Data
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label>
              Nome do feriado
              <input
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            {formError && <div className="form-error span-2">{formError}</div>}
            <div className="modal-actions span-2">
              <button className="primary-button" disabled={saving}>
                <Plus size={17} />
                {saving ? "Adicionando…" : "Adicionar feriado"}
              </button>
            </div>
          </form>
          {holidays.length === 0 ? (
            <EmptyState
              title="Nenhum feriado cadastrado"
              copy="Adicione as datas em que a clínica não atende."
            />
          ) : (
            <div className="holiday-list">
              {holidays.map((holiday) => (
                <article key={holiday.id}>
                  <div>
                    <strong>{holiday.name}</strong>
                    <small>{formatIsoDate(holiday.date)}</small>
                  </div>
                  <button
                    type="button"
                    className="danger-button button-sm"
                    aria-label={`Excluir feriado ${holiday.name}`}
                    onClick={() => setDeletingHoliday(holiday)}
                  >
                    Excluir
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {deletingHoliday && (
        <DeleteHolidayModal
          holiday={deletingHoliday}
          onClose={() => setDeletingHoliday(null)}
          onConfirm={() => remove(deletingHoliday)}
        />
      )}
    </>
  );
}

function PatientTagsSection({ canEdit }: { canEdit: boolean }) {
  return (
    <CollapsibleSection className="admin-tags" eyebrow="Clientes" title="Etiquetas">
      <PatientTagsContent canEdit={canEdit} />
    </CollapsibleSection>
  );
}

function sortPatientTags(tags: PatientTag[]) {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Conteúdo da gaveta de Etiquetas: só monta (e busca a lista) quando a gaveta abre. Cada ação
 * (criar, editar, excluir) grava na hora; não há formulário pendente ao fechar a gaveta.
 */
function PatientTagsContent({ canEdit }: { canEdit: boolean }) {
  const [tags, setTags] = useState<PatientTag[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", color: DEFAULT_PATIENT_TAG_COLOR });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PatientTag | null>(null);
  const [deleting, setDeleting] = useState<PatientTag | null>(null);

  useEffect(() => {
    let active = true;
    api
      .patientTags()
      .then((data) => active && setTags(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setFormError("Informe o nome da etiqueta.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const created = await api.createPatientTag({ name, color: form.color });
      setTags((items) => sortPatientTags([...(items ?? []), created]));
      setForm({ name: "", color: form.color });
    } catch (cause) {
      setFormError(
        cause instanceof ApiClientError ? cause.message : "Não foi possível criar a etiqueta.",
      );
    } finally {
      setSaving(false);
    }
  }

  function replaceTag(updated: PatientTag) {
    setTags((items) => sortPatientTags((items ?? []).map((item) => (item.id === updated.id ? updated : item))));
  }

  async function remove(tag: PatientTag) {
    try {
      await api.deletePatientTag(tag.id);
    } catch (cause) {
      // Em uso (409): atualiza a contagem mostrada com a que a API devolveu.
      const count = cause instanceof ApiClientError ? cause.details?.patientCount : undefined;
      if (typeof count === "number") replaceTag({ ...tag, patientCount: count });
      throw new Error(
        cause instanceof ApiClientError ? cause.message : "Não foi possível excluir a etiqueta.",
        { cause },
      );
    }
    setTags((items) => (items ?? []).filter((item) => item.id !== tag.id));
    setDeleting(null);
  }

  return (
    <>
      <p className="muted-copy">
        Só as etiquetas daqui podem ser usadas no cadastro dos clientes, nos filtros e nos
        comunicados. Renomear atualiza os clientes que já têm a etiqueta.
      </p>
      {error && <ErrorBanner error={error} />}
      {!tags ? (
        !error && <LoadingBlock />
      ) : (
        <>
          {canEdit && (
            <form className="form-grid tag-form" onSubmit={(event) => void submit(event)} noValidate>
              <label className="span-2">
                Nome da etiqueta
                <input
                  maxLength={40}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <TagColorPicker
                value={form.color}
                previewName={form.name.trim() || "Nova etiqueta"}
                onChange={(color) => setForm({ ...form, color })}
              />
              {formError && (
                <div className="form-error span-2" role="alert">
                  {formError}
                </div>
              )}
              <div className="modal-actions span-2">
                <button className="primary-button" disabled={saving}>
                  <Plus size={17} />
                  {saving ? "Adicionando…" : "Adicionar etiqueta"}
                </button>
              </div>
            </form>
          )}
          {tags.length === 0 ? (
            <EmptyState
              title="Nenhuma etiqueta configurada"
              copy={
                canEdit
                  ? "Crie as etiquetas que a equipe vai usar nos clientes."
                  : "Peça a quem administra as configurações para criar as etiquetas."
              }
            />
          ) : (
            <ul className="tag-list" aria-label="Etiquetas configuradas">
              {tags.map((tag) => (
                <li key={tag.id}>
                  <div className="tag-list-info">
                    <PatientTagBadge name={tag.name} color={tag.color} />
                    <small>{countLabel(tag.patientCount, "cliente", "clientes")}</small>
                  </div>
                  {canEdit && (
                    <div className="tag-list-actions">
                      <button
                        type="button"
                        className="secondary-button button-sm"
                        aria-label={`Editar etiqueta ${tag.name}`}
                        onClick={() => setEditing(tag)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="danger-button button-sm"
                        aria-label={`Excluir etiqueta ${tag.name}`}
                        onClick={() => setDeleting(tag)}
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editing && (
        <PatientTagEditModal
          tag={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            replaceTag(updated);
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <ActionModal
          eyebrow="Etiquetas"
          title="Excluir etiqueta"
          subtitle={deleting.name}
          effect={
            deleting.patientCount > 0
              ? `A etiqueta “${deleting.name}” está em ${countLabel(deleting.patientCount, "cliente", "clientes")}. Etiqueta em uso não pode ser excluída: retire-a desses clientes antes.`
              : `A etiqueta “${deleting.name}” deixa de aparecer no cadastro dos clientes, nos filtros e nos comunicados.`
          }
          confirmLabel="Excluir etiqueta"
          danger
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/** Cor da etiqueta: paleta sugerida, seletor livre e prévia do selo (texto preto ou branco). */
function TagColorPicker({
  value,
  previewName,
  onChange,
}: {
  value: string;
  previewName: string;
  onChange: (color: string) => void;
}) {
  return (
    <fieldset className="form-fieldset span-2 tag-color-picker">
      <legend>Cor</legend>
      <div className="tag-palette" role="group" aria-label="Cores sugeridas">
        {patientTagPalette.map((item) => (
          <button
            type="button"
            key={item.color}
            className="tag-swatch"
            style={tagColorStyle(item.color)}
            aria-label={`Cor ${item.name}`}
            aria-pressed={value === item.color}
            title={item.name}
            onClick={() => onChange(item.color)}
          />
        ))}
      </div>
      <div className="tag-color-row">
        <label className="tag-custom-color">
          Outra cor
          <input type="color" value={value} onChange={(e) => onChange(normalizeTagColor(e.target.value))} />
        </label>
        <span className="tag-color-preview">
          Prévia
          <PatientTagBadge name={previewName} color={value} />
        </span>
      </div>
    </fieldset>
  );
}

function PatientTagEditModal({
  tag,
  onClose,
  onSaved,
}: {
  tag: PatientTag;
  onClose: () => void;
  onSaved: (tag: PatientTag) => void;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(normalizeTagColor(tag.color));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe o nome da etiqueta.");
      return;
    }
    const update = {
      ...(trimmed !== tag.name ? { name: trimmed } : {}),
      ...(color !== normalizeTagColor(tag.color) ? { color } : {}),
    };
    if (!update.name && !update.color) {
      onClose();
      return;
    }
    setSaving(true);
    setError("");
    try {
      onSaved(await api.updatePatientTag(tag.id, update));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Não foi possível salvar a etiqueta.");
      setSaving(false);
    }
  }

  return (
    <Modal
      eyebrow="Etiquetas"
      title="Editar etiqueta"
      subtitle={`${tag.name} · ${countLabel(tag.patientCount, "cliente", "clientes")}. Renomear atualiza esses clientes.`}
      busy={saving}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={(event) => void submit(event)} noValidate>
        <label className="span-2">
          Nome da etiqueta
          <input autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <TagColorPicker value={color} previewName={name.trim() || tag.name} onChange={setColor} />
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="primary-button" disabled={saving}>
            {saving ? "Salvando…" : "Salvar etiqueta"}
          </button>
        </div>
      </form>
    </Modal>
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
        description="Prazos e mensagens dos contatos sugeridos e etiquetas dos clientes."
      />
      <div className="settings-stack">
        <RelationshipSettingsSection canEdit={false} />
        <PatientTagsSection canEdit={canEdit("settings")} />
      </div>
    </>
  );
}

type CloseGuard = (proceed: () => void) => void;

function RelationshipSettingsSection({ canEdit }: { canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  // O conteúdo (que guarda a edição) registra aqui o aviso de alteração não salva.
  const closeGuard = useRef<CloseGuard | null>(null);
  const registerCloseGuard = useCallback((guard: CloseGuard | null) => {
    closeGuard.current = guard;
  }, []);
  return (
    <CollapsibleSection
      className="admin-relationship"
      eyebrow="Relacionamento"
      title="Prazos e mensagens"
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else if (closeGuard.current) closeGuard.current(() => setOpen(false));
        else setOpen(false);
      }}
    >
      <RelationshipSettingsContent canEdit={canEdit} registerCloseGuard={registerCloseGuard} />
    </CollapsibleSection>
  );
}

/** Conteúdo da gaveta de Prazos e mensagens: só monta (e busca os valores) quando a gaveta abre. */
function RelationshipSettingsContent({
  canEdit,
  registerCloseGuard,
}: {
  canEdit: boolean;
  registerCloseGuard: (guard: CloseGuard | null) => void;
}) {
  const [settings, setSettings] = useState<RelationshipSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<RelationshipSettings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const prompt = useUnsavedChangesPrompt({
    section: "Prazos e mensagens",
    dirty:
      canEdit &&
      settings !== null &&
      savedSettings !== null &&
      JSON.stringify(settings) !== JSON.stringify(savedSettings),
    save: async () => {
      if (!settings) return;
      const saved = await api.updateRelationshipSettings(settings);
      setSettings(saved);
      setSavedSettings(saved);
    },
    discard: () => setSettings(savedSettings),
  });
  const { confirmLeave } = prompt;
  useEffect(() => {
    registerCloseGuard(confirmLeave);
    return () => registerCloseGuard(null);
  }, [registerCloseGuard, confirmLeave]);

  useEffect(() => {
    let active = true;
    api
      .relationshipSettings()
      .then((data) => {
        if (!active) return;
        setSettings(data);
        setSavedSettings(data);
      })
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
      const saved = await api.updateRelationshipSettings(settings);
      setSettings(saved);
      setSavedSettings(saved);
      setNotice("Prazos e mensagens salvos.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {error && <ErrorBanner error={error} />}
      {!canEdit && (
        <p className="muted-copy">
          Somente um admin pode alterar estes valores.
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
            <div className="modal-actions">
            <button className="primary-button" disabled={saving}>
              {saving ? "Salvando…" : "Salvar prazos e mensagens"}
            </button>
            </div>
          )}
        </form>
      )}
      {prompt.modal}
    </>
  );
}

// Trava a rolagem do body enquanto houver modal/gaveta aberta. O contador cobre diálogos
// empilhados: só libera quando o último fecha.
let bodyScrollLocks = 0;
let bodyPaddingRightBeforeLock = "";

function useBodyScrollLock() {
  useLayoutEffect(() => {
    const body = document.body;
    if (bodyScrollLocks === 0) {
      bodyPaddingRightBeforeLock = body.style.paddingRight;
      const viewportWidth = document.documentElement.clientWidth;
      const scrollbarWidth = window.innerWidth - viewportWidth;
      // Compensa a barra de rolagem que some, para o layout não "pular" no desktop.
      if (viewportWidth > 0 && scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
      body.classList.add("modal-open");
    }
    bodyScrollLocks += 1;
    return () => {
      bodyScrollLocks -= 1;
      if (bodyScrollLocks === 0) {
        body.classList.remove("modal-open");
        body.style.paddingRight = bodyPaddingRightBeforeLock;
      }
    };
  }, []);
}

// Modais de ação (no lugar de prompt/confirm do navegador): título, frase com o efeito, campos do
// dado pedido e "Voltar"/"Confirmar" (destrutivas em danger-button). Esc fecha; Enter envia o
// formulário — o foco abre no primeiro campo ou, sem campos, no botão de confirmar. A validação e
// os erros da API aparecem no próprio modal (form-error).
function ActionModal({
  eyebrow,
  title,
  subtitle,
  effect,
  confirmLabel = "Confirmar",
  danger = false,
  validate,
  onConfirm,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  effect: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  validate?: () => string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const problem = validate?.() ?? "";
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onConfirm();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal eyebrow={eyebrow} title={title} subtitle={subtitle} busy={saving} onClose={onClose}>
      <form className="form-grid" noValidate onSubmit={(event) => void submit(event)}>
        <p className="span-2">{effect}</p>
        {children}
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Voltar
          </button>
          <button
            type="submit"
            className={danger ? "danger-button" : "primary-button"}
            disabled={saving}
            autoFocus={!children}
          >
            {saving ? "Salvando…" : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Valor digitado em reais (campo numérico) → centavos; null se vazio, inválido ou negativo.
function reaisToCents(value: string) {
  const amount = Number(value.replace(",", "."));
  if (value.trim() === "" || !Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function LeadLostModal({
  lead,
  onClose,
  onConfirm,
}: {
  lead: Lead;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  return (
    <ActionModal
      eyebrow="CRM comercial"
      title="Marcar lead como perdido"
      subtitle={lead.fullName}
      effect={`${lead.fullName} sai das oportunidades abertas e vai para a coluna Perdidos, com o motivo registrado no cartão.`}
      danger
      validate={() => (reason.trim() ? "" : "Informe o motivo da perda.")}
      onConfirm={() => onConfirm(reason.trim())}
      onClose={onClose}
    >
      <label className="span-2">
        Motivo da perda
        <input
          autoFocus
          maxLength={500}
          placeholder="Ex.: achou o valor acima do orçamento"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}

function LeadConvertModal({
  lead,
  onClose,
  onConfirm,
}: {
  lead: Lead;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <ActionModal
      eyebrow="CRM comercial"
      title="Converter lead em cliente"
      subtitle={`${lead.fullName} · ${formatPhone(lead.phone)}`}
      effect={`${lead.fullName} passa a ser cliente: se já houver um cliente com o mesmo telefone ou e-mail, o lead é ligado a ele; senão, um cadastro novo é criado com nome, telefone e e-mail do lead. Os agendamentos experimentais vão para o cliente e o lead vai para a coluna Ganhos.`}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

function PlanCancelModal({
  plan,
  onClose,
  onConfirm,
}: {
  plan: PatientPlan;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <ActionModal
      eyebrow="Planos"
      title="Cancelar plano"
      subtitle={`${plan.patientName} · ${plan.name}`}
      effect={`As parcelas em aberto deste plano são canceladas no Financeiro${plan.remainingSessions === 1 ? " e a sessão restante não poderá mais ser usada" : plan.remainingSessions > 1 ? ` e as ${plan.remainingSessions} sessões restantes não poderão mais ser usadas` : ""}. Um plano cancelado não pode ser reativado.`}
      danger
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

function ReceivableAdjustModal({
  receivable,
  onClose,
  onConfirm,
}: {
  receivable: Receivable;
  onClose: () => void;
  onConfirm: (amountInCents: number, reason: string) => Promise<void>;
}) {
  const [value, setValue] = useState(String(receivable.amountInCents / 100));
  const [reason, setReason] = useState("");
  return (
    <ActionModal
      eyebrow="Financeiro"
      title="Ajustar valor da parcela"
      subtitle={`${receivable.patientName} · ${receivable.description}`}
      effect={`Hoje a parcela vale ${currency.format(receivable.amountInCents / 100)}. O novo valor substitui o atual e a justificativa fica registrada no histórico.`}
      validate={() => {
        if (reaisToCents(value) === null) return "Informe o novo valor em reais (zero ou mais).";
        if (reason.trim().length < 5) return "Escreva a justificativa do ajuste (pelo menos 5 caracteres).";
        return "";
      }}
      onConfirm={() => onConfirm(reaisToCents(value) ?? 0, reason.trim())}
      onClose={onClose}
    >
      <label>
        Novo valor (R$)
        <input
          autoFocus
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <label className="span-2">
        Justificativa
        <input
          maxLength={500}
          placeholder="Ex.: desconto combinado com o cliente"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}

function FinanceRegistryModal({
  kind,
  onClose,
  onConfirm,
}: {
  kind: "category" | "costCenter";
  onClose: () => void;
  onConfirm: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const isCategory = kind === "category";
  return (
    <ActionModal
      eyebrow="Financeiro"
      title={isCategory ? "Nova categoria de despesa" : "Novo centro de custo"}
      subtitle="Cadastros do Financeiro"
      effect={
        isCategory
          ? "A categoria passa a aparecer na lista ao lançar uma despesa, para agrupar os gastos da clínica."
          : "O centro de custo passa a aparecer na lista ao lançar uma despesa, para separar os gastos por área."
      }
      confirmLabel="Salvar"
      validate={() =>
        name.trim().length >= 2 ? "" : "Informe um nome com pelo menos 2 caracteres."
      }
      onConfirm={() => onConfirm(name.trim())}
      onClose={onClose}
    >
      <label className="span-2">
        Nome
        <input
          autoFocus
          maxLength={100}
          placeholder={isCategory ? "Ex.: Material de limpeza" : "Ex.: Estúdio de Pilates"}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}

function RenegotiateModal({
  receivables,
  onClose,
  onConfirm,
}: {
  receivables: Receivable[];
  onClose: () => void;
  onConfirm: (input: {
    totalAmountInCents: number;
    installments: number;
    firstDueDate: string;
    reason: string;
  }) => Promise<void>;
}) {
  const total = receivables.reduce((sum, item) => sum + item.amountInCents, 0);
  const [value, setValue] = useState(String(total / 100));
  const [installments, setInstallments] = useState(String(receivables.length));
  const [firstDueDate, setFirstDueDate] = useState(saoPauloToday());
  const [reason, setReason] = useState("");
  const names = [...new Set(receivables.map((item) => item.patientName))].join(", ");
  const count = Number(installments);
  return (
    <ActionModal
      eyebrow="Financeiro"
      title="Renegociar parcelas"
      subtitle={`${names} · ${receivables.length} parcela${receivables.length === 1 ? "" : "s"} · ${currency.format(total / 100)}`}
      effect="As parcelas selecionadas são canceladas e substituídas pelas novas, com o valor total dividido igualmente e vencimentos mensais a partir da primeira data."
      validate={() => {
        if (reaisToCents(value) === null) return "Informe o novo valor total em reais (zero ou mais).";
        if (!Number.isInteger(count) || count < 1 || count > 36) return "Informe de 1 a 36 parcelas.";
        if (!firstDueDate) return "Escolha a data do primeiro vencimento.";
        if (reason.trim().length < 5) return "Escreva o motivo da renegociação (pelo menos 5 caracteres).";
        return "";
      }}
      onConfirm={() =>
        onConfirm({
          totalAmountInCents: reaisToCents(value) ?? 0,
          installments: count,
          firstDueDate,
          reason: reason.trim(),
        })
      }
      onClose={onClose}
    >
      <label>
        Novo valor total (R$)
        <input
          autoFocus
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <label>
        Número de parcelas
        <input
          type="number"
          min="1"
          max="36"
          step="1"
          value={installments}
          onChange={(event) => setInstallments(event.target.value)}
        />
      </label>
      <label>
        Primeiro vencimento
        <input
          type="date"
          value={firstDueDate}
          onChange={(event) => setFirstDueDate(event.target.value)}
        />
      </label>
      <label className="span-2">
        Motivo da renegociação
        <input
          maxLength={500}
          placeholder="Ex.: cliente pediu para parcelar o saldo"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}

function CommissionRuleModal({
  professionals,
  onClose,
  onConfirm,
}: {
  professionals: Professional[];
  onClose: () => void;
  onConfirm: (input: {
    professionalId: string;
    percentage: number;
    effectiveFrom: string;
  }) => Promise<void>;
}) {
  const [professionalId, setProfessionalId] = useState(professionals[0]?.id ?? "");
  const [percentage, setPercentage] = useState("30");
  const [effectiveFrom, setEffectiveFrom] = useState(saoPauloToday());
  const value = Number(percentage.replace(",", "."));
  return (
    <ActionModal
      eyebrow="Comissões"
      title="Nova regra de comissão"
      subtitle="Percentual do profissional sobre os atendimentos"
      effect="A partir da data escolhida, a comissão do profissional é calculada com este percentual sobre a base de cálculo de cada atendimento concluído."
      confirmLabel="Salvar"
      validate={() => {
        if (!professionalId) return "Cadastre um profissional na agenda antes de criar uma regra.";
        if (percentage.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) return "Informe um percentual entre 0 e 100.";
        if (!effectiveFrom) return "Informe a data em que a regra passa a valer.";
        return "";
      }}
      onConfirm={() => onConfirm({ professionalId, percentage: value, effectiveFrom })}
      onClose={onClose}
    >
      <label className="span-2">
        Profissional
        <select
          autoFocus
          value={professionalId}
          onChange={(event) => setProfessionalId(event.target.value)}
        >
          {professionals.length === 0 && <option value="">Nenhum profissional cadastrado</option>}
          {professionals.map((item) => (
            <option key={item.id} value={item.id}>
              {item.fullName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Percentual (%)
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          inputMode="decimal"
          value={percentage}
          onChange={(event) => setPercentage(event.target.value)}
        />
      </label>
      <label>
        Vale a partir de
        <input
          type="date"
          value={effectiveFrom}
          onChange={(event) => setEffectiveFrom(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}

function FinalizeRecordModal({
  record,
  onClose,
  onConfirm,
}: {
  record: ClinicalRecord;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const startsAt = new Date(record.appointmentStartsAt);
  return (
    <ActionModal
      eyebrow="Prontuários"
      title="Finalizar evolução"
      subtitle={`${record.patientName} · ${shortDate.format(startsAt)} às ${timeLabel.format(startsAt)}`}
      effect="Depois de finalizada, a evolução fica fechada e não poderá mais ser editada. Confira o texto antes de confirmar."
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

function CancelBlockModal({
  block,
  onClose,
  onConfirm,
}: {
  block: ScheduleBlock;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const startsAt = new Date(block.startsAt);
  const endsAt = new Date(block.endsAt);
  const who = block.professionalName ?? block.roomName;
  return (
    <ActionModal
      eyebrow="Agenda"
      title="Cancelar bloqueio"
      subtitle={`${block.reason} · ${shortDate.format(startsAt)}, ${timeLabel.format(startsAt)}–${timeLabel.format(endsAt)}`}
      effect={`O horário de ${shortDate.format(startsAt)}, das ${timeLabel.format(startsAt)} às ${timeLabel.format(endsAt)}${who ? ` (${who})` : ""}, volta a ficar livre para novos agendamentos.`}
      danger
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

function DeleteHolidayModal({
  holiday,
  onClose,
  onConfirm,
}: {
  holiday: Holiday;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <ActionModal
      eyebrow="Feriados"
      title="Excluir feriado"
      subtitle={`${holiday.name} · ${formatIsoDate(holiday.date)}`}
      effect={`A agenda volta a aceitar atendimentos em ${formatIsoDate(holiday.date)}.`}
      danger
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

// Pilha dos modais/gavetas abertos (o último aberto fica no topo): Esc fecha só o de cima e não
// faz nada enquanto ele salva (`busy`). Clicar no fundo não fecha — só o X, Esc ou os botões.
const escapeStack: symbol[] = [];

function useEscapeToClose(onClose: () => void, busy: boolean) {
  const latest = useRef({ onClose, busy });
  useEffect(() => {
    latest.current = { onClose, busy };
  });
  useEffect(() => {
    const id = Symbol("dialog");
    escapeStack.push(id);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || escapeStack[escapeStack.length - 1] !== id) return;
      if (!latest.current.busy) latest.current.onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const index = escapeStack.indexOf(id);
      if (index >= 0) escapeStack.splice(index, 1);
    };
  }, []);
}

export function Modal({
  title,
  subtitle,
  eyebrow = "Cadastro rápido",
  busy = false,
  inactive = false,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  eyebrow?: string;
  /** Salvamento em andamento: X e Esc ficam desativados. */
  busy?: boolean;
  /** Mantém o formulário montado, mas inacessível sob outro modal. */
  inactive?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useBodyScrollLock();
  useEscapeToClose(onClose, busy);
  // Id próprio: com modal sobre modal, cada um é nomeado pelo seu título.
  const titleId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!inactive && section && !section.contains(document.activeElement)) {
      section.querySelector<HTMLElement>("input, select, textarea, button:not(:disabled)")?.focus();
    }
  }, [inactive]);
  return (
    <div className="modal-backdrop" role="presentation" inert={inactive} aria-hidden={inactive || undefined}>
      <section
        ref={sectionRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = Array.from(sectionRef.current?.querySelectorAll<HTMLElement>(
            'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [tabindex="0"]',
          ) ?? []).filter((element) => !element.closest('[hidden], [inert]') && element.getAttribute("type") !== "hidden");
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id={titleId}>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar" disabled={busy}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Drawer({ title, subtitle, busy = false, onClose, children }: { title: string; subtitle: string; busy?: boolean; onClose: () => void; children: ReactNode }) {
  useBodyScrollLock();
  useEscapeToClose(onClose, busy);
  return (
    <div className="drawer-backdrop">
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer-head"><div><span className="eyebrow">Turmas</span><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar gaveta" autoFocus disabled={busy}><X size={20} /></button></header>
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
      <div className="group-slots-head"><div><h4>Dias e horários fixos</h4><p>Estes horários ficam reservados na agenda toda semana, com o profissional e a sala da turma.</p></div><button type="button" className="secondary-button button-sm" disabled={slots.length >= 14} onClick={addSlot}>Adicionar horário</button></div>
      {slots.length === 0 && <p className="group-empty">Adicione ao menos um dia e horário para a turma.</p>}
      {slots.map((slot, index) => (
        <div className="group-slot-row" key={index}>
          <label>Dia<select value={slot.weekday} onChange={(event) => onChange(slots.map((item, position) => position === index ? { ...item, weekday: Number(event.target.value) } : item))}>{weekDayNames.map((name, weekday) => <option key={name} value={weekday}>{name}</option>)}</select></label>
          <label>Início<input type="time" required value={slot.startTime} onChange={(event) => onChange(slots.map((item, position) => position === index ? { ...item, startTime: event.target.value } : item))} /></label>
          <label>Término<input type="time" required min={slot.startTime} value={slot.endTime} onChange={(event) => onChange(slots.map((item, position) => position === index ? { ...item, endTime: event.target.value } : item))} /></label>
          <button type="button" className="icon-button" aria-label={`Remover horário ${index + 1}`} onClick={() => onChange(slots.filter((_, position) => position !== index))}><X size={18} /></button>
        </div>
      ))}
    </div>
  );
}

function GroupsPage() {
  const weekDayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const [workspace, setWorkspace] = useState<GroupWorkspace | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<"create" | "enroll" | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = canEdit("groups");
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
          api.patientOptions(),
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
      api.patientOptions(),
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
    setSaving(true);
    try {
      await action();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
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
        action={canManage && (
          <div className="page-actions">
            <button className="secondary-button" onClick={() => setDrawer("enroll")}><UserPlus size={18} /> Matricular cliente</button>
            <button className="primary-button" onClick={() => setDrawer("create")}><Plus size={18} /> Nova turma</button>
          </div>
        )}
      />
      {!canManage && <ReadOnlyNotice module="groups" />}
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
          {drawer === "create" && <Drawer title="Nova turma" subtitle="Configure os dados e horários fixos." busy={saving} onClose={closeDrawers}>
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
              <div className="modal-actions span-2"><button className="primary-button" disabled={groupForm.weeklySlots.length === 0}>Criar turma</button></div>
            </form>
          </section>
          </Drawer>}
          {drawer === "enroll" && <Drawer title="Nova matrícula" subtitle="Escolha a turma e o cliente." busy={saving} onClose={closeDrawers}>
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
              <div className="modal-actions span-2"><button className="primary-button">Matricular</button></div>
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
                  <button className="secondary-button button-sm" onClick={() => openGroup(group)}>Abrir turma</button>
                </article>
              ))}
            </div>
          </section>

          {selectedGroup && <Drawer title={selectedGroup.name} subtitle={`${describeGroupSchedule(selectedGroup.weeklySlots ?? [])} · ${selectedGroup.professionalName}`} busy={saving} onClose={closeDrawers}>
            <div className="group-drawer-content">
              {error && <ErrorBanner error={error} />}
              {canManage && (
              <>
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
                  <div className="modal-actions span-2"><button className="primary-button" disabled={editingSlots.length === 0}>Salvar alterações</button></div>
                </form>
              </section>
              </>
              )}
              <section className="group-drawer-section">
                <h3>Participantes</h3>
                <div className="group-members">
                  {workspace?.enrollments.filter((item) => item.groupId === selectedGroup.id && item.status !== "cancelled").map((item) => (
                    <div key={item.id}><span>{item.patientName} · {item.status === "active" ? "Matriculado" : `Espera ${item.queuePosition}`}</span>{canManage && <button type="button" className="danger-button button-sm" aria-label={`Cancelar matrícula de ${item.patientName}`} onClick={() => void run(() => api.cancelGroupEnrollment(item.id))}><UserMinus size={14} aria-hidden="true" />Cancelar matrícula</button>}</div>
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
  // Sessão antiga (gravada antes dos módulos por usuário): completa com `/me` antes de montar o menu.
  const staleSession = authenticated && !hasAccessLists(user!);
  const logout = () => {
    clearSession();
    setUser(null);
  };
  useEffect(() => {
    if (!staleSession) return;
    let active = true;
    api
      .me()
      .then((fresh) => {
        if (!active) return;
        storeUser(fresh);
        setUser(fresh);
      })
      .catch(() => {
        if (!active) return;
        // Sem como confirmar as permissões: pede novo login.
        clearSession();
        setUser(null);
      });
    return () => {
      active = false;
    };
  }, [staleSession]);
  const allow = (module: AppModule, element: ReactNode) =>
    user?.modules?.includes(module) ? element : <Navigate to="/" replace />;
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
          ) : staleSession ? (
            <main className="session-check">
              <LoadingBlock />
            </main>
          ) : (
            <Shell user={user!} onLogout={logout}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/agenda" element={allow("agenda", <AgendaPage />)} />
                <Route path="/turmas" element={allow("groups", <GroupsPage />)} />
                <Route path="/clientes" element={allow("patients", <PatientsPage />)} />
                {/* Endereço antigo, mantido para links e favoritos já salvos. */}
                <Route path="/pacientes" element={<Navigate to="/clientes" replace />} />
                <Route
                  path="/planos"
                  element={allow("plans", <PlansPage canManage={canEdit("plans")} />)}
                />
                <Route path="/comercial" element={allow("crm", <CommercialPage />)} />
                <Route
                  path="/relacionamento"
                  element={allow("relationship", <RelationshipPage />)}
                />
                <Route
                  path="/comunicacoes"
                  element={allow("communications", <CommunicationsPage />)}
                />
                <Route path="/contratos" element={allow("contracts", <DocumentsPage />)} />
                <Route
                  path="/documentos"
                  element={<Navigate to="/contratos" replace />}
                />
                <Route
                  path="/prontuarios"
                  element={allow("clinical", <ClinicalRecordsPage />)}
                />
                <Route path="/financeiro" element={allow("finance", <FinancePage />)} />
                <Route path="/relatorios" element={allow("reports", <ReportsPage />)} />
                <Route
                  path="/configuracoes"
                  element={
                    user!.role === "admin" ? (
                      <AdminPage />
                    ) : (
                      allow("settings", <RelationshipSettingsPage />)
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
