import type { NotificationsSummary } from "@crm/contracts";
import {
  Bell,
  BellRing,
  Cake,
  CalendarClock,
  ListTodo,
  PauseCircle,
  PhoneCall,
  Receipt,
  WalletCards,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuthorization } from "../authorization-context";
import { useDataVersion } from "../shared/hooks/useDataVersion";

/** Painel suspenso do cabeçalho: fecha com Esc, clique fora ou ao escolher um item. */
function HeaderPopover({
  label,
  triggerLabel = label,
  trigger,
  triggerClassName,
  onOpen,
  children,
}: {
  label: string;
  /** Nome do botão, quando difere do painel (ex.: com a contagem de pendências). */
  triggerLabel?: string;
  trigger: ReactNode;
  triggerClassName: string;
  onOpen?: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  return (
    <div className="header-popover" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        title={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((current) => !current);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div className="header-popover-panel" role="dialog" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

type NotificationModule =
  "relationship" | "finance" | "agenda" | "crm" | "plans" | "communications";

interface NotificationGroup {
  key: string;
  label: string;
  detail: string;
  count: number;
  to: string;
  icon: ReactNode;
}

/**
 * Grupos do sino (QM13), cada um só para quem vê o módulo: aniversariantes de hoje
 * (Relacionamento), parcelas vencidas e despesas fixas a vencer (Financeiro), atendimentos a
 * finalizar (Agenda) e os retornos combinados: tarefas comerciais vencidas (Comercial),
 * contatos adiados que voltaram (Relacionamento), pausas com retorno previsto (Planos) e uma
 * linha por campanha automática com mensagens pendentes (Comunicações). Grupos zerados não
 * aparecem.
 */
function notificationGroups(
  summary: NotificationsSummary | null,
  canView: (module: NotificationModule) => boolean,
): NotificationGroup[] {
  if (!summary) return [];
  const groups: NotificationGroup[] = [];
  if (canView("relationship") && (summary.birthdaysToday ?? 0) > 0)
    groups.push({
      key: "birthdays",
      label: "Aniversariantes de hoje",
      detail: "Envie os parabéns em Relacionamento",
      count: summary.birthdaysToday ?? 0,
      to: "/relacionamento",
      icon: <Cake size={16} aria-hidden="true" />,
    });
  if (canView("finance") && (summary.overdueReceivables ?? 0) > 0)
    groups.push({
      key: "overdue",
      label: "Parcelas vencidas",
      detail: "Em aberto com vencimento já passado",
      count: summary.overdueReceivables ?? 0,
      to: "/financeiro",
      icon: <WalletCards size={16} aria-hidden="true" />,
    });
  if (canView("finance") && (summary.recurringPayablesDue ?? 0) > 0)
    groups.push({
      key: "recurring-payables",
      label: "Despesas fixas a vencer",
      detail: "No prazo de aviso ou vencidas, ainda sem pagamento",
      count: summary.recurringPayablesDue ?? 0,
      to: "/financeiro?aba=contas-a-pagar",
      icon: <Receipt size={16} aria-hidden="true" />,
    });
  if (canView("agenda") && (summary.pendingFinalization ?? 0) > 0)
    groups.push({
      key: "pending",
      label: "Atendimentos a finalizar",
      detail: "Já passaram e seguem agendados ou confirmados",
      count: summary.pendingFinalization ?? 0,
      to: "/agenda/a-finalizar",
      icon: <CalendarClock size={16} aria-hidden="true" />,
    });
  if (canView("crm") && (summary.overdueLeadTasks ?? 0) > 0)
    groups.push({
      key: "lead-tasks",
      label: "Tarefas comerciais vencidas",
      detail: "Retornos de leads com o horário já passado",
      count: summary.overdueLeadTasks ?? 0,
      to: "/comercial",
      icon: <ListTodo size={16} aria-hidden="true" />,
    });
  if (canView("relationship") && (summary.snoozedContactsDue ?? 0) > 0)
    groups.push({
      key: "snoozed",
      label: "Contatos adiados para retomar",
      detail: "O prazo do adiamento terminou",
      count: summary.snoozedContactsDue ?? 0,
      to: "/relacionamento",
      icon: <PhoneCall size={16} aria-hidden="true" />,
    });
  if (canView("plans") && (summary.pauseReturnsDue ?? 0) > 0)
    groups.push({
      key: "pause-returns",
      label: "Retornos de pausa previstos",
      detail: "Planos pausados com retorno previsto até hoje",
      count: summary.pauseReturnsDue ?? 0,
      to: "/planos",
      icon: <PauseCircle size={16} aria-hidden="true" />,
    });
  if (canView("communications"))
    for (const campaign of summary.autoCampaigns ?? [])
      if (campaign.pending > 0)
        groups.push({
          key: `auto-campaign:${campaign.id}`,
          label: `Campanha automática “${campaign.name}”`,
          detail: `${campaign.pending === 1 ? "Falta 1 pessoa" : `Faltam ${campaign.pending} pessoas`} para concluir a campanha de hoje`,
          count: campaign.pending,
          to: "/?aba=campanhas",
          icon: <BellRing size={16} aria-hidden="true" />,
        });
  return groups;
}

export function NotificationsMenu({
  onNavigate,
}: {
  onNavigate: (to: string) => void;
}) {
  const { canView } = useAuthorization();
  const watched = (
    [
      "relationship",
      "finance",
      "agenda",
      "crm",
      "plans",
      "communications",
    ] as const
  ).some((module) => canView(module));
  // Recarga silenciosa quando agenda, financeiro, clientes, contatos, leads ou planos
  // mudam (QC6).
  const version = useDataVersion(
    "agenda",
    "finance",
    "patients",
    "relationship",
    "crm",
    "plans",
    "communications",
  );
  const [summary, setSummary] = useState<NotificationsSummary | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!watched) return;
    let active = true;
    api
      .notifications()
      .then((data) => {
        if (!active) return;
        setSummary(data);
        setError("");
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar as notificações.");
      });
    return () => {
      active = false;
    };
  }, [watched, version, attempt]);
  const groups = notificationGroups(summary, canView);
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const loading = watched && summary === null && !error;
  return (
    <HeaderPopover
      label="Notificações"
      triggerLabel={
        total > 0
          ? `Notificações: ${total} ${total === 1 ? "pendência" : "pendências"}`
          : "Notificações"
      }
      triggerClassName="icon-button header-bell"
      // Abrir o sino confere de novo (os atendimentos a finalizar mudam com a hora).
      onOpen={() => setAttempt((value) => value + 1)}
      trigger={
        <>
          <Bell size={19} />
          {total > 0 && (
            <span className="header-bell-count" aria-hidden="true">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </>
      }
    >
      {(close) => (
        <>
          <strong className="header-popover-title">Notificações</strong>
          {error && (
            <div className="header-notifications-error">
              <p className="form-error" role="alert">
                {error}
              </p>
              <button
                type="button"
                className="secondary-button button-sm"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {loading ? (
            <div
              className="header-notifications-skeleton"
              role="status"
              aria-label="Carregando notificações"
            >
              <span />
              <span />
              <span />
            </div>
          ) : groups.length > 0 ? (
            <ul className="header-notifications">
              {groups.map((group) => (
                <li key={group.key}>
                  <button
                    type="button"
                    className="text-button header-notification-item"
                    onClick={() => {
                      close();
                      onNavigate(group.to);
                    }}
                  >
                    {group.icon}
                    <span>
                      <strong>{group.label}</strong>
                      <small>{group.detail}</small>
                    </span>
                    <span className="header-notification-count">
                      {group.count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !error && <p className="muted-copy">Nada pendente.</p>
          )}
        </>
      )}
    </HeaderPopover>
  );
}
