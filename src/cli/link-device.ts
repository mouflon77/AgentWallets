#!/usr/bin/env node
/** @deprecated Use `npm run setup` instead. */

import { SafeAgentSigner } from "../core/safe-agent-signer";

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const userName = parseArg("--user-name") ?? "User";
  const walletName = parseArg("--wallet-name");
  const portalUrl = parseArg("--portal-url");

  const signer = await SafeAgentSigner.init(
    portalUrl ? { approvalPortalUrl: portalUrl } : undefined,
  );

  signer.setup({ userName, walletName });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
