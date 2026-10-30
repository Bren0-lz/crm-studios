import { AlertTriangle, BellRing, X } from "lucide-react";
import type { NotificationCenter } from "./notification-center";

/**
 * Faixa de alertas abaixo do cabeçalho: os grupos destacados nas preferências, com atalho
 * para cada tela. "Dispensar" esconde até alguma contagem crescer (ou a sessão acabar).
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
  return (
    <section className="notification-banner" aria-label="Alertas">
      <AlertTriangle size={18} aria-hidden="true" />
      <strong>
        {total === 1
          ? "1 pendência pede atenção"
          : `${total} pendências pedem atenção`}
      </strong>
      <ul>
        {groups.map((group) => (
          <li key={group.key}>
            <button
              type="button"
              className="notification-banner-item"
              onClick={() => onNavigate(group.to)}
            >
              {group.icon}
              {group.label}
              <span className="notification-banner-count">{group.count}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="icon-button notification-banner-close"
        aria-label="Dispensar alertas"
        title="Dispensar alertas"
        onClick={center.dismissBanner}
      >
        <X size={16} />
      </button>
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
