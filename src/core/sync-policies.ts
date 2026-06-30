import type { TurnkeyServerClient } from "@turnkey/sdk-server";

import {
  AGENT_AUTO_SIGN_POLICY_NAME,
  HUMAN_APPROVAL_POLICY_NAME,
  agentAutoSignPolicy,
  humanApprovalPolicy,
  solToLamports,
} from "./policies";
import type { ProvisionedWallet, SecureWallet } from "./types";

export interface SyncPoliciesResult {
  subOrganizationId: string;
  thresholdLamports: number;
  agentPolicyId: string;
  humanPolicyId?: string;
}

type TurnkeyPolicyApi = Pick<
  TurnkeyServerClient,
  "getPolicies" | "createPolicies" | "updatePolicy"
>;

function isSecureWallet(
  wallet: ProvisionedWallet | SecureWallet,
): wallet is SecureWallet {
  return "humanUserId" in wallet && Boolean(wallet.humanUserId);
}

/**
 * Push spend limits to Turnkey's policy engine (enclave-enforced).
 *
 * This is **Policy as Infrastructure** — not a local if/else. Even if an attacker
 * patches the agent's TypeScript, Turnkey refuses signatures that violate these rules.
 */
export async function syncPoliciesToTurnkey(
  api: TurnkeyPolicyApi,
  wallet: ProvisionedWallet | SecureWallet,
  thresholdSol: number,
): Promise<SyncPoliciesResult> {
  const subOrganizationId = wallet.subOrganizationId;
  const thresholdLamports = solToLamports(thresholdSol);

  const agentDef = agentAutoSignPolicy(wallet.agentUserId, thresholdLamports);
  const { policies: existingPolicies = [] } = await api.getPolicies({
    organizationId: subOrganizationId,
  });

  const agentPolicyId = await upsertPolicy(
    api,
    subOrganizationId,
    existingPolicies,
    AGENT_AUTO_SIGN_POLICY_NAME,
    agentDef,
  );

  let humanPolicyId: string | undefined;

  if (isSecureWallet(wallet)) {
    const humanDef = humanApprovalPolicy(wallet.humanUserId, thresholdLamports);
    humanPolicyId = await upsertPolicy(
      api,
      subOrganizationId,
      existingPolicies,
      HUMAN_APPROVAL_POLICY_NAME,
      humanDef,
    );
  }

  return {
    subOrganizationId,
    thresholdLamports,
    agentPolicyId,
    humanPolicyId,
  };
}

async function upsertPolicy(
  api: TurnkeyPolicyApi,
  organizationId: string,
  existingPolicies: Array<{ policyId: string; policyName: string }>,
  policyName: string,
  definition: {
    policyName: string;
    effect: "EFFECT_ALLOW";
    consensus: string;
    condition: string;
    notes: string;
  },
): Promise<string> {
  const found = existingPolicies.find((p) => p.policyName === policyName);

  if (found) {
    await api.updatePolicy({
      organizationId,
      policyId: found.policyId,
      policyName: definition.policyName,
      policyEffect: definition.effect,
      policyCondition: definition.condition,
      policyConsensus: definition.consensus,
      policyNotes: definition.notes,
    });
    return found.policyId;
  }

  const created = await api.createPolicies({
    organizationId,
    policies: [
      {
        policyName: definition.policyName,
        effect: definition.effect,
        condition: definition.condition,
        consensus: definition.consensus,
        notes: definition.notes,
      },
    ],
  });

  const policyId = created.policyIds?.[0];
  if (!policyId) {
    throw new Error(`Turnkey did not return a policy id for "${policyName}".`);
  }

  return policyId;
}

/** Convenience: sync from SOL amount (matches AUTO_SIGN_THRESHOLD_SOL). */
export function thresholdSolFromEnv(
  override?: number,
  envValue = process.env.AUTO_SIGN_THRESHOLD_SOL,
): number {
  if (override !== undefined) return override;
  return Number(envValue ?? "0.5");
}
