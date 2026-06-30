import { Connection } from "@solana/web3.js";

import { GcpAgent } from "./auth/gcp";
import { SecureWalletOrchestrator } from "./orchestrator";
import { generateRecoveryShare, printRecoveryShare, generateRecoveryMnemonic } from "./recovery-share";
import { TurnkeyAgentSigner } from "./adapter";
import { printSetupQr, type PrintSetupQrResult } from "../cli/setup-qr";
import { TurnkeySolanaWallet } from "./turnkey-solana-wallet";
import { executeSolanaTransfer, type SolanaTransferResult } from "./transfer";
import type {
  PasskeyRegistration,
  SecureWallet,
  SignatureResult,
  SolanaTransaction,
} from "./types";

export interface SafeAgentSignerConfig {
  /** GCP project ID. Defaults to `GCP_PROJECT_ID`. */
  gcpProjectId?: string;
  /** Auto-sign below this SOL amount. Defaults to `0.5`. */
  autoSignThresholdSol?: number;
  /** Approval portal URL for phone linking. Defaults to `http://localhost:3000`. */
  approvalPortalUrl?: string;
  /** Solana RPC for simulation before signing. */
  solanaRpcUrl?: string;
}

export interface SafeAgentSetupInput {
  userName: string;
  walletName?: string;
  ttlMinutes?: number;
  /** Skip recovery mnemonic export (not recommended). */
  skipRecoveryShare?: boolean;
}

function resolveConfig(config: SafeAgentSignerConfig = {}) {
  const gcpProjectId = config.gcpProjectId ?? process.env.GCP_PROJECT_ID;

  if (!gcpProjectId) {
    throw new Error(
      "GCP_PROJECT_ID is required. Set it in the environment or pass gcpProjectId.",
    );
  }

  return {
    gcpProjectId,
    autoSignThresholdSol:
      config.autoSignThresholdSol ??
      Number(process.env.AUTO_SIGN_THRESHOLD_SOL ?? "0.5"),
    approvalPortalUrl:
      config.approvalPortalUrl ??
      process.env.APPROVAL_PORTAL_URL ??
      "http://localhost:3000",
    solanaRpcUrl:
      config.solanaRpcUrl ??
      process.env.SOLANA_RPC_URL ??
      "https://api.devnet.solana.com",
  };
}

/**
 * Stupid-easy entry point for AI agents.
 *
 * ```ts
 * const signer = await SafeAgentSigner.init();
 * await signer.setup({ userName: "Alice" }); // sub-org, address, QR in terminal
 * await signer.loadWallet("wallet-<subOrgId>-agent-keys");
 * const result = await signer.requestSignature(tx);
 * ```
 */
export class SafeAgentSigner {
  readonly gcp: GcpAgent;
  readonly orchestrator: SecureWalletOrchestrator;

  private readonly approvalPortalUrl: string;
  private readonly solanaRpcUrl: string;
  private wallet: SecureWallet | null = null;

  private constructor(
    gcp: GcpAgent,
    orchestrator: SecureWalletOrchestrator,
    runtime: { approvalPortalUrl: string; solanaRpcUrl: string },
  ) {
    this.gcp = gcp;
    this.orchestrator = orchestrator;
    this.approvalPortalUrl = runtime.approvalPortalUrl;
    this.solanaRpcUrl = runtime.solanaRpcUrl;
  }

  /** Connect to GCP Secret Manager + verify Turnkey credentials. */
  static async init(config: SafeAgentSignerConfig = {}): Promise<SafeAgentSigner> {
    const resolved = resolveConfig(config);
    const gcp = GcpAgent.fromEnv({ projectId: resolved.gcpProjectId });

    console.log("SafeAgentSigner — connecting to GCP Secret Manager…");
    await gcp.verifyAccess();
    await gcp.loadTurnkeySecrets();
    console.log("Turnkey credentials loaded from Secret Manager.\n");

    const orchestrator = new SecureWalletOrchestrator({
      gcp: { projectId: resolved.gcpProjectId },
      autoSignThresholdSol: resolved.autoSignThresholdSol,
    });

    return new SafeAgentSigner(gcp, orchestrator, {
      approvalPortalUrl: resolved.approvalPortalUrl,
      solanaRpcUrl: resolved.solanaRpcUrl,
    });
  }

  /**
   * Setup flow:
   *   1. Create Turnkey sub-org for this agent
   *   2. Generate Solana wallet inside the sub-org
   *   3. Print the public address (fund with SOL)
   *   4. Print QR — phone becomes Guardian via Passkey
   */
  async setup(input: SafeAgentSetupInput): Promise<PrintSetupQrResult> {
    const walletName = input.walletName ?? `${input.userName} Agent Wallet`;

    console.log("Creating Turnkey sub-org and Solana wallet…\n");

    const wallet = await this.orchestrator.provisionAgentWallet({ walletName });

    if (!input.skipRecoveryShare) {
      const recovery = await generateRecoveryMnemonic(this.gcp, wallet);
      printRecoveryShare(recovery);
    }

    return printSetupQr({
      portalUrl: this.approvalPortalUrl,
      walletName,
      userName: input.userName,
      ttlMinutes: input.ttlMinutes,
      wallet,
    });
  }

  /** Load a wallet record from GCP Secret Manager (`wallet-<subOrgId>`). */
  async loadWallet(secretId: string): Promise<SecureWallet> {
    const wallet = await this.gcp.loadJsonSecret<SecureWallet>(secretId);
    this.wallet = wallet;
    return wallet;
  }

  /** Attach a fully-provisioned wallet (e.g. after portal registration). */
  useWallet(wallet: SecureWallet): void {
    this.wallet = wallet;
  }

  getWallet(): SecureWallet {
    if (!this.wallet) {
      throw new Error("No wallet loaded. Call loadWallet() or useWallet() first.");
    }
    return this.wallet;
  }

  /** Drop-in async signer for Eliza, LangChain, and custom bots. */
  getTurnkeyAgentSigner(): TurnkeyAgentSigner {
    return TurnkeyAgentSigner.fromSafeAgentSigner(this, {
      solanaRpcUrl: this.solanaRpcUrl,
    });
  }

  /** Drop-in Solana signer backed by Turnkey MPC + GCP agent key. */
  getSolanaWallet(): TurnkeySolanaWallet {
    return this.orchestrator.getAgentWallet(this.getWallet(), {
      connection: this.getConnection(),
    });
  }

  getConnection(): Connection {
    return new Connection(this.solanaRpcUrl, "confirmed");
  }

  async createSecureWallet(input: {
    walletName: string;
    userDisplayName: string;
    passkey: PasskeyRegistration;
  }): Promise<SecureWallet> {
    const wallet = await this.orchestrator.createSecureWallet(input);
    this.wallet = wallet;
    return wallet;
  }

  /**
   * Re-push spend limits to Turnkey's enclave policy engine.
   * Call after changing AUTO_SIGN_THRESHOLD_SOL or to verify infrastructure policy.
   */
  async syncPolicy(): Promise<void> {
    await this.orchestrator.syncPolicy(this.getWallet());
  }

  /**
   * Policy-aware signing — small txs auto-sign, large txs need phone approval.
   * Turnkey enclave policies are authoritative; this also simulates on-chain first.
   */
  async requestSignature(tx: SolanaTransaction): Promise<SignatureResult> {
    const solanaWallet = this.getSolanaWallet();

    await solanaWallet.simulate(this.getConnection(), tx);
    return solanaWallet.requestSignature(tx);
  }

  async signTransaction(tx: SolanaTransaction): Promise<SolanaTransaction> {
    return this.getSolanaWallet().simulateAndSign(this.getConnection(), tx);
  }

  /** Build, sign (policy-aware), and optionally submit a native SOL transfer. */
  async executeSolanaTransfer(input: {
    recipient: string;
    amountSol: number;
  }): Promise<SolanaTransferResult> {
    return executeSolanaTransfer(this, input, this.getConnection());
  }
}

/** Stupid-easy one-liner. */
export async function createSafeAgentSigner(
  config?: SafeAgentSignerConfig,
): Promise<SafeAgentSigner> {
  return SafeAgentSigner.init(config);
}
