import { MoreHorizontal } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useAuthorization } from "../../authorization-context";
import type { ActionMenuItem } from "../lib/types";

export function ActionMenu({
  label,
  items: allItems,
  iconOnly = false,
  align = "start",
  disabled = false,
}: {
  label: string;
  items: ActionMenuItem[];
  iconOnly?: boolean;
  align?: "start" | "end";
  disabled?: boolean;
}) {
  const { can } = useAuthorization();
  const items = allItems.filter(
    (item) => !item.permission || can(item.permission),
  );
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const expanded = open && !disabled;

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const button = buttonRef.current;
    if (!expanded || !menu || !button) return;
    function positionMenu() {
      if (!menu || !button) return;
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const anchor = button.getBoundingClientRect();
      const below = viewportTop + viewportHeight - anchor.bottom - 16;
      const above = anchor.top - viewportTop - 16;
      const placeAbove = menu.scrollHeight > below && above > below;
      menu.style.top = placeAbove ? "auto" : "calc(100% + var(--space-1))";
      menu.style.bottom = placeAbove ? "calc(100% + var(--space-1))" : "auto";
      menu.style.maxHeight = `${Math.max(0, placeAbove ? above : below)}px`;
      menu.style.overflowY = "auto";
    }
    function onScroll(event: Event) {
      if (event.target instanceof Node && menu?.contains(event.target)) return;
      positionMenu();
    }
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", onScroll, true);
    window.visualViewport?.addEventListener("resize", positionMenu);
    window.visualViewport?.addEventListener("scroll", positionMenu);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", onScroll, true);
      window.visualViewport?.removeEventListener("resize", positionMenu);
      window.visualViewport?.removeEventListener("scroll", positionMenu);
    };
  }, [expanded, items.length]);

  useEffect(() => {
    if (!expanded) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [expanded]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const entries = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ) ?? [],
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
    <div
      className={`action-menu${align === "end" ? " action-menu-end" : ""}`}
      ref={wrapperRef}
    >
      <button
        ref={buttonRef}
        type="button"
        className={iconOnly ? "icon-button button-sm" : "secondary-button"}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={expanded}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !expanded && !disabled) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={iconOnly ? 19 : 16} /> {!iconOnly && label}
      </button>
      {expanded && (
        <div
          className="action-menu-list"
          role="menu"
          aria-label={label}
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={
                item.danger
                  ? "action-menu-item action-menu-item-danger"
                  : "action-menu-item"
              }
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
