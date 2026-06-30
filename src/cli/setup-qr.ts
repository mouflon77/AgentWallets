import qrcode from "qrcode-terminal";

import {
  buildDeviceLinkUrl,
  createDeviceLinkPayload,
  type DeviceLinkPayload,
} from "../core/link-payload";
import type { ProvisionedWallet } from "../core/types";

export interface PrintSetupQrInput {
  portalUrl: string;
  walletName: string;
  userName: string;
  ttlMinutes?: number;
  wallet: ProvisionedWallet;
}

export interface PrintSetupQrResult {
  url: string;
  payload: DeviceLinkPayload;
  wallet: ProvisionedWallet;
}

/**
 * Render a setup QR code directly in the VS Code / terminal.
 * Uses qrcode-terminal for crisp in-editor display.
 */
export function printSetupQr(input: PrintSetupQrInput): PrintSetupQrResult {
  const payload = createDeviceLinkPayload({
    portalUrl: input.portalUrl,
    walletName: input.walletName,
    userName: input.userName,
    ttlMs: (input.ttlMinutes ?? 15) * 60 * 1000,
    subOrganizationId: input.wallet.subOrganizationId,
    solanaAddress: input.wallet.solanaAddress,
  });

  const url = buildDeviceLinkUrl(payload);
  const secretId = `wallet-${input.wallet.subOrganizationId}`;

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Agent Solana Wallet — Setup complete");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("  1. Create Sub-Org   ✓  Turnkey sub-org for this agent");
  console.log(`     Sub-Org ID       ${input.wallet.subOrganizationId}`);
  console.log("");
  console.log("  2. Generate Wallet  ✓  Solana address created in sub-org");
  console.log("");
  console.log("  3. Turnkey policy   ✓  Spend limit pushed to enclave (not local code)");
  console.log("");
  console.log("  4. Fund AFTER guardian registration (recommended):");
  console.log("");
  console.log(`     ${input.wallet.solanaAddress}`);
  console.log("");
  console.log(`  GCP secret ID: ${secretId}`);
  console.log("");
  console.log("  ━━━ VERIFY BEFORE SCANNING QR (anti-phishing) ━━━");
  console.log("");
  console.log("  Your phone must show EXACTLY these values:");
  console.log(`    Sub-Org ID : ${input.wallet.subOrganizationId}`);
  console.log(`    Address    : ${input.wallet.solanaAddress}`);
  console.log("");
  console.log("  If the portal shows different IDs, STOP — do not register.");
  console.log("");
  console.log("  5. Scan QR — your phone becomes the Guardian for this wallet");
  console.log("");
  console.log(`  Wallet  : ${payload.walletName}`);
  console.log(`  User    : ${payload.userName}`);
  console.log(`  Expires : ${new Date(payload.expiresAt).toLocaleString()}`);
  console.log("");

  qrcode.generate(url, { small: true });

  console.log("");
  console.log("  Or open this URL on your phone:");
  console.log(`  ${url}`);
  console.log("");
  console.log("  After registering your Passkey, the agent can load:");
  console.log(`  await signer.loadWallet("${secretId}")`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  return { url, payload, wallet: input.wallet };
}
