import { AlertTriangle, BellRing, ChevronDown, X } from "lucide-react";
import { HeaderPopover } from "./HeaderMenus";
import type { NotificationCenter } from "./notification-center";

/**
 * Alertas fixos no cabeçalho: um botão com o total dos grupos destacados nas preferências,
 * que abre a lista com atalho para cada tela. Não tem como fechar: some só quando as
 * pendências destacadas zeram.
 */
export function NotificationsBanner({
  center,
  onNavigate,
}: {
  center: NotificationCenter;
  onNavigate: (to: string) => void;
}) {
  const groups = center.bannerGroups;
  if (groups.length === 0) return null;
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const noun = total === 1 ? "pendência" : "pendências";
  return (
    <section className="notification-banner" aria-label="Alertas">
      <HeaderPopover
        label="Pendências em destaque"
        triggerLabel={
          total === 1
            ? "1 pendência pede atenção"
            : `${total} pendências pedem atenção`
        }
        triggerClassName="notification-banner-trigger"
        trigger={
          <>
            <AlertTriangle size={16} aria-hidden="true" />
            <strong>{total}</strong>
            <span className="notification-banner-noun">{noun}</span>
            <ChevronDown
              size={15}
              className="notification-banner-chevron"
              aria-hidden="true"
            />
          </>
        }
      >
        {(close) => (
          <>
            <div className="header-popover-head">
              <strong className="header-popover-title">
                Pendências em destaque
              </strong>
            </div>
            <ul className="header-notifications">
              {groups.map((group) => (
                <li key={group.key}>
                  <button
                    type="button"
                    className="text-button header-notification-item is-highlighted"
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
          </>
        )}
      </HeaderPopover>
    </section>
  );
}

/** Avisos flutuantes de pendência nova, no canto superior direito. */
export function NotificationAlerts({
  center,
  onNavigate,
}: {
  center: NotificationCenter;
  onNavigate: (to: string) => void;
}) {
  return (
    <div className="notification-alerts" aria-live="assertive">
      {center.alerts.map(({ id, group }) => (
        <div key={id} className="notification-alert" role="alert">
          <BellRing size={18} aria-hidden="true" />
          <span>
            <strong>Nova pendência</strong>
            <small>
              {group.label}: {group.count}
            </small>
          </span>
          <button
            type="button"
            className="secondary-button button-sm"
            onClick={() => {
              center.dismissAlert(id);
              onNavigate(group.to);
            }}
          >
            Ver
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => center.dismissAlert(id)}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
