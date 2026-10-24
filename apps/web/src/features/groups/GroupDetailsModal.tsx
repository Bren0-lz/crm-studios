import type {
  GroupClass,
  GroupWorkspace,
  Professional,
  Service,
} from "@crm/contracts";
import { describeGroupSchedule } from "@crm/contracts";
import { useId, useState, type ReactNode } from "react";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { GroupModal } from "./GroupModal";
import {
  GroupOperationsPanel,
  type GroupCalendarState,
} from "./GroupOperationsPanel";
import { GroupSessionModal } from "./GroupSessionModal";

const tabs = [
  { key: "details", label: "Dados da turma" },
  { key: "operations", label: "Frequência e reposições" },
] as const;

export function GroupDetailsModal({
  group,
  workspace,
  professionals,
  service,
  busy,
  dirty,
  error,
  initialSessionId,
  calendar,
  onClose,
  onChanged,
  children,
}: {
  group: GroupClass;
  workspace: GroupWorkspace;
  professionals: Professional[];
  service?: Service | undefined;
  busy: boolean;
  dirty: boolean;
  error: string;
  initialSessionId?: string | undefined;
  calendar: GroupCalendarState;
  onClose: () => void;
  onChanged: () => Promise<void>;
  children: ReactNode;
}) {
  const id = useId();
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>(
    initialSessionId ? "operations" : "details",
  );
  const [operationsBusy, setOperationsBusy] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(
    initialSessionId ?? null,
  );
  const meeting = workspace.sessions.find(
    (item) => item.id === selectedSessionId && item.groupId === group.id,
  );
  const saving = busy || operationsBusy;
  const [initialSession] = useState(() =>
    workspace.sessions.find((item) => item.id === initialSessionId),
  );
  return (
    <>
      <GroupModal
        title={group.name}
        subtitle={`${describeGroupSchedule(group.weeklySlots ?? [])} · ${group.professionalName}`}
        initialFocus='[role="tab"][aria-selected="true"]'
        busy={saving}
        inactive={Boolean(meeting)}
        dirty={dirty}
        onClose={onClose}
      >
        <div className="group-modal-sections">
          <div className="group-modal-tabs" role="tablist" aria-label="Turma">
            {tabs.map(({ key, label }, index) => (
              <button
                key={key}
                type="button"
                role="tab"
                className="secondary-button"
                id={`${id}-${key}-tab`}
                aria-controls={`${id}-${key}-panel`}
                aria-selected={tab === key}
                tabIndex={tab === key ? 0 : -1}
                disabled={saving}
                onClick={() => setTab(key)}
                onKeyDown={(event) => {
                  if (saving) return;
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : event.key === "ArrowRight"
                          ? (index + 1) % tabs.length
                          : event.key === "ArrowLeft"
                            ? (index + tabs.length - 1) % tabs.length
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  setTab(tabs[next]!.key);
                  document
                    .getElementById(`${id}-${tabs[next]!.key}-tab`)
                    ?.focus();
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {error && <ErrorBanner error={error} />}
          <div
            role="tabpanel"
            id={`${id}-details-panel`}
            aria-labelledby={`${id}-details-tab`}
            hidden={tab !== "details"}
          >
            {children}
          </div>
          <div
            role="tabpanel"
            id={`${id}-operations-panel`}
            aria-labelledby={`${id}-operations-tab`}
            hidden={tab !== "operations"}
          >
            <GroupOperationsPanel
              groupId={group.id}
              workspace={workspace}
              calendar={calendar}
              initialSessionStartsAt={initialSession?.startsAt}
              busy={saving}
              onBusyChange={setOperationsBusy}
              onSelectSession={setSelectedSessionId}
              onChanged={onChanged}
            />
          </div>
        </div>
      </GroupModal>
      {meeting && (
        <GroupSessionModal
          key={meeting.id}
          meeting={meeting}
          workspace={workspace}
          professionals={professionals}
          service={service}
          busy={saving}
          refreshError={error}
          onBusyChange={setOperationsBusy}
          onChanged={onChanged}
          onClose={() => setSelectedSessionId(null)}
        />
      )}
    </>
  );
}
