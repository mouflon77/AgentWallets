import { DEFAULT_SOLANA_ACCOUNTS } from "@turnkey/sdk-server";
import { Connection } from "@solana/web3.js";

import { GcpAgent } from "./auth/gcp";
import { syncPoliciesToTurnkey } from "./sync-policies";
import { TurnkeySolanaWallet } from "./turnkey-solana-wallet";
import type {
  PasskeyRegistration,
  ProvisionedWallet,
  SecureWallet,
  SignatureResult,
  SolanaTransaction,
} from "./types";

export interface SecureWalletOrchestratorConfig {
  gcp: ConstructorParameters<typeof GcpAgent>[0];
  /** Auto-sign with the GCP agent when the tx is strictly below this amount (SOL). */
  autoSignThresholdSol: number;
}

/**
 * Server-side orchestrator for 2-of-3 Solana wallets.
 *
 * Security model:
 *   1. Turnkey MPC holds the private key shards (always).
 *   2. GCP Agent — API key in the sub-org, auto-signs small txs.
 *   3. User Device — Passkey authenticator, approves large txs.
 */
export class SecureWalletOrchestrator {
  private readonly gcpAgent: GcpAgent;
  private readonly autoSignThresholdSol: number;

  constructor(config: SecureWalletOrchestratorConfig) {
    this.gcpAgent = new GcpAgent(config.gcp);
    this.autoSignThresholdSol = config.autoSignThresholdSol;
  }

  get gcp(): GcpAgent {
    return this.gcpAgent;
  }

  async provisionAgentWallet(input: { walletName: string }): Promise<ProvisionedWallet> {
    const parentSecrets = await this.gcpAgent.loadTurnkeySecrets();
    const parentClient = this.gcpAgent.createParentClient(parentSecrets);
    const api = parentClient.apiClient();

    const agentKeys = this.gcpAgent.generateAgentKeyPair();

    const result = await api.createSubOrganization({
      organizationId: parentSecrets.organizationId,
      subOrganizationName: input.walletName,
      rootQuorumThreshold: 1,
      rootUsers: [
        {
          userName: "GCP Agent",
          apiKeys: [
            {
              apiKeyName: "agent-signer",
              publicKey: agentKeys.publicKey,
              curveType: "API_KEY_CURVE_P256",
            },
          ],
          authenticators: [],
          oauthProviders: [],
        },
      ],
      wallet: {
        walletName: input.walletName,
        accounts: DEFAULT_SOLANA_ACCOUNTS,
      },
    });

    const subOrganizationId = result.subOrganizationId;
    const agentUserId = result.rootUserIds?.[0];
    const wallet = result.wallet;

    if (!subOrganizationId || !agentUserId || !wallet) {
      throw new Error("Turnkey did not return expected wallet metadata.");
    }

    const solanaAddress = wallet.addresses[0];
    if (!solanaAddress) {
      throw new Error("Turnkey wallet has no Solana address.");
    }

    const provisioned: ProvisionedWallet = {
      subOrganizationId,
      walletId: wallet.walletId,
      solanaAddress,
      agentUserId,
      agentApiPublicKey: agentKeys.publicKey,
      agentApiPrivateKey: agentKeys.privateKey,
    };

    await this.gcpAgent.storeAgentKeys(
      `wallet-${subOrganizationId}-agent-keys`,
      agentKeys,
    );

    await this.gcpAgent.storeJsonSecret(`wallet-${subOrganizationId}`, provisioned);

    // Enclave policy before guardian links — agent cannot exceed threshold even with stolen API key.
    const subOrgClient = this.gcpAgent.createSubOrgAgentClient(
      subOrganizationId,
      agentKeys.publicKey,
      agentKeys.privateKey,
    );
    await syncPoliciesToTurnkey(
      subOrgClient.apiClient(),
      provisioned,
      this.autoSignThresholdSol,
    );

    return provisioned;
  }

  /**
   * Link a Passkey-holding guardian to a provisioned wallet (2-of-3 quorum + policies).
   */
  async linkGuardian(input: {
    wallet: ProvisionedWallet;
    userDisplayName: string;
    passkey: PasskeyRegistration;
  }): Promise<SecureWallet> {
    const subOrganizationId = input.wallet.subOrganizationId;

    const subOrgClient = this.gcpAgent.createSubOrgAgentClient(
      subOrganizationId,
      input.wallet.agentApiPublicKey,
      input.wallet.agentApiPrivateKey,
    );
    const api = subOrgClient.apiClient();

    const createUsersResult = await api.createUsers({
      organizationId: subOrganizationId,
      users: [
        {
          userName: input.userDisplayName,
          apiKeys: [],
          authenticators: [
            {
              authenticatorName: "User Passkey",
              challenge: input.passkey.encodedChallenge,
              attestation: input.passkey.attestation,
            },
          ],
          oauthProviders: [],
          userTags: [],
        },
      ],
    });

    const humanUserId = createUsersResult.userIds?.[0];
    if (!humanUserId) {
      throw new Error("Turnkey did not return the guardian user id.");
    }

    await api.updateRootQuorum({
      organizationId: subOrganizationId,
      threshold: 2,
      userIds: [input.wallet.agentUserId, humanUserId],
    });

    const secureWallet: SecureWallet = {
      ...input.wallet,
      humanUserId,
    };

    await syncPoliciesToTurnkey(api, secureWallet, this.autoSignThresholdSol);

    await this.gcpAgent.storeJsonSecret(`wallet-${subOrganizationId}`, secureWallet);

    return secureWallet;
  }

  /**
   * Re-push spend limits to Turnkey (enclave). Call after changing AUTO_SIGN_THRESHOLD_SOL
   * or to verify policies match your config.
   */
  async syncPolicy(wallet: ProvisionedWallet | SecureWallet): Promise<void> {
    const subOrgClient = this.gcpAgent.createSubOrgAgentClient(
      wallet.subOrganizationId,
      wallet.agentApiPublicKey,
      wallet.agentApiPrivateKey,
    );
    await syncPoliciesToTurnkey(
      subOrgClient.apiClient(),
      wallet,
      this.autoSignThresholdSol,
    );
  }

  async createSecureWallet(input: {
    walletName: string;
    userDisplayName: string;
    passkey: PasskeyRegistration;
  }): Promise<SecureWallet> {
    const provisioned = await this.provisionAgentWallet({
      walletName: input.walletName,
    });

    return this.linkGuardian({
      wallet: provisioned,
      userDisplayName: input.userDisplayName,
      passkey: input.passkey,
    });
  }

  async requestSignature(
    tx: SolanaTransaction,
    wallet: SecureWallet,
  ): Promise<SignatureResult> {
    return this.getAgentWallet(wallet).requestSignature(tx);
  }

  getAgentWallet(
    wallet: SecureWallet,
    options?: { connection?: Connection },
  ): TurnkeySolanaWallet {
    const agentTurnkey = this.gcpAgent.createSubOrgAgentClient(
      wallet.subOrganizationId,
      wallet.agentApiPublicKey,
      wallet.agentApiPrivateKey,
    );

    return TurnkeySolanaWallet.fromClient({
      organizationId: wallet.subOrganizationId,
      address: wallet.solanaAddress,
      client: agentTurnkey.apiClient(),
      connection: options?.connection,
      simulateBeforeSign: options?.connection ? true : undefined,
      autoSignThresholdSol: this.autoSignThresholdSol,
    });
  }

  async signWithAgent(
    tx: SolanaTransaction,
    wallet: SecureWallet,
  ): Promise<SolanaTransaction> {
    return this.getAgentWallet(wallet).signTransaction(tx);
  }
}

export async function createOrchestrator(
  config: SecureWalletOrchestratorConfig,
): Promise<SecureWalletOrchestrator> {
  return new SecureWalletOrchestrator(config);
}
