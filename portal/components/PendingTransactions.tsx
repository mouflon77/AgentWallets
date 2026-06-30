"use client";

import { useCallback, useEffect, useState } from "react";

import { getUserDevice } from "@/lib/device";
import {
  deserializeTransaction,
  serializeTransaction,
} from "@/lib/solana-tx";
import type { PendingTransaction, WalletSession } from "@/lib/types";

interface PendingTransactionsProps {
  session: WalletSession | null;
}

export function PendingTransactions({ session }: PendingTransactionsProps) {
  const [pending, setPending] = useState<PendingTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) {
      setPending([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/pending?subOrganizationId=${encodeURIComponent(session.subOrganizationId)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load pending transactions.");
      }

      setPending(data.pending ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function handleApprove(item: PendingTransaction) {
    if (!session) return;

    setApprovingId(item.id);
    setError(null);
    setMessage(null);

    try {
      const device = getUserDevice();
      await device.login(session.subOrganizationId, session.solanaAddress);

      const wallet = device.getWallet(
        session.subOrganizationId,
        session.solanaAddress,
      );

      const unsignedTx = deserializeTransaction(item.serializedTx);
      const signedTx = await wallet.signTransaction(unsignedTx);

      const signedSerializedTx = serializeTransaction(signedTx);

      const response = await fetch(`/api/pending/${item.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedSerializedTx }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Approval failed.");
      }

      setMessage(`Approved "${item.description}" with your device Passkey.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setApprovingId(null);
    }
  }

  async function handleSeedDemo() {
    if (!session) return;

    setSeeding(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/pending/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subOrganizationId: session.subOrganizationId,
          transferSol: 1.25,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to simulate agent request.");
      }

      setMessage("Simulated AI agent queued a 1.25 SOL transfer.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed.");
    } finally {
      setSeeding(false);
    }
  }

  if (!session) {
    return (
      <section className="card p-6">
        <h2 className="text-lg font-semibold">Pending Transactions</h2>
        <p className="text-sm text-slate-400 mt-2">
          Register your device first to see agent requests.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pending Transactions</h2>
          <p className="text-sm text-slate-400 mt-1">
            High-value transfers queued by the AI agent. Approve with your local
            device share (Passkey).
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={refresh}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSeedDemo}
            disabled={seeding}
          >
            {seeding ? "Simulating…" : "Simulate Agent Request"}
          </button>
        </div>
      </div>

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {loading && pending.length === 0 ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : null}

      {!loading && pending.length === 0 ? (
        <p className="text-sm text-slate-400 rounded-lg border border-dashed border-slate-700 p-6 text-center">
          No pending transactions. Use &quot;Simulate Agent Request&quot; to test
          the approval flow.
        </p>
      ) : (
        <ul className="space-y-3">
          {pending.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{item.description}</p>
                  <span className="badge badge-pending">Pending</span>
                </div>
                <p className="text-sm text-slate-400">
                  {item.transferSol} SOL →{" "}
                  <span className="font-mono text-xs">{item.recipient}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Requested {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-success shrink-0"
                onClick={() => handleApprove(item)}
                disabled={approvingId === item.id}
              >
                {approvingId === item.id
                  ? "Confirm with Passkey…"
                  : "Approve"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
