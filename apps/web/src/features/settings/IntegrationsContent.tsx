import { KeyRound, Send } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { IntegrationKeysContent } from "./IntegrationKeysContent";
import { TelegramIntegrationContent } from "./TelegramIntegrationContent";

const pages = [
  { id: "chaves", label: "Chaves de API", icon: KeyRound },
  { id: "telegram", label: "Telegram", icon: Send },
] as const;

export function IntegrationsContent({ busy }: { busy: boolean }) {
  const [params] = useSearchParams();
  const { state } = useLocation();
  const selected =
    params.get("integracao") === "telegram" ? "telegram" : "chaves";
  const currentLink = useRef<HTMLAnchorElement>(null);

  useLayoutEffect(() => {
    if (state?.focusIntegrationLink === true) {
      currentLink.current?.focus({ preventScroll: true });
    }
  }, [selected, state]);

  return (
    <>
      <nav
        className="integration-nav"
        aria-label="Páginas de integrações"
        inert={busy}
      >
        {pages.map(({ id, label, icon: Icon }) => {
          const search = new URLSearchParams(params);
          search.set("secao", "integracoes");
          search.set("integracao", id);
          return (
            <Link
              key={id}
              to={{ search: search.toString() }}
              state={{ focusIntegrationLink: true }}
              ref={selected === id ? currentLink : undefined}
              aria-current={selected === id ? "page" : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
      {selected === "telegram" ? (
        <TelegramIntegrationContent />
      ) : (
        <IntegrationKeysContent />
      )}
    </>
  );
}
