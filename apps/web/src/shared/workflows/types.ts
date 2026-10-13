import type { GroupClass } from "@crm/contracts";

export type CloseGuard = (proceed: () => void) => void;

export type GroupChoices = {
  items: GroupClass[] | null;
  error: string;
  retry: () => void;
};
