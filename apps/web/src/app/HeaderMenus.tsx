import { Bell, BellRing, Settings2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { NotificationCenter } from "./notification-center";
import { NotificationSettingsModal } from "./NotificationSettingsModal";

/** Painel suspenso do cabeçalho: fecha com Esc, clique fora ou ao escolher um item. */
export function HeaderPopover({
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

export function NotificationsMenu({
  center,
  onNavigate,
}: {
  center: NotificationCenter;
  onNavigate: (to: string) => void;
}) {
  const { groups, highlighted, error, loading, refresh } = center;
  const [configuring, setConfiguring] = useState(false);
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  // Grupo destacado com pendência: o sino ganha cor de alerta para chamar a atenção.
  const alerting = highlighted.length > 0;
  return (
    <>
      <HeaderPopover
        label="Notificações"
        triggerLabel={
          total > 0
            ? `Notificações: ${total} ${total === 1 ? "pendência" : "pendências"}`
            : "Notificações"
        }
        triggerClassName={`icon-button header-bell${alerting ? " is-alerting" : ""}`}
        // Abrir o sino confere de novo (os atendimentos a finalizar mudam com a hora).
        onOpen={refresh}
        trigger={
          <>
            {alerting ? <BellRing size={19} /> : <Bell size={19} />}
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
            <div className="header-popover-head">
              <strong className="header-popover-title">Notificações</strong>
              <button
                type="button"
                className="text-button button-sm"
                onClick={() => {
                  close();
                  setConfiguring(true);
                }}
              >
                <Settings2 size={15} aria-hidden="true" />
                Configurar
              </button>
            </div>
            {error && (
              <div className="header-notifications-error">
                <p className="form-error" role="alert">
                  {error}
                </p>
                <button
                  type="button"
                  className="secondary-button button-sm"
                  onClick={refresh}
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
                      className={`text-button header-notification-item${
                        highlighted.includes(group) ? " is-highlighted" : ""
                      }`}
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
      {configuring && (
        <NotificationSettingsModal
          availableKinds={center.availableKinds}
          preferences={center.preferences}
          onSave={center.savePreferences}
          onClose={() => setConfiguring(false)}
        />
      )}
    </>
  );
}
