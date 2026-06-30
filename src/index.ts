/**
 * Agent Solana Wallet SDK
 *
 * Stupid-easy setup:
 *
 * ```ts
 * import { SafeAgentSigner } from "agentwallets";
 *
 * const signer = await SafeAgentSigner.init();
 * signer.setup({ userName: "Alice" }); // QR appears in your terminal
 * ```
 *
 * Run `npm run setup` for the interactive CLI.
 */

export {
  SafeAgentSigner,
  createSafeAgentSigner,
  type SafeAgentSignerConfig,
  type SafeAgentSetupInput,
} from "./core/safe-agent-signer";

export { GcpAgent, DEFAULT_GCP_SECRET_NAMES } from "./core/auth/gcp";
export { UserDevice } from "./core/auth/user";
export {
  SecureWalletOrchestrator,
  createOrchestrator,
  type SecureWalletOrchestratorConfig,
} from "./core/orchestrator";
export {
  TurnkeySolanaWallet,
  type SolanaWalletSigner,
  type TurnkeySolanaWalletConfig,
  type TurnkeySigningClient,
} from "./core/turnkey-solana-wallet";
export {
  TurnkeyAgentSigner,
  type TurnkeyAgentSignerConfig,
  type TransactionSigner,
  isLegacyKeypairSigner,
} from "./core/adapter";
export {
  generateRecoveryShare,
  generateRecoveryMnemonic,
  printRecoveryShare,
  type RecoveryShare,
} from "./core/recovery-share";
export {
  syncPoliciesToTurnkey,
  thresholdSolFromEnv,
  type SyncPoliciesResult,
} from "./core/sync-policies";
export {
  AGENT_AUTO_SIGN_POLICY_NAME,
  HUMAN_APPROVAL_POLICY_NAME,
} from "./core/policies";
export { sendAndConfirmWithWallet, sendWithWallet } from "./core/send-and-confirm";
export {
  executeSolanaTransfer,
  buildSolTransferTransactionWithConnection,
  type SolanaTransferInput,
  type SolanaTransferResult,
} from "./core/transfer";
export {
  AgentEngine,
  EXECUTE_SOLANA_TRANSFER_TOOL,
  type AgentEngineConfig,
  type AgentRunResult,
  type AgentToolCallRecord,
  type LlmProvider,
} from "./agent/agent-engine";
export { printSetupQr, type PrintSetupQrInput, type PrintSetupQrResult } from "./cli/setup-qr";
export {
  buildDeviceLinkUrl,
  createDeviceLinkPayload,
  decodeDeviceLink,
  encodeDeviceLink,
  type DeviceLinkPayload,
} from "./core/link-payload";
export type {
  GcpAgentConfig,
  GcpSecretNames,
  TurnkeySecrets,
  AgentKeyPair,
} from "./core/auth/gcp";
export type { UserDeviceConfig } from "./core/auth/user";
export type {
  PasskeyRegistration,
  ProvisionedWallet,
  SecureWallet,
  SignatureResult,
  HumanApprovalRequired,
  SignedResult,
  SolanaTransaction,
} from "./core/types";

// ─── Boilerplate: run with `npm run setup` or `node dist/index.js` ───────────

import { SafeAgentSigner } from "./core/safe-agent-signer";

async function main(): Promise<void> {
  const userName = process.env.SETUP_USER_NAME ?? "User";
  const walletName = process.env.SETUP_WALLET_NAME;

  console.log("\nAgent Solana Wallet — setup\n");

  const signer = await SafeAgentSigner.init();

  await signer.setup({ userName, walletName });

  console.log("Next steps:");
  console.log("  1. Fund the Solana address printed above");
  console.log("  2. Scan the QR code with your phone");
  console.log("  3. Register your Passkey on the approval portal");
  console.log("  4. Agent loads wallet via loadWallet() using the secret ID shown\n");
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nSetup failed: ${message}\n`);
    process.exit(1);
  });
}
