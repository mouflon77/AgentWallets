import { GcpAgent, SecureWalletOrchestrator } from "agentwallets";
import type { PasskeyRegistration, ProvisionedWallet, SecureWallet } from "agentwallets";

function getAutoSignThresholdSol(): number {
  return Number(process.env.AUTO_SIGN_THRESHOLD_SOL ?? "0.5");
}

function requireGcpProjectId(): string {
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "GCP_PROJECT_ID is required to link a guardian to a CLI-provisioned wallet.",
    );
  }
  return projectId;
}

/** Link a Passkey guardian to a wallet provisioned by `npm run setup`. */
export async function linkGuardianToProvisionedWallet(input: {
  subOrganizationId: string;
  userDisplayName: string;
  passkey: PasskeyRegistration;
}): Promise<SecureWallet> {
  const gcp = GcpAgent.fromEnv({ projectId: requireGcpProjectId() });
  const wallet = await gcp.loadJsonSecret<ProvisionedWallet>(
    `wallet-${input.subOrganizationId}`,
  );

  if (wallet.subOrganizationId !== input.subOrganizationId) {
    throw new Error("Wallet sub-org id mismatch.");
  }

  const orchestrator = new SecureWalletOrchestrator({
    gcp: { projectId: requireGcpProjectId() },
    autoSignThresholdSol: getAutoSignThresholdSol(),
  });

  return orchestrator.linkGuardian({
    wallet,
    userDisplayName: input.userDisplayName,
    passkey: input.passkey,
  });
}
