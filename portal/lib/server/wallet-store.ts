import type { SecureWallet } from "agentwallets";

const wallets = new Map<string, SecureWallet>();

export function saveWallet(wallet: SecureWallet): void {
  wallets.set(wallet.subOrganizationId, wallet);
}

export function getWallet(
  subOrganizationId: string,
): SecureWallet | undefined {
  return wallets.get(subOrganizationId);
}

export function getLatestWallet(): SecureWallet | undefined {
  const all = [...wallets.values()];
  return all.at(-1);
}
