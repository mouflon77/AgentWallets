import {
  Connection,
  type ConfirmOptions,
  type TransactionSignature,
} from "@solana/web3.js";

import type { TurnkeySolanaWallet } from "./turnkey-solana-wallet";
import type { SolanaTransaction } from "./types";

/**
 * Send a transaction signed by a Turnkey wallet.
 *
 * Replaces `sendAndConfirmTransaction(connection, tx, [keypair])` — no local
 * private key required.
 */
export async function sendAndConfirmWithWallet(
  connection: Connection,
  transaction: SolanaTransaction,
  wallet: TurnkeySolanaWallet,
  options?: ConfirmOptions,
): Promise<TransactionSignature> {
  const signed = await wallet.simulateAndSign(connection, transaction);
  const signature = await connection.sendRawTransaction(signed.serialize(), options);

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    options?.commitment ?? "confirmed",
  );

  return signature;
}

/**
 * Sign and send without waiting for confirmation.
 */
export async function sendWithWallet(
  connection: Connection,
  transaction: SolanaTransaction,
  wallet: TurnkeySolanaWallet,
  options?: ConfirmOptions,
): Promise<TransactionSignature> {
  const signed = await wallet.simulateAndSign(connection, transaction);
  return connection.sendRawTransaction(signed.serialize(), options);
}
