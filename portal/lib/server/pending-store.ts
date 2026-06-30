import { randomUUID } from "crypto";

import type { PendingTransaction } from "@/lib/types";

const pending = new Map<string, PendingTransaction>();

export function listPending(subOrganizationId: string): PendingTransaction[] {
  return [...pending.values()]
    .filter(
      (item) =>
        item.subOrganizationId === subOrganizationId && item.status === "pending",
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function getPending(id: string): PendingTransaction | undefined {
  return pending.get(id);
}

export function addPending(
  input: Omit<PendingTransaction, "id" | "createdAt" | "status">,
): PendingTransaction {
  const item: PendingTransaction = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  pending.set(item.id, item);
  return item;
}

export function markApproved(
  id: string,
  signedSerializedTx: string,
): PendingTransaction | undefined {
  const item = pending.get(id);
  if (!item) return undefined;

  const updated: PendingTransaction = {
    ...item,
    status: "approved",
    serializedTx: signedSerializedTx,
  };

  pending.set(id, updated);
  return updated;
}
