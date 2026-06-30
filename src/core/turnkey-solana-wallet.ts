import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { TurnkeySigner } from "@turnkey/solana";
import type { TurnkeyBrowserClient } from "@turnkey/sdk-browser";
import type { TurnkeyServerClient } from "@turnkey/sdk-server";

import { getMaxNativeSolTransfer } from "./solana";
import type {
  HumanApprovalRequired,
  SignatureResult,
  SolanaTransaction,
} from "./types";

/** Any Turnkey client that can stamp signing requests. */
export type TurnkeySigningClient =
  | TurnkeyBrowserClient
  | TurnkeyServerClient
  | TurnkeySigner["client"];

/**
 * Async wallet signer — drop-in for wallet-adapter style code paths.
 *
 * Turnkey MPC wallets never expose a local `secretKey`, so they cannot use
 * the synchronous `@solana/web3.js` Keypair `Signer` ({ publicKey, secretKey }).
 * Use `signTransaction()` instead of `transaction.sign(keypair)`.
 */
export interface SolanaWalletSigner {
  readonly publicKey: PublicKey;
  signTransaction<T extends SolanaTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends SolanaTransaction>(
    transactions: T[],
  ): Promise<T[]>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

export interface TurnkeySolanaWalletConfig {
  organizationId: string;
  /** Base58 Solana address for this Turnkey wallet account. */
  address: string;
  client: TurnkeySigningClient;
  /** When set, simulates on RPC before every signTransaction call. */
  connection?: Connection;
  /** Default true when `connection` is set. */
  simulateBeforeSign?: boolean;
  /**
   * When set, `requestSignature` returns `requires_human_approval` at or above it.
   * This is a **UX hint only** — Turnkey enclave policies are authoritative.
   */
  autoSignThresholdSol?: number;
  onHumanApprovalRequired?: (
    approval: HumanApprovalRequired,
  ) => void | Promise<void>;
}

/**
 * Turnkey-backed Solana wallet — works like a Keypair in async code, but the
 * private key never leaves the MPC enclave.
 *
 * ```ts
 * const wallet = TurnkeySolanaWallet.fromClient({
 *   organizationId: subOrgId,
 *   address: solanaAddress,
 *   client: turnkey.apiClient(),
 * });
 *
 * tx.feePayer = wallet.publicKey;
 * const signed = await wallet.signTransaction(tx);
 * await connection.sendRawTransaction(signed.serialize());
 * ```
 */
export class TurnkeySolanaWallet implements SolanaWalletSigner {
  readonly publicKey: PublicKey;

  private readonly organizationId: string;
  private readonly address: string;
  private readonly turnkeySigner: TurnkeySigner;
  private readonly connection?: Connection;
  private readonly simulateBeforeSign: boolean;
  private readonly autoSignThresholdSol?: number;
  private readonly onHumanApprovalRequired?: (
    approval: HumanApprovalRequired,
  ) => void | Promise<void>;

  constructor(config: TurnkeySolanaWalletConfig) {
    this.publicKey = new PublicKey(config.address);
    this.organizationId = config.organizationId;
    this.address = config.address;
    this.connection = config.connection;
    this.simulateBeforeSign = config.simulateBeforeSign ?? Boolean(config.connection);
    this.autoSignThresholdSol = config.autoSignThresholdSol;
    this.onHumanApprovalRequired = config.onHumanApprovalRequired;

    this.turnkeySigner = new TurnkeySigner({
      organizationId: config.organizationId,
      client: config.client,
    });
  }

  /** Build a wallet from an existing Turnkey API client. */
  static fromClient(
    config: Omit<TurnkeySolanaWalletConfig, "autoSignThresholdSol" | "onHumanApprovalRequired"> &
      Pick<
        Partial<TurnkeySolanaWalletConfig>,
        "autoSignThresholdSol" | "onHumanApprovalRequired"
      >,
  ): TurnkeySolanaWallet {
    return new TurnkeySolanaWallet(config);
  }

  async signTransaction<T extends SolanaTransaction>(transaction: T): Promise<T> {
    if (this.simulateBeforeSign && this.connection) {
      await this.simulate(this.connection, transaction);
    }
    return (await this.turnkeySigner.signTransaction(
      transaction,
      this.address,
      this.organizationId,
    )) as T;
  }

  async signAllTransactions<T extends SolanaTransaction>(
    transactions: T[],
  ): Promise<T[]> {
    return (await this.turnkeySigner.signAllTransactions(
      transactions,
      this.address,
      this.organizationId,
    )) as T[];
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    return this.turnkeySigner.signMessage(
      message,
      this.address,
      this.organizationId,
    );
  }

  /**
   * Simulate before signing — always call this before sending to mainnet.
   */
  async simulate(connection: Connection, transaction: SolanaTransaction): Promise<void> {
    const result =
      transaction instanceof VersionedTransaction
        ? await connection.simulateTransaction(transaction, { sigVerify: false })
        : await connection.simulateTransaction(transaction, undefined, false);

    if (result.value.err) {
      throw new Error(
        `Transaction simulation failed: ${JSON.stringify(result.value.err)}`,
      );
    }
  }

  /** Simulate, then sign. Safe default for agent workflows. */
  async simulateAndSign(
    connection: Connection,
    transaction: SolanaTransaction,
  ): Promise<SolanaTransaction> {
    await this.simulate(connection, transaction);
    return this.signTransaction(transaction);
  }

  /**
   * UX helper — queues large transfers for the portal instead of calling Turnkey.
   * **Security is enforced by Turnkey policies** uploaded via `syncPolicy()`.
   */
  async requestSignature(transaction: SolanaTransaction): Promise<SignatureResult> {
    if (this.autoSignThresholdSol === undefined) {
      return {
        status: "signed",
        signedTransaction: await this.signTransaction(transaction),
      };
    }

    const transferSol = getMaxNativeSolTransfer(transaction);

    if (transferSol >= this.autoSignThresholdSol) {
      const approval: HumanApprovalRequired = {
        status: "requires_human_approval",
        subOrganizationId: this.organizationId,
        solanaAddress: this.address,
        transferSol,
        thresholdSol: this.autoSignThresholdSol,
      };

      await this.onHumanApprovalRequired?.(approval);
      return approval;
    }

    return {
      status: "signed",
      signedTransaction: await this.signTransaction(transaction),
    };
  }
}
