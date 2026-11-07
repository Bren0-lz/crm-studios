import { AlertTriangle, BellRing, X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import type { NotificationCenter } from "./notification-center";

/** Velocidade da rolagem automática dos atalhos, em px por segundo. */
const AUTO_SCROLL_SPEED = 30;
/** Pausa no fim (antes de voltar ao início) e no início (antes de recomeçar). */
const AUTO_SCROLL_HOLD_MS = 1500;
/** Depois de um toque (arraste manual no celular), espera antes de retomar. */
const AUTO_SCROLL_TOUCH_RESUME_MS = 4000;

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Rola a lista sozinha quando os atalhos não cabem. Pausa enquanto `paused.current` for
 * verdadeiro (mouse, foco ou toque na barra) e continua de onde o usuário deixou o scroll
 * manual. Ao chegar no fim, espera e volta ao início. Desliga com movimento reduzido.
 */
function useAutoScroll(
  listRef: RefObject<HTMLUListElement | null>,
  paused: RefObject<boolean>,
  resetKey: number,
) {
  useEffect(() => {
    const list = listRef.current;
    if (!list || prefersReducedMotion()) return;
    let frame = 0;
    let holdUntil = performance.now() + AUTO_SCROLL_HOLD_MS;
    let last: number | null = null;
    let position = list.scrollLeft;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const elapsed = last === null ? 0 : now - last;
      last = now;
      const max = list.scrollWidth - list.clientWidth;
      if (max <= 0 || paused.current || now < holdUntil) {
        position = list.scrollLeft;
        return;
      }
      // Lê o scroll atual: se o usuário rolou à mão, segue dali.
      if (Math.abs(list.scrollLeft - position) > 1) position = list.scrollLeft;
      if (position >= max - 1) {
        holdUntil = now + AUTO_SCROLL_HOLD_MS * 2;
        position = 0;
        if (typeof list.scrollTo === "function") {
          list.scrollTo({ left: 0, behavior: "smooth" });
        } else {
          list.scrollLeft = 0;
        }
        return;
      }
      position = Math.min(max, position + (AUTO_SCROLL_SPEED * elapsed) / 1000);
      list.scrollLeft = position;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [listRef, paused, resetKey]);
}

/**
 * Alertas fixos no cabeçalho: os grupos destacados nas preferências, com atalho para cada
 * tela. Não tem como fechar: some só quando as pendências destacadas zeram.
 */
export function NotificationsBanner({
  center,
  onNavigate,
}: {
  center: NotificationCenter;
  onNavigate: (to: string) => void;
}) {
  const groups = center.bannerGroups;
  const listRef = useRef<HTMLUListElement>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const touchTimer = useRef<number | undefined>(undefined);
  const paused = useRef(false);
  const syncPaused = () => {
    paused.current =
      hovered.current || focused.current || touchTimer.current !== undefined;
  };
  useAutoScroll(listRef, paused, groups.length);
  useEffect(() => () => window.clearTimeout(touchTimer.current), []);
  if (groups.length === 0) return null;
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  return (
    <section
      className="notification-banner"
      aria-label="Alertas"
      onMouseEnter={() => {
        hovered.current = true;
        syncPaused();
      }}
      onMouseLeave={() => {
        hovered.current = false;
        syncPaused();
      }}
      onFocus={() => {
        focused.current = true;
        syncPaused();
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null))
          return;
        focused.current = false;
        syncPaused();
      }}
      onTouchStart={() => {
        window.clearTimeout(touchTimer.current);
        touchTimer.current = window.setTimeout(() => {
          touchTimer.current = undefined;
          syncPaused();
        }, AUTO_SCROLL_TOUCH_RESUME_MS);
        syncPaused();
      }}
    >
      <span className="notification-banner-icon" aria-hidden="true">
        <AlertTriangle size={16} />
      </span>
      <strong>
        {total === 1
          ? "1 pendência pede atenção"
          : `${total} pendências pedem atenção`}
      </strong>
      <ul ref={listRef}>
        {groups.map((group) => (
          <li key={group.key}>
            <button
              type="button"
              className="notification-banner-item"
              title={group.detail}
              onClick={() => onNavigate(group.to)}
            >
              {group.icon}
              {group.label}
              <span className="notification-banner-count">{group.count}</span>
            </button>
          </li>
        ))}
      </ul>
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
