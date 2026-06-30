#!/usr/bin/env node
/**
 * One-time bootstrap: upload Turnkey parent-org credentials to GCP Secret Manager.
 *
 * Usage:
 *   TURNKEY_API_PUBLIC_KEY=... TURNKEY_API_PRIVATE_KEY=... TURNKEY_ORGANIZATION_ID=... \
 *     npm run gcp:bootstrap
 */

import { GcpAgent } from "../core/auth/gcp";

async function main(): Promise<void> {
  const agent = GcpAgent.fromEnv();

  const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY;
  const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY;
  const organizationId = process.env.TURNKEY_ORGANIZATION_ID;

  if (!apiPublicKey || !apiPrivateKey || !organizationId) {
    throw new Error(
      "Set TURNKEY_API_PUBLIC_KEY, TURNKEY_API_PRIVATE_KEY, and TURNKEY_ORGANIZATION_ID in the environment for bootstrap.",
    );
  }

  console.log(`Bootstrapping Turnkey secrets into project ${process.env.GCP_PROJECT_ID}…`);

  await agent.verifyAccess();
  await agent.bootstrapTurnkeySecrets({
    apiPublicKey,
    apiPrivateKey,
    organizationId,
  });

  console.log("Done. Turnkey credentials are now in Secret Manager.");
  console.log("Remove them from .env and rotate any keys that were exposed locally.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nError: ${message}\n`);
  process.exit(1);
});
