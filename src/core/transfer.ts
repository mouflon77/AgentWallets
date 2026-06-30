import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import type { SafeAgentSigner } from "./safe-agent-signer";
import type { SignatureResult } from "./types";

export interface SolanaTransferInput {
  /** Base58 Solana address */
  recipient: string;
  /** Amount in SOL (not lamports) */
  amountSol: number;
}

export interface SolanaTransferResult {
  recipient: string;
  amountSol: number;
  result: SignatureResult;
  /** Set when the agent auto-signed and the tx was submitted. */
  signature?: string;
}

export async function buildSolTransferTransactionWithConnection(
  connection: Connection,
  fromAddress: string,
  input: SolanaTransferInput,
): Promise<Transaction> {
  if (input.amountSol <= 0) {
    throw new Error("amountSol must be greater than zero.");
  }

  const from = new PublicKey(fromAddress);
  const to = new PublicKey(input.recipient);
  const lamports = Math.floor(input.amountSol * LAMPORTS_PER_SOL);

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }),
  );
  tx.feePayer = from;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  return tx;
}

/** Policy-aware transfer — auto-signs small amounts, queues large ones for Guardian. */
export async function executeSolanaTransfer(
  signer: SafeAgentSigner,
  input: SolanaTransferInput,
  connection?: Connection,
): Promise<SolanaTransferResult> {
  const rpc = connection ?? signer.getConnection();

  const tx = await buildSolTransferTransactionWithConnection(
    rpc,
    signer.getWallet().solanaAddress,
    input,
  );

  const result = await signer.requestSignature(tx);

  if (result.status === "signed") {
    const signature = await rpc.sendRawTransaction(
      result.signedTransaction.serialize(),
      { skipPreflight: false },
    );
    return { recipient: input.recipient, amountSol: input.amountSol, result, signature };
  }

  return { recipient: input.recipient, amountSol: input.amountSol, result };
}
