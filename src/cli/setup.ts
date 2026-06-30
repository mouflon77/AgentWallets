#!/usr/bin/env node
/**
 * Interactive setup — prints QR in VS Code terminal via qrcode-terminal.
 *
 *   npm run setup
 *   npm run setup -- --user-name Alice --wallet-name "Alice Agent Wallet"
 */

import { SafeAgentSigner } from "../core/safe-agent-signer";

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const userName = parseArg("--user-name") ?? process.env.SETUP_USER_NAME ?? "User";
  const walletName = parseArg("--wallet-name") ?? process.env.SETUP_WALLET_NAME;
  const portalUrl = parseArg("--portal-url") ?? process.env.APPROVAL_PORTAL_URL;

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
SafeAgentSigner setup

  npm run setup
  npm run setup -- --user-name Alice --wallet-name "Alice Agent Wallet"

Options:
  --user-name <name>      Passkey holder name (default: User)
  --wallet-name <name>    Turnkey wallet name
  --portal-url <url>      Approval portal URL (default: http://localhost:3000)

Environment:
  GCP_PROJECT_ID          Required — GCP project with Secret Manager
  APPROVAL_PORTAL_URL     Default portal URL
  SETUP_USER_NAME         Default user name
`);
    return;
  }

  const signer = await SafeAgentSigner.init(
    portalUrl ? { approvalPortalUrl: portalUrl } : undefined,
  );

  const result = await signer.setup({ userName, walletName });
  console.log(`Wallet ready: ${result.wallet.solanaAddress}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nSetup failed: ${message}\n`);
  process.exit(1);
});
