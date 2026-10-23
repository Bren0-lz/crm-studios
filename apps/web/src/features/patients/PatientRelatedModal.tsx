import {
  type ContactSuggestion,
  type GroupClass,
  type GroupEnrollment,
  type OutboundMessage,
  describeGroupSchedule,
  patientFirstName,
} from "@crm/contracts";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import {
  formatIsoDate,
  groupOperationRange,
  shortDate,
} from "../../shared/lib/formatting";
import {
  broadcastChannelLabels,
  queueKindLabels,
  queueStatusLabels,
} from "../communications";
import { contactReasonLabels } from "../relationship";

export type PatientRelatedModule = "groups" | "relationship" | "communications";

type RelatedItem = {
  key: string;
  title: string;
  detail: string;
  status?: string;
  body?: string;
};

const sections: Record<
  PatientRelatedModule,
  {
    title: string;
    to: string;
    empty: [title: string, copy: string];
    load: (patientId: string) => Promise<RelatedItem[]>;
  }
> = {
  groups: {
    title: "Turmas",
    to: "/turmas",
    empty: [
      "Sem turmas",
      "O cliente não tem matrícula ativa nem está na lista de espera.",
    ],
    load: async (patientId) => {
      const range = groupOperationRange();
      const data = await api.groupWorkspace(range.from, range.to);
      return data.enrollments
        .filter(
          (item) => item.patientId === patientId && item.status !== "cancelled",
        )
        .map((item) =>
          groupItem(
            item,
            data.groups.find((group) => group.id === item.groupId),
          ),
        );
    },
  },
  relationship: {
    title: "Contatos sugeridos",
    to: "/relacionamento",
    empty: [
      "Sem contatos sugeridos",
      "Nenhuma situação pede contato com este cliente agora.",
    ],
    load: async (patientId) =>
      (await api.contactSuggestions())
        .filter((item) => item.patientId === patientId)
        .sort((a, b) => a.priority - b.priority)
        .map(suggestionItem),
  },
  communications: {
    title: "Comunicações",
    to: "/comunicacoes",
    empty: [
      "Sem comunicações",
      "Nenhuma mensagem foi registrada para este cliente.",
    ],
    load: async (patientId) =>
      (await api.communications()).messages
        .filter((item) => item.patientId === patientId)
        .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor))
        .map(messageItem),
  },
};

function groupItem(
  enrollment: GroupEnrollment,
  group: GroupClass | undefined,
): RelatedItem {
  const detail = group
    ? [
        describeGroupSchedule(group.weeklySlots ?? []),
        group.professionalName,
        group.roomName,
      ]
    : [];
  return {
    key: enrollment.id,
    title: group?.name ?? "Turma",
    detail: [...detail, `Desde ${formatIsoDate(enrollment.startsOn)}`].join(
      " · ",
    ),
    status:
      enrollment.status === "waitlisted"
        ? `Lista de espera${enrollment.queuePosition ? ` (posição ${enrollment.queuePosition})` : ""}`
        : "Matrícula ativa",
  };
}

function suggestionItem(suggestion: ContactSuggestion): RelatedItem {
  return {
    key: `${suggestion.reason}:${suggestion.referenceKey}`,
    title: contactReasonLabels[suggestion.reason],
    detail: suggestion.dueDate
      ? `${suggestion.detail} · ${formatIsoDate(suggestion.dueDate)}`
      : suggestion.detail,
  };
}

function messageItem(message: OutboundMessage): RelatedItem {
  return {
    key: message.id,
    title: `${queueKindLabels[message.kind]} · ${broadcastChannelLabels[message.channel]}`,
    detail: shortDate.format(new Date(message.sentAt ?? message.scheduledFor)),
    status: queueStatusLabels[message.status],
    body: message.body,
  };
}

/** Resumo de turmas, contatos sugeridos ou comunicações do cliente, sem sair da ficha. */
export function PatientRelatedModal({
  module,
  patientId,
  patientName,
  onClose,
}: {
  module: PatientRelatedModule;
  patientId: string;
  patientName: string;
  onClose: () => void;
}) {
  const section = sections[module];
  const [items, setItems] = useState<RelatedItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    section
      .load(patientId)
      .then((data) => active && setItems(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [section, patientId]);
  let content: ReactNode;
  if (error) content = <ErrorBanner error={error} />;
  else if (!items) content = <LoadingBlock />;
  else if (!items.length)
    content = <EmptyState title={section.empty[0]} copy={section.empty[1]} />;
  else
    content = (
      <ul className="patient-related-list">
        {items.map((item) => (
          <li key={item.key}>
            <div className="patient-related-head">
              <strong>{item.title}</strong>
              {item.status && (
                <span className="status-pill">{item.status}</span>
              )}
            </div>
            <span className="patient-related-detail">{item.detail}</span>
            {item.body && <p>{item.body}</p>}
          </li>
        ))}
      </ul>
    );
  return (
    <Modal
      title={section.title}
      subtitle={`Resumo de ${patientFirstName(patientName)}.`}
      onClose={onClose}
    >
      <div className="patient-related-body">{content}</div>
      <div className="modal-actions">
        <Link
          className="secondary-button"
          to={`${section.to}?patientId=${encodeURIComponent(patientId)}`}
        >
          Abrir em {section.title}
        </Link>
        <button type="button" className="primary-button" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
