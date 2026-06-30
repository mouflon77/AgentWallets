import { DEFAULT_SOLANA_ACCOUNTS, Turnkey } from "@turnkey/sdk-server";
import { generateP256KeyPair } from "@turnkey/crypto";
import type { PasskeyRegistration, SecureWallet } from "agentwallets";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getAutoSignThresholdSol(): number {
  return Number(process.env.AUTO_SIGN_THRESHOLD_SOL ?? "0.5");
}

function solToLamports(sol: number): number {
  return Math.floor(sol * 1_000_000_000);
}

function agentAutoSignPolicy(agentUserId: string, thresholdLamports: number) {
  return {
    policyName: "Agent auto-sign (low value)",
    effect: "EFFECT_ALLOW" as const,
    consensus: `approvers.any(user, user.id == '${agentUserId}')`,
    condition: `solana.tx.transfers.all(transfer, transfer.amount < ${thresholdLamports})`,
    notes: "GCP agent may sign transactions below the configured SOL threshold.",
  };
}

function humanApprovalPolicy(humanUserId: string, thresholdLamports: number) {
  return {
    policyName: "Human approval (high value)",
    effect: "EFFECT_ALLOW" as const,
    consensus: `approvers.any(user, user.id == '${humanUserId}')`,
    condition: `solana.tx.transfers.any(transfer, transfer.amount >= ${thresholdLamports})`,
    notes: "Passkey holder must approve transactions at or above the threshold.",
  };
}

function getParentTurnkey(): Turnkey {
  return new Turnkey({
    apiBaseUrl: process.env.TURNKEY_API_BASE_URL ?? "https://api.turnkey.com",
    apiPublicKey: requireEnv("TURNKEY_API_PUBLIC_KEY"),
    apiPrivateKey: requireEnv("TURNKEY_API_PRIVATE_KEY"),
    defaultOrganizationId: requireEnv("TURNKEY_ORGANIZATION_ID"),
  });
}

/** Create a Turnkey sub-org wallet with Agent API key + User Passkey. */
export async function createSecureWallet(input: {
  walletName: string;
  userDisplayName: string;
  passkey: PasskeyRegistration;
}): Promise<SecureWallet> {
  const parentOrgId = requireEnv("TURNKEY_ORGANIZATION_ID");
  const api = getParentTurnkey().apiClient();
  const agentKeys = generateP256KeyPair();
  const thresholdLamports = solToLamports(getAutoSignThresholdSol());

  const result = await api.createSubOrganization({
    organizationId: parentOrgId,
    subOrganizationName: input.walletName,
    rootQuorumThreshold: 2,
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
      },
    ],
    wallet: {
      walletName: input.walletName,
      accounts: DEFAULT_SOLANA_ACCOUNTS,
    },
  });

  const subOrganizationId = result.subOrganizationId;
  const agentUserId = result.rootUserIds?.[0];
  const humanUserId = result.rootUserIds?.[1];
  const wallet = result.wallet;

  if (!subOrganizationId || !agentUserId || !humanUserId || !wallet) {
    throw new Error("Turnkey did not return expected wallet metadata.");
  }

  const solanaAddress = wallet.addresses[0];
  if (!solanaAddress) {
    throw new Error("Turnkey wallet has no Solana address.");
  }

  const subOrgClient = new Turnkey({
    apiBaseUrl: process.env.TURNKEY_API_BASE_URL ?? "https://api.turnkey.com",
    apiPublicKey: agentKeys.publicKey,
    apiPrivateKey: agentKeys.privateKey,
    defaultOrganizationId: subOrganizationId,
  });

  await subOrgClient.apiClient().createPolicies({
    organizationId: subOrganizationId,
    policies: [
      agentAutoSignPolicy(agentUserId, thresholdLamports),
      humanApprovalPolicy(humanUserId, thresholdLamports),
    ],
  });

  return {
    subOrganizationId,
    walletId: wallet.walletId,
    solanaAddress,
    agentUserId,
    humanUserId,
    agentApiPublicKey: agentKeys.publicKey,
    agentApiPrivateKey: agentKeys.privateKey,
  };
}
