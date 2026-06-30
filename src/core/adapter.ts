import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

import { SafeAgentSigner, type SafeAgentSignerConfig } from "./safe-agent-signer";
import { TurnkeySolanaWallet } from "./turnkey-solana-wallet";
import type { SolanaTransaction } from "./types";

/**
 * Drop-in transaction signer for Eliza, LangChain, and custom Solana bots.
 *
 * MPC wallets never expose a local `secretKey`, so this is an **async** signer
 * (`publicKey` + `signTransaction`) rather than `@solana/web3.js` Keypair's
 * synchronous `Signer` ({ publicKey, secretKey }).
 *
 * ```ts
 * const signer = await TurnkeyAgentSigner.init();
 * tx.feePayer = signer.publicKey;
 * const signed = await signer.signTransaction(tx);
 * await connection.sendRawTransaction(signed.serialize());
 * ```
 */
export interface TransactionSigner {
  readonly publicKey: PublicKey;
  signTransaction<T extends SolanaTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends SolanaTransaction>(
    transactions: T[],
  ): Promise<T[]>;
}

export interface TurnkeyAgentSignerConfig extends SafeAgentSignerConfig {
  /** GCP Secret Manager wallet id, e.g. `wallet-<subOrgId>`. Defaults to `WALLET_SECRET_ID`. */
  walletSecretId?: string;
  /** Solana RPC for simulation. Falls back to config / `SOLANA_RPC_URL`. */
  solanaRpcUrl?: string;
  /** Simulate before every sign. Default `true`. */
  simulateBeforeSign?: boolean;
}

export class TurnkeyAgentSigner implements TransactionSigner {
  readonly publicKey: PublicKey;

  private readonly inner: TurnkeySolanaWallet;
  private readonly connection: Connection;
  private readonly simulateBeforeSign: boolean;

  private constructor(
    inner: TurnkeySolanaWallet,
    connection: Connection,
    simulateBeforeSign: boolean,
  ) {
    this.inner = inner;
    this.publicKey = inner.publicKey;
    this.connection = connection;
    this.simulateBeforeSign = simulateBeforeSign;
  }

  /**
   * Connect to GCP + load wallet, then return a drop-in MPC signer.
   *
   * Env: `GCP_PROJECT_ID`, `WALLET_SECRET_ID`, optional `TURNKEY_ORGANIZATION_ID`
   * (parent org — used during bootstrap; signing uses the wallet sub-org from Secret Manager).
   */
  static async init(
    config: TurnkeyAgentSignerConfig = {},
  ): Promise<TurnkeyAgentSigner> {
    const safe = await SafeAgentSigner.init(config);
    const walletSecretId =
      config.walletSecretId ?? process.env.WALLET_SECRET_ID;

    if (!walletSecretId) {
      throw new Error(
        "WALLET_SECRET_ID is required. Run npm run setup and use the printed secret id.",
      );
    }

    await safe.loadWallet(walletSecretId);
    return TurnkeyAgentSigner.fromSafeAgentSigner(safe, config);
  }

  /** Build from an already-initialized SafeAgentSigner with a loaded wallet. */
  static fromSafeAgentSigner(
    safe: SafeAgentSigner,
    config: Pick<TurnkeyAgentSignerConfig, "solanaRpcUrl" | "simulateBeforeSign"> = {},
  ): TurnkeyAgentSigner {
    const rpc =
      config.solanaRpcUrl ??
      process.env.SOLANA_RPC_URL ??
      "https://api.devnet.solana.com";

    return new TurnkeyAgentSigner(
      safe.getSolanaWallet(),
      new Connection(rpc, "confirmed"),
      config.simulateBeforeSign ?? true,
    );
  }

  async signTransaction<T extends SolanaTransaction>(transaction: T): Promise<T> {
    if (this.simulateBeforeSign) {
      await this.inner.simulate(this.connection, transaction);
    }
    return this.inner.signTransaction(transaction);
  }

  async signAllTransactions<T extends SolanaTransaction>(
    transactions: T[],
  ): Promise<T[]> {
    if (this.simulateBeforeSign) {
      for (const tx of transactions) {
        await this.inner.simulate(this.connection, tx);
      }
    }
    return this.inner.signAllTransactions(transactions);
  }

  /** Access the underlying Turnkey wallet (policy-aware signing, etc.). */
  getTurnkeyWallet(): TurnkeySolanaWallet {
    return this.inner;
  }

  /** Policy-aware path — auto-sign small txs, defer large ones to the portal. */
  requestSignature(transaction: SolanaTransaction) {
    return this.inner.requestSignature(transaction);
  }
}

/** Type guard — legacy `transaction.sign(keypair)` expects sync Keypair; use async signing instead. */
export function isLegacyKeypairSigner(
  signer: unknown,
): signer is { publicKey: PublicKey; secretKey: Uint8Array } {
  return (
    typeof signer === "object" &&
    signer !== null &&
    "secretKey" in signer &&
    signer.secretKey instanceof Uint8Array
  );
}

export type { Transaction, VersionedTransaction };
