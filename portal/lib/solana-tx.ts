import {
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

export function serializeTransaction(
  tx: Transaction | VersionedTransaction,
): string {
  const bytes = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return Buffer.from(bytes).toString("base64");
}

export function deserializeTransaction(
  base64: string,
): Transaction | VersionedTransaction {
  const bytes = Buffer.from(base64, "base64");

  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}
