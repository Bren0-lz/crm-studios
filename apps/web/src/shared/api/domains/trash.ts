import type {
  TrashImpact,
  TrashItem,
  TrashKind,
} from "@crm/contracts";
import { trashPurgeConfirmation } from "@crm/contracts";
import { request } from "../transport";

export const trashApi = {
  trash: (kind: TrashKind) => request<TrashItem[]>(`/trash/${kind}`),
  sendToTrash: (kind: TrashKind, id: string) =>
    request<TrashItem>(`/trash/${kind}/${id}`, { method: "POST" }),
  trashImpact: (kind: TrashKind, id: string) =>
    request<TrashImpact>(`/trash/${kind}/${id}/impact`),
  restoreFromTrash: (kind: TrashKind, id: string) =>
    request<void>(`/trash/${kind}/${id}/restore`, { method: "POST" }),
  purgeFromTrash: (kind: TrashKind, id: string) =>
    request<void>(`/trash/${kind}/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ confirmation: trashPurgeConfirmation }),
    }),
};
