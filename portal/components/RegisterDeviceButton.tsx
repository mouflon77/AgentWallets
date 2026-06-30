"use client";

import { useEffect, useState } from "react";

import { getUserDevice } from "@/lib/device";
import { loadWalletSession, saveWalletSession } from "@/lib/wallet-session";
import type { WalletSession } from "@/lib/types";

interface RegisterDeviceButtonProps {
  onRegistered: (session: WalletSession) => void;
  initialUserName?: string;
  initialWalletName?: string;
  initialSubOrganizationId?: string;
  initialSolanaAddress?: string;
}

export function RegisterDeviceButton({
  onRegistered,
  initialUserName,
  initialWalletName,
  initialSubOrganizationId,
  initialSolanaAddress,
}: RegisterDeviceButtonProps) {
  const [displayName, setDisplayName] = useState(initialUserName ?? "");
  const [walletName, setWalletName] = useState(initialWalletName ?? "Agent Wallet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const requiresVerification = Boolean(
    initialSubOrganizationId && initialSolanaAddress,
  );

  useEffect(() => {
    if (initialUserName) setDisplayName(initialUserName);
    if (initialWalletName) setWalletName(initialWalletName);
  }, [initialUserName, initialWalletName]);

  async function handleRegister() {
    if (!displayName.trim()) {
      setError("Enter your name first.");
      return;
    }

    if (requiresVerification && !verified) {
      setError("Confirm the wallet address matches your terminal before registering.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const device = getUserDevice();
      const passkey = await device.registerPasskey(displayName.trim());

      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          walletName: walletName.trim(),
          subOrganizationId: initialSubOrganizationId,
          passkey,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Registration failed.");
      }

      if (
        initialSolanaAddress &&
        data.solanaAddress &&
        data.solanaAddress !== initialSolanaAddress
      ) {
        throw new Error(
          "Wallet address mismatch — do not register. Check your setup QR link.",
        );
      }

      const session: WalletSession = {
        displayName: displayName.trim(),
        subOrganizationId: data.subOrganizationId,
        solanaAddress: data.solanaAddress,
      };

      saveWalletSession(session);
      onRegistered(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  const existing = loadWalletSession();

  return (
    <section className="card p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Register Device</h2>
        <p className="text-sm text-slate-400 mt-1">
          Create a Passkey on this device (Touch ID / Face ID / Windows Hello).
          This becomes the Guardian for this agent wallet — required for
          high-value transaction approvals.
        </p>
      </div>

      {requiresVerification ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-4 space-y-3">
          <p className="text-sm text-amber-100 font-medium">
            You are registering as Guardian for this agent wallet
          </p>
          <div className="text-sm space-y-1 font-mono break-all text-slate-200">
            <p>
              <span className="text-slate-400">Sub-Org ID:</span>{" "}
              {initialSubOrganizationId}
            </p>
            <p>
              <span className="text-slate-400">Address:</span>{" "}
              {initialSolanaAddress}
            </p>
          </div>
          <p className="text-xs text-slate-400">
            Compare with your laptop terminal before continuing. If these do not
            match, this may be a phishing link.
          </p>
          <label className="flex items-start gap-2 text-sm text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={verified}
              onChange={(event) => setVerified(event.target.checked)}
              disabled={loading || Boolean(existing)}
            />
            <span>
              I verified this Sub-Org ID and address match my setup terminal
            </span>
          </label>
        </div>
      ) : initialSolanaAddress ? (
        <p className="text-sm text-slate-300 font-mono break-all">
          Agent address: {initialSolanaAddress}
        </p>
      ) : null}

      {existing ? (
        <p className="text-sm text-emerald-300">
          Device already registered as <strong>{existing.displayName}</strong>.
        </p>
      ) : (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-slate-300">Your name</span>
            <input
              className="input"
              placeholder="Alice"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={loading}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-slate-300">Wallet name</span>
            <input
              className="input"
              placeholder="Alice Agent Wallet"
              value={walletName}
              onChange={(event) => setWalletName(event.target.value)}
              disabled={loading}
            />
          </label>
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary w-full sm:w-auto"
        onClick={handleRegister}
        disabled={
          loading ||
          Boolean(existing) ||
          (requiresVerification && !verified)
        }
      >
        {loading ? "Waiting for Passkey…" : "Register Device"}
      </button>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </section>
  );
}
