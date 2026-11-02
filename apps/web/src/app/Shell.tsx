import { EmergencyButton } from "../shared/components/EmergencyButton";
import { RevokeSessionsButton } from "../shared/auth/RevokeSessionsButton";
import type { NavTab, NavTabLabel, UserSummary } from "@crm/contracts";
import { LogOut, Menu, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ModuleLabelContext } from "../shared/lib/ModuleLabelContext";
import { NavTabLabelsContext } from "../shared/lib/NavTabLabelsContext";
import { Logo } from "../shared/components/Logo";
import { NavigationGuardContext } from "../shared/lib/NavigationGuardContext";
import { initials, roleLabels } from "../shared/lib/formatting";
import type { NavigationGuard } from "../shared/lib/types";
import { installInlineValidation } from "../shared/feedback/inline-validation";
import { api, BRANCH_CHANGED_EVENT, getStoredBranchId } from "../api";
import { BranchSelector } from "./BranchSelector";
import { NotificationsMenu } from "./HeaderMenus";
import { NotificationAlerts, NotificationsBanner } from "./NotificationAlerts";
import { useNotificationCenter } from "./notification-center";
import { navGroups } from "./navItems";

export function Shell({
  user,
  onLogout,
  children,
}: {
  user: UserSummary;
  onLogout: () => void;
  children: ReactNode;
}) {
  // Trocar de filial remonta a página aberta: todas as telas recarregam na filial nova.
  const [branchKey, setBranchKey] = useState(() => getStoredBranchId() ?? "");
  useEffect(() => {
    const changed = () => setBranchKey(getStoredBranchId() ?? "");
    window.addEventListener(BRANCH_CHANGED_EVENT, changed);
    return () => window.removeEventListener(BRANCH_CHANGED_EVENT, changed);
  }, []);
  // Nomes das abas renomeados pelo admin; sem resposta, o menu fica com os nomes padrão.
  const [tabLabels, setTabLabels] = useState<Partial<Record<NavTab, string>>>(
    {},
  );
  const applyTabLabels = useCallback((labels: NavTabLabel[]) => {
    setTabLabels(
      Object.fromEntries(labels.map((item) => [item.tab, item.label])),
    );
  }, []);
  useEffect(() => {
    let active = true;
    api
      .navTabLabels()
      .then((labels) => {
        if (active && Array.isArray(labels)) applyTabLabels(labels);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [applyTabLabels]);
  const navItems = navGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      label: tabLabels[item.tab] ?? item.label,
    })),
  }));
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Rótulo dos modais: o módulo da página aberta (o item de menu mais específico).
  const moduleLabel =
    navItems
      .flatMap((group) => group.items)
      .filter(
        (item) =>
          item.to !== "/" &&
          (pathname === item.to || pathname.startsWith(`${item.to}/`)),
      )
      .sort((a, b) => b.to.length - a.to.length)[0]?.label ??
    (pathname === "/"
      ? (tabLabels.dashboard ?? "Visão geral")
      : "Studios Aryana");
  // Validação dos formulários abaixo de cada campo, no lugar dos balões do navegador.
  useEffect(() => installInlineValidation(document), []);
  const visibleGroups = navItems
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.module || user.modules.includes(item.module),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const notifications = useNotificationCenter();
  // Menu lateral recolhível: o botão e a gaveta só aparecem no celular (CSS, até 700px).
  // Guarda a tela em que foi aberto: trocar de página ou de filial fecha sozinho.
  const screenKey = `${pathname}|${branchKey}`;
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null);
  const menuOpen = menuOpenAt === screenKey;
  const setMenuOpen = (open: boolean) => setMenuOpenAt(open ? screenKey : null);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpenAt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  const guards = useRef(new Set<NavigationGuard>());
  const registerGuard = useCallback((guard: NavigationGuard) => {
    const set = guards.current;
    set.add(guard);
    return () => {
      set.delete(guard);
    };
  }, []);

  /** Navegação dos menus do cabeçalho: respeita os avisos de alterações não salvas. */
  function guardedNavigate(to: string) {
    for (const guard of guards.current) if (guard(to)) return;
    void navigate(to);
  }

  return (
    <div className={`app-shell${menuOpen ? " menu-open" : ""}`}>
      <aside id="main-sidebar" className="sidebar">
        <div className="sidebar-head">
          <Logo compactMark />
          <button
            type="button"
            className="icon-button sidebar-close"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav className="main-nav" aria-label="Navegação principal">
          {visibleGroups.map((group) => (
            <div
              className="nav-group"
              role="group"
              aria-label={group.label}
              key={group.label}
            >
              <span className="nav-caption" aria-hidden="true">
                {group.label}
              </span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return item.disabled ? (
                  <span
                    className="nav-item disabled"
                    key={item.to}
                    title={`${item.label} (em breve)`}
                    aria-label={`${item.label} (em breve)`}
                  >
                    <Icon size={19} aria-hidden="true" />
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
                    title={item.label}
                    aria-label={item.label}
                    onClick={(event) => {
                      for (const guard of guards.current) {
                        if (guard(item.to)) {
                          event.preventDefault();
                          return;
                        }
                      }
                      setMenuOpen(false);
                    }}
                  >
                    <Icon size={19} aria-hidden="true" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="user-card"
            onClick={onLogout}
            title="Sair"
            aria-label={`Sair: ${user.fullName}`}
          >
            <span className="avatar" aria-hidden="true">
              {initials(user.fullName)}
            </span>
            <span className="user-copy">
              <strong>{user.fullName}</strong>
              <small>{user.jobTitle ?? roleLabels[user.role]}</small>
            </span>
            <LogOut size={17} aria-hidden="true" />
          </button>
          <RevokeSessionsButton onLogout={onLogout} />
        </div>
      </aside>
      {menuOpen && (
        <div
          className="sidebar-scrim"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <section className="app-main">
        <header className="topbar" role="banner">
          <button
            type="button"
            className="icon-button menu-toggle"
            aria-label="Abrir menu"
            aria-controls="main-sidebar"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="topbar-context">
            <span className="clinic-label">Studios Aryana</span>
            <span className="environment-dot">Demonstração</span>
          </div>
          <NotificationsBanner
            center={notifications}
            onNavigate={guardedNavigate}
          />
          <div className="top-actions">
            <BranchSelector />
            <EmergencyButton />
            <NotificationsMenu
              center={notifications}
              onNavigate={guardedNavigate}
            />
          </div>
        </header>
        <NotificationAlerts
          center={notifications}
          onNavigate={guardedNavigate}
        />
        <div className="page-content" key={branchKey}>
          <NavigationGuardContext.Provider value={registerGuard}>
            <NavTabLabelsContext.Provider value={applyTabLabels}>
              <ModuleLabelContext.Provider value={moduleLabel}>
                {children}
              </ModuleLabelContext.Provider>
            </NavTabLabelsContext.Provider>
          </NavigationGuardContext.Provider>
        </div>
      </section>
    </div>
  );
}
