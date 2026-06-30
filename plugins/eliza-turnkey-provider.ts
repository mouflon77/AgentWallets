/**
 * ElizaOS Turnkey Provider — copy this file into your Eliza project.
 *
 * Setup:
 *   1. npm install agentwallets
 *   2. Copy this file to your Eliza repo (e.g. src/plugins/eliza-turnkey-provider.ts)
 *   3. Set env vars (see README) — do NOT put SOLANA_PRIVATE_KEY in character.json
 *   4. Register the plugin in your character or project agent
 *
 * ```ts
 * import { turnkeySolanaPlugin } from "./plugins/eliza-turnkey-provider";
 *
 * export const character = {
 *   name: "MyAgent",
 *   plugins: ["@elizaos/plugin-sql", "@elizaos/plugin-openai", turnkeySolanaPlugin.name],
 * };
 * ```
 */

import {
  TurnkeyAgentSigner,
  type TurnkeyAgentSignerConfig,
  type TransactionSigner,
} from "agentwallets";

let cachedSigner: TurnkeyAgentSigner | null = null;

/** Lazily initialize the MPC signer (shared across plugin hooks). */
export async function getTurnkeySigner(
  config?: TurnkeyAgentSignerConfig,
): Promise<TurnkeyAgentSigner> {
  if (cachedSigner) return cachedSigner;
  cachedSigner = await TurnkeyAgentSigner.init(config);
  return cachedSigner;
}

/** Reset cached signer (tests / hot reload). */
export function resetTurnkeySigner(): void {
  cachedSigner = null;
}

/**
 * Minimal Eliza-compatible plugin object.
 * Wire `init` in your ProjectAgent or register via character plugins array.
 */
export const turnkeySolanaPlugin = {
  name: "turnkey-solana-provider",
  description:
    "MPC Solana wallet via Turnkey + GCP — replaces SOLANA_PRIVATE_KEY in character.json",

  /** Call from ProjectAgent.init or Eliza plugin bootstrap. */
  async init(): Promise<void> {
    const signer = await getTurnkeySigner();
    console.log(
      `[turnkey-solana-provider] MPC wallet ready: ${signer.publicKey.toBase58()}`,
    );
  },

  /**
   * Example action — send SOL using the MPC signer.
   * Extend or replace with your own Eliza actions.
   */
  actions: [
    {
      name: "SEND_SOL_MPC",
      description: "Send SOL from the Turnkey MPC agent wallet",
      handler: async (
        _runtime: unknown,
        message: { content?: { text?: string } },
      ) => {
        const signer = await getTurnkeySigner();
        return {
          text: `Turnkey MPC wallet active at ${signer.publicKey.toBase58()}. ` +
            `Use AgentEngine.run() or signer.signTransaction() for transfers. ` +
            `Incoming: ${message.content?.text ?? ""}`,
        };
      },
    },
  ],
};

/** Drop-in signer for custom Eliza services that expect { publicKey, signTransaction }. */
export async function createElizaTransactionSigner(): Promise<TransactionSigner> {
  return getTurnkeySigner();
}
