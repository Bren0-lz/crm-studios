import { EmergencyButton } from "../shared/components/EmergencyButton";
import { RevokeSessionsButton } from "../shared/auth/RevokeSessionsButton";
import type { UserSummary } from "@crm/contracts";
import { Bell, LogOut, Menu, X } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Logo } from "../shared/components/Logo";
import { NavigationGuardContext } from "../shared/lib/NavigationGuardContext";
import { initials, roleLabels } from "../shared/lib/formatting";
import type { NavigationGuard } from "../shared/lib/types";
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.module || user.modules.includes(item.module),
      ),
    }))
    .filter((group) => group.items.length > 0);
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
      <aside
        id="main-sidebar"
        className={`sidebar ${mobileOpen ? "open" : ""}`}
      >
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
            </div>
          ))}
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
          <RevokeSessionsButton onLogout={onLogout} />
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
        <header className="topbar" role="banner">
          <button
            className="icon-button menu-button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            aria-controls="main-sidebar"
            aria-expanded={mobileOpen}
          >
            <Menu size={21} />
          </button>
          <div>
            <span className="clinic-label">Studios Aryana</span>
            <span className="environment-dot">Demonstração</span>
          </div>
          <div className="top-actions">
            <EmergencyButton />
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
