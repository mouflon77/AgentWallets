export type PendingStatus = "pending" | "approved" | "rejected";

/** Queued by the AI agent when human approval is required. */
export interface PendingTransaction {
  id: string;
  createdAt: string;
  description: string;
  recipient: string;
  transferSol: number;
  /** Base64-encoded unsigned Solana transaction. */
  serializedTx: string;
  subOrganizationId: string;
  solanaAddress: string;
  status: PendingStatus;
}

export interface WalletSession {
  displayName: string;
  subOrganizationId: string;
  solanaAddress: string;
}

export interface RegisterResponse {
  subOrganizationId: string;
  solanaAddress: string;
  walletId: string;
}
