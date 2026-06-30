import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import { serializeTransaction } from "@/lib/solana-tx";
import { addPending } from "@/lib/server/pending-store";
import type { SecureWallet } from "agentwallets";

const DEVNET = "https://api.devnet.solana.com";

/** Build an unsigned devnet transfer for demo / agent simulation. */
export async function queueDemoPendingTransfer(
  wallet: SecureWallet,
  transferSol: number,
) {
  const connection = new Connection(
    process.env.SOLANA_RPC_URL ?? DEVNET,
    "confirmed",
  );

  const from = new PublicKey(wallet.solanaAddress);
  const to = new PublicKey(
    process.env.DEMO_RECIPIENT_ADDRESS ??
      "11111111111111111111111111111112",
  );

  const { blockhash } = await connection.getLatestBlockhash();
  const lamports = Math.floor(transferSol * 1_000_000_000);

  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: from,
  }).add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports,
    }),
  );

  return addPending({
    description: `AI Agent transfer request (${transferSol} SOL)`,
    recipient: to.toBase58(),
    transferSol,
    serializedTx: serializeTransaction(tx),
    subOrganizationId: wallet.subOrganizationId,
    solanaAddress: wallet.solanaAddress,
  });
}
