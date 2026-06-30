import {
  SystemProgram,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { SolanaTransaction } from "./types";

/** Read lamports from a System Program transfer instruction (type = 2). */
function lamportsFromTransferData(data: Buffer): number | null {
  if (data.length < 12) return null;
  if (data.readUInt32LE(0) !== 2) return null;
  return Number(data.readBigUInt64LE(4));
}

/** Max native SOL sent in a legacy transaction. */
function maxLamportsInLegacyTx(tx: Transaction): number {
  let max = 0;

  for (const ix of tx.instructions) {
    if (!ix.programId.equals(SystemProgram.programId)) continue;
    const lamports = lamportsFromTransferData(ix.data);
    if (lamports !== null) max = Math.max(max, lamports);
  }

  return max;
}

/** Max native SOL sent in a versioned transaction. */
function maxLamportsInVersionedTx(tx: VersionedTransaction): number {
  let max = 0;
  const message = tx.message;
  const keys = message.getAccountKeys();

  for (const ix of message.compiledInstructions) {
    const programId = keys.get(ix.programIdIndex);
    if (!programId?.equals(SystemProgram.programId)) continue;

    const lamports = lamportsFromTransferData(Buffer.from(ix.data));
    if (lamports !== null) max = Math.max(max, lamports);
  }

  return max;
}

/** Largest single native SOL transfer inside the transaction. */
export function getMaxNativeSolTransfer(tx: SolanaTransaction): number {
  const lamports =
    tx instanceof Transaction
      ? maxLamportsInLegacyTx(tx)
      : maxLamportsInVersionedTx(tx);

  return lamports / LAMPORTS_PER_SOL;
}
