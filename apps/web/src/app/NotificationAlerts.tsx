import { AlertTriangle, BellRing, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
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
 * Rola a faixa sozinha quando os atalhos não cabem. Pausa enquanto `paused.current` for
 * verdadeiro (mouse, foco ou toque na barra) e continua de onde o usuário deixou o scroll
 * manual. Ao chegar no fim, espera e volta ao início. Desliga com movimento reduzido.
 */
function useAutoScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  paused: RefObject<boolean>,
  resetKey: number,
) {
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || prefersReducedMotion()) return;
    let frame = 0;
    let holdUntil = performance.now() + AUTO_SCROLL_HOLD_MS;
    let last: number | null = null;
    let position = scroller.scrollLeft;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const elapsed = last === null ? 0 : now - last;
      last = now;
      const max = scroller.scrollWidth - scroller.clientWidth;
      if (max <= 0 || paused.current || now < holdUntil) {
        position = scroller.scrollLeft;
        return;
      }
      // Lê o scroll atual: se o usuário rolou à mão, segue dali.
      if (Math.abs(scroller.scrollLeft - position) > 1)
        position = scroller.scrollLeft;
      if (position >= max - 1) {
        holdUntil = now + AUTO_SCROLL_HOLD_MS * 2;
        position = 0;
        if (typeof scroller.scrollTo === "function") {
          scroller.scrollTo({ left: 0, behavior: "smooth" });
        } else {
          scroller.scrollLeft = 0;
        }
        return;
      }
      position = Math.min(max, position + (AUTO_SCROLL_SPEED * elapsed) / 1000);
      scroller.scrollLeft = position;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [scrollRef, paused, resetKey]);
}

/**
 * Altura da faixa em `--notification-banner-height` no topo: no celular a faixa fica acima
 * da linha do menu e o topo fixo para com ela escondida, rolando com a página (RE11).
 */
function useBannerHeight(
  bannerRef: RefObject<HTMLElement | null>,
  visible: boolean,
) {
  useLayoutEffect(() => {
    const banner = bannerRef.current;
    const topbar = banner?.parentElement;
    if (!visible || !banner || !topbar) return;
    const update = () =>
      topbar.style.setProperty(
        "--notification-banner-height",
        `${banner.offsetHeight}px`,
      );
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(banner);
    return () => {
      observer?.disconnect();
      topbar.style.removeProperty("--notification-banner-height");
    };
  }, [bannerRef, visible]);
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLElement>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const touchTimer = useRef<number | undefined>(undefined);
  const paused = useRef(false);
  const syncPaused = () => {
    paused.current =
      hovered.current || focused.current || touchTimer.current !== undefined;
  };
  useAutoScroll(scrollRef, paused, groups.length);
  useBannerHeight(bannerRef, groups.length > 0);
  useEffect(() => () => window.clearTimeout(touchTimer.current), []);
  if (groups.length === 0) return null;
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  return (
    <section
      ref={bannerRef}
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
      <div ref={scrollRef} className="notification-banner-scroll">
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
      </div>
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
