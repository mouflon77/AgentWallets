import { Turnkey, SessionType } from "@turnkey/sdk-browser";

import { TurnkeySolanaWallet } from "../turnkey-solana-wallet";
import type { PasskeyRegistration, SolanaTransaction } from "../types";

export type { PasskeyRegistration, SolanaTransaction } from "../types";
export { TurnkeySolanaWallet, type SolanaWalletSigner } from "../turnkey-solana-wallet";

export interface UserDeviceConfig {
  /** WebAuthn relying party ID (your domain, e.g. "app.example.com"). */
  rpId: string;
  /** Turnkey parent organization ID shown in the dashboard. */
  organizationId: string;
  apiBaseUrl?: string;
}

/**
 * Browser-only device module.
 *
 * Registers the user's Passkey as a Turnkey authenticator and signs
 * high-value transactions after human approval.
 *
 * Run this code in the browser — not on the server.
 */
export class UserDevice {
  private readonly turnkey: Turnkey;
  private readonly passkeyClient: ReturnType<Turnkey["passkeyClient"]>;
  private indexedDbClient: Awaited<
    ReturnType<Turnkey["indexedDbClient"]>
  > | null = null;

  private activeSubOrgId: string | null = null;
  private activeAddress: string | null = null;

  constructor(config: UserDeviceConfig) {
    this.turnkey = new Turnkey({
      rpId: config.rpId,
      apiBaseUrl: config.apiBaseUrl ?? "https://api.turnkey.com",
      defaultOrganizationId: config.organizationId,
    });

    this.passkeyClient = this.turnkey.passkeyClient();
  }

  private async getIndexedDbClient() {
    if (!this.indexedDbClient) {
      this.indexedDbClient = await this.turnkey.indexedDbClient();
    }
    return this.indexedDbClient;
  }

  /**
   * Step 1 — Prompt the user to create a Passkey on their device.
   * Send the result to your backend's createSecureWallet call.
   */
  async registerPasskey(displayName: string): Promise<PasskeyRegistration> {
    const passkey = await this.passkeyClient.createUserPasskey({
      publicKey: {
        rp: { name: "Agent Wallet" },
        user: { name: displayName, displayName },
      },
    });

    return {
      encodedChallenge: passkey.encodedChallenge,
      attestation: passkey.attestation,
    };
  }

  /**
   * Step 2 — After wallet creation, log in with the Passkey.
   * Required before signing high-value transactions.
   */
  async login(subOrganizationId: string, solanaAddress?: string): Promise<void> {
    const indexedDb = await this.getIndexedDbClient();
    await indexedDb.init();

    const publicKey = await indexedDb.getPublicKey();
    if (!publicKey) {
      throw new Error("IndexedDB key pair missing — call registerPasskey first.");
    }

    await this.passkeyClient.loginWithPasskey({
      organizationId: subOrganizationId,
      sessionType: SessionType.READ_WRITE,
      publicKey,
      expirationSeconds: "3600",
    });

    this.activeSubOrgId = subOrganizationId;
    if (solanaAddress) {
      this.activeAddress = solanaAddress;
    }
  }

  /**
   * Returns a TurnkeySolanaWallet backed by the Passkey session.
   * Drop into existing Solana code that expects an async signer.
   */
  getWallet(subOrganizationId: string, solanaAddress: string): TurnkeySolanaWallet {
    return TurnkeySolanaWallet.fromClient({
      organizationId: subOrganizationId,
      address: solanaAddress,
      client: this.passkeyClient,
    });
  }

  /**
   * Step 3 — Human approval: sign a transaction with the Passkey session.
   */
  async signTransaction(
    tx: SolanaTransaction,
    solanaAddress: string,
    subOrganizationId: string,
  ): Promise<SolanaTransaction> {
    return this.getWallet(subOrganizationId, solanaAddress).signTransaction(tx);
  }
}
