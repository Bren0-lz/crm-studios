import {
  defaultNotificationPreferences,
  notificationKinds,
  resolveNotificationPreferences,
  type NotificationKind,
  type PermissionKey,
  type NotificationPreferences,
  type NotificationsSummary,
} from "@crm/contracts";
import {
  BellRing,
  Cake,
  CalendarClock,
  ListTodo,
  PackageOpen,
  PauseCircle,
  PhoneCall,
  Receipt,
  WalletCards,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "../api";
import { useAuthorization } from "../authorization-context";
import { useDataVersion } from "../shared/hooks/useDataVersion";

type NotificationModule =
  | "relationship"
  | "finance"
  | "agenda"
  | "crm"
  | "plans"
  | "patients"
  | "communications";

/**
 * Nome, explicação, módulo e, quando o módulo não basta, a permissão de cada grupo (também
 * usados nas configurações).
 */
export const notificationKindDetails: Record<
  NotificationKind,
  {
    label: string;
    detail: string;
    module: NotificationModule;
    permission?: PermissionKey;
  }
> = {
  birthdays: {
    label: "Aniversariantes de hoje",
    detail: "Envie os parabéns em Relacionamento",
    module: "relationship",
  },
  overdueReceivables: {
    label: "Parcelas vencidas",
    detail: "Em aberto com vencimento já passado",
    module: "finance",
  },
  recurringPayables: {
    label: "Despesas fixas a vencer",
    detail: "No prazo de aviso ou vencidas, ainda sem pagamento",
    module: "finance",
  },
  pendingFinalization: {
    label: "Atendimentos a finalizar",
    detail: "Já passaram e seguem agendados ou confirmados",
    module: "agenda",
  },
  overdueLeadTasks: {
    label: "Tarefas comerciais vencidas",
    detail: "Retornos de leads com o horário já passado",
    module: "crm",
  },
  snoozedContacts: {
    label: "Contatos adiados para retomar",
    detail: "O prazo do adiamento terminou",
    module: "relationship",
  },
  pauseReturns: {
    label: "Retornos de pausa previstos",
    detail: "Planos pausados com retorno previsto até hoje",
    module: "plans",
  },
  lowStock: {
    label: "Estoque para repor",
    detail: "Produtos sem estoque ou no aviso de reposição",
    module: "patients",
    permission: "patients.inventory_view",
  },
  autoCampaigns: {
    label: "Campanhas automáticas",
    detail: "Mensagens do dia ainda não enviadas",
    module: "communications",
  },
};

export interface NotificationGroup {
  key: string;
  kind: NotificationKind;
  label: string;
  detail: string;
  count: number;
  to: string;
  icon: ReactNode;
}

/** Aviso flutuante de pendência nova. */
export interface NotificationAlert {
  id: number;
  group: NotificationGroup;
}

const iconProps = { size: 16, "aria-hidden": true } as const;

/**
 * Grupos do sino (QM13), cada um só para quem vê o módulo: aniversariantes de hoje
 * (Relacionamento), parcelas vencidas e despesas fixas a vencer (Financeiro), atendimentos a
 * finalizar (Agenda) e os retornos combinados: tarefas comerciais vencidas (Comercial),
 * contatos adiados que voltaram (Relacionamento), pausas com retorno previsto (Planos), produtos
 * a repor (Vendas, com permissão de ver estoque) e uma
 * linha por campanha automática com mensagens pendentes (Comunicações). Grupos zerados e os
 * desligados nas preferências não aparecem.
 */
export function notificationGroups(
  summary: NotificationsSummary | null,
  canViewKind: (kind: NotificationKind) => boolean,
  hiddenKinds: readonly NotificationKind[] = [],
): NotificationGroup[] {
  if (!summary) return [];
  const groups: NotificationGroup[] = [];
  const visible = (kind: NotificationKind) =>
    canViewKind(kind) && !hiddenKinds.includes(kind);
  function add(
    kind: Exclude<NotificationKind, "autoCampaigns">,
    count: number | undefined,
    to: string,
    icon: ReactNode,
  ) {
    if (!visible(kind) || !count) return;
    groups.push({
      key: kind,
      kind,
      label: notificationKindDetails[kind].label,
      detail: notificationKindDetails[kind].detail,
      count,
      to,
      icon,
    });
  }
  add(
    "birthdays",
    summary.birthdaysToday,
    "/relacionamento",
    <Cake {...iconProps} />,
  );
  add(
    "overdueReceivables",
    summary.overdueReceivables,
    "/financeiro",
    <WalletCards {...iconProps} />,
  );
  add(
    "recurringPayables",
    summary.recurringPayablesDue,
    "/financeiro?aba=contas-a-pagar",
    <Receipt {...iconProps} />,
  );
  add(
    "pendingFinalization",
    summary.pendingFinalization,
    "/agenda/a-finalizar",
    <CalendarClock {...iconProps} />,
  );
  add(
    "overdueLeadTasks",
    summary.overdueLeadTasks,
    "/comercial",
    <ListTodo {...iconProps} />,
  );
  add(
    "snoozedContacts",
    summary.snoozedContactsDue,
    "/relacionamento",
    <PhoneCall {...iconProps} />,
  );
  add(
    "pauseReturns",
    summary.pauseReturnsDue,
    "/planos",
    <PauseCircle {...iconProps} />,
  );
  add(
    "lowStock",
    summary.lowStockProducts,
    "/vendas?aba=estoque",
    <PackageOpen {...iconProps} />,
  );
  if (visible("autoCampaigns"))
    for (const campaign of summary.autoCampaigns ?? [])
      if (campaign.pending > 0)
        groups.push({
          key: `auto-campaign:${campaign.id}`,
          kind: "autoCampaigns",
          label: `Campanha automática “${campaign.name}”`,
          detail: `${campaign.pending === 1 ? "Falta 1 pessoa" : `Faltam ${campaign.pending} pessoas`} para concluir a campanha de hoje`,
          count: campaign.pending,
          to: "/?aba=campanhas",
          icon: <BellRing {...iconProps} />,
        });
  return groups;
}

/** Toque curto ao surgir pendência nova; sem áudio no navegador, fica em silêncio. */
export function playNotificationSound() {
  const AudioContextClass = window.AudioContext as
    typeof AudioContext | undefined;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5);
    oscillator.connect(gain).connect(context.destination);
    oscillator.onended = () => void context.close();
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
  } catch {
    // Navegador sem permissão de áudio: o aviso na tela basta.
  }
}

/** Tempo do aviso flutuante na tela. */
const ALERT_DURATION = 12_000;

/**
 * Estado das notificações do cabeçalho: contagens, preferências do usuário, conferência
 * automática no intervalo escolhido, avisos de pendência nova e os alertas do cabeçalho.
 */
export function useNotificationCenter() {
  const { can, canView: canViewModule } = useAuthorization();
  const canView = (kind: NotificationKind) => {
    const { module, permission } = notificationKindDetails[kind];
    return canViewModule(module) && (!permission || can(permission));
  };
  const availableKinds = notificationKinds.filter(canView);
  const watched = availableKinds.length > 0;
  // Recarga silenciosa quando agenda, financeiro, clientes, contatos, leads, planos ou
  // estoque mudam (QC6).
  const version = useDataVersion(
    "agenda",
    "finance",
    "patients",
    "relationship",
    "crm",
    "plans",
    "inventory",
    "communications",
  );
  const [summary, setSummary] = useState<NotificationsSummary | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    defaultNotificationPreferences,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [alerts, setAlerts] = useState<NotificationAlert[]>([]);
  // Valores atuais para a conferência, sem refazer a busca quando mudam.
  const preferencesRef = useRef(preferences);
  const canViewRef = useRef(canView);
  useEffect(() => {
    preferencesRef.current = preferences;
    canViewRef.current = canView;
  });
  /** Contagens da última conferência; `null` até a primeira (que nunca gera aviso). */
  const previousCounts = useRef<Map<string, number> | null>(null);
  const nextAlertId = useRef(1);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  const dismissAlert = useCallback(
    (id: number) =>
      setAlerts((current) => current.filter((alert) => alert.id !== id)),
    [],
  );

  useEffect(() => {
    if (!watched) return;
    let active = true;
    api
      .notificationPreferences()
      .then((data) => {
        if (active) setPreferences(resolveNotificationPreferences(data));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [watched]);

  useEffect(() => {
    if (!watched) return;
    let active = true;
    api
      .notifications()
      .then((data) => {
        if (!active) return;
        setSummary(data);
        setError("");
        const current = preferencesRef.current;
        const groups = notificationGroups(
          data,
          canViewRef.current,
          current.hiddenKinds,
        );
        const previous = previousCounts.current;
        previousCounts.current = new Map(
          groups.map((group) => [group.key, group.count]),
        );
        if (!previous) return;
        const grown = groups.filter(
          (group) => group.count > (previous.get(group.key) ?? 0),
        );
        if (grown.length === 0) return;
        if (current.playSound) playNotificationSound();
        if (!current.showToasts) return;
        const created = grown.map((group) => ({
          id: nextAlertId.current++,
          group,
        }));
        // No máximo 3 avisos ao mesmo tempo: os mais antigos saem.
        setAlerts((items) => [...items, ...created].slice(-3));
        for (const alert of created)
          window.setTimeout(() => dismissAlert(alert.id), ALERT_DURATION);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar as notificações.");
      });
    return () => {
      active = false;
    };
  }, [watched, version, attempt, dismissAlert]);

  // Conferência automática no intervalo escolhido (os atendimentos a finalizar mudam com a
  // hora e outros usuários registram pendências).
  useEffect(() => {
    if (!watched) return;
    const timer = window.setInterval(
      refresh,
      preferences.refreshMinutes * 60_000,
    );
    return () => window.clearInterval(timer);
  }, [watched, preferences.refreshMinutes, refresh]);

  const savePreferences = useCallback(
    async (input: NotificationPreferences) => {
      const saved = await api.saveNotificationPreferences(input);
      setPreferences(saved);
      // Grupos religados não geram aviso: a próxima conferência parte das contagens atuais.
      previousCounts.current = null;
      refresh();
    },
    [refresh],
  );

  const groups = notificationGroups(summary, canView, preferences.hiddenKinds);
  const highlighted = groups.filter((group) =>
    preferences.highlightedKinds.includes(group.kind),
  );
  // Alertas fixos no cabeçalho: sem dispensa, ficam enquanto houver pendência destacada.
  const bannerGroups = preferences.showBanner ? highlighted : [];

  return {
    watched,
    availableKinds,
    preferences,
    savePreferences,
    groups,
    highlighted,
    bannerGroups,
    alerts,
    dismissAlert,
    loading: watched && summary === null && !error,
    error,
    refresh,
  };
}

export type NotificationCenter = ReturnType<typeof useNotificationCenter>;
