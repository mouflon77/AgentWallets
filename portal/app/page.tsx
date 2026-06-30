"use client";

import { useEffect, useState } from "react";

import { PendingTransactions } from "@/components/PendingTransactions";
import { BrandLogo } from "@/components/BrandLogo";
import { RegisterDeviceButton } from "@/components/RegisterDeviceButton";
import { parseSetupLink } from "@/lib/link-setup";
import { loadWalletSession } from "@/lib/wallet-session";
import type { WalletSession } from "@/lib/types";

export default function HomePage() {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [linkSetup, setLinkSetup] = useState<{
    walletName: string;
    userName: string;
    subOrganizationId?: string;
    solanaAddress?: string;
  } | null>(null);

  useEffect(() => {
    setSession(loadWalletSession());

    const setupParam = new URLSearchParams(window.location.search).get("setup");

    if (!setupParam) return;

    try {
      const payload = parseSetupLink(setupParam);
      if (!payload) return;

      setLinkSetup({
        walletName: payload.walletName,
        userName: payload.userName,
        subOrganizationId: payload.subOrganizationId,
        solanaAddress: payload.solanaAddress,
      });
    } catch (error) {
      setSetupError(
        error instanceof Error ? error.message : "Invalid setup link.",
      );
    }
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="space-y-4">
        <div className="flex items-center gap-4">
          <BrandLogo size={56} />
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-[0.2em] text-sky-300/80">
              Agent Solana Wallet
            </p>
            <h1 className="text-3xl font-bold">Guardian</h1>
          </div>
        </div>
        <p className="text-slate-400 max-w-2xl">
          Your phone is the co-signer for your AI agent&apos;s wallet. Register
          with a Passkey, review pending transfers, and approve with Face ID /
          Touch ID.
        </p>
      </header>

      {linkSetup ? (
        <section className="card p-4 text-sm text-sky-200 space-y-2">
          <p>
            Linked from CLI — wallet <strong>{linkSetup.walletName}</strong> for{" "}
            <strong>{linkSetup.userName}</strong>.
          </p>
          {linkSetup.solanaAddress ? (
            <p className="font-mono text-xs break-all text-slate-300">
              Fund: {linkSetup.solanaAddress}
            </p>
          ) : null}
          <p>Tap Register Device to become the Guardian.</p>
        </section>
      ) : null}

      {setupError ? (
        <section className="card p-4 text-sm text-red-300">{setupError}</section>
      ) : null}

      {session ? (
        <section className="card p-4 text-sm text-slate-300 space-y-1">
          <p>
            Signed in as <strong>{session.displayName}</strong>
          </p>
          <p className="font-mono text-xs break-all">{session.solanaAddress}</p>
        </section>
      ) : null}

      <RegisterDeviceButton
        onRegistered={setSession}
        initialUserName={linkSetup?.userName}
        initialWalletName={linkSetup?.walletName}
        initialSubOrganizationId={linkSetup?.subOrganizationId}
        initialSolanaAddress={linkSetup?.solanaAddress}
      />
      <PendingTransactions session={session} />
    </main>
  );
}
