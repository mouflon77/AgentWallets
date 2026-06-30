import type { Transaction, VersionedTransaction } from "@solana/web3.js";

/** Passkey attestation produced by the browser device module. */
export interface PasskeyRegistration {
  encodedChallenge: string;
  attestation: {
    credentialId: string;
    clientDataJson: string;
    attestationObject: string;
    transports: (
      | "AUTHENTICATOR_TRANSPORT_BLE"
      | "AUTHENTICATOR_TRANSPORT_INTERNAL"
      | "AUTHENTICATOR_TRANSPORT_NFC"
      | "AUTHENTICATOR_TRANSPORT_USB"
      | "AUTHENTICATOR_TRANSPORT_HYBRID"
    )[];
  };
}

/** Wallet provisioned by the agent CLI — guardian not linked yet. */
export interface ProvisionedWallet {
  subOrganizationId: string;
  walletId: string;
  solanaAddress: string;
  agentUserId: string;
  /** Store this in GCP Secret Manager — never commit it. */
  agentApiPublicKey: string;
  agentApiPrivateKey: string;
}

/** Wallet created by the orchestrator (2-of-3: Turnkey MPC + Agent + User). */
export interface SecureWallet extends ProvisionedWallet {
  humanUserId: string;
}

export type SolanaTransaction = Transaction | VersionedTransaction;

/** Agent signed immediately (tx below threshold). */
export interface SignedResult {
  status: "signed";
  signedTransaction: SolanaTransaction;
}

/** Human must approve on their device (tx at or above threshold). */
export interface HumanApprovalRequired {
  status: "requires_human_approval";
  subOrganizationId: string;
  solanaAddress: string;
  transferSol: number;
  thresholdSol: number;
}

export type SignatureResult = SignedResult | HumanApprovalRequired;
