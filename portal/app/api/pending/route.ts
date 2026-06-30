import { NextResponse } from "next/server";

import { listPending, addPending } from "@/lib/server/pending-store";
import { getWallet } from "@/lib/server/wallet-store";

/** List pending transactions for a registered wallet. */
export async function GET(request: Request) {
  const subOrganizationId = new URL(request.url).searchParams.get(
    "subOrganizationId",
  );

  if (!subOrganizationId) {
    return NextResponse.json(
      { error: "subOrganizationId is required." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    pending: listPending(subOrganizationId),
  });
}

/**
 * AI Agent endpoint — queue a transaction that needs human approval.
 * Body: { subOrganizationId, serializedTx, transferSol, recipient, description }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const subOrganizationId = body.subOrganizationId as string | undefined;
    const serializedTx = body.serializedTx as string | undefined;
    const transferSol = Number(body.transferSol);
    const recipient = body.recipient as string | undefined;
    const description = body.description as string | undefined;

    if (!subOrganizationId || !serializedTx || !recipient || !description) {
      return NextResponse.json(
        {
          error:
            "subOrganizationId, serializedTx, recipient, and description are required.",
        },
        { status: 400 },
      );
    }

    const wallet = getWallet(subOrganizationId);
    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found." }, { status: 404 });
    }

    const pending = addPending({
      subOrganizationId,
      solanaAddress: wallet.solanaAddress,
      serializedTx,
      transferSol: Number.isFinite(transferSol) ? transferSol : 0,
      recipient,
      description,
    });

    return NextResponse.json({ pending });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to queue transaction.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
