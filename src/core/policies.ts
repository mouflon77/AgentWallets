/** Turnkey policy: agent may sign when every native SOL transfer is below the threshold. */
export const AGENT_AUTO_SIGN_POLICY_NAME = "Agent auto-sign (low value)";

/** Turnkey policy: human must approve when any native SOL transfer meets or exceeds the threshold. */
export const HUMAN_APPROVAL_POLICY_NAME = "Human approval (high value)";

export function agentAutoSignPolicy(
  agentUserId: string,
  thresholdLamports: number,
): {
  policyName: string;
  effect: "EFFECT_ALLOW";
  consensus: string;
  condition: string;
  notes: string;
} {
  return {
    policyName: AGENT_AUTO_SIGN_POLICY_NAME,
    effect: "EFFECT_ALLOW",
    consensus: `approvers.any(user, user.id == '${agentUserId}')`,
    condition: `solana.tx.transfers.all(transfer, transfer.amount < ${thresholdLamports})`,
    notes: "GCP agent may sign transactions below the configured SOL threshold.",
  };
}

/** Turnkey policy: human must approve when any native SOL transfer meets or exceeds the threshold. */
export function humanApprovalPolicy(
  humanUserId: string,
  thresholdLamports: number,
): {
  policyName: string;
  effect: "EFFECT_ALLOW";
  consensus: string;
  condition: string;
  notes: string;
} {
  return {
    policyName: HUMAN_APPROVAL_POLICY_NAME,
    effect: "EFFECT_ALLOW",
    consensus: `approvers.any(user, user.id == '${humanUserId}')`,
    condition: `solana.tx.transfers.any(transfer, transfer.amount >= ${thresholdLamports})`,
    notes: "Passkey holder must approve transactions at or above the configured SOL threshold.",
  };
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * 1_000_000_000);
}
