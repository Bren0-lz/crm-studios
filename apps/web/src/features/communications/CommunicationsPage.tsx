import type { MessageTemplate } from "@crm/contracts";
import {
  BellRing,
  Megaphone,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthorization } from "../../authorization-context";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import { AutoCampaignsTab } from "./auto-campaigns/AutoCampaignsTab";
import { CampaignsTab } from "./campaigns/CampaignsTab";
import { TemplatesTab } from "./campaigns/TemplatesTab";

type TabKey = "campanhas" | "automaticas" | "mensagens";
const tabs: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: "campanhas", label: "Campanhas", icon: Megaphone },
  { key: "automaticas", label: "Campanhas automáticas", icon: BellRing },
  { key: "mensagens", label: "Mensagens padrão", icon: MessageSquareText },
];

function initialTab(value: string | null): TabKey {
  // Endereços antigos (`?aba=fila`) caem em Campanhas.
  return tabs.some((tab) => tab.key === value)
    ? (value as TabKey)
    : "campanhas";
}

/**
 * Central de comunicações em abas. A aba fica no estado local (sem mexer na URL),
 * porque mudar a busca remonta a página (`Routes key={pathname + search}`).
 */
export function CommunicationsPage() {
  const { canEdit } = useAuthorization();
  const [searchParams] = useSearchParams();
  const baseId = useId();
  const [active, setActive] = useState<TabKey>(() =>
    initialTab(searchParams.get("aba")),
  );
  const [visited, setVisited] = useState<TabKey[]>([active]);
  const [templateToUse, setTemplateToUse] = useState<MessageTemplate | null>(
    null,
  );

  function select(key: TabKey) {
    setActive(key);
    setVisited((current) =>
      current.includes(key) ? current : [...current, key],
    );
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    select(tabs[next]!.key);
    document.getElementById(`${baseId}-${tabs[next]!.key}-tab`)?.focus();
  }

  return (
    <>
      <PageHeader
        title="Central de comunicações"
        description="Campanhas de WhatsApp com mensagens prontas, inclusive lembretes de atendimento."
      />
      {!canEdit("communications") && <ReadOnlyNotice module="communications" />}
      <div
        className="settings-tabs communication-tabs"
        role="tablist"
        aria-label="Seções de comunicações"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            id={`${baseId}-${tab.key}-tab`}
            type="button"
            role="tab"
            className="text-button settings-tab"
            aria-selected={active === tab.key}
            aria-controls={`${baseId}-${tab.key}-panel`}
            tabIndex={active === tab.key ? 0 : -1}
            onClick={() => select(tab.key)}
            onKeyDown={(event) => moveFocus(event, index)}
          >
            <tab.icon size={18} aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map(
        (tab) =>
          visited.includes(tab.key) && (
            <div
              key={tab.key}
              id={`${baseId}-${tab.key}-panel`}
              role="tabpanel"
              aria-labelledby={`${baseId}-${tab.key}-tab`}
              hidden={active !== tab.key}
            >
              {tab.key === "campanhas" ? (
                <CampaignsTab
                  templateToUse={templateToUse}
                  onTemplateUsed={() => setTemplateToUse(null)}
                  onOpenTemplates={() => select("mensagens")}
                />
              ) : tab.key === "automaticas" ? (
                <AutoCampaignsTab />
              ) : (
                <TemplatesTab
                  onUseTemplate={(template) => {
                    setTemplateToUse(template);
                    select("campanhas");
                  }}
                />
              )}
            </div>
          ),
      )}
    </>
  );
}
